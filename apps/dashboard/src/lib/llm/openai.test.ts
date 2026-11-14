import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeChat, completeWithTools, llmProvider } from "./client";
import { openaiBaseUrl, openaiModel, openaiWithTools, toOpenaiMessages } from "./openai";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("COHORIO_LLM_API_KEY", "openai-test-key");
  vi.stubEnv("COHORIO_LLM_PROVIDER", "openai-compatible");
  vi.stubEnv("COHORIO_LLM_MODEL", "");
  vi.stubEnv("COHORIO_LLM_BASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("llmProvider", () => {
  it("selects openai-compatible for the openai alias and by default", () => {
    expect(llmProvider()).toBe("openai-compatible");
    vi.stubEnv("COHORIO_LLM_PROVIDER", "openai");
    expect(llmProvider()).toBe("openai-compatible");
    vi.stubEnv("COHORIO_LLM_PROVIDER", "");
    vi.stubEnv("COHORIO_LLM_API_KEY", "sk-generic-key");
    vi.stubEnv("COHORIO_LLM_BASE_URL", "https://api.groq.com/openai/v1");
    expect(llmProvider()).toBe("openai-compatible");
  });
});

describe("openaiBaseUrl and openaiModel", () => {
  it("defaults to the versioned OpenAI API and adds /v1 to a bare host", () => {
    expect(openaiBaseUrl()).toBe("https://api.openai.com/v1");
    vi.stubEnv("COHORIO_LLM_BASE_URL", "https://api.openai.com");
    expect(openaiBaseUrl()).toBe("https://api.openai.com/v1");
    vi.stubEnv("COHORIO_LLM_BASE_URL", "https://api.openai.com/v1/");
    expect(openaiBaseUrl()).toBe("https://api.openai.com/v1");
  });

  it("leaves gateway paths untouched", () => {
    vi.stubEnv("COHORIO_LLM_BASE_URL", "https://api.groq.com/openai/v1");
    expect(openaiBaseUrl()).toBe("https://api.groq.com/openai/v1");
    vi.stubEnv("COHORIO_LLM_BASE_URL", "https://openrouter.ai/api/v1/");
    expect(openaiBaseUrl()).toBe("https://openrouter.ai/api/v1");
  });

  it("defaults the model and passes any compatible model id through", () => {
    expect(openaiModel()).toBe("gpt-4.1-mini");
    vi.stubEnv("COHORIO_LLM_MODEL", "gpt-4o");
    expect(openaiModel()).toBe("gpt-4o");
    // Compatible gateways serve other families over the same API.
    vi.stubEnv("COHORIO_LLM_MODEL", "llama-3.3-70b-versatile");
    expect(openaiModel()).toBe("llama-3.3-70b-versatile");
  });
});

describe("toOpenaiMessages", () => {
  it("strips provider-only fields so the transcript stays standard", () => {
    expect(
      toOpenaiMessages([
        { role: "user", content: "Write ads" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call-1", type: "function", function: { name: "load_skill", arguments: "{}" } },
          ],
          providerContent: [{ type: "thinking", thinking: "raw" }],
        },
        { role: "tool", tool_call_id: "call-1", content: "playbook", isError: true },
      ]),
    ).toEqual([
      { role: "user", content: "Write ads" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "load_skill", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: "playbook" },
    ]);
  });
});

describe("openaiWithTools", () => {
  it("posts tools to chat completions and parses tool calls and usage", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: "call-1", type: "function", function: { name: "load_skill", arguments: '{"skill":"ads"}' } },
                { id: "call-2", type: "other", function: { name: "nope", arguments: "{}" } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 30 },
      }),
    );
    const turn = await openaiWithTools({
      messages: [{ role: "user", content: "Write ads" }],
      tools: [
        {
          type: "function",
          function: { name: "load_skill", description: "Load a skill", parameters: { type: "object" } },
        },
      ],
    });
    expect(turn.toolCalls).toEqual([
      { id: "call-1", type: "function", function: { name: "load_skill", arguments: '{"skill":"ads"}' } },
    ]);
    expect(turn.usage).toEqual({ promptTokens: 120, completionTokens: 30 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer openai-test-key");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toHaveLength(1);
  });

  it("sends the configured compatible model id to a custom base URL", async () => {
    vi.stubEnv("COHORIO_LLM_MODEL", "llama-3.3-70b-versatile");
    vi.stubEnv("COHORIO_LLM_BASE_URL", "https://api.groq.com/openai/v1");
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Done." } }] }));
    const turn = await completeWithTools({ messages: [{ role: "user", content: "Hi" }], tools: [] });
    expect(turn.content).toBe("Done.");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("never forwards the provider error body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "secret echo of the request" } }, 401));
    await expect(
      openaiWithTools({ messages: [{ role: "user", content: "Hi" }], tools: [] }),
    ).rejects.toThrow("The language model rejected the API key (HTTP 401).");
  });

  it("points at the model id on a 404", async () => {
    vi.stubEnv("COHORIO_LLM_MODEL", "no-such-model");
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "model not found" } }, 404));
    await expect(
      openaiWithTools({ messages: [{ role: "user", content: "Hi" }], tools: [] }),
    ).rejects.toThrow(/HTTP 404.*COHORIO_LLM_MODEL "no-such-model"/);
  });
});

describe("openaiChat through completeChat", () => {
  it("returns the message content", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Headline" } }] }));
    await expect(completeChat([{ role: "user", content: "Write a headline" }])).resolves.toBe("Headline");
  });
});
