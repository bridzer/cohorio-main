import { createHash, randomBytes } from "node:crypto";
import { hash, verify, argon2id } from "argon2";

const PASSWORD_MIN_LENGTH = 10;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validatePassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include upper-case, lower-case, and numeric characters.";
  }
  if (password.length > 200) return "Password is too long.";
  return null;
}

export async function hashPassword(password: string) {
  return hash(password, {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function createActionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashRateLimitKey(value: string) {
  const pepper = process.env.AUTH_SECRET;
  if (!pepper) throw new Error("AUTH_SECRET is required.");
  return createHash("sha256")
    .update(`${pepper}:${value.trim().toLowerCase()}`)
    .digest("hex");
}

export function safeReturnPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
