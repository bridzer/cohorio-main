import { describe, expect, it } from "vitest";
import {
  createActionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  safeReturnPath,
  validatePassword,
  verifyPassword,
} from "./security";

describe("authentication security", () => {
  it("normalizes email identity consistently", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
  });

  it("enforces the password policy", () => {
    expect(validatePassword("short")).toContain("10 characters");
    expect(validatePassword("alllowercase123")).toContain("upper-case");
    expect(validatePassword("ValidPassword123")).toBeNull();
  });

  it("hashes passwords with Argon2id", async () => {
    const passwordHash = await hashPassword("ValidPassword123");
    expect(passwordHash).toContain("$argon2id$");
    await expect(
      verifyPassword(passwordHash, "ValidPassword123"),
    ).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, "WrongPassword123")).resolves.toBe(
      false,
    );
  });

  it("stores only deterministic action-token hashes", () => {
    const { token, tokenHash } = createActionToken();
    expect(token).not.toBe(tokenHash);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).toHaveLength(64);
  });

  it("rejects external and protocol-relative callback paths", () => {
    expect(safeReturnPath("/commerce?tab=products")).toBe(
      "/commerce?tab=products",
    );
    expect(safeReturnPath("//attacker.example")).toBe("/");
    expect(safeReturnPath("https://attacker.example")).toBe("/");
  });
});
