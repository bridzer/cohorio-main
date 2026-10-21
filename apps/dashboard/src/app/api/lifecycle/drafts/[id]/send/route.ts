import { NextRequest, NextResponse } from "next/server";
import { LifecycleSendError, sendLifecycleDraft } from "@/lib/lifecycle-send";
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

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/lifecycle/drafts/[id]/send">,
) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to send lifecycle drafts.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const id = (await context.params).id;
    if (!UUID.test(id)) return errorResponse("Draft id is invalid.", 400);
    const body = (await request.json()) as { confirm?: unknown; to?: unknown };
    if (body?.confirm !== true) {
      return errorResponse("Confirm the send before Cohorio emails this draft.", 400);
    }
    const to = typeof body.to === "string" ? body.to : "";
    const sent = await sendLifecycleDraft(workspaceId, id, to);
    return NextResponse.json({ draft: sent });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    if (error instanceof LifecycleSendError) {
      return errorResponse(error.message, error.status);
    }
    return errorResponse("Unable to send this draft.", 503);
  }
}
