import { describe, expect, it } from "vitest";
import { routeCopilotRequest } from "./copilot-route";

describe("routeCopilotRequest", () => {
  it("routes the co-pilot examples to a workspace request", () => {
    expect(routeCopilotRequest("Audit my homepage for CRO")).toEqual({
      workspaceId: "conversion",
      jobId: "page",
    });
    expect(routeCopilotRequest("Write a welcome email sequence")).toEqual({
      workspaceId: "content",
      jobId: "email",
    });
    expect(routeCopilotRequest("Write Meta ad headlines for the trial")).toEqual({
      workspaceId: "paid",
      jobId: "creative",
    });
    expect(routeCopilotRequest("Turn this article into LinkedIn posts")).toEqual({
      workspaceId: "content",
      jobId: "social",
    });
  });

  it("keeps a brand question on Brand Brain", () => {
    expect(routeCopilotRequest("How should we describe the product?")).toEqual({
      workspaceId: "brand-brain",
      jobId: "ask",
    });
  });
});
