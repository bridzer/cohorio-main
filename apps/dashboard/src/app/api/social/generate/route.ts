import { NextRequest, NextResponse } from "next/server";
import { workspaceContextMarkdown } from "@/lib/marketing-context-prompt";
import { completeChat } from "@/lib/llm/client";
import { readSkillMarkdown } from "@/lib/skills/load-skill";
import {
  clipSocialPost,
  isSocialPlatform,
  type SocialPlatform,
} from "@/lib/social/generate";
import { insertSocialPost, type SocialPost } from "@/lib/social/repository";
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
  if (!process.env.COHORIO_LLM_API_KEY?.trim()) {
    return errorResponse("COHORIO_LLM_API_KEY is not configured.", 400);
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
    const platforms = requestedPlatforms(body);
    const [skillMarkdown, brandMarkdown] = await Promise.all([
      readSkillMarkdown("social"),
      workspaceContextMarkdown(workspaceId),
    ]);
    const drafts: Partial<Record<SocialPlatform, string>> = {};
    const saved: SocialPost[] = [];
    for (const platform of platforms) {
      const output = await completeChat([
        {
          role: "system",
          content: `${skillMarkdown}\n\n${brandMarkdown}\n\nWrite one ${platform} post. Return only the post text.`,
        },
        { role: "user", content: body.source.trim() },
      ]);
      drafts[platform] = clipSocialPost(output, platform);
    }
    for (const platform of platforms) {
      const text = drafts[platform];
      if (!text) continue;
      saved.push(
        await insertSocialPost({
          workspaceId,
          platform,
          body: text,
          sourcePrompt: body.source.trim(),
        }),
      );
    }
    return NextResponse.json({ posts: drafts, saved });
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
    const status =
      error instanceof RangeError ||
      message === "COHORIO_LLM_API_KEY is not configured."
        ? 400
        : 503;
    return errorResponse(message, status);
  }
}
