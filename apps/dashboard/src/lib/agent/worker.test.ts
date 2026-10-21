import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAutomation: vi.fn(),
  creatorRole: vi.fn(),
  recordResult: vi.fn(),
  enqueueDue: vi.fn(),
  runTurn: vi.fn(),
  quota: vi.fn(),
  record: vi.fn(),
  enqueueJob: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("./automations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./automations")>()),
  getAutomationForRun: mocks.getAutomation,
  creatorRole: mocks.creatorRole,
  recordAutomationResult: mocks.recordResult,
  enqueueDueAutomations: mocks.enqueueDue,
}));
vi.mock("./index", async () => {
  class ThreadNotFoundError extends Error {}
  return { runAgentTurn: mocks.runTurn, ThreadNotFoundError };
});
vi.mock("@/lib/billing/quota", async () => {
  class TaskQuotaError extends Error {}
  return { assertTaskQuota: mocks.quota, recordTaskEvent: mocks.record, TaskQuotaError };
});
vi.mock("./jobs", () => ({
  enqueueJob: mocks.enqueueJob,
  claimNextJob: mocks.claim,
  completeJob: mocks.complete,
  failJob: mocks.fail,
  failAbandonedJobs: vi.fn(async () => []),
  failStaleAgentRuns: vi.fn(),
  recordHeartbeat: vi.fn(),
}));
vi.mock("./notify", () => ({ sendAutomationEmail: mocks.sendEmail }));

import { ThreadNotFoundError } from "./index";
import { TaskQuotaError } from "@/lib/billing/quota";
import { automationInput } from "./automations";
import { processNextJob, runAutomationJob, runNotifyJob } from "./worker";

const job = (payload: Record<string, unknown> = { automationId: "auto-1" }) => ({
  id: "job-1", workspaceId: "workspace-a", kind: "automation" as const,
  payload, attempts: 1, maxAttempts: 1,
});
const automation = {
  id: "auto-1", workspaceId: "workspace-a", createdBy: "user-a", name: "Weekly digest",
  prompt: "Summarize last week.", enabled: true, notifyEmail: true, threadId: "thread-1",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAutomation.mockResolvedValue(automation);
  mocks.creatorRole.mockResolvedValue({ role: "member", email: "owner@acme.test" });
  mocks.runTurn.mockResolvedValue({ threadId: "thread-1", actions: [{ id: "a1" }] });
});

