import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeShopDomain,
  SHOPIFY_OAUTH_CALLBACK_PATH,
  shopifyRedirectUri,
  verifyShopifyQueryHmac,
} from "./client";

const SECRET = "test-client-secret";

function stubShopifyEnv() {
  vi.stubEnv("SHOPIFY_CLIENT_ID", "test-client-id");
  vi.stubEnv("SHOPIFY_CLIENT_SECRET", SECRET);
  vi.stubEnv("APP_URL", "https://www.cohorio.site");
}

/** Mirrors Shopify's signing: sorted key=value pairs, sha256 hex. */
function signed(params: Record<string, string>, secret = SECRET) {
  const message = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const hmac = createHmac("sha256", secret).update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac });
}

describe("normalizeShopDomain", () => {
  it("expands a bare store name to myshopify.com", () => {
    expect(normalizeShopDomain("mystore")).toBe("mystore.myshopify.com");
  });

  it("strips scheme, path, casing, and whitespace", () => {
    expect(normalizeShopDomain("  HTTPS://MyStore.myshopify.com/admin  ")).toBe(
      "mystore.myshopify.com",
    );
  });

  it("rejects non-Shopify and malformed domains", () => {
    expect(() => normalizeShopDomain("not a shop!")).toThrow(/valid store/);
    expect(() => normalizeShopDomain("evil.example.com")).toThrow(/valid store/);
    expect(() => normalizeShopDomain("")).toThrow(/valid store/);
  });
});

describe("verifyShopifyQueryHmac", () => {
  beforeEach(stubShopifyEnv);
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a correctly signed callback", () => {
    const params = signed({ shop: "mystore.myshopify.com", code: "auth-code", state: "nonce" });
    expect(verifyShopifyQueryHmac(params)).toBe(true);
  });

  it("ignores Shopify's extra signature parameter", () => {
    const params = signed({ shop: "mystore.myshopify.com", code: "auth-code" });
    params.set("signature", "whatever-shopify-sent");
    expect(verifyShopifyQueryHmac(params)).toBe(true);
  });

  it("rejects tampered, wrong-secret, missing, and malformed HMACs", () => {
    const valid = signed({ shop: "mystore.myshopify.com", code: "auth-code" });
    const tampered = new URLSearchParams(valid);
    tampered.set("code", "attacker-code");
    expect(verifyShopifyQueryHmac(tampered)).toBe(false);
    expect(verifyShopifyQueryHmac(signed({ shop: "x.myshopify.com" }, "wrong-secret"))).toBe(false);
    expect(verifyShopifyQueryHmac(new URLSearchParams({ shop: "x.myshopify.com" }))).toBe(false);
    expect(
      verifyShopifyQueryHmac(new URLSearchParams({ shop: "x.myshopify.com", hmac: "zzz" })),
    ).toBe(false);
  });

  it("accepts uppercase hex digests", () => {
    const params = signed({ shop: "mystore.myshopify.com" });
    params.set("hmac", (params.get("hmac") ?? "").toUpperCase());
    expect(verifyShopifyQueryHmac(params)).toBe(true);
  });
});

describe("shopifyRedirectUri", () => {
  it("builds the exact registered callback URL", () => {
    expect(SHOPIFY_OAUTH_CALLBACK_PATH).toBe("/api/shopify/oauth/callback");
    expect(shopifyRedirectUri("https://www.cohorio.site")).toBe(
      "https://www.cohorio.site/api/shopify/oauth/callback",
    );
  });

  it("strips a trailing slash so www and bare hosts stay distinct but clean", () => {
    expect(shopifyRedirectUri("https://www.cohorio.site/")).toBe(
      "https://www.cohorio.site/api/shopify/oauth/callback",
    );
    // www and apex are different hosts to Shopify: never conflate them.
    expect(shopifyRedirectUri("https://cohorio.site")).toBe(
      "https://cohorio.site/api/shopify/oauth/callback",
    );
  });
});
