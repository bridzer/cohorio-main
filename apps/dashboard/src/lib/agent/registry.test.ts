import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool, runToolCall, toolDefinitions, ToolInputError } from "./registry";
import { AGENT_TOOLS } from "./tools";
import type { AgentContext } from "./types";

const ctx: AgentContext = { workspaceId: "workspace-a", userId: "user-a", role: "member" };

function call(name: string, args: unknown, raw?: string) {
  return {
    id: `call-${name}`,
    type: "function" as const,
    function: { name, arguments: raw ?? JSON.stringify(args) },
  };
}

describe("agent tool registry", () => {
  it("exposes uniquely named tools with JSON schemas and no tenancy arguments", () => {
    const names = AGENT_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const definition of toolDefinitions(AGENT_TOOLS)) {
      expect(definition.function.parameters).toMatchObject({ type: "object" });
      expect(definition.function.parameters).not.toHaveProperty("$schema");
      const properties = Object.keys(
        (definition.function.parameters.properties as object | undefined) ?? {},
      );
      expect(properties).not.toContain("workspaceId");
      expect(properties).not.toContain("userId");
    }
  });

  it("refuses to define a tool that accepts a workspace id from the model", () => {
    expect(() =>
      defineTool({
        name: "leaky",
        tier: "read",
        description: "x",
        input: z.object({ workspaceId: z.string() }),
        execute: async () => null,
      }),
    ).toThrow(/must not accept workspaceId/);
  });

  it("never executes external tools and returns a pending action instead", async () => {
    const outcome = await runToolCall(AGENT_TOOLS, ctx, call("send_lifecycle_email", {
      draftId: "8b0d8f9e-1c1a-4c55-9d0c-7d1a3e1b2c3d",
      to: "buyer@example.com",
    }));
    expect(outcome.step.status).toBe("approval_required");
    expect(outcome.pending?.summary).toContain("buyer@example.com");
    expect(outcome.content).toContain("Not executed");
    expect(AGENT_TOOLS.find((tool) => tool.name === "send_lifecycle_email")).not.toHaveProperty("execute");
  });

  it("only accepts Brand Brain proposals for real fields of the chosen section", async () => {
    const bad = await runToolCall(AGENT_TOOLS, ctx, call("propose_brand_brain_update", {
      section: "productOverview", values: { favouriteColour: "blue" }, reason: "x",
    }));
    expect(bad.step.status).toBe("error");
    expect(bad.content).toContain("is not a field of productOverview");
    const good = await runToolCall(AGENT_TOOLS, ctx, call("propose_brand_brain_update", {
      section: "productOverview", values: { oneLiner: "Acme helps shops" }, reason: "user said",
    }));
    expect(good.step.status).toBe("approval_required");
    expect(good.pending?.summary).toBe("Update Brand Brain productOverview: oneLiner");
  });

  it("blocks draft tools for viewers before they run", async () => {
    const execute = vi.fn();
    const tool = defineTool({
      name: "make_draft",
      tier: "draft",
      description: "x",
      input: z.object({}),
      execute,
    });
    const outcome = await runToolCall([tool], { ...ctx, role: "viewer" }, call("make_draft", {}));
    expect(outcome.step.status).toBe("error");
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports bad JSON, invalid arguments and unknown tools back to the model", async () => {
    expect((await runToolCall(AGENT_TOOLS, ctx, call("load_skill", null, "{oops"))).content)
      .toContain("valid JSON");
    expect((await runToolCall(AGENT_TOOLS, ctx, call("load_skill", { skill: "" }))).content)
      .toContain("Invalid arguments");
    expect((await runToolCall(AGENT_TOOLS, ctx, call("drop_tables", {}))).content)
      .toContain("Unknown tool");
  });

  it("hides internal error details but passes through ToolInputError messages", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const internal = defineTool({
      name: "internal_fail",
      tier: "read",
      description: "x",
      input: z.object({}),
      execute: async () => {
        throw new Error("password authentication failed for user cohorio");
      },
    });
    const fixable = defineTool({
      name: "fixable_fail",
      tier: "read",
      description: "x",
      input: z.object({}),
      execute: async () => {
        throw new ToolInputError("Store not found.");
      },
    });
    const hidden = await runToolCall([internal], ctx, call("internal_fail", {}));
    expect(hidden.content).not.toContain("password");
    expect((await runToolCall([fixable], ctx, call("fixable_fail", {}))).content)
      .toContain("Store not found.");
    consoleError.mockRestore();
  });
});

describe("skill tools", () => {
  it("loads a real skill playbook with its reference file names", async () => {
    const outcome = await runToolCall(AGENT_TOOLS, ctx, call("load_skill", { skill: "ad-creative" }));
    expect(outcome.step.status).toBe("ok");
    // References are listed before the playbook, so they survive truncation.
    expect(outcome.content).toMatch(/^\{"skill":"ad-creative","references":\[/);
    expect(outcome.content).toContain("# Ad Creative");
  });

  it("rejects unknown skills and path traversal in reference names", async () => {
    expect((await runToolCall(AGENT_TOOLS, ctx, call("load_skill", { skill: "../../etc" }))).content)
      .toContain("Unknown skill");
    const traversal = await runToolCall(AGENT_TOOLS, ctx, call("read_skill_reference", {
      skill: "ads",
      file: "../../../package.json",
    }));
    expect(traversal.step.status).toBe("error");
    expect(traversal.content).not.toContain("dependencies");
  });
});
