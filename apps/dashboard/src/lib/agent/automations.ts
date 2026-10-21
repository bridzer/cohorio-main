import { z } from "zod";
import { query, transaction } from "@/lib/database";
import type { OrganizationRole } from "@/lib/auth/roles";
import { enqueueJob } from "./jobs";
import {
  describeSchedule,
  isValidTimezone,
  nextRunAt,
  type AutomationSchedule,
} from "./schedule";

export const AUTOMATION_LIMIT = 20;

export type Automation = AutomationSchedule & {
  id: string;
  name: string;
  prompt: string;
  enabled: boolean;
  notifyEmail: boolean;
  threadId: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: "completed" | "failed" | "skipped" | null;
  lastError: string | null;
  scheduleLabel: string;
  createdAt: string;
};

type AutomationRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  prompt: string;
  frequency: AutomationSchedule["frequency"];
  weekday: number | null;
  hour: number;
  timezone: string;
  enabled: boolean;
  notify_email: boolean;
  thread_id: string | null;
  next_run_at: Date;
  last_run_at: Date | null;
  last_status: Automation["lastStatus"];
  last_error: string | null;
  created_at: Date;
};

const COLUMNS = `id, workspace_id, created_by, name, prompt, frequency, weekday, hour, timezone,
  enabled, notify_email, thread_id, next_run_at, last_run_at, last_status, last_error, created_at`;

function scheduleOf(row: Pick<AutomationRow, "frequency" | "weekday" | "hour" | "timezone">) {
  return { frequency: row.frequency, weekday: row.weekday, hour: row.hour, timezone: row.timezone };
}

const publicAutomation = (row: AutomationRow): Automation => ({
  ...scheduleOf(row),
  id: row.id,
  name: row.name,
  prompt: row.prompt,
  enabled: row.enabled,
  notifyEmail: row.notify_email,
  threadId: row.thread_id,
  nextRunAt: new Date(row.next_run_at).toISOString(),
  lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
  lastStatus: row.last_status,
  lastError: row.last_error,
  scheduleLabel: describeSchedule(scheduleOf(row)),
  createdAt: new Date(row.created_at).toISOString(),
});

const scheduleFields = {
  frequency: z.enum(["daily", "weekly"]),
  weekday: z.number().int().min(0).max(6).nullable(),
  hour: z.number().int().min(0).max(23),
  timezone: z.string().refine(isValidTimezone, "is not a recognised timezone"),
};

function weekdayMatchesFrequency(value: { frequency?: string; weekday?: number | null }) {
  return value.frequency === undefined || (value.frequency === "weekly") === (value.weekday != null);
}

export const automationInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    prompt: z.string().trim().min(1).max(4_000),
    notifyEmail: z.boolean().default(true),
    ...scheduleFields,
  })
  .refine(weekdayMatchesFrequency, {
    path: ["weekday"],
    message: "is required for weekly automations and must be empty for daily ones",
  });

export const automationPatch = z
  .object({
    name: z.string().trim().min(1).max(80),
    prompt: z.string().trim().min(1).max(4_000),
    notifyEmail: z.boolean(),
    enabled: z.boolean(),
    ...scheduleFields,
  })
  .partial()
  .refine(weekdayMatchesFrequency, {
    path: ["weekday"],
    message: "is required for weekly automations and must be empty for daily ones",
  });

export function validationMessage(error: z.ZodError) {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "Request"} ${issue.message}` : "Invalid request.";
}

export class AutomationLimitError extends Error {
  constructor() {
    super(`A workspace can have up to ${AUTOMATION_LIMIT} automations.`);
  }
}

export async function listAutomations(workspaceId: string) {
  const result = await query<AutomationRow>(
    `SELECT ${COLUMNS} FROM workspace_automations
      WHERE workspace_id = $1 ORDER BY created_at`,
    [workspaceId],
  );
  return result.rows.map(publicAutomation);
}

export async function createAutomation(
  workspaceId: string,
  userId: string,
  input: z.infer<typeof automationInput>,
  now = new Date(),
) {
  const next = nextRunAt(input, now);
  const result = await query<AutomationRow>(
    `INSERT INTO workspace_automations
       (workspace_id, created_by, name, prompt, frequency, weekday, hour, timezone, notify_email, next_run_at)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      WHERE (SELECT count(*) FROM workspace_automations WHERE workspace_id = $1) < $11
     RETURNING ${COLUMNS}`,
    [
      workspaceId, userId, input.name, input.prompt, input.frequency,
      input.frequency === "weekly" ? input.weekday : null, input.hour, input.timezone,
      input.notifyEmail, next, AUTOMATION_LIMIT,
    ],
  );
  if (!result.rows[0]) throw new AutomationLimitError();
  return publicAutomation(result.rows[0]);
}

export async function updateAutomation(
  workspaceId: string,
  id: string,
  patch: z.infer<typeof automationPatch>,
  now = new Date(),
) {
  return transaction(async (client) => {
    const current = await client.query<AutomationRow>(
      `SELECT ${COLUMNS} FROM workspace_automations
        WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
      [id, workspaceId],
    );
    const row = current.rows[0];
    if (!row) return null;
    const merged = { ...scheduleOf(row), ...pick(patch, ["frequency", "weekday", "hour", "timezone"]) };
    if (merged.frequency === "daily") merged.weekday = null;
    if (merged.frequency === "weekly" && merged.weekday == null) {
      throw new RangeError("Weekly automations need a weekday.");
    }
    const scheduleChanged =
      merged.frequency !== row.frequency || merged.weekday !== row.weekday ||
      merged.hour !== row.hour || merged.timezone !== row.timezone;
    const enabling = patch.enabled === true && !row.enabled;
    // Re-enabling recomputes from now so a paused automation does not fire immediately.
    const next = scheduleChanged || enabling ? nextRunAt(merged, now) : row.next_run_at;
    const updated = await client.query<AutomationRow>(
      `UPDATE workspace_automations
          SET name = $3, prompt = $4, frequency = $5, weekday = $6, hour = $7, timezone = $8,
              notify_email = $9, enabled = $10, next_run_at = $11, updated_at = NOW()
        WHERE id = $1 AND workspace_id = $2
        RETURNING ${COLUMNS}`,
      [
        id, workspaceId, patch.name ?? row.name, patch.prompt ?? row.prompt,
        merged.frequency, merged.weekday, merged.hour, merged.timezone,
        patch.notifyEmail ?? row.notify_email, patch.enabled ?? row.enabled, next,
      ],
    );
    return publicAutomation(updated.rows[0]);
  });
}

