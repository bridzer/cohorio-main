import { afterEach, describe, expect, it, vi } from "vitest";

import { appBaseUrl } from "./app-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appBaseUrl", () => {
  it("prefers APP_URL and strips paths and trailing slashes", () => {
    vi.stubEnv("APP_URL", "https://www.cohorio.site/some/path/");
    vi.stubEnv("AUTH_URL", "https://other.example.com");
    expect(appBaseUrl("https://request.example.com")).toBe("https://www.cohorio.site");
  });

  it("falls back to AUTH_URL, then the request origin", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("AUTH_URL", "https://www.cohorio.site");
    expect(appBaseUrl("https://request.example.com")).toBe("https://www.cohorio.site");
    vi.stubEnv("AUTH_URL", "");
    expect(appBaseUrl("https://request.example.com")).toBe("https://request.example.com");
  });

  it("skips invalid values instead of throwing", () => {
    vi.stubEnv("APP_URL", "not a url");
    vi.stubEnv("AUTH_URL", "ftp://files.example.com");
    expect(appBaseUrl("https://request.example.com")).toBe("https://request.example.com");
  });

  it("never returns a poisoned request host when configured", () => {
    vi.stubEnv("APP_URL", "https://www.cohorio.site");
    vi.stubEnv("AUTH_URL", "");
    expect(appBaseUrl("https://localhost:8080")).toBe("https://www.cohorio.site");
  });

  it("falls back to localhost only when nothing else exists", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("AUTH_URL", "");
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });
});
