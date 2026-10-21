import { NextRequest, NextResponse } from "next/server";
import {
  getThread,
  listActions,
  listThreadMessages,
  listThreadRuns,
} from "@/lib/agent/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
