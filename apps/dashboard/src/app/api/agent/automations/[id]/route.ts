import { NextRequest, NextResponse } from "next/server";
import {
  automationPatch,
  deleteAutomation,
  updateAutomation,
  validationMessage,
} from "@/lib/agent/automations";
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

const notFound = () => NextResponse.json({ error: "Automation not found." }, { status: 404 });

function failure(error: unknown, fallback: string) {
  const originResponse = originErrorResponse(error);
  if (originResponse) return originResponse;
  const accessResponse = accessErrorResponse(error);
  if (accessResponse) return accessResponse;
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (error instanceof RangeError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 503 });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/agent/automations/[id]">,
) {
  try {
    assertSameOrigin(request);
    const { workspaceId, userId } = await requireWorkspaceAccess("member");
    const id = (await context.params).id;
    if (!UUID.test(id)) return notFound();
    const parsed = automationPatch.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }
    const automation = await updateAutomation(workspaceId, id, parsed.data);
    if (!automation) return notFound();
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.automation_updated",
      targetType: "automation",
      targetId: id,
      metadata: { changed: Object.keys(parsed.data), enabled: automation.enabled },
    });
    return NextResponse.json({ automation });
  } catch (error) {
    return failure(error, "Unable to update this automation.");
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/agent/automations/[id]">,
) {
  try {
    assertSameOrigin(request);
    const { workspaceId, userId } = await requireWorkspaceAccess("member");
    const id = (await context.params).id;
    if (!UUID.test(id) || !(await deleteAutomation(workspaceId, id))) return notFound();
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.automation_deleted",
      targetType: "automation",
      targetId: id,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return failure(error, "Unable to delete this automation.");
  }
}
