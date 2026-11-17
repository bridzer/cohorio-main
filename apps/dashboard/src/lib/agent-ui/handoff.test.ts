import { describe, expect, it } from "vitest";
import { buildAuditHandoffPrompt } from "./handoff";

const base = {
  workspaceName: "SEO & Discovery",
  jobLabel: "Audit a site or page",
  inputs: [
    { label: "Site or page URL", value: "https://example.com" },
    { label: "Goal", value: "Convert from search" },
  ],
  report: "## Findings\n1. Fix titles.\n2. Add descriptions.",
};

describe("buildAuditHandoffPrompt", () => {
  it("seeds the new conversation with the request and the report", () => {
    const prompt = buildAuditHandoffPrompt(base);
    expect(prompt).toContain("I just ran an audit");
    expect(prompt).toContain("Workspace: SEO & Discovery");
    expect(prompt).toContain("Request: Audit a site or page");
    expect(prompt).toContain("Site or page URL: https://example.com");
    expect(prompt).toContain("## Audit report");
    expect(prompt).toContain("1. Fix titles.");
    expect(prompt).toContain("help me implement the fixes one by one");
  });

  it("stays under the agent prompt limit even for long reports and inputs", () => {
    const prompt = buildAuditHandoffPrompt({
      ...base,
      inputs: [{ label: "Issues you already know", value: "x".repeat(5_000) }],
      report: "y".repeat(50_000),
    });
    expect(prompt.length).toBeLessThanOrEqual(7_900);
    expect(prompt).toContain("report truncated");
    expect(prompt).toContain("help me implement the fixes one by one");
  });
});
