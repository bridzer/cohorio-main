import type { AgentMessage, ChatMessage, ModelTurn, ToolCall, ToolModel } from "./client";

// OpenAI (api.openai.com) and any OpenAI-compatible chat-completions API
// (Groq, OpenRouter, Ollama, vLLM, ...). POST {base}/chat/completions with a
// Bearer key, function tools and prompt/completion token usage. Selected with
// COHORIO_LLM_PROVIDER=openai-compatible (alias: openai); see client.ts.
//
// Any model id the endpoint serves can be used via COHORIO_LLM_MODEL — there
// is deliberately no id-prefix check here, because compatible gateways serve
// many model families (gpt-, claude-, llama-, ...) over this same API.

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const MODEL_TIMEOUT_MS = 90_000;

/**
 * A pathless base (https://api.openai.com) gets /v1; anything else — a
 * versioned path (https://api.groq.com/openai/v1), a gateway path
 * (https://openrouter.ai/api/v1), a local server — is used as given.
 */
export function openaiBaseUrl() {
  const configured = (process.env.COHORIO_LLM_BASE_URL || DEFAULT_OPENAI_BASE_URL)
    .trim()
    .replace(/\/$/, "");
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

export function openaiModel() {
  return process.env.COHORIO_LLM_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function openaiConfig() {
  const apiKey = process.env.COHORIO_LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("COHORIO_LLM_API_KEY is not configured.");
  }
  return { apiKey, baseUrl: openaiBaseUrl(), model: openaiModel() };
}

/** Chat-completions messages carry only the standard fields (as in client.ts). */
export function toOpenaiMessages(messages: AgentMessage[]) {
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
  const { apiKey, baseUrl, model } = openaiConfig();
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
    if (response.status === 404) {
      throw new Error(
        `The language model request failed (HTTP 404). Check that COHORIO_LLM_MODEL "${model}" names a model this endpoint serves.`,
      );
    }
    throw new Error(`The language model request failed (HTTP ${response.status}).`);
  }
  return (await response.json()) as ChatCompletionsPayload;
}

export const openaiWithTools: ToolModel = async (input) => {
  const { model } = openaiConfig();
  const payload = await chatCompletions(
    {
      model,
      messages: toOpenaiMessages(input.messages),
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

export async function openaiChat(messages: ChatMessage[]) {
  const { model } = openaiConfig();
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
