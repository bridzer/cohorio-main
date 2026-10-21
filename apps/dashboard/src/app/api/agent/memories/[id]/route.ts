import { NextRequest, NextResponse } from "next/server";
import { auditAgentEvent } from "@/lib/agent/audit";
import { deleteMemory } from "@/lib/agent/repository";
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

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/agent/memories/[id]">,
) {
  try {
    assertSameOrigin(request);
    const { workspaceId, userId } = await requireWorkspaceAccess("member");
    const id = (await context.params).id;
    if (!UUID.test(id) || !(await deleteMemory(workspaceId, id))) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.memory_deleted",
      targetType: "memory",
      targetId: id,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to delete this memory." }, { status: 503 });
  }
}
