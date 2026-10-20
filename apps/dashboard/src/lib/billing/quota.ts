import { NextResponse } from "next/server";
import { query } from "@/lib/database";

export type WorkspacePlan = "free" | "pro" | "team";
export type TaskKind = "copilot" | "social" | "lifecycle";

export class TaskQuotaError extends Error {
  constructor() {
    super("Free plan includes 5 tasks per month.");
    this.name = "TASK_QUOTA_EXCEEDED";
  }
}

type PlanRow = { plan: WorkspacePlan };
type CountRow = { used: number };

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
    limit: plan === "free" ? 5 : null,
  };
}

export async function assertTaskQuota(workspaceId: string) {
  const usage = await getWorkspaceUsage(workspaceId);
  if (usage.plan === "free" && usage.used >= 5) {
    throw new TaskQuotaError();
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
    return NextResponse.json(
      { error: "Free plan includes 5 tasks per month." },
      { status: 402 },
    );
  }
  return null;
}