function pick<T extends object, K extends keyof T>(value: T, keys: K[]) {
  const picked: Partial<Pick<T, K>> = {};
  for (const key of keys) if (value[key] !== undefined) picked[key] = value[key];
  return picked;
}

export async function deleteAutomation(workspaceId: string, id: string) {
  const result = await query(
    `DELETE FROM workspace_automations WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
  return Boolean(result.rowCount);
}

/** Returns false when a run for this automation is already queued or running. */
export async function runAutomationNow(workspaceId: string, id: string) {
  const exists = await query(
    `SELECT 1 FROM workspace_automations WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
  if (!exists.rowCount) return null;
  const jobId = await enqueueJob({
    workspaceId,
    kind: "automation",
    payload: { automationId: id, manual: true },
  });
  return jobId !== null;
}

/**
 * Moves due automations onto the job queue and advances their next run.
 * Row locks with SKIP LOCKED keep concurrent schedulers from double-queueing.
 */
export async function enqueueDueAutomations(now = new Date(), limit = 25) {
  return transaction(async (client) => {
    const due = await client.query<AutomationRow>(
      `SELECT ${COLUMNS} FROM workspace_automations
        WHERE enabled AND next_run_at <= $1
        ORDER BY next_run_at
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
      [now, limit],
    );
    let queued = 0;
    for (const row of due.rows) {
      await client.query(
        `UPDATE workspace_automations SET next_run_at = $2 WHERE id = $1`,
        [row.id, nextRunAt(scheduleOf(row), now)],
      );
      const jobId = await enqueueJob(
        { workspaceId: row.workspace_id, kind: "automation", payload: { automationId: row.id } },
        client,
      );
      if (jobId) queued += 1;
    }
    return queued;
  });
}

export type AutomationForRun = {
  id: string;
  workspaceId: string;
  createdBy: string;
  name: string;
  prompt: string;
  enabled: boolean;
  notifyEmail: boolean;
  threadId: string | null;
};

export async function getAutomationForRun(workspaceId: string, id: string) {
  const result = await query<AutomationRow>(
    `SELECT ${COLUMNS} FROM workspace_automations WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    name: row.name,
    prompt: row.prompt,
    enabled: row.enabled,
    notifyEmail: row.notify_email,
    threadId: row.thread_id,
  } satisfies AutomationForRun;
}

export async function recordAutomationResult(
  workspaceId: string,
  id: string,
  result: { status: "completed" | "failed" | "skipped"; error?: string; threadId?: string; disable?: boolean },
) {
  await query(
    `UPDATE workspace_automations
        SET last_run_at = NOW(), last_status = $3, last_error = $4,
            thread_id = COALESCE($5, thread_id),
            enabled = CASE WHEN $6 THEN FALSE ELSE enabled END,
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId, result.status, result.error ?? null, result.threadId ?? null, result.disable ?? false],
  );
}

/**
 * The automation creator's current role in the workspace, or null if they
 * (or the workspace) are no longer active. Runs act with this user's access.
 */
export async function creatorRole(workspaceId: string, userId: string) {
  const result = await query<{ role: OrganizationRole; email: string }>(
    `SELECT m.role, u.email
       FROM organization_memberships m
       JOIN workspaces w ON w.organization_id = m.organization_id
       JOIN organizations o ON o.id = m.organization_id
       JOIN users u ON u.id = m.user_id
      WHERE w.id = $1 AND m.user_id = $2
        AND m.status = 'active' AND w.status = 'active'
        AND o.status = 'active' AND u.status = 'active'
      LIMIT 1`,
    [workspaceId, userId],
  );
  return result.rows[0] ?? null;
}
