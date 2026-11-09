import type { AgentMessage, ModelUsage, ToolCall, ToolModel } from "@/lib/llm/client";
import { runToolCall, toolDefinitions, TOOL_RESULT_LIMIT, type ToolCallOutcome } from "./registry";
import { delegateTask } from "./tools/delegate";
import type { AgentContext, AgentEvent, AgentTool, PendingAction, ToolStep } from "./types";

export type AgentLimits = {
  /** Model calls that may request tools. One extra tool-free call can follow to wrap up. */
  maxSteps: number;
  /** Tool calls across the whole run. */
  maxToolCalls: number;
  /** Prompt plus completion tokens across the whole run. */
  maxTotalTokens: number;
};

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxSteps: 10,
  maxToolCalls: 24,
  maxTotalTokens: 250_000,
};

export type AgentStopReason = "completed" | "step_limit" | "tool_limit" | "token_limit";

/**
 * Opt-in delegation: when present, the model may call delegate_task to hand a
 * self-contained subtask to a read-only subagent. Subagents get no delegate
 * tool themselves, so delegation is exactly one level deep.
 */
export type DelegateConfig = {
  /** Builds the subagent's messages for one subtask (system, context, task). */
  createMessages: (input: { task: string; skill?: string }) => AgentMessage[];
  /** Candidate tools; the loop keeps only the read tier for the subagent. */
  tools: AgentTool[];
  maxDelegations?: number;
  limits?: Partial<AgentLimits>;
};

export const DEFAULT_DELEGATE_LIMITS: AgentLimits = {
  maxSteps: 6,
  maxToolCalls: 12,
  maxTotalTokens: 80_000,
};
export const MAX_DELEGATIONS_PER_RUN = 3;

export type AgentRunResult = {
  output: string;
  stopReason: AgentStopReason;
  steps: ToolStep[];
  pendingActions: PendingAction[];
  skillsLoaded: string[];
  usage: ModelUsage & { modelCalls: number };
};

const WRAP_UP =
  "You have reached this run's work limit. Do not call more tools. Give the user your best final answer from what you have, and say what remains undone.";

