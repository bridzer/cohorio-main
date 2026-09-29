import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/database";
import type { ProductCroRecommendation } from "./product-cro";

type ConnectionRow = {
  id: string;
  workspace_id: string;
  shop_domain: string;
  display_name: string;
  shop_email: string | null;
  currency_code: string | null;
  timezone: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: Date | null;
  refresh_token_expires_at: Date | null;
  scopes: string;
  status: "active" | "error" | "disconnected";
  products_count: number;
  orders_count: number;
  overview_complete: boolean;
  last_error: string | null;
  installed_at: Date;
  last_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ShopifyConnectionWithSecrets = {
  id: string;
  workspaceId: string;
  shopDomain: string;
  displayName: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scopes: string;
};

export type ShopifyConnectionInput = {
  workspaceId: string;
  shopDomain: string;
  displayName: string;
  shopEmail: string | null;
  currencyCode: string | null;
  timezone: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scopes: string;
  productsCount?: number;
  ordersCount?: number;
};

function publicConnection(row: ConnectionRow) {
  return {
    id: row.id,
    shopDomain: row.shop_domain,
    displayName: row.display_name,
    shopEmail: row.shop_email,
    currencyCode: row.currency_code,
    timezone: row.timezone,
    scopes: row.scopes.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean),
    status: row.status,
    productsCount: row.products_count,
    ordersCount: row.orders_count,
    overviewComplete: row.overview_complete,
    lastError: row.last_error,
    installedAt: row.installed_at.toISOString(),
    lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
  };
}

export async function listConnections(workspaceId: string) {
  const result = await query<ConnectionRow>(
    `SELECT *
       FROM shopify_connections
      WHERE workspace_id = $1 AND status <> 'disconnected'
      ORDER BY installed_at DESC`,
    [workspaceId],
  );
  return result.rows.map(publicConnection);
}

export async function getConnectionForWorkspace(
  id: string,
  workspaceId: string,
) {
  const result = await query<ConnectionRow>(
    `SELECT *
       FROM shopify_connections
      WHERE id = $1 AND workspace_id = $2 AND status <> 'disconnected'
      LIMIT 1`,
    [id, workspaceId],
  );
  return result.rows[0] ? publicConnection(result.rows[0]) : null;
}