describe("runAutomationJob", () => {
  it("runs as the creator with their current role and records the outcome", async () => {
    await runAutomationJob(job());
    const call = mocks.runTurn.mock.calls[0][0];
    expect(call.ctx).toMatchObject({ workspaceId: "workspace-a", userId: "user-a", role: "member" });
    expect(call.ctx.signal).toBeInstanceOf(AbortSignal);
    expect(call.threadId).toBe("thread-1");
    expect(call.prompt).toMatch(/^\[Scheduled run of the automation "Weekly digest"/);
    expect(call.prompt).toContain("Summarize last week.");
    expect(mocks.record).toHaveBeenCalledWith("workspace-a", "copilot");
    expect(mocks.recordResult).toHaveBeenCalledWith("workspace-a", "auto-1", {
      status: "completed", threadId: "thread-1",
    });
    expect(mocks.enqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      kind: "notify", maxAttempts: 3,
      payload: expect.objectContaining({ status: "completed", pendingApprovals: 1 }),
    }));
  });

  it("pauses the automation instead of running when the creator lost access", async () => {
    mocks.creatorRole.mockResolvedValue({ role: "viewer", email: "x@y.z" });
    await runAutomationJob(job());
    expect(mocks.runTurn).not.toHaveBeenCalled();
    expect(mocks.recordResult).toHaveBeenCalledWith("workspace-a", "auto-1",
      expect.objectContaining({ status: "skipped", disable: true }));

    mocks.creatorRole.mockResolvedValue(null);
    await runAutomationJob(job());
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("skips without calling the model when the monthly quota is used up", async () => {
    mocks.quota.mockRejectedValue(new TaskQuotaError());
    await runAutomationJob(job());
    expect(mocks.runTurn).not.toHaveBeenCalled();
    expect(mocks.recordResult).toHaveBeenCalledWith("workspace-a", "auto-1",
      expect.objectContaining({ status: "skipped" }));
  });

  it("skips paused automations queued by the scheduler but honours Run now", async () => {
    mocks.getAutomation.mockResolvedValue({ ...automation, enabled: false });
    await runAutomationJob(job());
    expect(mocks.runTurn).not.toHaveBeenCalled();
    await runAutomationJob(job({ automationId: "auto-1", manual: true }));
    expect(mocks.runTurn).toHaveBeenCalledOnce();
  });

  it("starts a fresh conversation when the automation's thread was deleted", async () => {
    mocks.runTurn
      .mockRejectedValueOnce(new ThreadNotFoundError())
      .mockResolvedValueOnce({ threadId: "thread-2", actions: [] });
    await runAutomationJob(job());
    expect(mocks.runTurn.mock.calls[1][0].threadId).toBeUndefined();
    expect(mocks.recordResult).toHaveBeenCalledWith("workspace-a", "auto-1",
      { status: "completed", threadId: "thread-2" });
  });

  it("records a failure, emails the owner and rethrows so the job is marked failed", async () => {
    mocks.runTurn.mockRejectedValue(new Error("model down"));
    await expect(runAutomationJob(job())).rejects.toThrow("model down");
    expect(mocks.recordResult).toHaveBeenCalledWith("workspace-a", "auto-1",
      expect.objectContaining({ status: "failed" }));
    expect(mocks.enqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      kind: "notify", payload: expect.objectContaining({ status: "failed" }),
    }));
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("does nothing for an automation deleted after it was queued", async () => {
    mocks.getAutomation.mockResolvedValue(null);
    await runAutomationJob(job());
    expect(mocks.runTurn).not.toHaveBeenCalled();
    expect(mocks.recordResult).not.toHaveBeenCalled();
  });
});

describe("runNotifyJob", () => {
  it("emails the creator's current address", async () => {
    await runNotifyJob({ ...job({ automationId: "auto-1", threadId: "t1", status: "completed", pendingApprovals: 2 }), kind: "notify" });
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: "owner@acme.test", automationName: "Weekly digest", threadId: "t1",
      status: "completed", pendingApprovals: 2,
    });
  });
});

describe("processNextJob", () => {
  it("returns false on an empty queue", async () => {
    mocks.claim.mockResolvedValue(null);
    expect(await processNextJob()).toBe(false);
  });

  it("completes successful jobs and fails thrown ones with a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claim.mockResolvedValue(job());
    expect(await processNextJob()).toBe(true);
    expect(mocks.complete).toHaveBeenCalledWith("job-1");

    mocks.runTurn.mockRejectedValue(new Error("secret internals"));
    await processNextJob();
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }), "The job failed.");
  });
});

describe("automationInput", () => {
  const base = { name: "Digest", prompt: "Do it", hour: 9, timezone: "Europe/London" };

  it("requires a weekday for weekly schedules and forbids one for daily", () => {
    expect(automationInput.safeParse({ ...base, frequency: "weekly", weekday: 1 }).success).toBe(true);
    expect(automationInput.safeParse({ ...base, frequency: "weekly", weekday: null }).success).toBe(false);
    expect(automationInput.safeParse({ ...base, frequency: "daily", weekday: 3 }).success).toBe(false);
    expect(automationInput.safeParse({ ...base, frequency: "daily", weekday: null }).success).toBe(true);
  });

  it("rejects unknown timezones and out-of-range hours", () => {
    expect(automationInput.safeParse({ ...base, frequency: "daily", weekday: null, timezone: "Nowhere/City" }).success).toBe(false);
    expect(automationInput.safeParse({ ...base, frequency: "daily", weekday: null, hour: 24 }).success).toBe(false);
  });
});
