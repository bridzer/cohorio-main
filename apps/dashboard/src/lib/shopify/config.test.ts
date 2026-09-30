import { describe, expect, it } from "vitest";
import {
  assertRequiredShopifyScopes,
  assertShopifyAppUrl,
  assertShopifyClientSecret,
} from "./install";

describe("Shopify install configuration", () => {
  it("rejects Admin API tokens used as the client secret", () => {
    expect(() => assertShopifyClientSecret("shpat_not-a-client-secret")).toThrow(
      /Client secret/,
    );
    expect(() => assertShopifyClientSecret("shpua_not-a-client-secret")).toThrow(
      /Client secret/,
    );
    expect(() => assertShopifyClientSecret("shpca_not-a-client-secret")).toThrow(
      /Client secret/,
    );
    expect(() =>
      assertShopifyClientSecret("shpss_client-secret-from-dashboard"),
    ).not.toThrow();
    expect(() => assertShopifyClientSecret("shop_secret_from_dashboard")).not.toThrow();
  });

  it("requires an HTTPS app URL for the OAuth callback", () => {
    expect(() => assertShopifyAppUrl("http://localhost:3000")).toThrow(/HTTPS/);
    expect(() => assertShopifyAppUrl("not a url")).toThrow(/HTTPS URL/);
    expect(() =>
      assertShopifyAppUrl("https://cohorio.example.com"),
    ).not.toThrow();
  });

  it("does not treat missing required scopes as granted", () => {
    expect(() => assertRequiredShopifyScopes(["read_orders"])).toThrow(
      /read_products/,
    );
    expect(() => assertRequiredShopifyScopes(["write_products"])).not.toThrow();
  });
});