export async function runAgent(input: {
  ctx: AgentContext;
  messages: AgentMessage[];
  tools: AgentTool[];
  model: ToolModel;
  limits?: Partial<AgentLimits>;
  delegate?: DelegateConfig;
  onEvent?: (event: AgentEvent) => void;
}): Promise<AgentRunResult> {
  const limits = { ...DEFAULT_AGENT_LIMITS, ...input.limits };
  const messages = [...input.messages];
  const offeredTools =
    input.delegate && !input.tools.some((tool) => tool.name === delegateTask.name)
      ? [...input.tools, delegateTask]
      : input.tools;
  const definitions = toolDefinitions(offeredTools);
  const steps: ToolStep[] = [];
  const pendingActions: PendingAction[] = [];
  const skillsLoaded = new Set<string>();
  const usage = { promptTokens: 0, completionTokens: 0, modelCalls: 0 };
  let delegations = 0;

  const callModel = async (toolChoice: "auto" | "none") => {
    const turn = await input.model({
      messages,
      tools: definitions,
      toolChoice,
      signal: input.ctx.signal,
    });
    usage.modelCalls += 1;
    usage.promptTokens += turn.usage.promptTokens;
    usage.completionTokens += turn.usage.completionTokens;
    return turn;
  };
  const result = (output: string, stopReason: AgentStopReason): AgentRunResult => ({
    output,
    stopReason,
    steps,
    pendingActions,
    skillsLoaded: [...skillsLoaded],
    usage,
  });

  const runDelegation = async (call: ToolCall): Promise<ToolCallOutcome> => {
    const started = Date.now();
    const delegate = input.delegate;
    let parsed: { task: string; skill?: string } | null = null;
    const finish = (status: ToolStep["status"], payload: unknown): ToolCallOutcome => {
      const text = typeof payload === "string" ? payload : JSON.stringify(payload);
      const body =
        text.length > TOOL_RESULT_LIMIT ? `${text.slice(0, TOOL_RESULT_LIMIT)}… [truncated]` : text;
      return {
        content: body,
        step: {
          tool: delegateTask.name,
          tier: "read",
          input: parsed ?? null,
          status,
          preview: text.slice(0, 400),
          durationMs: Date.now() - started,
        },
      };
    };
    if (!delegate) {
      return finish("error", { error: "Delegation is not available in this run." });
    }
    try {
      parsed = delegateTask.input.parse(JSON.parse(call.function.arguments || "{}"));
    } catch {
      return finish("error", {
        error: "delegate_task needs a task of at least a sentence (and an optional skill id).",
      });
    }
    if (!parsed) {
      return finish("error", { error: "delegate_task needs a task." });
    }
    const maxDelegations = delegate.maxDelegations ?? MAX_DELEGATIONS_PER_RUN;
    if (delegations >= maxDelegations) {
      return finish("error", {
        error: `Delegation limit reached (${maxDelegations} per run). Do the remaining work yourself.`,
      });
    }
    // The subagent shares this run's token budget; it never gets a fresh one.
    const remainingTokens = limits.maxTotalTokens - (usage.promptTokens + usage.completionTokens);
    if (remainingTokens <= 1_000) {
      return finish("error", { error: "Token budget exhausted; the subtask was not delegated." });
    }
    delegations += 1;
    const subLimits: AgentLimits = {
      ...DEFAULT_DELEGATE_LIMITS,
      ...delegate.limits,
      maxTotalTokens: Math.min(
        delegate.limits?.maxTotalTokens ?? DEFAULT_DELEGATE_LIMITS.maxTotalTokens,
        remainingTokens,
      ),
    };
    const subTools = delegate.tools.filter(
      (tool) => tool.tier === "read" && tool.name !== delegateTask.name,
    );
    let sub: AgentRunResult;
    try {
      sub = await runAgent({
        ctx: input.ctx,
        messages: delegate.createMessages(parsed),
        tools: subTools,
        model: input.model,
        limits: subLimits,
      });
    } catch {
      return finish("error", {
        error: "The delegated subtask failed. Continue yourself or tell the user what is missing.",
      });
    }
    usage.promptTokens += sub.usage.promptTokens;
    usage.completionTokens += sub.usage.completionTokens;
    usage.modelCalls += sub.usage.modelCalls;
    for (const skill of sub.skillsLoaded) skillsLoaded.add(skill);
    if (!sub.output.trim()) {
      return finish("error", { error: "The subagent returned no findings. Continue yourself." });
    }
    return finish("ok", {
      status: sub.stopReason,
      findings: sub.output,
      toolsUsed: [...new Set(sub.steps.map((step) => step.tool))],
      skillsLoaded: sub.skillsLoaded,
    });
  };

  let stopReason: AgentStopReason = "step_limit";
  for (let step = 0; step < limits.maxSteps; step += 1) {
    const turn = await callModel("auto");
    if (!turn.toolCalls.length) {
      return result(turn.content ?? "", "completed");
    }
    messages.push({
      role: "assistant",
      content: turn.content,
      tool_calls: turn.toolCalls,
      ...(turn.providerContent !== undefined ? { providerContent: turn.providerContent } : {}),
    });
    for (const call of turn.toolCalls) {
      // Every tool_call id needs a reply, even when the budget refuses to run it.
      if (steps.length >= limits.maxToolCalls) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Tool budget exhausted; not executed." }),
        });
        continue;
      }
      input.ctx.signal?.throwIfAborted();
      input.onEvent?.({
        type: "tool_start",
        tool: call.function.name,
        tier: offeredTools.find((tool) => tool.name === call.function.name)?.tier ?? "unknown",
      });
      const outcome =
        call.function.name === delegateTask.name && input.delegate
          ? await runDelegation(call)
          : await runToolCall(offeredTools, input.ctx, call);
      input.onEvent?.({ type: "tool_end", step: outcome.step });
      steps.push(outcome.step);
      if (outcome.pending) pendingActions.push(outcome.pending);
      if (outcome.step.tool === "load_skill" && outcome.step.status === "ok") {
        skillsLoaded.add((outcome.step.input as { skill: string }).skill);
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: outcome.content,
        ...(outcome.step.status === "error" ? { isError: true } : {}),
      });
    }
    if (steps.length >= limits.maxToolCalls) {
      stopReason = "tool_limit";
      break;
    }
    if (usage.promptTokens + usage.completionTokens >= limits.maxTotalTokens) {
      stopReason = "token_limit";
      break;
    }
  }

  messages.push({ role: "user", content: WRAP_UP });
  const final = await callModel("none");
  return result(final.content ?? "", stopReason);
}
