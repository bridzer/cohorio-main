import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditAgentEvent } from "@/lib/agent/audit";
import { validationMessage } from "@/lib/agent/automations";
import {
  deleteMemory,
  MEMORY_MAX_LENGTH,
  updateMemory,
} from "@/lib/agent/repository";
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

const memoryInput = z.object({
  content: z.string().trim().min(3).max(MEMORY_MAX_LENGTH),
});

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/agent/memories/[id]">,
) {
  try {
    assertSameOrigin(request);
    const { workspaceId, userId } = await requireWorkspaceAccess("member");
    const id = (await context.params).id;
    if (!UUID.test(id)) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }
    const parsed = memoryInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }
    const memory = await updateMemory(workspaceId, id, parsed.data.content);
    if (!memory) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.memory_updated",
      targetType: "memory",
      targetId: id,
    });
    return NextResponse.json({ memory });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update this memory." }, { status: 503 });
  }
}

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
