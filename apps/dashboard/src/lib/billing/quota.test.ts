import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/database", () => ({
  query: (...args: unknown[]) => query(...args),
}));

import { assertTaskQuota } from "./quota";

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
});
