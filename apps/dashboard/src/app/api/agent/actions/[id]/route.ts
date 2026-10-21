import { NextRequest, NextResponse } from "next/server";
import { decideAction } from "@/lib/agent/actions";
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

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Body: { decision: "approve", confirm: true } or { decision: "reject" }. */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/agent/actions/[id]">,
) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const id = (await context.params).id;
    if (!UUID.test(id)) return errorResponse("Action not found.", 404);
    const body = (await request.json()) as { decision?: unknown; confirm?: unknown };
    if (body?.decision !== "approve" && body?.decision !== "reject") {
      return errorResponse("Choose approve or reject.", 400);
    }
    if (body.decision === "approve" && body.confirm !== true) {
      return errorResponse("Confirm the action before Cohorio runs it.", 400);
    }
    const outcome = await decideAction({
      workspaceId: access.workspaceId,
      userId: access.userId,
      actionId: id,
      decision: body.decision,
    });
    if (!outcome.ok) {
      return errorResponse("This action is no longer awaiting a decision.", 409);
    }
    return NextResponse.json({ action: outcome.action });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    console.error("Agent action decision failed", error);
    return errorResponse("Unable to record this decision.", 503);
  }
}
