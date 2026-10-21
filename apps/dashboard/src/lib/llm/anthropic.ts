import Anthropic from "@anthropic-ai/sdk";
import type { AgentMessage, ChatMessage, ModelTurn, ToolCall, ToolModel } from "./client";

// Claude through the official Anthropic SDK. Selected with
// COHORIO_LLM_PROVIDER=anthropic (or an sk-ant- key); see client.ts.

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
// Server-side refusal fallback: a declined request is retried on the model
// Anthropic recommends for that refusal category, inside the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const AGENT_TIMEOUT_MS = 5 * 60_000;
// Thinking counts toward max_tokens, so leave room for it as well as the reply.
const MAX_TOKENS = 16_000;

let cached: { key: string; client: Anthropic } | null = null;

function claudeClient() {
  const apiKey = process.env.COHORIO_LLM_API_KEY?.trim();
  if (!apiKey) throw new Error("COHORIO_LLM_API_KEY is not configured.");
  if (cached?.key !== apiKey) {
    // maxRetries: the SDK retries 408/409/429/5xx and connection errors itself.
    cached = { key: apiKey, client: new Anthropic({ apiKey, maxRetries: 2 }) };
  }
  return cached.client;
}

export function claudeModel() {
  const model = process.env.COHORIO_LLM_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
  if (!model.startsWith("claude-")) {
    throw new Error(
      `COHORIO_LLM_MODEL "${model}" is not a Claude model. Use a Claude model id such as ${DEFAULT_CLAUDE_MODEL}, or unset it.`,
    );
  }
  return model;
}

/** Effort is the control for how much Claude thinks; the API default is medium. */
export function claudeEffort(): Effort {
  const value = process.env.COHORIO_LLM_EFFORT?.trim() as Effort | undefined;
  return value && EFFORTS.includes(value) ? value : "medium";
}

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;
type Param = Anthropic.Beta.Messages.BetaMessageParam;

function parseArguments(raw: string) {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Converts the provider-neutral transcript into Messages API params. Assistant
 * turns produced by Claude are replayed from their raw content blocks,
 * unchanged, because thinking blocks are only valid byte-for-byte.
 */
export function toClaudeMessages(messages: AgentMessage[]) {
  const system: string[] = [];
  const converted: Param[] = [];
  const pushUser = (blocks: Block[]) => {
    const last = converted.at(-1);
    // Tool results for one assistant turn, and any text after them, share one user message.
    if (last?.role === "user" && Array.isArray(last.content)) {
      (last.content as Block[]).push(...blocks);
    } else {
      converted.push({ role: "user", content: blocks });
    }
  };

  for (const message of messages) {
    if (message.role === "system") {
      system.push(message.content);
    } else if (message.role === "user") {
      pushUser([{ type: "text", text: message.content }]);
    } else if (message.role === "tool") {
      pushUser([
        {
          type: "tool_result",
          tool_use_id: message.tool_call_id,
          content: message.content,
          ...(message.isError ? { is_error: true } : {}),
        },
      ]);
    } else if (message.role !== "assistant") {
      continue;
    } else if (Array.isArray(message.providerContent)) {
      converted.push({ role: "assistant", content: message.providerContent as Block[] });
    } else {
      const blocks: Block[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.tool_calls ?? []) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.function.name,
          input: parseArguments(call.function.arguments),
        });
      }
      converted.push({ role: "assistant", content: blocks.length ? blocks : "" });
    }
  }
  return { system: system.join("\n\n"), messages: converted };
}

const REFUSAL_TEXT =
  "I can't help with that request. If this looks wrong, rephrase it or contact support.";

/** Reads a Messages API response into the provider-neutral turn shape. */
export function fromClaudeResponse(response: Anthropic.Beta.Messages.BetaMessage): ModelTurn {
  const usage = response.usage;
  const promptTokens =
    (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0);
  const completionTokens = usage?.output_tokens ?? 0;
  // A refusal after fallbacks means every model in the chain declined.
  if (response.stop_reason === "refusal") {
    return { content: REFUSAL_TEXT, toolCalls: [], usage: { promptTokens, completionTokens } };
  }
  const text: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const block of response.content) {
    if (block.type === "text") text.push(block.text);
    else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      });
    }
  }
  const content = text.join("").trim() || null;
  if (!content && !toolCalls.length) {
    throw new Error("The language model returned an empty response.");
  }
  return {
    content,
    toolCalls,
    usage: { promptTokens, completionTokens },
    providerContent: response.content,
  };
}

async function create(
  params: {
    system: string;
    messages: Param[];
    tools?: Anthropic.Beta.Messages.BetaToolUnion[];
    toolChoice?: "auto" | "none";
  },
  signal?: AbortSignal,
) {
  // Configuration errors are actionable; resolve them before the call so they are not masked below.
  const client = claudeClient();
  const model = claudeModel();
  const effort = claudeEffort();
  const timeout = AbortSignal.timeout(AGENT_TIMEOUT_MS);
  try {
    return await client.beta.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort },
        // Caches the stable prefix (tools, system prompt, earlier turns) across agent steps.
        cache_control: { type: "ephemeral" },
        ...(params.system ? { system: params.system } : {}),
        messages: params.messages,
        ...(params.tools?.length
          ? { tools: params.tools, tool_choice: { type: params.toolChoice ?? "auto" } }
          : {}),
      },
      { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    // Never forward provider error bodies; they can echo request details.
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error("The language model rejected the API key (HTTP 401).");
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`The language model request failed (HTTP ${error.status ?? "error"}).`);
    }
    throw new Error("The language model request failed.");
  }
}

export const claudeWithTools: ToolModel = async (input) => {
  const { system, messages } = toClaudeMessages(input.messages);
  const response = await create(
    {
      system,
      messages,
      tools: input.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters as Anthropic.Beta.Messages.BetaTool.InputSchema,
      })),
      toolChoice: input.toolChoice,
    },
    input.signal,
  );
  return fromClaudeResponse(response);
};

export async function claudeChat(messages: ChatMessage[]) {
  const converted = toClaudeMessages(messages);
  const turn = fromClaudeResponse(await create(converted));
  if (!turn.content) throw new Error("The language model returned an empty response.");
  return turn.content;
}
