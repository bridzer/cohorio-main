import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditAgentEvent } from "@/lib/agent/audit";
import { validationMessage } from "@/lib/agent/automations";
import {
  deleteThread,
  getThread,
  listActions,
  listThreadMessages,
  listThreadRuns,
  renameThread,
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

const renameInput = z.object({
  title: z.string().trim().min(1).max(80),
});

const notFound = () =>
  NextResponse.json({ error: "Conversation not found." }, { status: 404 });

function failure(error: unknown, fallback: string) {
  const originResponse = originErrorResponse(error);
  if (originResponse) return originResponse;
  const accessResponse = accessErrorResponse(error);
  if (accessResponse) return accessResponse;
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 503 });
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/agent/threads/[id]">,
) {
  try {
    const { workspaceId } = await requireWorkspaceAccess("viewer");
    const id = (await context.params).id;
    const thread = UUID.test(id) ? await getThread(workspaceId, id) : null;
    if (!thread) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    const [messages, runs, actions] = await Promise.all([
      listThreadMessages(workspaceId, id),
      listThreadRuns(workspaceId, id),
      listActions(workspaceId, { threadId: id }),
    ]);
    return NextResponse.json({ thread, messages, runs, actions });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load this conversation." }, { status: 503 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/agent/threads/[id]">,
) {
  try {
    assertSameOrigin(request);
    const { workspaceId, userId } = await requireWorkspaceAccess("member");
    const id = (await context.params).id;
    if (!UUID.test(id)) return notFound();
    const parsed = renameInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }
    const thread = await renameThread(workspaceId, id, parsed.data.title);
    if (!thread) return notFound();
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.thread_renamed",
      targetType: "thread",
      targetId: id,
    });
    return NextResponse.json({ thread });
  } catch (error) {
    return failure(error, "Unable to rename this conversation.");
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/agent/threads/[id]">,
) {
  try {
    assertSameOrigin(request);
    const { workspaceId, userId } = await requireWorkspaceAccess("member");
    const id = (await context.params).id;
    if (!UUID.test(id) || !(await deleteThread(workspaceId, id))) return notFound();
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.thread_deleted",
      targetType: "thread",
      targetId: id,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return failure(error, "Unable to delete this conversation.");
  }
}
