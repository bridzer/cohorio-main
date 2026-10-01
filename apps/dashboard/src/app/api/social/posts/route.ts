import { NextRequest, NextResponse } from "next/server";
import { isSocialPlatform } from "@/lib/social/generate";
import {
  insertSocialPost,
  listSocialPosts,
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

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to load social posts.", 503);
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    return NextResponse.json({ posts: await listSocialPosts(workspaceId) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load social posts.";
    return errorResponse(message, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save social posts.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const body = payload as Record<string, unknown>;
    if (typeof body.platform !== "string" || !isSocialPlatform(body.platform)) {
      return errorResponse("Choose LinkedIn, X, or Instagram.", 400);
    }
    if (typeof body.body !== "string" || !body.body.trim()) {
      return errorResponse("Post text is required.", 400);
    }
    if (body.body.length > 20_000) {
      return errorResponse("Post text exceeds 20,000 characters.", 400);
    }
    const sourcePrompt =
      typeof body.sourcePrompt === "string"
        ? body.sourcePrompt.slice(0, 20_000)
        : null;
    const post = await insertSocialPost({
      workspaceId,
      platform: body.platform,
      body: body.body.trim(),
      sourcePrompt,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const message =
      error instanceof Error ? error.message : "Unable to save this post.";
    return errorResponse(message, 503);
  }
}
