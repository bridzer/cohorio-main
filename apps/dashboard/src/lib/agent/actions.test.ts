import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  access: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  append: vi.fn(),
  send: vi.fn(),
  publish: vi.fn(),
  getContext: vi.fn(),
  saveSection: vi.fn(),
}));

vi.mock("@/lib/agent/audit", () => ({ auditAgentEvent: mocks.audit }));
vi.mock("@/lib/access-control", () => ({
  requireWorkspaceAccess: mocks.access,
  accessErrorResponse: () => null,
}));
vi.mock("@/lib/agent/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent/repository")>()),
  claimAction: mocks.claim,
  completeAction: mocks.complete,
  appendMessage: mocks.append,
}));
vi.mock("@/lib/lifecycle-send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lifecycle-send")>()),
  sendLifecycleDraft: mocks.send,
}));
vi.mock("@/lib/ads/publish-campaign", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ads/publish-campaign")>()),
  publishWorkspaceCampaign: mocks.publish,
}));
vi.mock("@/lib/marketing-context-repository", () => ({
  getMarketingContext: mocks.getContext,
  saveMarketingContextSection: mocks.saveSection,
}));

import { POST } from "@/app/api/agent/actions/[id]/route";
import { LifecycleSendError } from "@/lib/lifecycle-send";
import { ACTION_EXECUTORS, decideAction } from "./actions";
import { AGENT_TOOLS } from "./tools";

const ACTION_ID = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const DRAFT_ID = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";

function claimed(tool: string, input: unknown, status = "approved") {
  return {
    id: ACTION_ID, threadId: "thread-1", runId: "run-1", tool, input,
    summary: `do ${tool}`, status, result: null, error: null,
    createdAt: "2026-10-21T00:00:00.000Z", decidedAt: "2026-10-21T00:01:00.000Z",
  };
}

const decide = (decision: "approve" | "reject") =>
  decideAction({ workspaceId: "workspace-a", userId: "user-a", actionId: ACTION_ID, decision });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.complete.mockImplementation(async (_workspace, _id, outcome) => ({
    ...claimed("x", {}), status: outcome.status, error: outcome.error ?? null,
  }));
});

