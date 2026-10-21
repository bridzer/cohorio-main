import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "./stripe-signature";

const secret = "whsec_test_secret";
const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
const timestamp = 1_760_000_000;

function header(t: number, body = payload, key = secret) {
  const signature = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${signature}`;
}

describe("verifyStripeSignature", () => {
  it("accepts a known signed payload inside the tolerance window", () => {
    expect(() =>
      verifyStripeSignature(payload, header(timestamp), secret, (timestamp + 120) * 1000),
    ).not.toThrow();
  });

  it("rejects a timestamp older than 300 seconds", () => {
    expect(() =>
      verifyStripeSignature(payload, header(timestamp), secret, (timestamp + 301) * 1000),
    ).toThrow("Stripe signature is too old.");
  });

  it("rejects a tampered payload or wrong secret", () => {
    expect(() =>
      verifyStripeSignature(
        payload.replace("evt_1", "evt_2"),
        header(timestamp),
        secret,
        timestamp * 1000,
      ),
    ).toThrow("Stripe signature is invalid.");
    expect(() =>
      verifyStripeSignature(
        payload,
        header(timestamp, payload, "whsec_other"),
        secret,
        timestamp * 1000,
      ),
    ).toThrow("Stripe signature is invalid.");
  });

  it("fails closed without a secret or header", () => {
    expect(() => verifyStripeSignature(payload, header(timestamp), "")).toThrow(
      "STRIPE_WEBHOOK_SECRET is not configured.",
    );
    expect(() => verifyStripeSignature(payload, null, secret)).toThrow(
      "Stripe signature is missing.",
    );
  });
});
