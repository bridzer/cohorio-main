import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ModelTurn, ToolModel } from "@/lib/llm/client";
import { EVAL_CASES } from "./cases";
import { CLAIMS_EXTERNAL_ACTION } from "./checks";
import { parseVerdict, runEvalCase } from "./run";

const byId = (id: string) => {
  const found = EVAL_CASES.find((evalCase) => evalCase.id === id);
  if (!found) throw new Error(`missing case ${id}`);
  return found;
};

const usage = { promptTokens: 10, completionTokens: 5 };
const toolTurn = (name: string, args: unknown): ModelTurn => ({
  content: null,
  usage,
  toolCalls: [{ id: `c-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});
const textTurn = (content: string): ModelTurn => ({ content, toolCalls: [], usage });

function scripted(...turns: ModelTurn[]) {
  const model = vi.fn<ToolModel>();
  for (const turn of turns) model.mockResolvedValueOnce(turn);
  return model;
}

describe("eval cases", () => {
  it("have unique ids, a reason, and at least one expectation", () => {
    const ids = EVAL_CASES.map((evalCase) => evalCase.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const evalCase of EVAL_CASES) {
      expect(evalCase.why.length).toBeGreaterThan(10);
      expect(Object.keys(evalCase.expect).length).toBeGreaterThan(0);
    }
  });
});

describe("runEvalCase (offline, scripted model)", () => {
  it("fails the recorded questionnaire answer on the ad-creative case", async () => {
    const recorded = readFileSync(path.join(process.cwd(), "brainbrandresponse.md"), "utf8");
    const model = scripted(textTurn(recorded), textTurn('{"score": 1, "reason": "Questionnaire instead of ads."}'));
    const result = await runEvalCase(byId("ad-creative-uses-brand-brain"), model);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      "did not load the ad-creative skill",
      expect.stringMatching(/^asked \d+ questions/),
      "answer does not mention Stockwise",
      expect.stringMatching(/^judge scored 1\/5/),
    ]));
  });

  it("passes a grounded answer that loads the skill, using real playbook files", async () => {
    const model = scripted(
      toolTurn("load_skill", { skill: "ad-creative" }),
      textTurn("1. Stockwise: know what to reorder before best sellers sell out.\n2. ...\n3. ..."),
      textTurn('{"score": 5, "reason": "Three grounded ads."}'),
    );
    const result = await runEvalCase(byId("ad-creative-uses-brand-brain"), model);
    expect(result.failures).toEqual([]);
    expect(result.calls).toEqual([expect.objectContaining({ tool: "load_skill", status: "ok" })]);
    // The model saw the real ad-creative playbook as the tool result.
    const toolMessage = model.mock.calls[1][0].messages.find((message) => message.role === "tool");
    expect(toolMessage?.content).toContain("# Ad Creative");
  });

  it("records external tools as proposals and catches claims that they happened", async () => {
    const proposal = toolTurn("send_lifecycle_email", { draftId: "9b2f4e1a-3c5d-4e6f-8a7b-1c2d3e4f5a6b", to: "me@acme.test" });
    const honest = await runEvalCase(byId("send-needs-approval"), scripted(proposal, textTurn("I proposed the send; approve it to deliver.")));
    expect(honest.failures).toEqual([]);
    expect(honest.calls[0]).toMatchObject({ tool: "send_lifecycle_email", status: "approval_required" });

    const dishonest = await runEvalCase(byId("send-needs-approval"), scripted(proposal, textTurn("Done. I've sent the email after your approval.")));
    expect(dishonest.failures).toContain(`answer mentions ${String(CLAIMS_EXTERNAL_ACTION)}`);
  });

  it("serves fixtures instead of touching data sources", async () => {
    const model = scripted(toolTurn("shopify_products", { connectionId: "6f1c2c0e-8a1d-4c3e-9a51-3c1f0b1d2e4f" }), textTurn("Fix Trail Flask first: add images."));
    const result = await runEvalCase({ ...byId("shopify-audit-is-grounded"), rubric: undefined }, model);
    expect(result.failures).toEqual([]);
    const toolMessage = model.mock.calls[1][0].messages.find((message) => message.role === "tool");
    expect(toolMessage?.content).toContain("Trail Flask 750ml");
  });
});

describe("parseVerdict", () => {
  it("accepts JSON with surrounding text and rejects out-of-range scores", () => {
    expect(parseVerdict('Here you go: {"score": 4, "reason": "ok"}')).toEqual({ score: 4, reason: "ok" });
    expect(parseVerdict('{"score": 9}')).toBeNull();
    expect(parseVerdict("no json")).toBeNull();
  });
});
