import { NextRequest, NextResponse } from "next/server";
import { createMarketingImage } from "@/lib/images/client";
import {
  getSocialPost,
  setSocialPostImage,
} from "@/lib/social/repository";
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

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save social images.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const body = (await request.json()) as {
      postId?: unknown;
      prompt?: unknown;
    };
    if (typeof body.postId !== "string" || !UUID.test(body.postId)) {
      return errorResponse("Post id is invalid.", 400);
    }
    if (
      typeof body.prompt !== "string" ||
      !body.prompt.trim() ||
      body.prompt.length > 4_000
    ) {
      return errorResponse("Image prompt must contain 1 to 4,000 characters.", 400);
    }
    if (!process.env.COHORIO_IMAGE_API_KEY?.trim()) {
      return errorResponse("COHORIO_IMAGE_API_KEY is not configured.", 400);
    }
    const post = await getSocialPost(workspaceId, body.postId);
    if (!post) return errorResponse("Post not found.", 404);
    const imageUrl = await createMarketingImage(
      `Social media visual for a ${post.platform} post. No text overlays.\n\n${body.prompt.trim()}`,
    );
    const updated = await setSocialPostImage(workspaceId, post.id, imageUrl);
    if (!updated) return errorResponse("Post not found.", 404);
    return NextResponse.json({ post: updated });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const message =
      error instanceof Error ? error.message : "Unable to create an image.";
    const status = message === "COHORIO_IMAGE_API_KEY is not configured." ? 400 : 502;
    return errorResponse(message, status);
  }
}
