import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  META_OAUTH_SCOPES,
  exchangeForLongLivedToken,
  exchangeMetaCode,
  listMetaAdAccounts,
  metaAuthorizeUrl,
  metaOAuthClient,
  metaRedirectUri,
  selectMetaAccount,
  serializeMetaCredential,
} from "./meta";
import { connector as metaAds } from "./connectors/meta-ads";

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("APP_URL", "https://www.cohorio.site");
  vi.stubEnv("META_APP_ID", "1234567890");
  vi.stubEnv("META_APP_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("meta OAuth client", () => {
  it("reads the Meta app credentials from the environment", () => {
    expect(metaOAuthClient()).toEqual({ appId: "1234567890", appSecret: "test-secret" });
  });

  it("fails closed when credentials are missing", () => {
    vi.stubEnv("META_APP_ID", "");
    expect(metaOAuthClient()).toBeNull();
  });

  it("builds the callback redirect URI from APP_URL", () => {
    expect(metaRedirectUri()).toBe("https://www.cohorio.site/api/integrations/meta-ads/oauth/callback");
  });

  it("falls back to localhost without APP_URL", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("AUTH_URL", "");
    expect(metaRedirectUri()).toBe("http://localhost:3000/api/integrations/meta-ads/oauth/callback");
  });
});

describe("meta authorize URL", () => {
  it("points at the Facebook dialog with the exact registered parameters", () => {
    const url = new URL(
      metaAuthorizeUrl({
        appId: "1234567890",
        redirectUri: "https://www.cohorio.site/api/integrations/meta-ads/oauth/callback",
        state: "test-nonce",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v25.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("1234567890");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://www.cohorio.site/api/integrations/meta-ads/oauth/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(META_OAUTH_SCOPES.join(","));
    expect(url.searchParams.get("state")).toBe("test-nonce");
  });
});

describe("meta token exchange", () => {
  it("exchanges a code for a short-lived token", async () => {
    fetchMock.mockResolvedValue(json({ access_token: "short", token_type: "bearer", expires_in: 3600 }));
    await expect(exchangeMetaCode("auth-code", metaRedirectUri())).resolves.toBe("short");
    const called = String(fetchMock.mock.calls[0]?.[0]);
    expect(called).toContain("/oauth/access_token");
    expect(called).toContain("code=auth-code");
    // The secret travels to Meta only, never back to the caller.
    expect(called).toContain("client_secret=test-secret");
  });

  it("upgrades to a long-lived token via fb_exchange_token", async () => {
    fetchMock.mockResolvedValue(json({ access_token: "long", expires_in: 5184000 }));
    await expect(exchangeForLongLivedToken("short")).resolves.toBe("long");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("grant_type=fb_exchange_token");
  });

  it("never forwards Meta's error body to the caller", async () => {
    fetchMock.mockResolvedValue(json({ error: { message: "Invalid code hunter2", code: 100 } }, 400));
    await expect(exchangeMetaCode("bad", metaRedirectUri())).rejects.toThrow(/try connecting again/);
    await expect(exchangeMetaCode("bad", metaRedirectUri())).rejects.not.toThrow(/hunter2/);
  });
});

describe("meta ad accounts", () => {
  it("lists accessible ad accounts", async () => {
    fetchMock.mockResolvedValue(
      json({ data: [{ account_id: "111", name: "Main", currency: "USD" }, { account_id: 222, name: "Side" }] }),
    );
    await expect(listMetaAdAccounts("token")).resolves.toEqual([
      { id: "111", name: "Main", currency: "USD" },
      { id: "222", name: "Side", currency: null },
    ]);
  });

  it("connects silently only when exactly one account exists", () => {
    const one = [{ id: "111", name: "Main", currency: "USD" }];
    expect(selectMetaAccount(one)).toEqual(one[0]);
    expect(selectMetaAccount([])).toBeNull();
    expect(selectMetaAccount([...one, { id: "222", name: "Side", currency: null }])).toBeNull();
  });

  it("serializes to the shape the meta-ads connector parses", () => {
    const credential = serializeMetaCredential("tok", { id: "123", name: "Main", currency: "USD" });
    expect(metaAds.parse(credential)).toEqual({ accessToken: "tok", accountId: "123" });
  });
});
