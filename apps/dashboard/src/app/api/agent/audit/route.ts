import { NextResponse } from "next/server";
import { listAgentAudit } from "@/lib/agent/audit";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

/** Agent and integration audit trail for the workspace. Admins and owners only. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspaceAccess("admin");
    return NextResponse.json({ events: await listAgentAudit(workspaceId) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load activity." }, { status: 503 });
  }
}
