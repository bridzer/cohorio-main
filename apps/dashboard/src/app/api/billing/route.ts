import { NextResponse } from "next/server";
import { getAgentSpend } from "@/lib/billing/budget";
import { getWorkspaceUsage } from "@/lib/billing/quota";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to load billing.", 503);
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    const [usage, agent] = await Promise.all([
      getWorkspaceUsage(workspaceId),
      getAgentSpend(workspaceId),
    ]);
    return NextResponse.json({
      ...usage,
      status: agent.status,
      agent: { spentUsd: agent.spentUsd, budgetUsd: agent.budgetUsd },
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load billing.";
    return errorResponse(message, 503);
  }
}
