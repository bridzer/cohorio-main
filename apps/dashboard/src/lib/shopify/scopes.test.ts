import { describe, expect, it } from "vitest";
import {
  expandShopifyScopes,
  missingShopifyScopes,
  parseShopifyScopes,
} from "./scopes";

describe("Shopify access scopes", () => {
  it("parses comma and space separated grants", () => {
    expect(parseShopifyScopes("write_products, read_orders")).toEqual([
      "write_products",
      "read_orders",
    ]);
    expect(parseShopifyScopes(["write_products", "read_orders"])).toEqual([
      "write_products",
      "read_orders",
    ]);
  });

  it("treats write grants as covering the matching read scope", () => {
    expect(expandShopifyScopes(["write_products"])).toEqual([
      "write_products",
      "read_products",
    ]);
    expect(
      missingShopifyScopes(["read_products"], ["write_products"]),
    ).toEqual([]);
  });

  it("still reports a truly missing read scope", () => {
    expect(
      missingShopifyScopes(["read_products"], ["read_orders"]),
    ).toEqual(["read_products"]);
  });
});
