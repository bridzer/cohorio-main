import type { AgentMessage, ChatMessage, ModelTurn, ToolCall, ToolModel } from "./client";

// Meta Muse through the Meta AI API (api.meta.ai). The API is
// OpenAI-compatible: POST {base}/chat/completions with a Bearer key, function
// tools and prompt/completion token usage. Selected with
// COHORIO_LLM_PROVIDER=meta-muse (aliases: meta, muse, meta-ai), or inferred
// when COHORIO_LLM_BASE_URL points at api.meta.ai; see client.ts.

export const DEFAULT_META_MODEL = "muse-wonder-1.0";
export const DEFAULT_META_BASE_URL = "https://api.meta.ai/v1";
const MODEL_TIMEOUT_MS = 90_000;

/**
 * The configured base may be the bare host (https://api.meta.ai) or already
 * carry the version path (https://api.meta.ai/v1). A pathless base gets /v1;
 * anything else is used as given.
 */
export function metaBaseUrl() {
  const configured = process.env.COHORIO_LLM_BASE_URL?.trim().replace(/\/$/, "");
  if (!configured) return DEFAULT_META_BASE_URL;
  try {
    const url = new URL(configured);
    if (url.pathname === "" || url.pathname === "/") {
      return `${url.origin}/v1`;
    }
  } catch {
    // Not a URL; return it untouched and let fetch report the problem.
  }
  return configured;
}

export function metaModel() {
  const model = process.env.COHORIO_LLM_MODEL?.trim() || DEFAULT_META_MODEL;
  if (model.startsWith("claude-")) {
    throw new Error(
      `COHORIO_LLM_MODEL "${model}" is a Claude model. Use a Muse model id such as ${DEFAULT_META_MODEL}, or switch COHORIO_LLM_PROVIDER to anthropic.`,
    );
  }
  return model;
}

function metaConfig() {
  const apiKey = process.env.COHORIO_LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("COHORIO_LLM_API_KEY is not configured.");
  }
  return { apiKey, baseUrl: metaBaseUrl(), model: metaModel() };
}

/** Chat-completions messages carry only the standard fields (as in client.ts). */
export function toMuseMessages(messages: AgentMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      const { providerContent: _raw, ...rest } = message;
      void _raw;
      return rest;
    }
    if (message.role === "tool") {
      const { isError: _flag, ...rest } = message;
      void _flag;
      return rest;
    }
    return message;
  });
}

type ChatCompletionsPayload = {
  choices?: { message?: { content?: unknown; tool_calls?: unknown } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

async function chatCompletions(body: Record<string, unknown>, signal?: AbortSignal) {
  const { apiKey, baseUrl } = metaConfig();
  const timeout = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("The language model request failed.");
  }
  if (!response.ok) {
    // Provider bodies can echo request details; keep them out of the error.
    if (response.status === 401 || response.status === 403) {
      throw new Error(`The language model rejected the API key (HTTP ${response.status}).`);
    }
    throw new Error(`The language model request failed (HTTP ${response.status}).`);
  }
  return (await response.json()) as ChatCompletionsPayload;
}

export const museWithTools: ToolModel = async (input) => {
  const { model } = metaConfig();
  const payload = await chatCompletions(
    {
      model,
      messages: toMuseMessages(input.messages),
      tools: input.tools.length ? input.tools : undefined,
      tool_choice: input.tools.length ? (input.toolChoice ?? "auto") : undefined,
      temperature: 0.3,
    },
    input.signal,
  );
  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw new Error("The language model returned an empty response.");
  }
  const toolCalls = Array.isArray(message.tool_calls)
    ? (message.tool_calls as ToolCall[]).filter(
        (call) =>
          call?.type === "function" &&
          typeof call.id === "string" &&
          typeof call.function?.name === "string",
      )
    : [];
  const content =
    typeof message.content === "string" && message.content.trim() ? message.content : null;
  if (!content && !toolCalls.length) {
    throw new Error("The language model returned an empty response.");
  }
  const turn: ModelTurn = {
    content,
    toolCalls,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
    },
  };
  return turn;
};

export async function museChat(messages: ChatMessage[]) {
  const { model } = metaConfig();
  const payload = await chatCompletions({
    model,
    messages,
    temperature: 0.4,
  });
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The language model returned an empty response.");
  }
  return content;
}
