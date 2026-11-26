import { NextRequest, NextResponse } from "next/server";
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
import {
  assertTaskQuota,
  quotaErrorResponse,
  recordTaskEvent,
} from "@/lib/billing/quota";

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
        throw new RangeError("Choose LinkedIn, X, Instagram, TikTok, or Facebook.");
      }
      values.push(item);
    }
  }
  const platforms = [...new Set(values)];
  if (!platforms.length) {
    throw new RangeError("Choose LinkedIn, X, Instagram, TikTok, or Facebook.");
  }
  if (!platforms.every(isSocialPlatform)) {
    throw new RangeError("Choose LinkedIn, X, Instagram, TikTok, or Facebook.");
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
    const access = await requireWorkspaceAccess("member");
    const workspaceId = access.workspaceId;
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
    const goals = [
      "Build authority",
      "Drive engagement",
      "Generate leads",
      "Drive traffic",
    ];
    const voices = [
      "Clear & insightful",
      "Bold & contrarian",
      "Warm & conversational",
      "Concise & tactical",
    ];
    if (typeof body.goal !== "string" || !goals.includes(body.goal)) {
      return errorResponse("Goal is not one of the supported choices.", 400);
    }
    if (typeof body.voice !== "string" || !voices.includes(body.voice)) {
      return errorResponse("Voice is not one of the supported choices.", 400);
    }
    const platforms = requestedPlatforms(body);
    await assertTaskQuota(workspaceId);
    const { getMarketingContext } = await import("@/lib/marketing-context-repository");
    const { contextToMarkdown } = await import("@/lib/marketing-context");
    const stored = await getMarketingContext(workspaceId);
    const brandMarkdown = stored ? contextToMarkdown(stored.sections, stored.updatedAt) : "No Brand Brain context saved.";
    const [skillMarkdown, adaptive] = await Promise.all([
      readSkillMarkdown("social"),
      import("@/lib/brand-brain/learning/context-engine").then((m) =>
        m.buildAdaptiveContext({
          workspaceId,
          organizationId: access.organizationId,
          taskContext: {
            taskType: "social_content",
            channel: platforms.join(","),
            contentType: "social_post",
            query: body.source as string,
            currentUserId: access.userId,
          },
          prefetchedStored: stored as unknown as { sections: import("@/lib/marketing-context").MarketingContext; updatedAt: string } | null,
        }),
      ).catch(() => null),
    ]);
    const drafts: Partial<Record<SocialPlatform, string>> = {};
    const saved: SocialPost[] = [];
    for (const platform of platforms) {
      const output = await completeChat([
        {
          role: "system",
          content: `${skillMarkdown}\n\n${brandMarkdown}${adaptive?.promptBlock ? `\n\n${adaptive.promptBlock}` : ""}\n\nWrite one ${platform} post. Return only the post text.`,
        },
        {
          role: "user",
          content: `${body.source.trim()}\n\nGoal: ${body.goal}\nVoice: ${body.voice}`,
        },
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
    await recordTaskEvent(workspaceId, "social");
    // Learning Loop: evaluate outputs before presenting (§8) and capture generation events.
    // Best-effort, never blocks response; output evaluations include brand voice scoring.
    for (const platform of platforms) {
      const text = drafts[platform];
      if (!text) continue;
      const { brandBrainLearningService } = await import("@/lib/brand-brain/learning/service");
      const entityId = saved.find((s) => s.platform === platform)?.id ?? null;
      brandBrainLearningService
        .captureEvent(
          { organizationId: access.organizationId, workspaceId, userId: access.userId },
          {
            eventType: "output_generated",
            sourceModule: "social/generate",
            entityType: "social_post",
            entityId: entityId ?? platform,
            resultingValue: text,
            context: { platform, goal: body.goal, voice: body.voice, adaptiveApplied: Boolean(adaptive?.promptBlock) },
          },
        )
        .catch((e: unknown) => console.error("Learning capture failed social/generate", e));
      brandBrainLearningService
        .evaluateOutput({
          organizationId: access.organizationId,
          workspaceId,
          entityType: "social_post",
          entityId: entityId ?? platform,
          outputType: `social:${platform}`,
          originalOutput: text,
          brandContextMarkdown: brandMarkdown,
        })
        .catch((e: unknown) => console.error("Output evaluation failed social/generate", e));
    }
    return NextResponse.json({ posts: drafts, saved, adaptive: adaptive ? { applied: Boolean(adaptive.promptBlock), preferencesCount: (adaptive.preferences?.length ?? 0) } : null });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const quotaResponse = quotaErrorResponse(error);
    if (quotaResponse) return quotaResponse;
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