describe("decideAction", () => {
  it("has an executor for every external tool and none for the rest", () => {
    const external = AGENT_TOOLS.filter((tool) => tool.tier === "external").map((tool) => tool.name);
    expect(Object.keys(ACTION_EXECUTORS).sort()).toEqual(external.sort());
  });

  it("executes an approved send in the deciding user's workspace and logs an event", async () => {
    mocks.claim.mockResolvedValue(claimed("send_lifecycle_email", { draftId: DRAFT_ID, to: "a@b.co" }));
    mocks.send.mockResolvedValue({ status: "sent", sentAt: "2026-10-21T00:02:00.000Z" });
    const outcome = await decide("approve");

    expect(mocks.claim).toHaveBeenCalledWith("workspace-a", ACTION_ID, "user-a", "approved");
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith("workspace-a", DRAFT_ID, "a@b.co");
    expect(mocks.complete).toHaveBeenCalledWith("workspace-a", ACTION_ID, {
      status: "executed", result: { draftId: DRAFT_ID, status: "sent", sentAt: "2026-10-21T00:02:00.000Z" },
    });
    expect(mocks.append).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1", role: "event", content: expect.stringMatching(/^Approved and executed/),
    }));
    expect(outcome).toMatchObject({ ok: true, action: { status: "executed" } });
  });

  it("audits the decision and its outcome as the deciding user", async () => {
    mocks.claim.mockResolvedValue(claimed("send_lifecycle_email", { draftId: DRAFT_ID, to: "a@b.co" }));
    mocks.send.mockResolvedValue({ status: "sent", sentAt: null });
    await decide("approve");
    expect(mocks.audit.mock.calls.map(([event]) => event.eventType)).toEqual([
      "agent.action_approved", "agent.action_executed",
    ]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-a", actorUserId: "user-a", targetType: "agent_action", targetId: ACTION_ID,
      metadata: expect.objectContaining({ tool: "send_lifecycle_email" }),
    }));

    mocks.audit.mockClear();
    mocks.claim.mockResolvedValue(claimed("send_lifecycle_email", {}, "rejected"));
    await decide("reject");
    expect(mocks.audit.mock.calls.map(([event]) => event.eventType)).toEqual(["agent.action_rejected"]);
  });

  it("does nothing when the action was already decided (double click, other tab)", async () => {
    mocks.claim.mockResolvedValue(null);
    expect(await decide("approve")).toEqual({ ok: false, reason: "not_pending" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
  });

  it("records a rejection without executing", async () => {
    mocks.claim.mockResolvedValue(claimed("send_lifecycle_email", { draftId: DRAFT_ID, to: "a@b.co" }, "rejected"));
    await decide("reject");
    expect(mocks.claim).toHaveBeenCalledWith("workspace-a", ACTION_ID, "user-a", "rejected");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.append).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringMatching(/^Rejected by user/),
    }));
  });

  it("stores user-safe provider errors and hides unexpected ones", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claim.mockResolvedValue(claimed("send_lifecycle_email", { draftId: DRAFT_ID, to: "a@b.co" }));
    mocks.send.mockRejectedValueOnce(new LifecycleSendError("resend is not connected.", 400));
    await decide("approve");
    expect(mocks.complete).toHaveBeenLastCalledWith("workspace-a", ACTION_ID, {
      status: "failed", error: "resend is not connected.",
    });

    mocks.send.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    await decide("approve");
    const stored = mocks.complete.mock.calls.at(-1)?.[2];
    expect(stored.status).toBe("failed");
    expect(stored.error).not.toContain("10.0.0.5");
  });

  it("re-validates stored input and refuses to run a tampered action", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claim.mockResolvedValue(claimed("send_lifecycle_email", { draftId: "x", to: "a@b.co, c@d.co" }));
    await decide("approve");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith("workspace-a", ACTION_ID, {
      status: "failed", error: "The proposed action is no longer valid.",
    });
  });

  it("merges a Brand Brain update into the stored section instead of replacing it", async () => {
    mocks.claim.mockResolvedValue(claimed("propose_brand_brain_update", {
      section: "productOverview", values: { category: "Inventory software" }, reason: "User said so",
    }));
    mocks.getContext.mockResolvedValue({
      sections: { productOverview: { oneLiner: "Acme helps shops", category: "Old", _notApplicable: "true" } },
    });
    await decide("approve");
    expect(mocks.saveSection).toHaveBeenCalledWith("workspace-a", "productOverview", {
      oneLiner: "Acme helps shops", category: "Inventory software",
    });
  });
});

describe("POST /api/agent/actions/[id]", () => {
  const context = { params: Promise.resolve({ id: ACTION_ID }) };
  const post = (body: unknown, origin = "https://cohorio.test") =>
    POST(
      new NextRequest(`https://cohorio.test/api/agent/actions/${ACTION_ID}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify(body),
      }),
      context as never,
    );

  beforeEach(() => {
    mocks.access.mockResolvedValue({ workspaceId: "workspace-a", userId: "user-a", role: "member" });
  });

  it("requires explicit confirmation to approve", async () => {
    expect((await post({ decision: "approve" })).status).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("rejects cross-origin decisions", async () => {
    expect((await post({ decision: "approve", confirm: true }, "https://evil.test")).status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("returns 409 when the action is no longer pending", async () => {
    mocks.claim.mockResolvedValue(null);
    expect((await post({ decision: "approve", confirm: true })).status).toBe(409);
  });

  it("requires member access", async () => {
    await post({ decision: "reject" });
    expect(mocks.access).toHaveBeenCalledWith("member");
  });
});
