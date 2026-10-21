import type { AgentMessage, ModelUsage, ToolModel } from "@/lib/llm/client";
import { runToolCall, toolDefinitions } from "./registry";
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
  onEvent?: (event: AgentEvent) => void;
}): Promise<AgentRunResult> {
  const limits = { ...DEFAULT_AGENT_LIMITS, ...input.limits };
  const messages = [...input.messages];
  const definitions = toolDefinitions(input.tools);
  const steps: ToolStep[] = [];
  const pendingActions: PendingAction[] = [];
  const skillsLoaded = new Set<string>();
  const usage = { promptTokens: 0, completionTokens: 0, modelCalls: 0 };

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
        tier: input.tools.find((tool) => tool.name === call.function.name)?.tier ?? "unknown",
      });
      const outcome = await runToolCall(input.tools, input.ctx, call);
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
