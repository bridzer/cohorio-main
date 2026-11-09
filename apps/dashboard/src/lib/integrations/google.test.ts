import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGa4Credential, resolveGa4AccessToken } from "./ga4";
import { clearGoogleTokenCache, freshGoogleAccessToken } from "./google";

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  clearGoogleTokenCache();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("AUTH_GOOGLE_ID", "client-id");
  vi.stubEnv("AUTH_GOOGLE_SECRET", "client-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("parseGa4Credential", () => {
  it("reads the JSON shape and the legacy bare token", () => {
    expect(parseGa4Credential('{"accessToken":"a","refreshToken":"r","propertyId":"123456"}')).toEqual({
      accessToken: "a",
      refreshToken: "r",
      propertyId: "123456",
    });
    expect(parseGa4Credential("ya29.bare-token")).toEqual({
      accessToken: "ya29.bare-token",
      refreshToken: null,
      propertyId: null,
    });
  });
});

describe("freshGoogleAccessToken", () => {
  it("exchanges the refresh token once and caches it", async () => {
    fetchMock.mockResolvedValue(json({ access_token: "fresh-token", expires_in: 3600 }));
    await expect(freshGoogleAccessToken("refresh-1")).resolves.toBe("fresh-token");
    await expect(freshGoogleAccessToken("refresh-1")).resolves.toBe("fresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-1");
    // The client secret goes to Google's token endpoint only.
    expect(body.get("client_id")).toBe("client-id");
  });

  it("rejects with a safe message when Google refuses the grant", async () => {
    fetchMock.mockResolvedValue(json({ error: "invalid_grant", error_description: "echo refresh-1" }, 400));
    await expect(freshGoogleAccessToken("refresh-1")).rejects.toThrow(/rejected the saved connection/);
    await expect(freshGoogleAccessToken("refresh-1")).rejects.not.toThrow(/refresh-1/);
  });

  it("fails clearly when no OAuth client is configured", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    await expect(freshGoogleAccessToken("refresh-1")).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveGa4AccessToken", () => {
  it("refreshes when a refresh token is saved", async () => {
    fetchMock.mockResolvedValue(json({ access_token: "fresh-token", expires_in: 3600 }));
    await expect(
      resolveGa4AccessToken({ accessToken: "stale", refreshToken: "r", propertyId: "1" }),
    ).resolves.toBe("fresh-token");
  });

  it("falls back to the stored access token when refreshing fails", async () => {
    fetchMock.mockResolvedValue(json({ error: "invalid_grant" }, 400));
    await expect(
      resolveGa4AccessToken({ accessToken: "stored", refreshToken: "r", propertyId: "1" }),
    ).resolves.toBe("stored");
  });

  it("uses the stored token as-is without a refresh token", async () => {
    await expect(
      resolveGa4AccessToken({ accessToken: "stored", refreshToken: null, propertyId: "1" }),
    ).resolves.toBe("stored");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
