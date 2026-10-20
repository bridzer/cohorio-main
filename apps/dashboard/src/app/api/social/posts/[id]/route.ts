import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateSocialPost, type SocialPostStatus } from "@/lib/social/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const statuses = new Set<SocialPostStatus>(["draft", "scheduled", "published"]);

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/social/posts/[id]">,
) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to update social posts.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const id = (await context.params).id;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return errorResponse("Post id is invalid.", 400);
    }
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const body = payload as Record<string, unknown>;
    if (typeof body.status !== "string" || !statuses.has(body.status as SocialPostStatus)) {
      return errorResponse("Status must be draft, scheduled, or published.", 400);
    }
    let scheduledFor: string | null = null;
    if (body.scheduledFor != null && body.scheduledFor !== "") {
      if (!z.iso.datetime({ offset: true }).safeParse(body.scheduledFor).success) {
        return errorResponse("scheduledFor must be an ISO date.", 400);
      }
      scheduledFor = new Date(body.scheduledFor as string).toISOString();
    }
    if (body.status === "scheduled" && !scheduledFor) {
      return errorResponse("A scheduled post needs a date.", 400);
    }
    if (body.status === "scheduled" && Date.parse(scheduledFor!) <= Date.now()) {
      return errorResponse("Choose a future date and time.", 400);
    }
    if (body.body !== undefined && (
      typeof body.body !== "string" || !body.body.trim() || body.body.length > 20_000
    )) {
      return errorResponse("Post text must contain 1 to 20,000 characters.", 400);
    }
    const post = await updateSocialPost(workspaceId, id, {
      status: body.status as SocialPostStatus,
      scheduledFor,
      ...(typeof body.body === "string" ? { body: body.body.trim() } : {}),
    });
    if (!post) {
      return errorResponse("Post not found.", 404);
    }
    return NextResponse.json({ post });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const message =
      error instanceof Error ? error.message : "Unable to update this post.";
    return errorResponse(message, 503);
  }
}
