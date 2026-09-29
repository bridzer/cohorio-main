import { describe, expect, it } from "vitest";
import {
  DAILY_SALES_SHOPIFYQL,
  dailyMetricsFromShopifyql,
  type ShopifyqlQueryResult,
} from "./daily-sales";

function result(
  overrides: Partial<ShopifyqlQueryResult["shopifyqlQuery"]> = {},
): ShopifyqlQueryResult {
  return {
    shopifyqlQuery: {
      tableData: {
        columns: [
          { name: "day", dataType: "DAY_TIMESTAMP" },
          { name: "net_sales", dataType: "MONEY" },
          { name: "orders", dataType: "INTEGER" },
        ],
        rows: [
          { day: "2026-09-28", net_sales: "10000.00", orders: 25 },
          { day: "2026-09-29", net_sales: "250.50", orders: "3" },
        ],
      },
      parseErrors: [],
      ...overrides,
    },
  };
}

describe("ShopifyQL daily sales", () => {
  it("asks the sales schema for daily net sales and orders", () => {
    expect(DAILY_SALES_SHOPIFYQL).toBe(
      [
        "FROM sales",
        "SHOW net_sales, orders",
        "TIMESERIES day",
        "SINCE startOfDay(-59d)",
        "UNTIL today",
        "ORDER BY day ASC",
      ].join("\n"),
    );
  });

  it("maps documented table rows onto daily metrics", () => {
    expect(dailyMetricsFromShopifyql(result())).toEqual([
      { date: "2026-09-28", revenue: 10000, ordersCount: 25 },
      { date: "2026-09-29", revenue: 250.5, ordersCount: 3 },
    ]);
  });

  it("surfaces ShopifyQL parse errors", () => {
    expect(() =>
      dailyMetricsFromShopifyql(
        result({
          tableData: null,
          parseErrors: ["Column Not Found: Column 'total_revenue' not found"],
        }),
      ),
    ).toThrow("Column 'total_revenue' not found");
  });
});
