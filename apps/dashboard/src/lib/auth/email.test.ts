import { afterEach, describe, expect, it, vi } from "vitest";

import { invitationUrl, passwordResetUrl, verificationUrl } from "./email";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth email URLs", () => {
  it("prefers AUTH_URL and strips a trailing slash", () => {
    vi.stubEnv("AUTH_URL", "https://www.cohorio.site/");
    vi.stubEnv("APP_URL", "https://other.example.com");
    expect(verificationUrl("tok")).toBe(
      "https://www.cohorio.site/verify-email?token=tok",
    );
  });

  it("falls back to APP_URL, then localhost outside production", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("APP_URL", "https://www.cohorio.site");
    expect(passwordResetUrl("tok")).toBe(
      "https://www.cohorio.site/reset-password?token=tok",
    );
    vi.stubEnv("APP_URL", "");
    expect(invitationUrl("tok")).toBe(
      "http://localhost:3000/invite?token=tok",
    );
  });

  it("refuses a localhost base when production explicitly configures one", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "http://localhost:8000");
    expect(() => verificationUrl("tok")).toThrow(/localhost in production/);
  });

  it("refuses a localhost default on a cloud host in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("RAILWAY_ENVIRONMENT", "production");
    expect(() => verificationUrl("tok")).toThrow(/localhost in production/);
  });

  it("still allows plain local smoke tests outside cloud hosts", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("RAILWAY_ENVIRONMENT", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("RENDER", "");
    expect(verificationUrl("tok")).toBe(
      "http://localhost:3000/verify-email?token=tok",
    );
  });
});
