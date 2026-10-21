import { NextRequest, NextResponse } from "next/server";
import { runAutomationNow } from "@/lib/agent/automations";
import { auditAgentEvent } from "@/lib/agent/audit";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Queues an immediate run; the background worker picks it up. */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/agent/automations/[id]/run">,
) {
  try {
    assertSameOrigin(request);
    const { workspaceId, userId } = await requireWorkspaceAccess("member");
    const id = (await context.params).id;
    const queued = UUID.test(id) ? await runAutomationNow(workspaceId, id) : null;
    if (queued === null) {
      return NextResponse.json({ error: "Automation not found." }, { status: 404 });
    }
    if (!queued) {
      return NextResponse.json(
        { error: "This automation is already queued or running." },
        { status: 409 },
      );
    }
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.automation_run_requested",
      targetType: "automation",
      targetId: id,
    });
    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Queue automation failed", error);
    return NextResponse.json({ error: "Unable to queue this automation." }, { status: 503 });
  }
}
