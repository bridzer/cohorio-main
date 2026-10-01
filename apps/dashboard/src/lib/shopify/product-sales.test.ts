import { describe, expect, it } from "vitest";
import type { ShopifyqlQueryResult } from "./daily-sales";
import {
  PRODUCT_SALES_SHOPIFYQL,
  productMetricsFromShopifyql,
} from "./product-sales";

function result(
  overrides: Partial<ShopifyqlQueryResult["shopifyqlQuery"]> = {},
): ShopifyqlQueryResult {
  return {
    shopifyqlQuery: {
      tableData: {
        columns: [
          { name: "product_id", dataType: "ID" },
          { name: "net_sales", dataType: "MONEY" },
          { name: "net_items_sold", dataType: "INTEGER" },
        ],
        rows: [
          {
            product_id: "gid://shopify/Product/11",
            net_sales: "120.50",
            net_items_sold: 4,
          },
          {
            product_id: "22",
            net_sales: 10,
            net_items_sold: "2",
          },
        ],
      },
      parseErrors: [],
      ...overrides,
    },
  };
}

describe("ShopifyQL product sales", () => {
  it("asks the sales schema for 30-day product net sales and units", () => {
    expect(PRODUCT_SALES_SHOPIFYQL).toBe(
      [
        "FROM sales",
        "SHOW net_sales, net_items_sold",
        "GROUP BY product_id",
        "SINCE startOfDay(-29d)",
        "UNTIL today",
      ].join("\n"),
    );
  });

  it("maps product rows onto revenue and units by Shopify product GID", () => {
    const parsed = productMetricsFromShopifyql(result());
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.metrics.get("gid://shopify/Product/11")).toEqual({
      revenue30d: 120.5,
      unitsSold30d: 4,
    });
    expect(parsed.metrics.get("gid://shopify/Product/22")).toEqual({
      revenue30d: 10,
      unitsSold30d: 2,
    });
  });

  it("returns parse errors without inventing product metrics", () => {
    const parsed = productMetricsFromShopifyql(
      result({
        tableData: null,
        parseErrors: ["Column Not Found: Column 'net_items_sold' not found"],
      }),
    );
    expect(parsed.metrics.size).toBe(0);
    expect(parsed.parseErrors).toEqual([
      "Column Not Found: Column 'net_items_sold' not found",
    ]);
  });
});
