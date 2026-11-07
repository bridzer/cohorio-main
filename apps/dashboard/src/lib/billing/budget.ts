import { NextResponse } from "next/server";
import { query } from "@/lib/database";
import type { WorkspacePlan } from "./quota";

// Included agent LLM spend per UTC month, in USD. Defaults keep a free
// workspace's agent usage near-free while paid plans get real headroom.
// Override per plan with COHORIO_AGENT_BUDGET_FREE_USD / _PRO_USD / _TEAM_USD.
const DEFAULT_BUDGETS: Record<WorkspacePlan, number> = {
  free: 1,
  pro: 50,
  team: 200,
};

export class AgentBudgetError extends Error {
  constructor() {
    super("This workspace has used its agent budget for this month.");
    this.name = "AGENT_BUDGET_EXCEEDED";
  }
}

export function planBudgetUsd(plan: WorkspacePlan): number {
  const override = process.env[`COHORIO_AGENT_BUDGET_${plan.toUpperCase()}_USD`];
  const parsed = override ? Number(override) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return DEFAULT_BUDGETS[plan];
}

export async function getAgentSpend(workspaceId: string) {
  await query(
    `INSERT INTO workspace_plans (workspace_id)
     VALUES ($1)
     ON CONFLICT (workspace_id) DO NOTHING`,
    [workspaceId],
  );
  const planResult = await query<{ plan: WorkspacePlan; status: string }>(
    `SELECT plan, status FROM workspace_plans WHERE workspace_id = $1`,
    [workspaceId],
  );
  const spendResult = await query<{ spent: string }>(
    `SELECT COALESCE(SUM(cost_usd), 0)::text AS spent
       FROM agent_runs
      WHERE workspace_id = $1
        AND created_at >= date_trunc('month', timezone('utc', now()))`,
    [workspaceId],
  );
  const plan = planResult.rows[0]?.plan ?? "free";
  const spentUsd = Number(spendResult.rows[0]?.spent ?? 0);
  return {
    plan,
    status: planResult.rows[0]?.status ?? "active",
    spentUsd,
    budgetUsd: planBudgetUsd(plan),
  };
}

export async function assertAgentBudget(workspaceId: string) {
  const spend = await getAgentSpend(workspaceId);
  if (spend.spentUsd >= spend.budgetUsd) {
    throw new AgentBudgetError();
  }
  return spend;
}

export function budgetErrorResponse(error: unknown) {
  if (
    error instanceof AgentBudgetError ||
    (error instanceof Error && error.name === "AGENT_BUDGET_EXCEEDED")
  ) {
    return NextResponse.json(
      { error: "This workspace has used its agent budget for this month." },
      { status: 402 },
    );
  }
  return null;
}
