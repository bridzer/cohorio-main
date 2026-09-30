import { NextRequest, NextResponse } from "next/server";
import { workspaceContextMarkdown } from "@/lib/marketing-context-prompt";
import {
  generateSocialPosts,
  isSocialPlatform,
  type SocialPlatform,
} from "@/lib/social/generate";
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

function requestedPlatforms(body: Record<string, unknown>) {
  const values: string[] = [];
  if (typeof body.platform === "string") values.push(body.platform);
  if (Array.isArray(body.platforms)) {
    for (const item of body.platforms) {
      if (typeof item !== "string") {
        throw new RangeError("Choose LinkedIn, X, or Instagram.");
      }
      values.push(item);
    }
  }
  const platforms = [...new Set(values)];
  if (!platforms.length) {
    throw new RangeError("Choose LinkedIn, X, or Instagram.");
  }
  if (!platforms.every(isSocialPlatform)) {
    throw new RangeError("Choose LinkedIn, X, or Instagram.");
  }
  return platforms as SocialPlatform[];
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse(
      "DATABASE_URL is required to generate social posts.",
      503,
    );
  }

  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const body = payload as Record<string, unknown>;
    if (typeof body.source !== "string" || !body.source.trim()) {
      return errorResponse("Source content is required.", 400);
    }
    if (body.source.length > 20_000) {
      return errorResponse("Source content exceeds 20,000 characters.", 400);
    }
    const tone =
      typeof body.tone === "string" ? body.tone.trim().slice(0, 80) : undefined;
    const platforms = requestedPlatforms(body);
    const posts = generateSocialPosts({
      source: body.source,
      platforms,
      brandContextMarkdown: await workspaceContextMarkdown(workspaceId),
      tone,
    });
    return NextResponse.json({ posts });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const message =
      error instanceof Error ? error.message : "Unable to generate posts.";
    const status = error instanceof RangeError ? 400 : 503;
    return errorResponse(message, status);
  }
}
