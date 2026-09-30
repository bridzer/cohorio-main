import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { clientIp, originErrorResponse } from "./request";

function requestWithHeaders(headers: Record<string, string>) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  } as NextRequest;
}

function env(values: Record<string, string>) {
  return values as unknown as NodeJS.ProcessEnv;
}

describe("same-origin errors", () => {
  it("returns 403 for INVALID_ORIGIN", async () => {
    const response = originErrorResponse(new Error("INVALID_ORIGIN"));
    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    await expect(response!.json()).resolves.toEqual({
      error: "Invalid request origin.",
    });
  });

  it("ignores unrelated errors", () => {
    expect(originErrorResponse(new Error("UNAUTHORIZED"))).toBeNull();
  });
});

describe("client IP", () => {
  const spoofed = requestWithHeaders({
    "x-forwarded-for": "203.0.113.1, 10.0.0.2",
    "x-real-ip": "198.51.100.8",
  });

  it("ignores forwarded headers unless AUTH_TRUST_PROXY is true", () => {
    expect(clientIp(spoofed, env({}))).toBe("direct");
    expect(clientIp(spoofed, env({ AUTH_TRUST_PROXY: "false" }))).toBe(
      "direct",
    );
  });

  it("uses the last X-Forwarded-For hop behind a trusted proxy", () => {
    expect(clientIp(spoofed, env({ AUTH_TRUST_PROXY: "true" }))).toBe(
      "10.0.0.2",
    );
  });

  it("falls back to X-Real-IP then unknown", () => {
    expect(
      clientIp(
        requestWithHeaders({ "x-real-ip": "198.51.100.8" }),
        env({ AUTH_TRUST_PROXY: "true" }),
      ),
    ).toBe("198.51.100.8");
    expect(
      clientIp(requestWithHeaders({}), env({ AUTH_TRUST_PROXY: "true" })),
    ).toBe("unknown");
  });
});
