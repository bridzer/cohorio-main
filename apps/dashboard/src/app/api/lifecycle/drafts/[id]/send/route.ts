import { NextRequest, NextResponse } from "next/server";
import {
  getLifecycleDraft,
  markLifecycleDraftSent,
} from "@/lib/lifecycle-repository";
import { loadIntegration } from "@/lib/integrations/store";
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
const SINGLE_EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

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
    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!SINGLE_EMAIL.test(to) || to.length > 320) {
      return errorResponse("Enter one email address.", 400);
    }
    const from = process.env.AUTH_EMAIL_FROM?.trim();
    if (!from) return errorResponse("AUTH_EMAIL_FROM is not configured.", 400);

    const draft = await getLifecycleDraft(workspaceId, id);
    if (!draft) return errorResponse("Draft not found.", 404);
    if (draft.status === "sent") {
      return errorResponse("This draft was already sent.", 409);
    }
    const apiKey = await loadIntegration(workspaceId, "resend");
    if (!apiKey) return errorResponse("resend is not connected.", 400);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: draft.name,
        text: draft.bodyMarkdown,
      }),
    });
    if (!response.ok) {
      return errorResponse(
        `Resend rejected the email (HTTP ${response.status}).`,
        502,
      );
    }
    const sent = await markLifecycleDraftSent(workspaceId, id);
    return NextResponse.json({ draft: sent });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    return errorResponse("Unable to send this draft.", 503);
  }
}
