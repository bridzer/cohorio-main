import type { ShopifyqlQueryResult } from "./daily-sales";

export const PRODUCT_SALES_SHOPIFYQL = [
  "FROM sales",
  "SHOW net_sales, net_items_sold",
  "GROUP BY product_id",
  "SINCE startOfDay(-29d)",
  "UNTIL today",
].join("\n");

export const PRODUCT_SALES_QUERY = `#graphql
  query CohorioProductSales {
    shopifyqlQuery(query: """
${PRODUCT_SALES_SHOPIFYQL}
    """) {
      tableData {
        columns {
          name
          dataType
        }
        rows
      }
      parseErrors
    }
  }
`;

export type ProductSalesMetric = {
  revenue30d: number;
  unitsSold30d: number;
};

export function shopifyProductGid(productId: string) {
  const value = productId.trim();
  if (value.startsWith("gid://shopify/Product/")) return value;
  const numeric = value.match(/(\d+)$/);
  if (!numeric) return value;
  return `gid://shopify/Product/${numeric[1]}`;
}

function numberFromShopify(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowsFromTable(rows: unknown) {
  const value = typeof rows === "string" ? JSON.parse(rows) : rows;
  if (!Array.isArray(value)) {
    throw new Error("ShopifyQL returned product sales rows in an unexpected shape.");
  }
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("ShopifyQL returned a product sales row in an unexpected shape.");
    }
    return row as Record<string, unknown>;
  });
}

export function productMetricsFromShopifyql(result: ShopifyqlQueryResult) {
  const { tableData, parseErrors } = result.shopifyqlQuery;
  if (parseErrors.length) {
    return {
      metrics: new Map<string, ProductSalesMetric>(),
      parseErrors,
    };
  }
  if (!tableData) {
    throw new Error("ShopifyQL returned no product sales table.");
  }

  const metrics = new Map<string, ProductSalesMetric>();
  for (const row of rowsFromTable(tableData.rows)) {
    const productId = String(row.product_id ?? "").trim();
    if (!productId) {
      throw new Error("ShopifyQL returned a product sales row without a product_id.");
    }
    const gid = shopifyProductGid(productId);
    const current = metrics.get(gid) ?? { revenue30d: 0, unitsSold30d: 0 };
    current.revenue30d += numberFromShopify(row.net_sales);
    current.unitsSold30d += numberFromShopify(row.net_items_sold);
    metrics.set(gid, current);
  }
  return { metrics, parseErrors: [] as string[] };
}
