import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import {
  getConnectionWithSecretsForWorkspace,
  updateConnectionTokens,
  type ShopifyConnectionWithSecrets,
} from "./repository";
import {
  analyzeProductCro,
  type ProductCroRecommendation,
} from "./product-cro";
import {
  DAILY_SALES_QUERY,
  dailyMetricsFromShopifyql,
  type ShopifyqlQueryResult,
} from "./daily-sales";
import {
  expandShopifyScopes,
  missingShopifyScopes,
  parseShopifyScopes,
} from "./scopes";

export {
  expandShopifyScopes,
  missingShopifyScopes,
  parseShopifyScopes,
} from "./scopes";

export const SHOPIFY_API_VERSION =
  process.env.SHOPIFY_API_VERSION ?? "2026-07";

const configuredShopifyScopes =
  process.env.SHOPIFY_SCOPES ??
  "read_products,write_products,read_inventory,read_orders,read_customers,read_analytics,read_reports";

export const REQUIRED_SHOPIFY_SCOPES = ["read_products"];

export const SHOPIFY_SCOPES = parseShopifyScopes(
  `${configuredShopifyScopes},read_products,write_products`,
).join(",");

export type ShopifyTokenResponse = {
  access_token: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};

export type ShopifySummary = {
  shop: {
    name: string;
    myshopifyDomain: string;
    email: string;
    currencyCode: string;
    ianaTimezone: string;
  };
  productsCount: { count: number };
  ordersCount: { count: number };
};

export function shopifyConfig() {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;

  if (!clientId || !clientSecret || !appUrl) {
    throw new Error(
      "SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and APP_URL are required.",
    );
  }

  return {
    clientId,
    clientSecret,
    appUrl: appUrl.replace(/\/$/, ""),
  };
}

export function normalizeShopDomain(input: string) {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!value.includes(".")) value = `${value}.myshopify.com`;

  if (
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value) ||
    value.length > 255
  ) {
    throw new Error("Enter a valid store name or .myshopify.com domain.");
  }
  return value;
}

