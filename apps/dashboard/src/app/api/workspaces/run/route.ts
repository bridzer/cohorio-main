import { NextRequest, NextResponse } from "next/server";
import { workspaceContextMarkdown } from "@/lib/marketing-context-prompt";
import { insertCopilotRun } from "@/lib/copilot-repository";
import { completeChat } from "@/lib/llm/client";
import { brandBrainMessages } from "@/lib/brand-brain-messages";
import { readSkillMarkdown } from "@/lib/skills/load-skill";
import { findJob } from "@/lib/workspaces";
import { skillForJob } from "@/lib/workspaces-server";
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

function answerText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save this work.", 503);
  }
  if (!process.env.COHORIO_LLM_API_KEY?.trim()) {
    return errorResponse("COHORIO_LLM_API_KEY is not configured.", 400);
  }

  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json()) as {
      workspaceId?: unknown;
      jobId?: unknown;
      answers?: unknown;
      prompt?: unknown;
    };
    if (typeof body.workspaceId !== "string" || typeof body.jobId !== "string") {
      return errorResponse("Choose a workspace and a request.", 400);
    }
    const match = findJob(body.workspaceId, body.jobId);
    if (!match) return errorResponse("Choose a workspace and a request.", 400);
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    const chat =
      typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (chat.length > 8_000) {
      return errorResponse("This request is too long.", 400);
    }
    const lines = [
      `Workspace: ${match.workspace.name}`,
      `Request: ${match.job.label}`,
      "",
    ];
    const answered = match.job.fields.some((field) => answerText(answers[field.id]));
    for (const field of match.job.fields) {
      const value = answerText(answers[field.id]);
      if (field.required && !value && (!chat || answered)) {
        return errorResponse(`${field.label} is required.`, 400);
      }
      if (value.length > 4_000) {
        return errorResponse(`${field.label} is too long.`, 400);
      }
      if (value) lines.push(`${field.label}: ${value}`);
    }
    if (chat) lines.push(chat);
    const prompt = lines.join("\n");
    if (prompt.length > 8_000) {
      return errorResponse("This request is too long.", 400);
    }
    const skillDirectory = skillForJob(match.workspace.id, match.job.id);
    await assertTaskQuota(access.workspaceId);
    const [skillMarkdown, brandMarkdown] = await Promise.all([
      readSkillMarkdown(skillDirectory),
      workspaceContextMarkdown(access.workspaceId),
    ]);
    const output = await completeChat(
      brandBrainMessages({ skillMarkdown, brandMarkdown, prompt }),
    );
    const run = await insertCopilotRun({
      workspaceId: access.workspaceId,
      userId: access.userId,
      skillId: skillDirectory,
      prompt,
      output,
    });
    await recordTaskEvent(access.workspaceId, "copilot");
    return NextResponse.json(
      {
        run: {
          id: run.id,
          title: match.workspace.name,
          output: run.output,
          created_at: run.created_at,
        },
      },
      { status: 201 },
    );
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
      error instanceof Error ? error.message : "Unable to run this workspace.";
    const status =
      message === "COHORIO_LLM_API_KEY is not configured." ||
      message === "That workspace request is not available."
        ? 400
        : 503;
    return errorResponse(message, status);
  }
}
