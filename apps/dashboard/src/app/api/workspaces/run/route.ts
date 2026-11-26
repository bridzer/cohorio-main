import { NextRequest, NextResponse } from "next/server";
import { insertCopilotRun } from "@/lib/copilot-repository";
import { completeChat } from "@/lib/llm/client";
import { brandBrainMessages } from "@/lib/brand-brain-messages";
import { buildAuditHandoffPrompt } from "@/lib/agent-ui/handoff";
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
    const { getMarketingContext } = await import("@/lib/marketing-context-repository");
    const { contextToMarkdown } = await import("@/lib/marketing-context");
    const stored = await getMarketingContext(access.workspaceId);
    const brandMarkdown = stored
      ? contextToMarkdown(stored.sections, stored.updatedAt)
      : "No Brand Brain context saved.";
    const [skillMarkdown, adaptive] = await Promise.all([
      readSkillMarkdown(skillDirectory),
      import("@/lib/brand-brain/learning/context-engine").then((m) =>
        m.buildAdaptiveContext({
          workspaceId: access.workspaceId,
          organizationId: access.organizationId,
          taskContext: {
            taskType: `${match.workspace.id}:${match.job.id}`,
            contentType: match.workspace.id,
            query: prompt.slice(0, 800),
            currentUserId: access.userId,
          },
          prefetchedStored: stored as unknown as { sections: import("@/lib/marketing-context").MarketingContext; updatedAt: string } | null,
        }),
      ).catch(() => null),
    ]);
    const messages = brandBrainMessages({ skillMarkdown, brandMarkdown, prompt });
    // Inject adaptive preferences into the first user message (Brand Brain context) when present
    if (adaptive?.promptBlock) {
      const lastIdx = messages.length - 1;
      if (messages[lastIdx]) {
        messages[lastIdx] = {
          ...messages[lastIdx]!,
          content: `${messages[lastIdx]!.content}\n\n${adaptive.promptBlock}`,
        };
      }
    }
    const output = await completeChat(messages);
    const run = await insertCopilotRun({
      workspaceId: access.workspaceId,
      userId: access.userId,
      skillId: skillDirectory,
      prompt,
      output,
    });
    await recordTaskEvent(access.workspaceId, "copilot");
    // Learning Loop: capture output generation (§3.B) and run internal evaluation (§8) — best-effort, non-blocking
    {
      const { brandBrainLearningService } = await import("@/lib/brand-brain/learning/service");
      brandBrainLearningService
        .captureEvent(
          { organizationId: access.organizationId, workspaceId: access.workspaceId, userId: access.userId },
          {
            eventType: "output_generated",
            sourceModule: `workspace:${match.workspace.id}:${match.job.id}`,
            entityType: "copilot_run",
            entityId: run.id,
            resultingValue: output.slice(0, 6000),
            context: { workspaceId: match.workspace.id, jobId: match.job.id, adaptiveApplied: Boolean(adaptive?.promptBlock) },
          },
        )
        .catch((e: unknown) => console.error("Learning capture workspace/run", e));
      brandBrainLearningService
        .evaluateOutput({
          organizationId: access.organizationId,
          workspaceId: access.workspaceId,
          entityType: "copilot_run",
          entityId: run.id,
          outputType: `copilot:${skillDirectory}`,
          originalOutput: output,
          brandContextMarkdown: brandMarkdown,
        })
        .catch((e: unknown) => console.error("Learning evaluate workspace/run", e));
    }
    // Audit jobs continue in chat: the response carries the first message of
    // a new agent conversation (request + report), which the client hands to
    // /agent the moment the run completes.
    const handoff = match.job.continuesInChat
      ? buildAuditHandoffPrompt({
          workspaceName: match.workspace.name,
          jobLabel: match.job.label,
          inputs: [
            ...match.job.fields
              .map((field) => ({
                label: field.label,
                value: answerText(answers[field.id]),
              }))
              .filter((item) => item.value),
            ...(chat ? [{ label: "Additional details", value: chat }] : []),
          ],
          report: output,
        })
      : null;
    return NextResponse.json(
      {
        run: {
          id: run.id,
          title: match.workspace.name,
          output: run.output,
          created_at: run.created_at,
        },
        handoff,
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
