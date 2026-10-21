import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelTurn } from "@/lib/llm/client";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  access: vi.fn(),
  context: vi.fn(),
  model: vi.fn(),
  insert: vi.fn(),
  quota: vi.fn(),
  record: vi.fn(),
  repo: {
    createThread: vi.fn(),
    getThread: vi.fn(),
    listThreadMessages: vi.fn(),
    listMemories: vi.fn(),
    startRun: vi.fn(),
    appendMessage: vi.fn(),
    finishRun: vi.fn(),
    failRun: vi.fn(),
    insertActions: vi.fn(),
    addMemory: vi.fn(),
  },
}));

vi.mock("@/lib/agent/audit", () => ({ auditAgentEvent: mocks.audit }));
vi.mock("@/lib/access-control", () => ({
  requireWorkspaceAccess: mocks.access,
  accessErrorResponse: () => null,
}));
vi.mock("@/lib/marketing-context-repository", () => ({
  getMarketingContext: mocks.context,
}));
vi.mock("@/lib/llm/client", () => ({ completeWithTools: mocks.model }));
vi.mock("@/lib/copilot-repository", () => ({ insertCopilotRun: mocks.insert }));
vi.mock("@/lib/integrations/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/store")>()),
  listConfiguredProviders: vi.fn(async () => ["klaviyo", "some-unbuilt-provider"]),
}));
vi.mock("@/lib/agent/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent/repository")>()),
  ...mocks.repo,
}));
vi.mock("@/lib/billing/quota", async () => {
  const { NextResponse } = await import("next/server");
  return {
    assertTaskQuota: mocks.quota,
    recordTaskEvent: mocks.record,
    quotaErrorResponse: (error: unknown) =>
      error instanceof Error && error.name === "TASK_QUOTA_EXCEEDED"
        ? NextResponse.json({ error: "Free plan includes 5 tasks per month." }, { status: 402 })
        : null,
  };
});

import { POST } from "@/app/api/agent/runs/route";
import { readEventStream } from "@/lib/agent-ui/sse";

const THREAD = "0f8fad5b-d9cb-469f-a165-70867728950e";

