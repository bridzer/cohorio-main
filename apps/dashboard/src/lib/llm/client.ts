export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
      /**
       * The provider's raw assistant content, replayed unchanged on the next
       * call. Claude needs this: its thinking blocks are valid only verbatim.
       */
      providerContent?: unknown;
    }
  | { role: "tool"; tool_call_id: string; content: string; isError?: boolean };

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ModelUsage = { promptTokens: number; completionTokens: number };

export type ModelTurn = {
  content: string | null;
  toolCalls: ToolCall[];
  usage: ModelUsage;
  /** Raw assistant content to store on the transcript (see AgentMessage). */
  providerContent?: unknown;
};

export type ToolModel = (input: {
  messages: AgentMessage[];
  tools: ToolDefinition[];
  toolChoice?: "auto" | "none";
  signal?: AbortSignal;
}) => Promise<ModelTurn>;

const MODEL_TIMEOUT_MS = 90_000;

export type LlmProvider = "anthropic" | "openai-compatible";

/**
 * COHORIO_LLM_PROVIDER picks the API. Unset, an Anthropic key (sk-ant-) means
 * Claude through the Anthropic SDK; anything else uses the OpenAI-compatible
 * chat-completions endpoint at COHORIO_LLM_BASE_URL (Groq, OpenRouter, ...).
 */
export function llmProvider(): LlmProvider {
  const configured = process.env.COHORIO_LLM_PROVIDER?.trim().toLowerCase();
  if (configured === "anthropic" || configured === "openai-compatible") return configured;
  return process.env.COHORIO_LLM_API_KEY?.trim().startsWith("sk-ant-") ? "anthropic" : "openai-compatible";
}

/** Chat-completions messages carry only the standard fields. */
function chatCompletionsMessages(messages: AgentMessage[]) {
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

function modelConfig() {
  const apiKey = process.env.COHORIO_LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("COHORIO_LLM_API_KEY is not configured.");
  }
  const baseUrl = (
    process.env.COHORIO_LLM_BASE_URL || "https://api.openai.com/v1"
  )
    .trim()
    .replace(/\/$/, "");
  const model = (process.env.COHORIO_LLM_MODEL || "gpt-4.1-mini").trim();
  return { apiKey, baseUrl, model };
}

export const completeWithTools: ToolModel = async (input) => {
  if (llmProvider() === "anthropic") {
    const { claudeWithTools } = await import("./anthropic");
    return claudeWithTools(input);
  }
  const { apiKey, baseUrl, model } = modelConfig();
  const timeout = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: chatCompletionsMessages(input.messages),
      tools: input.tools.length ? input.tools : undefined,
      tool_choice: input.tools.length ? (input.toolChoice ?? "auto") : undefined,
      temperature: 0.3,
    }),
    signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
  });
  if (!response.ok) {
    // Provider bodies can echo request details; keep them out of the error.
    throw new Error(
      `The language model request failed (HTTP ${response.status}).`,
    );
  }
  const payload = (await response.json()) as {
    choices?: {
      message?: { content?: unknown; tool_calls?: unknown };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
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
    typeof message.content === "string" && message.content.trim()
      ? message.content
      : null;
  if (!content && !toolCalls.length) {
    throw new Error("The language model returned an empty response.");
  }
  return {
    content,
    toolCalls,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
    },
  };
};

export async function completeChat(messages: ChatMessage[]) {
  if (llmProvider() === "anthropic") {
    const { claudeChat } = await import("./anthropic");
    return claudeChat(messages);
  }
  const { apiKey, baseUrl, model } = modelConfig();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    let providerMessage = "";
    try {
      const parsed = JSON.parse(detail) as {
        error?: { message?: string } | string;
      };
      providerMessage =
        typeof parsed.error === "string"
          ? parsed.error
          : (parsed.error?.message ?? "");
    } catch {
      providerMessage = detail.slice(0, 240);
    }
    throw new Error(
      providerMessage
        ? `The language model request failed: ${providerMessage}`
        : "The language model request failed.",
    );
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The language model returned an empty response.");
  }
  return content;
}
