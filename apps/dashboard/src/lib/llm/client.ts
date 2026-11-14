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

export type LlmProvider = "anthropic" | "meta-muse" | "openai-compatible";

/**
 * COHORIO_LLM_PROVIDER picks the API: "anthropic", "meta-muse" (aliases
 * "meta", "muse", "meta-ai") or "openai-compatible" (alias "openai"). Unset,
 * an Anthropic key (sk-ant-) means Claude through the Anthropic SDK, a base
 * URL at api.meta.ai means Meta Muse, and anything else uses the
 * OpenAI-compatible chat-completions endpoint (OpenAI, Groq, OpenRouter, ...).
 */
export function llmProvider(): LlmProvider {
  const configured = process.env.COHORIO_LLM_PROVIDER?.trim().toLowerCase();
  if (configured === "anthropic") return configured;
  if (configured === "openai-compatible" || configured === "openai") return "openai-compatible";
  if (configured === "meta-muse" || configured === "meta" || configured === "muse" || configured === "meta-ai") {
    return "meta-muse";
  }
  if (process.env.COHORIO_LLM_API_KEY?.trim().startsWith("sk-ant-")) return "anthropic";
  if ((process.env.COHORIO_LLM_BASE_URL ?? "").includes("api.meta.ai")) return "meta-muse";
  return "openai-compatible";
}

export const completeWithTools: ToolModel = async (input) => {
  if (llmProvider() === "anthropic") {
    const { claudeWithTools } = await import("./anthropic");
    return claudeWithTools(input);
  }
  if (llmProvider() === "meta-muse") {
    const { museWithTools } = await import("./meta-muse");
    return museWithTools(input);
  }
  const { openaiWithTools } = await import("./openai");
  return openaiWithTools(input);
};

export async function completeChat(messages: ChatMessage[]) {
  if (llmProvider() === "anthropic") {
    const { claudeChat } = await import("./anthropic");
    return claudeChat(messages);
  }
  if (llmProvider() === "meta-muse") {
    const { museChat } = await import("./meta-muse");
    return museChat(messages);
  }
  const { openaiChat } = await import("./openai");
  return openaiChat(messages);
}
