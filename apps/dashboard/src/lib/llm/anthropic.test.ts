import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    constructor(public status: number) {
      super(`status ${status}`);
    }
  }
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    beta = { messages: { create: sdk.create } };
  }
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { claudeWithTools, fromClaudeResponse, toClaudeMessages } from "./anthropic";
import { completeWithTools, llmProvider, type AgentMessage } from "./client";

const thinking = { type: "thinking", thinking: "", signature: "sig-abc" };
const toolUse = { type: "tool_use", id: "toolu_1", name: "load_skill", input: { skill: "ad-creative" } };

function response(overrides: Record<string, unknown> = {}) {
  return {
    content: [thinking, toolUse],
    stop_reason: "tool_use",
    usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 400, output_tokens: 50 },
    ...overrides,
  } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("COHORIO_LLM_API_KEY", "sk-ant-test-only");
  vi.stubEnv("COHORIO_LLM_PROVIDER", "");
  vi.stubEnv("COHORIO_LLM_MODEL", "");
  vi.stubEnv("COHORIO_LLM_EFFORT", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("llmProvider", () => {
  it("uses Claude for Anthropic keys unless told otherwise", () => {
    expect(llmProvider()).toBe("anthropic");
    vi.stubEnv("COHORIO_LLM_API_KEY", "gsk_groq");
    expect(llmProvider()).toBe("openai-compatible");
    vi.stubEnv("COHORIO_LLM_PROVIDER", "anthropic");
    expect(llmProvider()).toBe("anthropic");
  });
});

describe("toClaudeMessages", () => {
  it("lifts system text, replays raw assistant content verbatim and groups tool results", () => {
    const transcript: AgentMessage[] = [
      { role: "system", content: "You are Cohorio." },
      { role: "user", content: "brand data" },
      { role: "user", content: "Write ads" },
      {
        role: "assistant", content: null,
        tool_calls: [{ id: "toolu_1", type: "function", function: { name: "load_skill", arguments: '{"skill":"ad-creative"}' } }],
        providerContent: [thinking, toolUse],
      },
      { role: "tool", tool_call_id: "toolu_1", content: "playbook" },
      { role: "tool", tool_call_id: "toolu_2", content: '{"error":"x"}', isError: true },
      { role: "user", content: "Wrap up now." },
    ];
    const { system, messages } = toClaudeMessages(transcript);
    expect(system).toBe("You are Cohorio.");
    expect(messages).toEqual([
      { role: "user", content: [{ type: "text", text: "brand data" }, { type: "text", text: "Write ads" }] },
      { role: "assistant", content: [thinking, toolUse] },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: "playbook" },
          { type: "tool_result", tool_use_id: "toolu_2", content: '{"error":"x"}', is_error: true },
          { type: "text", text: "Wrap up now." },
        ],
      },
    ]);
    // The very same block objects are sent back, so thinking signatures stay intact.
    expect((messages[1].content as unknown[])[0]).toBe(thinking);
  });

  it("rebuilds tool_use blocks for assistant turns from other providers", () => {
    const { messages } = toClaudeMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Checking.", tool_calls: [{ id: "c1", type: "function", function: { name: "list_assets", arguments: "{bad json" } }] },
    ]);
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Checking." }, { type: "tool_use", id: "c1", name: "list_assets", input: {} }],
    });
  });
});

describe("fromClaudeResponse", () => {
  it("maps tool_use blocks, keeps the raw content and counts cached input tokens", () => {
    const turn = fromClaudeResponse(response());
    expect(turn.toolCalls).toEqual([
      { id: "toolu_1", type: "function", function: { name: "load_skill", arguments: '{"skill":"ad-creative"}' } },
    ]);
    expect(turn.content).toBeNull();
    expect(turn.providerContent).toEqual([thinking, toolUse]);
    expect(turn.usage).toEqual({ promptTokens: 520, completionTokens: 50 });
  });

  it("turns a refusal into a short answer instead of reading partial content", () => {
    const turn = fromClaudeResponse(response({ stop_reason: "refusal", content: [{ type: "text", text: "partial" }] }));
    expect(turn.content).toMatch(/can't help with that request/);
    expect(turn.toolCalls).toEqual([]);
  });
});

describe("claudeWithTools", () => {
  const tools = [{ type: "function" as const, function: { name: "load_skill", description: "Load", parameters: { type: "object", properties: {} } } }];

  it("sends a Claude request with fallbacks, explicit effort, caching and no sampling params", async () => {
    sdk.create.mockResolvedValue(response({ content: [{ type: "text", text: "Done." }], stop_reason: "end_turn" }));
    const turn = await claudeWithTools({
      messages: [{ role: "system", content: "S" }, { role: "user", content: "U" }],
      tools,
      toolChoice: "none",
    });
    expect(turn.content).toBe("Done.");
    const [params, options] = sdk.create.mock.calls[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: "S",
      tool_choice: { type: "none" },
      tools: [{ name: "load_skill", description: "Load", input_schema: { type: "object", properties: {} } }],
    });
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("thinking");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("is what completeWithTools uses for Anthropic keys", async () => {
    sdk.create.mockResolvedValue(response({ content: [{ type: "text", text: "Hi" }], stop_reason: "end_turn" }));
    vi.stubEnv("COHORIO_LLM_EFFORT", "high");
    await completeWithTools({ messages: [{ role: "user", content: "U" }], tools: [] });
    const params = sdk.create.mock.calls[0][0];
    expect(params.output_config).toEqual({ effort: "high" });
    expect(params).not.toHaveProperty("tools");
  });

  it("refuses a non-Claude model id instead of sending it", async () => {
    vi.stubEnv("COHORIO_LLM_MODEL", "openai/gpt-oss-120b");
    await expect(claudeWithTools({ messages: [{ role: "user", content: "U" }], tools: [] })).rejects.toThrow(/not a Claude model/);
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it("reports API failures without the provider's message", async () => {
    const AuthError = (Anthropic as unknown as { AuthenticationError: new (status: number) => Error }).AuthenticationError;
    sdk.create.mockRejectedValue(new AuthError(401));
    await expect(claudeWithTools({ messages: [{ role: "user", content: "U" }], tools: [] })).rejects.toThrow(
      "The language model rejected the API key (HTTP 401).",
    );
  });
});
