import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/database", () => ({
  query: (...args: unknown[]) => query(...args),
}));

import { assertAgentBudget, getAgentSpend, planBudgetUsd } from "./budget";

function spendQueries(plan: string, spent: string, status = "active") {
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ plan, status }] })
    .mockResolvedValueOnce({ rows: [{ spent }] });
}

describe("planBudgetUsd", () => {
  it("has per-plan defaults", () => {
    expect(planBudgetUsd("free")).toBe(1);
    expect(planBudgetUsd("pro")).toBe(50);
    expect(planBudgetUsd("team")).toBe(200);
  });
});

describe("assertAgentBudget", () => {
  beforeEach(() => {
    query.mockReset();
    vi.unstubAllEnvs();
  });

  it("allows a free workspace under its $1 budget", async () => {
    spendQueries("free", "0.25");
    await expect(assertAgentBudget("workspace-1")).resolves.toMatchObject({
      plan: "free",
      spentUsd: 0.25,
      budgetUsd: 1,
    });
  });

  it("rejects a free workspace at its budget", async () => {
    spendQueries("free", "1.00");
    await expect(assertAgentBudget("workspace-1")).rejects.toMatchObject({
      name: "AGENT_BUDGET_EXCEEDED",
    });
  });

  it("gives pro workspaces the larger budget", async () => {
    spendQueries("pro", "20");
    await expect(getAgentSpend("workspace-1")).resolves.toMatchObject({
      plan: "pro",
      spentUsd: 20,
      budgetUsd: 50,
    });
  });

  it("honours an env override", async () => {
    vi.stubEnv("COHORIO_AGENT_BUDGET_FREE_USD", "5");
    spendQueries("free", "2");
    await expect(getAgentSpend("workspace-1")).resolves.toMatchObject({
      budgetUsd: 5,
    });
  });
});