function request(body: unknown, origin = "https://cohorio.test") {
  return new NextRequest("https://cohorio.test/api/agent/runs", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

const turn = (partial: Partial<ModelTurn>): ModelTurn => ({
  content: null,
  toolCalls: [],
  usage: { promptTokens: 10, completionTokens: 5 },
  ...partial,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://unused-test-host/cohorio");
  vi.stubEnv("COHORIO_LLM_API_KEY", "test-only-never-sent");
  mocks.access.mockResolvedValue({
    workspaceId: "workspace-a", userId: "user-a", role: "member", workspaceName: "Acme",
  });
  mocks.context.mockResolvedValue({
    workspaceId: "workspace-a",
    sections: { productOverview: { oneLiner: "Acme makes inventory software" } },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
  });
  mocks.insert.mockImplementation(async (input) => ({
    id: "copilot-1", output: input.output, created_at: "2026-10-21T00:00:00.000Z",
  }));
  mocks.repo.createThread.mockResolvedValue({ id: "thread-new" });
  mocks.repo.listMemories.mockResolvedValue([{ id: "m1", content: "No emojis on LinkedIn" }]);
  mocks.repo.startRun.mockResolvedValue("run-1");
  mocks.repo.failRun.mockResolvedValue(undefined);
  mocks.repo.insertActions.mockImplementation(async ({ actions }) =>
    actions.map((action: { tool: string; summary: string }, index: number) => ({
      id: `action-${index}`, tool: action.tool, summary: action.summary, status: "pending",
    })),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/agent/runs", () => {
  it("starts a thread, runs the agent with memories, and persists the whole turn", async () => {
    mocks.model
      .mockResolvedValueOnce(turn({
        toolCalls: [{
          id: "c1", type: "function",
          function: { name: "load_skill", arguments: '{"skill":"ad-creative"}' },
        }],
      }))
      .mockResolvedValueOnce(turn({ content: "Three Meta ads for Acme." }));

    const response = await POST(request({ prompt: "Write Meta ads" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      threadId: "thread-new",
      runId: "run-1",
      run: { id: "copilot-1", output: "Three Meta ads for Acme." },
      stopReason: "completed",
      skills: ["ad-creative"],
      steps: [{ tool: "load_skill", tier: "read", status: "ok" }],
      pendingActions: [],
    });

    expect(mocks.repo.createThread).toHaveBeenCalledWith("workspace-a", "user-a", "Write Meta ads");
    const first = mocks.model.mock.calls[0][0];
    expect(first.messages[0].content).toContain("# Skill catalog");
    expect(first.messages[0].content).not.toContain("Acme makes inventory software");
    expect(first.messages[1].content).toContain("Acme makes inventory software");
    expect(first.messages[1].content).toContain("No emojis on LinkedIn");
    expect(first.messages[2]).toEqual({ role: "user", content: "Write Meta ads" });
    // Only connected providers with a connector add tools, and the prompt names them.
    const toolNames = first.tools.map((tool: { function: { name: string } }) => tool.function.name);
    expect(toolNames).toContain("klaviyo_campaign_performance");
    expect(toolNames).not.toContain("meta_ads_performance");
    expect(first.messages[0].content).toContain("Connected marketing tools: Klaviyo.");

    expect(mocks.repo.appendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      threadId: "thread-new", role: "user", content: "Write Meta ads",
    }));
    expect(mocks.repo.appendMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: "assistant", content: "Three Meta ads for Acme.",
    }));
    expect(mocks.repo.finishRun).toHaveBeenCalledWith(
      "workspace-a", "run-1", expect.objectContaining({ stopReason: "completed" }), "copilot-1",
    );
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ skillId: "agent" }));
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith("workspace-a", "copilot");
    const audited = mocks.audit.mock.calls.map(([event]) => event);
    expect(audited).toEqual([expect.objectContaining({
      eventType: "agent.run_completed", workspaceId: "workspace-a", actorUserId: "user-a", targetId: "run-1",
      metadata: expect.objectContaining({ tools: [{ tool: "load_skill", tier: "read", status: "ok" }] }),
    })]);
    // Tool inputs and the prompt never reach the audit log.
    expect(JSON.stringify(audited)).not.toContain("Write Meta ads");
    expect(JSON.stringify(audited)).not.toContain('"skill":"ad-creative"');
  });

  it("continues an existing thread with its history and saves proposed actions", async () => {
    mocks.repo.getThread.mockResolvedValue({ id: THREAD });
    mocks.repo.listThreadMessages.mockResolvedValue([
      { role: "user", content: "Draft a win-back email" },
      { role: "assistant", content: "Here is the win-back draft." },
      { role: "event", content: "Rejected by user: Send lifecycle draft x." },
    ]);
    mocks.model
      .mockResolvedValueOnce(turn({
        toolCalls: [{
          id: "c1", type: "function",
          function: {
            name: "send_lifecycle_email",
            arguments: JSON.stringify({
              draftId: "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b", to: "me@acme.test",
            }),
          },
        }],
      }))
      .mockResolvedValueOnce(turn({ content: "Proposed sending it to you; approve to send." }));

    const response = await POST(request({ prompt: "Send it to me@acme.test", threadId: THREAD }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.threadId).toBe(THREAD);
    expect(body.pendingActions).toEqual([
      expect.objectContaining({ id: "action-0", tool: "send_lifecycle_email", status: "pending" }),
    ]);
    expect(mocks.repo.getThread).toHaveBeenCalledWith("workspace-a", THREAD);
    expect(mocks.repo.createThread).not.toHaveBeenCalled();
    const messages = mocks.model.mock.calls[0][0].messages;
    expect(messages.slice(2, 5)).toEqual([
      { role: "user", content: "Draft a win-back email" },
      { role: "assistant", content: "Here is the win-back draft." },
      { role: "user", content: expect.stringMatching(/^\[Cohorio event, not a user request\] Rejected/) },
    ]);
    expect(mocks.repo.insertActions).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-a", threadId: THREAD, runId: "run-1",
    }));
  });

  it("returns 404 for a thread from another workspace without running the model", async () => {
    mocks.repo.getThread.mockResolvedValue(null);
    expect((await POST(request({ prompt: "hi", threadId: THREAD }))).status).toBe(404);
    expect((await POST(request({ prompt: "hi", threadId: "not-a-uuid" }))).status).toBe(404);
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests before doing any work", async () => {
    const response = await POST(request({ prompt: "hi" }, "https://evil.test"));
    expect(response.status).toBe(403);
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("returns 402 without calling the model when the quota is used up", async () => {
    mocks.quota.mockRejectedValue(Object.assign(new Error("quota"), { name: "TASK_QUOTA_EXCEEDED" }));
    const response = await POST(request({ prompt: "hi" }));
    expect(response.status).toBe(402);
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.repo.startRun).not.toHaveBeenCalled();
  });

  it("marks the run failed, hides model errors and charges nothing when the model fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.model.mockRejectedValue(new Error("upstream said: key sk-live-123 invalid"));
    const response = await POST(request({ prompt: "hi" }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("sk-live");
    expect(mocks.repo.failRun).toHaveBeenCalledWith("workspace-a", "run-1");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "agent.run_failed", targetId: "run-1" }));
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("streams thread, tool progress and the final turn as server-sent events", async () => {
    mocks.model
      .mockResolvedValueOnce(turn({
        toolCalls: [{
          id: "c1", type: "function",
          function: { name: "load_skill", arguments: '{"skill":"ad-creative"}' },
        }],
      }))
      .mockResolvedValueOnce(turn({ content: "Streamed answer." }));

    const response = await POST(request({ prompt: "Write Meta ads", stream: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events: { event: string; data: Record<string, unknown> }[] = [];
    await readEventStream(response.body!, (message) =>
      events.push(message as { event: string; data: Record<string, unknown> }));

    expect(events.map((event) => event.event)).toEqual(["thread", "tool_start", "tool_end", "done"]);
    expect(events[0].data).toEqual({ type: "thread", threadId: "thread-new", runId: "run-1" });
    const step = events[2].data.step as Record<string, unknown>;
    expect(step).toMatchObject({ tool: "load_skill", status: "ok", input: { skill: "ad-creative" } });
    expect(step).not.toHaveProperty("preview");
    expect(events[3].data).toMatchObject({ threadId: "thread-new", run: { output: "Streamed answer." } });
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith("workspace-a", "copilot");
  });

  it("reports a sanitized error event and charges nothing when a streamed run fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.model.mockRejectedValue(new Error("upstream said: key sk-live-123 invalid"));
    const response = await POST(request({ prompt: "hi", stream: true }));
    const events: { event: string; data: unknown }[] = [];
    await readEventStream(response.body!, (message) => events.push(message));
    expect(events.map((event) => event.event)).toEqual(["thread", "error"]);
    expect(JSON.stringify(events)).not.toContain("sk-live");
    expect(mocks.repo.failRun).toHaveBeenCalledWith("workspace-a", "run-1");
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("returns plain JSON errors for streamed requests that fail before the run starts", async () => {
    mocks.quota.mockRejectedValue(Object.assign(new Error("quota"), { name: "TASK_QUOTA_EXCEEDED" }));
    const response = await POST(request({ prompt: "hi", stream: true }));
    expect(response.status).toBe(402);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("validates the prompt", async () => {
    expect((await POST(request({ prompt: "  " }))).status).toBe(400);
    expect((await POST(request({ prompt: "x".repeat(8_001) }))).status).toBe(400);
  });
});