export function verifyShopifyQueryHmac(params: URLSearchParams) {
  const provided = params.get("hmac");
  if (!provided || !/^[a-f0-9]{64}$/i.test(provided)) return false;

  const message = [...params.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const expected = createHmac("sha256", shopifyConfig().clientSecret)
    .update(message)
    .digest("hex");
  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function exchangeAuthorizationCode(
  shopDomain: string,
  code: string,
) {
  const { clientId, clientSecret } = shopifyConfig();
  const response = await fetch(
    `https://${shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        expiring: "1",
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify token exchange failed (${response.status}).`);
  }
  const tokens = (await response.json()) as ShopifyTokenResponse & {
    access_scopes?: { handle?: string }[];
  };
  if (!tokens.scope && tokens.access_scopes?.length) {
    tokens.scope = tokens.access_scopes
      .map((scope) => scope.handle ?? "")
      .filter(Boolean)
      .join(",");
  }
  return tokens;
}

export async function fetchGrantedShopifyScopes(
  shopDomain: string,
  accessToken: string,
) {
  try {
    const response = await fetch(
      `https://${shopDomain}/admin/oauth/access_scopes.json`,
      {
        headers: {
          Accept: "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      access_scopes?: { handle?: string }[];
    };
    return parseShopifyScopes(
      (payload.access_scopes ?? [])
        .map((scope) => scope.handle ?? "")
        .join(","),
    );
  } catch {
    return [];
  }
}

async function refreshAccessToken(
  connection: ShopifyConnectionWithSecrets,
) {
  if (!connection.refreshTokenEncrypted) {
    throw new Error("This store must be reconnected to renew access.");
  }

  const { clientId, clientSecret } = shopifyConfig();
  const response = await fetch(
    `https://${connection.shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: decryptSecret(connection.refreshTokenEncrypted),
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify token refresh failed (${response.status}).`);
  }

  const tokens = (await response.json()) as ShopifyTokenResponse;
  await updateConnectionTokens(connection.id, connection.workspaceId, {
    accessTokenEncrypted: encryptSecret(tokens.access_token),
    refreshTokenEncrypted: tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : connection.refreshTokenEncrypted,
    tokenExpiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
    refreshTokenExpiresAt: tokens.refresh_token_expires_in
      ? new Date(Date.now() + tokens.refresh_token_expires_in * 1000)
      : connection.refreshTokenExpiresAt,
    scopes: expandShopifyScopes(parseShopifyScopes(tokens.scope)).join(","),
  });

  return tokens.access_token;
}

async function accessTokenFor(connection: ShopifyConnectionWithSecrets) {
  const refreshBefore = Date.now() + 5 * 60 * 1000;
  if (
    connection.tokenExpiresAt &&
    connection.tokenExpiresAt.getTime() <= refreshBefore
  ) {
    return refreshAccessToken(connection);
  }
  return decryptSecret(connection.accessTokenEncrypted);
}

export async function shopifyGraphql<T>(
  connectionId: string,
  workspaceId: string,
  query: string,
  variables: Record<string, unknown> = {},
) {
  const connection = await getConnectionWithSecretsForWorkspace(
    connectionId,
    workspaceId,
  );
  if (!connection) throw new Error("Shopify connection not found.");

  const token = await accessTokenFor(connection);
  const response = await fetch(
    `https://${connection.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify Admin API failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (payload.errors?.length || !payload.data) {
    throw new Error(
      payload.errors?.map((error) => error.message).join("; ") ??
        "Shopify returned no data.",
    );
  }
  return payload.data;
}

export type ShopifyProductUpdateInput = {
  id: string;
  title?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  seo?: {
    title?: string;
    description?: string;
  };
};

type ShopifyProductUpdateResult = {
  productUpdate: {
    product: {
      id: string;
      title: string;
      handle: string;
      status: string;
      onlineStoreUrl: string | null;
    } | null;
    userErrors: {
      field: string[] | null;
      message: string;
    }[];
  };
};

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation CohorioUpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        title
        handle
        status
        onlineStoreUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function updateShopifyProduct(
  connectionId: string,
  workspaceId: string,
  product: ShopifyProductUpdateInput,
) {
  const result = await shopifyGraphql<ShopifyProductUpdateResult>(
    connectionId,
    workspaceId,
    PRODUCT_UPDATE_MUTATION,
    { product },
  );
  if (result.productUpdate.userErrors.length) {
    throw new Error(
      result.productUpdate.userErrors
        .map((error) => error.message)
        .join("; "),
    );
  }
  if (!result.productUpdate.product) {
    throw new Error("Shopify did not return the updated product.");
  }
  return result.productUpdate.product;
}

export const SHOP_SUMMARY_QUERY = `#graphql
  query CohorioShopSummary {
    shop {
      name
      myshopifyDomain
      email
      currencyCode
      ianaTimezone
    }
    productsCount {
      count
    }
    ordersCount {
      count
    }
  }
`;

export async function fetchShopSummaryWithToken(
  shopDomain: string,
  accessToken: string,
) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: SHOP_SUMMARY_QUERY }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to read Shopify store data (${response.status}).`);
  }
  const payload = (await response.json()) as {
    data?: ShopifySummary;
    errors?: { message: string }[];
  };
  if (payload.errors?.length || !payload.data) {
    throw new Error(
      payload.errors?.map((error) => error.message).join("; ") ??
        "Shopify returned no store data.",
    );
  }
  return payload.data;
}

type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

type ShopifyProductsPage = {
  products: {
    nodes: {
      id: string;
      title: string;
      handle: string;
      description: string;
      vendor: string;
      productType: string;
      tags: string[];
      status: string;
      totalInventory: number | null;
      mediaCount: { count: number } | null;
      variantsCount: { count: number } | null;
      onlineStoreUrl: string | null;
      seo: {
        title: string | null;
        description: string | null;
      };
      featuredMedia: {
        preview: { image: { url: string } | null } | null;
      } | null;
      priceRangeV2: {
        minVariantPrice: ShopifyMoney;
      };
    }[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

type ShopifyOrdersPage = {
  orders: {
    nodes: {
      createdAt: string;
      cancelledAt: string | null;
      test: boolean;
      displayFinancialStatus: string | null;
      currentTotalPriceSet: { shopMoney: ShopifyMoney };
      lineItems: {
        nodes: {
          quantity: number;
          discountedTotalSet: { shopMoney: ShopifyMoney };
          product: { id: string } | null;
        }[];
      };
    }[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

export type ShopifyProductSnapshot = {
  shopifyProductId: string;
  title: string;
  handle: string;
  descriptionText: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  status: string;
  totalInventory: number;
  mediaCount: number;
  variantsCount: number;
  onlineStoreUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  minimumPrice: number;
  currencyCode: string | null;
  imageUrl: string | null;
  revenue30d: number;
  unitsSold30d: number;
  croScore: number;
  croRecommendations: ProductCroRecommendation[];
};

export type ShopifyDailyMetric = {
  date: string;
  revenue: number;
  ordersCount: number;
};

export type ShopifyOverviewSync = {
  products: ShopifyProductSnapshot[];
  dailyMetrics: ShopifyDailyMetric[];
  complete: boolean;
};

const PRODUCTS_PAGE_QUERY = `#graphql
  query CohorioProducts($after: String) {
    products(first: 100, after: $after, sortKey: TITLE) {
      nodes {
        id
        title
        handle
        description
        vendor
        productType
        tags
        status
        totalInventory
        mediaCount {
          count
        }
        variantsCount {
          count
        }
        onlineStoreUrl
        seo {
          title
          description
        }
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const ORDERS_PAGE_QUERY = `#graphql
  query CohorioOrders($after: String, $query: String!) {
    orders(
      first: 25
      after: $after
      query: $query
      sortKey: CREATED_AT
      reverse: true
    ) {
      nodes {
        createdAt
        cancelledAt
        test
        displayFinancialStatus
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 25) {
          nodes {
            quantity
            discountedTotalSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            product {
              id
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const MAX_PRODUCT_PAGES = 20;
const MAX_ORDER_PAGES = 40;
const INCLUDED_FINANCIAL_STATUSES = new Set([
  "PAID",
  "PARTIALLY_PAID",
  "PARTIALLY_REFUNDED",
]);

function numberFromShopify(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchDailyNetSales(
  connectionId: string,
  workspaceId: string,
) {
  const connection = await getConnectionWithSecretsForWorkspace(
    connectionId,
    workspaceId,
  );
  if (!connection) throw new Error("Shopify connection not found.");

  const missing = missingShopifyScopes(
    ["read_reports"],
    parseShopifyScopes(connection.scopes),
  );
  if (missing.length) {
    throw new Error(
      "Reconnect this Shopify store to grant read_reports. Store net sales come from ShopifyQL and need that scope.",
    );
  }

  const result = await shopifyGraphql<ShopifyqlQueryResult>(
    connectionId,
    workspaceId,
    DAILY_SALES_QUERY,
  );
  return dailyMetricsFromShopifyql(result);
}

export async function fetchShopifyOverview(
  connectionId: string,
  workspaceId: string,
): Promise<ShopifyOverviewSync> {
  const dailyMetrics = await fetchDailyNetSales(connectionId, workspaceId);
  const products: ShopifyProductSnapshot[] = [];
  let productsCursor: string | null = null;
  let productsComplete = true;

  for (let page = 0; page < MAX_PRODUCT_PAGES; page += 1) {
    const payload: ShopifyProductsPage =
      await shopifyGraphql<ShopifyProductsPage>(
        connectionId,
        workspaceId,
        PRODUCTS_PAGE_QUERY,
        { after: productsCursor },
      );
    for (const product of payload.products.nodes) {
      const minimumPrice = numberFromShopify(
        product.priceRangeV2.minVariantPrice.amount,
      );
      const cro = analyzeProductCro({
        title: product.title,
        descriptionText: product.description,
        vendor: product.vendor || null,
        productType: product.productType || null,
        tags: product.tags,
        mediaCount: product.mediaCount?.count ?? 0,
        variantsCount: product.variantsCount?.count ?? 0,
        seoTitle: product.seo.title,
        seoDescription: product.seo.description,
        onlineStoreUrl: product.onlineStoreUrl,
        status: product.status.toUpperCase(),
        totalInventory: product.totalInventory ?? 0,
        minimumPrice,
      });
      products.push({
        shopifyProductId: product.id,
        title: product.title,
        handle: product.handle,
        descriptionText: product.description,
        vendor: product.vendor || null,
        productType: product.productType || null,
        tags: product.tags,
        status: product.status.toUpperCase(),
        totalInventory: product.totalInventory ?? 0,
        mediaCount: product.mediaCount?.count ?? 0,
        variantsCount: product.variantsCount?.count ?? 0,
        onlineStoreUrl: product.onlineStoreUrl,
        seoTitle: product.seo.title,
        seoDescription: product.seo.description,
        minimumPrice,
        currencyCode:
          product.priceRangeV2.minVariantPrice.currencyCode?.toUpperCase() ||
          null,
        imageUrl: product.featuredMedia?.preview?.image?.url ?? null,
        revenue30d: 0,
        unitsSold30d: 0,
        croScore: cro.score,
        croRecommendations: cro.recommendations,
      });
    }

    if (!payload.products.pageInfo.hasNextPage) break;
    productsCursor = payload.products.pageInfo.endCursor;
    if (!productsCursor || page === MAX_PRODUCT_PAGES - 1) {
      productsComplete = false;
      break;
    }
  }

  const now = new Date();
  const currentPeriodStart = new Date(now);
  currentPeriodStart.setUTCDate(currentPeriodStart.getUTCDate() - 29);
  currentPeriodStart.setUTCHours(0, 0, 0, 0);
  const comparisonStart = new Date(currentPeriodStart);
  comparisonStart.setUTCDate(comparisonStart.getUTCDate() - 30);

  const productById = new Map(
    products.map((product) => [product.shopifyProductId, product]),
  );
  let ordersCursor: string | null = null;
  let ordersComplete = true;

  for (let page = 0; page < MAX_ORDER_PAGES; page += 1) {
    const payload: ShopifyOrdersPage = await shopifyGraphql<ShopifyOrdersPage>(
      connectionId,
      workspaceId,
      ORDERS_PAGE_QUERY,
      {
        after: ordersCursor,
        query: `created_at:>='${comparisonStart.toISOString()}'`,
      },
    );

    for (const order of payload.orders.nodes) {
      if (
        order.cancelledAt ||
        order.test ||
        !order.displayFinancialStatus ||
        !INCLUDED_FINANCIAL_STATUSES.has(order.displayFinancialStatus)
      ) {
        continue;
      }

      if (new Date(order.createdAt) < currentPeriodStart) continue;
      for (const lineItem of order.lineItems.nodes) {
        if (!lineItem.product) continue;
        const product = productById.get(lineItem.product.id);
        if (!product) continue;
        product.revenue30d += numberFromShopify(
          lineItem.discountedTotalSet.shopMoney.amount,
        );
        product.unitsSold30d += lineItem.quantity;
      }
    }

    if (!payload.orders.pageInfo.hasNextPage) break;
    ordersCursor = payload.orders.pageInfo.endCursor;
    if (!ordersCursor || page === MAX_ORDER_PAGES - 1) {
      ordersComplete = false;
      break;
    }
  }

  return {
    products,
    dailyMetrics,
    complete: productsComplete && ordersComplete,
  };
}
