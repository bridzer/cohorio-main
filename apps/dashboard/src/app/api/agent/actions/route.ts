import { NextRequest, NextResponse } from "next/server";
import { listActions, type AgentActionStatus } from "@/lib/agent/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

const STATUSES: AgentActionStatus[] = ["pending", "approved", "rejected", "executed", "failed"];

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspaceAccess("viewer");
    const status = request.nextUrl.searchParams.get("status");
    if (status !== null && !STATUSES.includes(status as AgentActionStatus)) {
      return NextResponse.json({ error: "Unknown action status." }, { status: 400 });
    }
    return NextResponse.json({
      actions: await listActions(workspaceId, {
        status: (status as AgentActionStatus | null) ?? undefined,
      }),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load actions." }, { status: 503 });
  }
}
