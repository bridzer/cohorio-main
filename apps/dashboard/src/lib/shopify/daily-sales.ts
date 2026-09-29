export const DAILY_SALES_SHOPIFYQL = [
  "FROM sales",
  "SHOW net_sales, orders",
  "TIMESERIES day",
  "SINCE startOfDay(-59d)",
  "UNTIL today",
  "ORDER BY day ASC",
].join("\n");

export const DAILY_SALES_QUERY = `#graphql
  query CohorioDailySales {
    shopifyqlQuery(query: """
${DAILY_SALES_SHOPIFYQL}
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

export type ShopifyqlQueryResult = {
  shopifyqlQuery: {
    tableData: {
      columns: { name: string; dataType: string }[];
      rows: unknown;
    } | null;
    parseErrors: string[];
  };
};

export type DailySalesMetric = {
  date: string;
  revenue: number;
  ordersCount: number;
};

function numberFromShopify(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowsFromTable(rows: unknown) {
  const value = typeof rows === "string" ? JSON.parse(rows) : rows;
  if (!Array.isArray(value)) {
    throw new Error("ShopifyQL returned sales rows in an unexpected shape.");
  }
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("ShopifyQL returned a sales row in an unexpected shape.");
    }
    return row as Record<string, unknown>;
  });
}

export function dailyMetricsFromShopifyql(
  result: ShopifyqlQueryResult,
): DailySalesMetric[] {
  const { tableData, parseErrors } = result.shopifyqlQuery;
  if (parseErrors.length) {
    throw new Error(parseErrors.join("; "));
  }
  if (!tableData) {
    throw new Error("ShopifyQL returned no sales table.");
  }

  return rowsFromTable(tableData.rows).map((row) => {
    const date = String(row.day ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("ShopifyQL returned a sales row without a day.");
    }
    return {
      date,
      revenue: numberFromShopify(row.net_sales),
      ordersCount: numberFromShopify(row.orders),
    };
  });
}
