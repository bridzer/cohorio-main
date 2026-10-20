import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowMs = Date.now(),
) {
  if (!secret.trim()) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  if (!header) {
    throw new Error("Stripe signature is missing.");
  }
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) {
    throw new Error("Stripe signature is invalid.");
  }
  if (Math.abs(nowMs / 1000 - timestamp) > TOLERANCE_SECONDS) {
    throw new Error("Stripe signature is too old.");
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new Error("Stripe signature is invalid.");
  }
}
