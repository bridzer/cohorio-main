import { NextRequest, NextResponse } from "next/server";
import {
  EmptyAgentOutputError,
  runAgentTurn,
  ThreadNotFoundError,
  type AgentTurn,
  type TurnEvent,
} from "@/lib/agent";
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

const PROMPT_LIMIT = 8_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_FAILURE = "Cohorio could not finish this request. Try again.";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Errors raised once the run has started, as a user-safe message and status. */
function runFailure(error: unknown, signal: AbortSignal) {
  if (error instanceof ThreadNotFoundError) return { message: error.message, status: 404 };
  if (error instanceof EmptyAgentOutputError) return { message: error.message, status: 502 };
  if (signal.aborted) return { message: "The request was cancelled.", status: 499 };
  console.error("Agent run failed", error);
  return { message: GENERIC_FAILURE, status: 502 };
}

const SKILL_TOOLS = new Set(["load_skill", "read_skill_reference"]);

/** What the UI needs about a step; inputs are shown only for playbook lookups. */
function stepOutline(step: AgentTurn["result"]["steps"][number]) {
  const { tool, tier, status, durationMs, link, input } = step;
  return { tool, tier, status, durationMs, link, input: SKILL_TOOLS.has(tool) ? input : undefined };
}

function turnPayload(turn: AgentTurn) {
  const { result } = turn;
  return {
    threadId: turn.threadId,
    runId: turn.runId,
    run: {
      id: turn.copilotRunId,
      title: "Cohorio agent",
      output: result.output,
      created_at: turn.createdAt,
    },
    stopReason: result.stopReason,
    skills: result.skillsLoaded,
    steps: result.steps.map(stepOutline),
    pendingActions: turn.actions.map(({ id, tool, summary, status }) => ({
      id,
      tool,
      summary,
      status,
    })),
    usage: result.usage,
  };
}

function publicEvent(event: TurnEvent) {
  if (event.type !== "tool_end") return event;
  // Tool previews can hold page text or store data; the UI only needs the outline.
  return { type: event.type, step: stepOutline(event.step) };
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save this work.", 503);
  }
  if (!process.env.COHORIO_LLM_API_KEY?.trim()) {
    return errorResponse("COHORIO_LLM_API_KEY is not configured.", 400);
  }

  let input: Parameters<typeof runAgentTurn>[0];
  let stream = false;
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json()) as {
      prompt?: unknown;
      threadId?: unknown;
      stream?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return errorResponse("Tell Cohorio what you need.", 400);
    if (prompt.length > PROMPT_LIMIT) {
      return errorResponse("This request is too long.", 400);
    }
    if (
      body.threadId !== undefined &&
      (typeof body.threadId !== "string" || !UUID.test(body.threadId))
    ) {
      return errorResponse("Conversation not found.", 404);
    }
    stream = body.stream === true;
    await assertTaskQuota(access.workspaceId);
    input = {
      ctx: {
        workspaceId: access.workspaceId,
        userId: access.userId,
        role: access.role,
        signal: request.signal,
      },
      prompt,
      threadId: body.threadId as string | undefined,
      workspaceName: access.workspaceName,
    };
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
    console.error("Agent run setup failed", error);
    return errorResponse(GENERIC_FAILURE, 503);
  }

  if (!stream) {
    try {
      const turn = await runAgentTurn(input);
      await recordTaskEvent(input.ctx.workspaceId, "copilot");
      return NextResponse.json(turnPayload(turn), { status: 201 });
    } catch (error) {
      const failure = runFailure(error, request.signal);
      return errorResponse(failure.message, failure.status);
    }
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client went away; the run still finishes and is saved.
        }
      };
      try {
        const turn = await runAgentTurn({
          ...input,
          onEvent: (event) => send(event.type, publicEvent(event)),
        });
        await recordTaskEvent(input.ctx.workspaceId, "copilot");
        send("done", turnPayload(turn));
      } catch (error) {
        send("error", { error: runFailure(error, request.signal).message });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
