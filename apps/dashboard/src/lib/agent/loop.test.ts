import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelTurn, ToolCall, ToolModel } from "@/lib/llm/client";

const mocks = vi.hoisted(() => ({ listConnections: vi.fn() }));

vi.mock("@/lib/shopify/repository", () => ({
  listConnections: mocks.listConnections,
  getConnectionForWorkspace: vi.fn(),
  getShopifyOverview: vi.fn(),
  listShopifyProducts: vi.fn(),
}));

import { runAgent } from "./loop";
import { AGENT_TOOLS } from "./tools";
import type { AgentContext } from "./types";

const ctx: AgentContext = { workspaceId: "workspace-a", userId: "user-a", role: "member" };
const start = [{ role: "user" as const, content: "How is my store doing?" }];

function toolTurn(...calls: [string, unknown][]): ModelTurn {
  return {
    content: null,
    toolCalls: calls.map(([name, args], index): ToolCall => ({
      id: `call-${index}-${name}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    })),
    usage: { promptTokens: 100, completionTokens: 10 },
  };
}

function textTurn(content: string): ModelTurn {
  return { content, toolCalls: [], usage: { promptTokens: 100, completionTokens: 50 } };
}

function scripted(...turns: ModelTurn[]) {
  const model = vi.fn<ToolModel>();
  for (const turn of turns) model.mockResolvedValueOnce(turn);
  return model;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listConnections.mockResolvedValue([
    { id: "store-1", displayName: "Acme", shopDomain: "acme.myshopify.com", status: "active" },
  ]);
});

describe("runAgent", () => {
  it("runs requested tools, returns results to the model and finishes with its answer", async () => {
    const model = scripted(toolTurn(["list_shopify_stores", {}]), textTurn("You have one store."));
    const result = await runAgent({ ctx, messages: start, tools: AGENT_TOOLS, model });

    expect(result).toMatchObject({ output: "You have one store.", stopReason: "completed" });
    expect(result.steps).toEqual([expect.objectContaining({ tool: "list_shopify_stores", status: "ok" })]);
    expect(result.usage).toEqual({ promptTokens: 200, completionTokens: 60, modelCalls: 2 });
    const secondCall = model.mock.calls[1][0].messages;
    expect(secondCall.at(-2)).toMatchObject({ role: "assistant", tool_calls: [expect.anything()] });
    expect(secondCall.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call-0-list_shopify_stores" });
    expect(secondCall.at(-1)?.content).toContain("acme.myshopify.com");
  });

  it("uses the session workspace even when the model tries to pass another one", async () => {
    const model = scripted(
      toolTurn(["list_shopify_stores", { workspaceId: "workspace-b" }]),
      textTurn("done"),
    );
    await runAgent({ ctx, messages: start, tools: AGENT_TOOLS, model });
    expect(mocks.listConnections).toHaveBeenCalledExactlyOnceWith("workspace-a");
  });

  it("collects external actions as pending without executing anything", async () => {
    const model = scripted(
      toolTurn(["publish_ad_campaign", {
        connectionId: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
        campaignId: "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b",
      }]),
      textTurn("I proposed publishing the campaign; it needs your approval."),
    );
    const result = await runAgent({ ctx, messages: start, tools: AGENT_TOOLS, model });
    expect(result.pendingActions).toEqual([
      expect.objectContaining({ tool: "publish_ad_campaign" }),
    ]);
    expect(result.steps[0].status).toBe("approval_required");
  });

  it("forces a tool-free wrap-up when the step limit is reached", async () => {
    const model = scripted(
      toolTurn(["list_shopify_stores", {}]),
      toolTurn(["list_shopify_stores", {}]),
      textTurn("Partial answer; store detail still pending."),
    );
    const result = await runAgent({
      ctx, messages: start, tools: AGENT_TOOLS, model, limits: { maxSteps: 2 },
    });
    expect(result.stopReason).toBe("step_limit");
    expect(result.output).toContain("Partial answer");
    expect(model).toHaveBeenCalledTimes(3);
    expect(model.mock.calls[2][0].toolChoice).toBe("none");
  });

  it("answers every tool call id but refuses calls beyond the tool budget", async () => {
    const model = scripted(
      toolTurn(["list_shopify_stores", {}], ["list_shopify_stores", {}], ["list_shopify_stores", {}]),
      textTurn("wrapped up"),
    );
    const result = await runAgent({
      ctx, messages: start, tools: AGENT_TOOLS, model, limits: { maxToolCalls: 2 },
    });
    expect(result.stopReason).toBe("tool_limit");
    expect(mocks.listConnections).toHaveBeenCalledTimes(2);
    const replies = model.mock.calls[1][0].messages.filter((message) => message.role === "tool");
    expect(replies).toHaveLength(3);
    expect(replies[2].content).toContain("Tool budget exhausted");
  });

  it("records which skills were loaded", async () => {
    const model = scripted(toolTurn(["load_skill", { skill: "ad-creative" }]), textTurn("ads"));
    const result = await runAgent({ ctx, messages: start, tools: AGENT_TOOLS, model });
    expect(result.skillsLoaded).toEqual(["ad-creative"]);
  });

  it("delegates a subtask to a read-only subagent and folds in its usage and skills", async () => {
    const createMessages = vi.fn(({ task }: { task: string; skill?: string }) => [
      { role: "user" as const, content: task },
    ]);
    const model = scripted(
      toolTurn(["delegate_task", { task: "Check how the Acme store is doing lately." }]),
      toolTurn(["load_skill", { skill: "ad-creative" }]),
      textTurn("Findings: one store, Acme, is active."),
      textTurn("Here is the store summary."),
    );
    const result = await runAgent({
      ctx,
      messages: start,
      tools: AGENT_TOOLS,
      model,
      delegate: { createMessages, tools: AGENT_TOOLS },
    });

    expect(result.output).toBe("Here is the store summary.");
    expect(result.steps).toEqual([expect.objectContaining({ tool: "delegate_task", status: "ok" })]);
    expect(result.skillsLoaded).toEqual(["ad-creative"]);
    expect(result.usage).toEqual({ promptTokens: 400, completionTokens: 120, modelCalls: 4 });
    expect(createMessages).toHaveBeenCalledWith(
      expect.objectContaining({ task: "Check how the Acme store is doing lately." }),
    );
    // The subagent (second model call) sees read tools only: no delegate_task,
    // no draft tools, no external tools.
    const subToolNames = model.mock.calls[1][0].tools.map((tool) => tool.function.name);
    expect(subToolNames).toContain("list_shopify_stores");
    expect(subToolNames).toContain("load_skill");
    expect(subToolNames).not.toContain("delegate_task");
    expect(subToolNames).not.toContain("save_social_posts");
    expect(subToolNames).not.toContain("send_lifecycle_email");
    // The parent receives the subagent's findings as the tool result.
    const parentReplies = model.mock.calls[3][0].messages.filter((m) => m.role === "tool");
    expect(parentReplies.at(-1)?.content).toContain("Findings: one store, Acme, is active.");
  });

  it("stops delegating at the per-run cap without spending model calls", async () => {
    const model = scripted(
      toolTurn(["delegate_task", { task: "First subtask: check the store." }]),
      textTurn("Findings one."),
      toolTurn(["delegate_task", { task: "Second subtask: check it again." }]),
      textTurn("Final answer."),
    );
    const result = await runAgent({
      ctx,
      messages: start,
      tools: AGENT_TOOLS,
      model,
      delegate: {
        createMessages: ({ task }) => [{ role: "user" as const, content: task }],
        tools: AGENT_TOOLS,
        maxDelegations: 1,
      },
    });

    expect(result.output).toBe("Final answer.");
    expect(result.steps.map((step) => step.status)).toEqual(["ok", "error"]);
    expect(result.usage.modelCalls).toBe(4);
    const replies = model.mock.calls[3][0].messages.filter((m) => m.role === "tool");
    expect(replies.at(-1)?.content).toContain("Delegation limit reached");
  });

  it("treats delegate_task as unknown when the run has no delegate configured", async () => {
    const model = scripted(
      toolTurn(["delegate_task", { task: "Check the store for me please." }]),
      textTurn("done"),
    );
    const result = await runAgent({ ctx, messages: start, tools: AGENT_TOOLS, model });
    expect(result.steps[0]).toMatchObject({ tool: "delegate_task", status: "error" });
  });
});
