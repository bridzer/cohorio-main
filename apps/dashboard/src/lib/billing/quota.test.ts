import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/database", () => ({
  query: (...args: unknown[]) => query(...args),
}));

import { assertTaskQuota, planTaskLimit } from "./quota";

function usageQueries(plan: string, used: number) {
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ plan }] })
    .mockResolvedValueOnce({ rows: [{ used }] });
}

describe("assertTaskQuota", () => {
  beforeEach(() => {
    query.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the fifth free task and rejects the sixth", async () => {
    usageQueries("free", 4);
    await expect(assertTaskQuota("workspace-1")).resolves.toMatchObject({
      used: 4,
      limit: 5,
    });
    usageQueries("free", 5);
    await expect(assertTaskQuota("workspace-1")).rejects.toMatchObject({
      name: "TASK_QUOTA_EXCEEDED",
      message: "Free plan includes 5 tasks per month.",
    });
  });

  it("allows the sixth task on pro", async () => {
    usageQueries("pro", 5);
    await expect(assertTaskQuota("workspace-1")).resolves.toMatchObject({
      plan: "pro",
      limit: null,
    });
  });

  it("enforces a configured pro limit", async () => {
    vi.stubEnv("COHORIO_QUOTA_PRO_TASKS", "10");
    usageQueries("pro", 9);
    await expect(assertTaskQuota("workspace-1")).resolves.toMatchObject({
      plan: "pro",
      limit: 10,
    });
    usageQueries("pro", 10);
    await expect(assertTaskQuota("workspace-1")).rejects.toMatchObject({
      name: "TASK_QUOTA_EXCEEDED",
      message: "Pro plan includes 10 tasks per month.",
    });
  });

  it("overrides the free limit and singularizes one task", async () => {
    vi.stubEnv("COHORIO_QUOTA_FREE_TASKS", "1");
    usageQueries("free", 1);
    await expect(assertTaskQuota("workspace-1")).rejects.toMatchObject({
      message: "Free plan includes 1 task per month.",
    });
  });

  it("treats 'unlimited' as no limit", async () => {
    vi.stubEnv("COHORIO_QUOTA_FREE_TASKS", "unlimited");
    usageQueries("free", 500);
    await expect(assertTaskQuota("workspace-1")).resolves.toMatchObject({
      limit: null,
    });
  });

  it("falls back to defaults on invalid values", () => {
    vi.stubEnv("COHORIO_QUOTA_FREE_TASKS", "lots");
    vi.stubEnv("COHORIO_QUOTA_PRO_TASKS", "-3");
    vi.stubEnv("COHORIO_QUOTA_TEAM_TASKS", "4.5");
    expect(planTaskLimit("free")).toBe(5);
    expect(planTaskLimit("pro")).toBeNull();
    expect(planTaskLimit("team")).toBeNull();
  });
});
