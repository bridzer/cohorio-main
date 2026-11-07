import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/database", () => ({
  query: (...args: unknown[]) => query(...args),
}));

import {
  applyPaymentFailed,
  applySubscriptionEvent,
  stripeCustomerRef,
} from "./stripe";

const ref = (id: string) => createHash("sha256").update(id).digest("hex");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stripeCustomerRef", () => {
  it("is a stable hash that does not expose the customer id", () => {
    expect(stripeCustomerRef("cus_123")).toBe(ref("cus_123"));
    expect(stripeCustomerRef("cus_123")).not.toContain("cus_123");
  });
});

describe("applySubscriptionEvent", () => {
  beforeEach(() => {
    query.mockReset();
    // 64 hex chars = the 32-byte key encryptSecret requires.
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "0".repeat(64));
  });

  it("downgrades to free when the subscription is canceled", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await expect(
      applySubscriptionEvent({ customer: "cus_123", status: "canceled" }),
    ).resolves.toBe(true);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("plan = 'free'");
    expect(params).toEqual([ref("cus_123")]);
  });

  it("marks the plan past_due without downgrading it", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await applySubscriptionEvent({ customer: "cus_123", status: "past_due" });
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain("status = 'past_due'");
    expect(sql).not.toContain("plan =");
  });

  it("restores the plan from the price amount when active again", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await applySubscriptionEvent({
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      items: { data: [{ price: { unit_amount: 4900, currency: "usd" } }] },
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'active'");
    expect(params[0]).toBe(ref("cus_123"));
    expect(params[1]).toBe("pro");
  });

  it("acknowledges unknown customers without writing", async () => {
    query.mockResolvedValue({ rowCount: 0 });
    await expect(
      applySubscriptionEvent({ customer: "cus_unknown", status: "canceled" }),
    ).resolves.toBe(false);
  });
});

describe("applyPaymentFailed", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("marks the workspace past_due", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await expect(applyPaymentFailed({ customer: "cus_123" })).resolves.toBe(true);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("past_due");
    expect(params).toEqual([ref("cus_123")]);
  });
});