export async function getConnectionWithSecretsForWorkspace(
  id: string,
  workspaceId: string,
) {
  const result = await query<ConnectionRow>(
    `SELECT * FROM shopify_connections
      WHERE id = $1 AND workspace_id = $2
        AND status <> 'disconnected' LIMIT 1`,
    [id, workspaceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    shopDomain: row.shop_domain,
    displayName: row.display_name,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenExpiresAt: row.token_expires_at,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    scopes: row.scopes,
  } satisfies ShopifyConnectionWithSecrets;
}

export async function upsertConnection(input: ShopifyConnectionInput) {
  const result = await query<ConnectionRow>(
    `INSERT INTO shopify_connections (
       id, workspace_id, shop_domain, display_name, shop_email,
       currency_code, timezone, access_token_encrypted,
       refresh_token_encrypted, token_expires_at,
       refresh_token_expires_at, scopes, status, products_count,
       orders_count, last_error, installed_at, last_synced_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       'active', $13, $14, NULL, NOW(), NOW()
     )
     ON CONFLICT (workspace_id, shop_domain) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       shop_email = EXCLUDED.shop_email,
       currency_code = EXCLUDED.currency_code,
       timezone = EXCLUDED.timezone,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       token_expires_at = EXCLUDED.token_expires_at,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       scopes = EXCLUDED.scopes,
       status = 'active',
       overview_complete = FALSE,
       products_count = EXCLUDED.products_count,
       orders_count = EXCLUDED.orders_count,
       last_error = NULL,
       installed_at = NOW(),
       last_synced_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      randomUUID(),
      input.workspaceId,
      input.shopDomain,
      input.displayName,
      input.shopEmail,
      input.currencyCode,
      input.timezone,
      input.accessTokenEncrypted,
      input.refreshTokenEncrypted,
      input.tokenExpiresAt,
      input.refreshTokenExpiresAt,
      input.scopes,
      input.productsCount ?? 0,
      input.ordersCount ?? 0,
    ],
  );
  return publicConnection(result.rows[0]);
}

export async function updateConnectionTokens(
  id: string,
  workspaceId: string,
  input: {
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
    refreshTokenExpiresAt: Date | null;
    scopes: string;
  },
) {
  await query(
    `UPDATE shopify_connections
        SET access_token_encrypted = $2,
            refresh_token_encrypted = $3,
            token_expires_at = $4,
            refresh_token_expires_at = $5,
            scopes = $6,
            status = 'active',
            last_error = NULL,
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $7`,
    [
      id,
      input.accessTokenEncrypted,
      input.refreshTokenEncrypted,
      input.tokenExpiresAt,
      input.refreshTokenExpiresAt,
      input.scopes,
      workspaceId,
    ],
  );
}

export async function updateConnectionSummary(
  id: string,
  workspaceId: string,
  input: {
    displayName: string;
    shopEmail: string;
    currencyCode: string;
    timezone: string;
    productsCount: number;
    ordersCount: number;
  },
) {
  await query(
    `UPDATE shopify_connections
        SET display_name = $2,
            shop_email = $3,
            currency_code = $4,
            timezone = $5,
            products_count = $6,
            orders_count = $7,
            status = 'active',
            last_error = NULL,
            last_synced_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $8`,
    [
      id,
      input.displayName,
      input.shopEmail,
      input.currencyCode,
      input.timezone,
      input.productsCount,
      input.ordersCount,
      workspaceId,
    ],
  );
}

export type ShopifyOverviewInput = {
  products: {
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
  }[];
  dailyMetrics: {
    date: string;
    revenue: number;
    ordersCount: number;
  }[];
  complete: boolean;
};

type ProductOverviewRow = {
  shopify_product_id: string;
  title: string;
  handle: string;
  description_text: string;
  vendor: string | null;
  product_type: string | null;
  tags: string[];
  status: string;
  total_inventory: number;
  media_count: number;
  variants_count: number;
  online_store_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  minimum_price: string;
  currency_code: string | null;
  image_url: string | null;
  revenue_30d: string;
  units_sold_30d: number;
  cro_score: number;
  cro_recommendations: ProductCroRecommendation[];
};

type DailyMetricRow = {
  metric_date: string;
  revenue: string;
  orders_count: number;
};

type ProductAggregateRow = {
  products_count: string;
  inventory_units: string;
};

export async function saveShopifyOverview(
  id: string,
  workspaceId: string,
  overview: ShopifyOverviewInput,
) {
  await transaction(async (client) => {
    const connection = await client.query(
      `SELECT 1 FROM shopify_connections
        WHERE id = $1 AND workspace_id = $2
        FOR UPDATE`,
      [id, workspaceId],
    );
    if (!connection.rowCount) throw new Error("Shopify connection not found.");
    if (overview.products.length) {
      const productRows = overview.products.map((product) => ({
        shopify_product_id: product.shopifyProductId,
        title: product.title,
        handle: product.handle,
        description_text: product.descriptionText,
        vendor: product.vendor,
        product_type: product.productType,
        tags: product.tags,
        status: product.status,
        total_inventory: product.totalInventory,
        media_count: product.mediaCount,
        variants_count: product.variantsCount,
        online_store_url: product.onlineStoreUrl,
        seo_title: product.seoTitle,
        seo_description: product.seoDescription,
        minimum_price: product.minimumPrice,
        currency_code: product.currencyCode,
        image_url: product.imageUrl,
        revenue_30d: product.revenue30d,
        units_sold_30d: product.unitsSold30d,
        cro_score: product.croScore,
        cro_recommendations: product.croRecommendations,
      }));
      await client.query(
        `INSERT INTO shopify_products (
           connection_id, shopify_product_id, title, handle, description_text,
           vendor, product_type, tags, status, total_inventory, media_count,
           variants_count, online_store_url, seo_title, seo_description,
           minimum_price, currency_code, image_url, revenue_30d, units_sold_30d,
           cro_score, cro_recommendations, synced_at
         )
         SELECT $1, product.shopify_product_id, product.title, product.handle,
                product.description_text, product.vendor, product.product_type,
                product.tags, product.status, product.total_inventory,
                product.media_count, product.variants_count,
                product.online_store_url, product.seo_title,
                product.seo_description, product.minimum_price,
                product.currency_code, product.image_url, product.revenue_30d,
                product.units_sold_30d, product.cro_score,
                product.cro_recommendations, NOW()
           FROM jsonb_to_recordset($2::jsonb) AS product(
             shopify_product_id TEXT,
             title TEXT,
             handle TEXT,
             description_text TEXT,
             vendor TEXT,
             product_type TEXT,
             tags JSONB,
             status TEXT,
             total_inventory INTEGER,
             media_count INTEGER,
             variants_count INTEGER,
             online_store_url TEXT,
             seo_title TEXT,
             seo_description TEXT,
             minimum_price NUMERIC,
             currency_code TEXT,
             image_url TEXT,
             revenue_30d NUMERIC,
             units_sold_30d INTEGER,
             cro_score INTEGER,
             cro_recommendations JSONB
           )
         ON CONFLICT (connection_id, shopify_product_id) DO UPDATE SET
           title = EXCLUDED.title,
           handle = EXCLUDED.handle,
           description_text = EXCLUDED.description_text,
           vendor = EXCLUDED.vendor,
           product_type = EXCLUDED.product_type,
           tags = EXCLUDED.tags,
           status = EXCLUDED.status,
           total_inventory = EXCLUDED.total_inventory,
           media_count = EXCLUDED.media_count,
           variants_count = EXCLUDED.variants_count,
           online_store_url = EXCLUDED.online_store_url,
           seo_title = EXCLUDED.seo_title,
           seo_description = EXCLUDED.seo_description,
           minimum_price = EXCLUDED.minimum_price,
           currency_code = EXCLUDED.currency_code,
           image_url = EXCLUDED.image_url,
           revenue_30d = EXCLUDED.revenue_30d,
           units_sold_30d = EXCLUDED.units_sold_30d,
           cro_score = EXCLUDED.cro_score,
           cro_recommendations = EXCLUDED.cro_recommendations,
           synced_at = NOW()`,
        [id, JSON.stringify(productRows)],
      );
      await client.query(
        `DELETE FROM shopify_products
          WHERE connection_id = $1
            AND NOT (shopify_product_id = ANY($2::text[]))`,
        [id, overview.products.map((product) => product.shopifyProductId)],
      );
    } else {
      await client.query(
        "DELETE FROM shopify_products WHERE connection_id = $1",
        [id],
      );
    }

    await client.query(
      "DELETE FROM shopify_daily_metrics WHERE connection_id = $1",
      [id],
    );
    if (overview.dailyMetrics.length) {
      const metricRows = overview.dailyMetrics.map((metric) => ({
        metric_date: metric.date,
        revenue: metric.revenue,
        orders_count: metric.ordersCount,
      }));
      await client.query(
        `INSERT INTO shopify_daily_metrics (
           connection_id, metric_date, revenue, orders_count, synced_at
         )
         SELECT $1, metric.metric_date, metric.revenue, metric.orders_count, NOW()
           FROM jsonb_to_recordset($2::jsonb) AS metric(
             metric_date DATE,
             revenue NUMERIC,
             orders_count INTEGER
           )`,
        [id, JSON.stringify(metricRows)],
      );
    }

    await client.query(
      `UPDATE shopify_connections
          SET overview_complete = $2,
              status = 'active',
              last_error = NULL,
              last_synced_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND workspace_id = $3`,
      [id, overview.complete, workspaceId],
    );
  });
}

function publicProduct(product: ProductOverviewRow) {
  return {
    id: product.shopify_product_id,
    title: product.title,
    handle: product.handle,
    descriptionText: product.description_text,
    vendor: product.vendor,
    productType: product.product_type,
    tags: product.tags,
    status: product.status,
    totalInventory: product.total_inventory,
    mediaCount: product.media_count,
    variantsCount: product.variants_count,
    onlineStoreUrl: product.online_store_url,
    seoTitle: product.seo_title,
    seoDescription: product.seo_description,
    minimumPrice: Number(product.minimum_price),
    currencyCode: product.currency_code,
    imageUrl: product.image_url,
    revenue30d: Number(product.revenue_30d),
    unitsSold30d: product.units_sold_30d,
    croScore: product.cro_score,
    croRecommendations: product.cro_recommendations,
  };
}

export async function getShopifyOverview(id: string, workspaceId: string) {
  const [connectionResult, productsResult, metricsResult, aggregateResult] =
    await Promise.all([
    query<ConnectionRow>(
      `SELECT *
         FROM shopify_connections
        WHERE id = $1 AND workspace_id = $2 AND status <> 'disconnected'
        LIMIT 1`,
      [id, workspaceId],
    ),
    query<ProductOverviewRow>(
      `SELECT shopify_product_id, title, handle, description_text, vendor,
              product_type, tags, status, total_inventory, media_count,
              variants_count, online_store_url, seo_title, seo_description,
              minimum_price, currency_code, image_url, revenue_30d,
              units_sold_30d, cro_score, cro_recommendations
         FROM shopify_products product
        WHERE product.connection_id = $1
          AND EXISTS (
            SELECT 1 FROM shopify_connections connection
             WHERE connection.id = product.connection_id
               AND connection.workspace_id = $2
          )
        ORDER BY revenue_30d DESC, title ASC
        LIMIT 10`,
      [id, workspaceId],
    ),
    query<DailyMetricRow>(
      `SELECT metric_date::text, revenue, orders_count
         FROM shopify_daily_metrics metric
        WHERE metric.connection_id = $1
          AND EXISTS (
            SELECT 1 FROM shopify_connections connection
             WHERE connection.id = metric.connection_id
               AND connection.workspace_id = $2
          )
          AND metric_date >= CURRENT_DATE - 70
        ORDER BY metric_date ASC`,
      [id, workspaceId],
    ),
    query<ProductAggregateRow>(
      `SELECT COUNT(*)::text AS products_count,
              COALESCE(SUM(total_inventory), 0)::text AS inventory_units
         FROM shopify_products product
        WHERE product.connection_id = $1
          AND EXISTS (
            SELECT 1 FROM shopify_connections connection
             WHERE connection.id = product.connection_id
               AND connection.workspace_id = $2
          )`,
      [id, workspaceId],
    ),
  ]);
  const connection = connectionResult.rows[0];
  if (!connection) return null;

  return {
    currencyCode: connection.currency_code ?? "USD",
    complete: connection.overview_complete,
    lastSyncedAt: connection.last_synced_at?.toISOString() ?? null,
    productsCount: Number(aggregateResult.rows[0]?.products_count ?? 0),
    inventoryUnits: Number(aggregateResult.rows[0]?.inventory_units ?? 0),
    products: productsResult.rows.map(publicProduct),
    dailyMetrics: metricsResult.rows.map((metric) => ({
      date: metric.metric_date,
      revenue: Number(metric.revenue),
      ordersCount: metric.orders_count,
    })),
  };
}

export async function listShopifyProducts(id: string, workspaceId: string) {
  const result = await query<ProductOverviewRow>(
    `SELECT shopify_product_id, title, handle, description_text, vendor,
            product_type, tags, status, total_inventory, media_count,
            variants_count, online_store_url, seo_title, seo_description,
            minimum_price, currency_code, image_url, revenue_30d,
            units_sold_30d, cro_score, cro_recommendations
       FROM shopify_products product
      WHERE product.connection_id = $1
        AND EXISTS (
          SELECT 1 FROM shopify_connections connection
           WHERE connection.id = product.connection_id
             AND connection.workspace_id = $2
        )
      ORDER BY cro_score ASC, revenue_30d DESC, title ASC`,
    [id, workspaceId],
  );
  return result.rows.map(publicProduct);
}

export async function productBelongsToConnection(
  connectionId: string,
  workspaceId: string,
  productId: string,
) {
  const result = await query(
    `SELECT 1
       FROM shopify_products product
       JOIN shopify_connections connection
         ON connection.id = product.connection_id
      WHERE product.connection_id = $1
        AND connection.workspace_id = $2
        AND product.shopify_product_id = $3
      LIMIT 1`,
    [connectionId, workspaceId, productId],
  );
  return Boolean(result.rowCount);
}

export async function markConnectionError(
  id: string,
  workspaceId: string,
  error: string,
) {
  await query(
    `UPDATE shopify_connections
        SET status = 'error', last_error = $2, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $3`,
    [id, error.slice(0, 1000), workspaceId],
  );
}

export async function disconnectConnection(
  id: string,
  workspaceId: string,
) {
  const result = await query(
    `UPDATE shopify_connections
        SET status = 'disconnected',
            access_token_encrypted = '',
            refresh_token_encrypted = NULL,
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function connectionBelongsToWorkspace(
  client: PoolClient,
  id: string,
  workspaceId: string,
) {
  const result = await client.query(
    `SELECT 1 FROM shopify_connections WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
  return Boolean(result.rowCount);
}
