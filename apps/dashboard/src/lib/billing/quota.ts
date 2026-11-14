import { NextResponse } from "next/server";
import { query } from "@/lib/database";

export type WorkspacePlan = "free" | "pro" | "team";
export type TaskKind = "copilot" | "social" | "lifecycle";

export class TaskQuotaError extends Error {
  constructor(plan: WorkspacePlan, limit: number) {
    super(
      `${plan[0].toUpperCase()}${plan.slice(1)} plan includes ${limit} task${limit === 1 ? "" : "s"} per month.`,
    );
    this.name = "TASK_QUOTA_EXCEEDED";
  }
}

type PlanRow = { plan: WorkspacePlan };
type CountRow = { used: number };

/**
 * Monthly task limit per plan, from the environment. Unset means the default
 * (5 for free, unlimited for pro and team). A non-negative integer sets the
 * limit; "unlimited" removes it. Anything else falls back to the default so
 * a typo fails open to known behavior rather than blocking all tasks.
 */
export function planTaskLimit(plan: WorkspacePlan): number | null {
  const fallback = plan === "free" ? 5 : null;
  const raw =
    plan === "free"
      ? process.env.COHORIO_QUOTA_FREE_TASKS
      : plan === "pro"
        ? process.env.COHORIO_QUOTA_PRO_TASKS
        : process.env.COHORIO_QUOTA_TEAM_TASKS;
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "unlimited" || value === "null" || value === "none") return null;
  if (/^\d+$/.test(value)) return Number(value);
  return fallback;
}

export async function getWorkspaceUsage(workspaceId: string) {
  await query(
    `INSERT INTO workspace_plans (workspace_id)
     VALUES ($1)
     ON CONFLICT (workspace_id) DO NOTHING`,
    [workspaceId],
  );
  const planResult = await query<PlanRow>(
    `SELECT plan FROM workspace_plans WHERE workspace_id = $1`,
    [workspaceId],
  );
  const countResult = await query<CountRow>(
    `SELECT count(*)::int AS used
       FROM workspace_task_events
      WHERE workspace_id = $1
        AND created_at >= date_trunc('month', timezone('utc', now()))`,
    [workspaceId],
  );
  const plan = planResult.rows[0]?.plan ?? "free";
  const used = countResult.rows[0]?.used ?? 0;
  return {
    plan,
    used,
    limit: planTaskLimit(plan),
  };
}

export async function assertTaskQuota(workspaceId: string) {
  const usage = await getWorkspaceUsage(workspaceId);
  if (usage.limit !== null && usage.used >= usage.limit) {
    throw new TaskQuotaError(usage.plan, usage.limit);
  }
  return usage;
}

export async function recordTaskEvent(workspaceId: string, kind: TaskKind) {
  await query(
    `INSERT INTO workspace_task_events (workspace_id, kind)
     VALUES ($1, $2)`,
    [workspaceId, kind],
  );
}

export function quotaErrorResponse(error: unknown) {
  if (
    error instanceof TaskQuotaError ||
    (error instanceof Error && error.name === "TASK_QUOTA_EXCEEDED")
  ) {
    // The message travels with the error so it reflects the plan's limit.
    const message =
      error instanceof Error ? error.message : "Task quota exceeded.";
    return NextResponse.json({ error: message }, { status: 402 });
  }
  return null;
}
