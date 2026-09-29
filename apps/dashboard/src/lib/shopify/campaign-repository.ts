import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/database";
import type {
  AdPlatform,
  CampaignCreative,
  CampaignProduct,
  CampaignStrategy,
} from "./ad-campaign";

type CampaignRow = {
  id: string;
  connection_id: string;
  name: string;
  platform: AdPlatform;
  objective: string;
  status: "draft" | "ready" | "archived";
  daily_budget: string;
  currency_code: string;
  audience: string;
  value_proposition: string;
  offer: string | null;
  landing_page_url: string | null;
  selected_product_ids: string[];
  strategy: CampaignStrategy;
  creatives: CampaignCreative[];
  created_at: Date;
  updated_at: Date;
};

type CampaignProductRow = {
  shopify_product_id: string;
  title: string;
  product_type: string | null;
  minimum_price: string;
  currency_code: string | null;
  online_store_url: string | null;
  image_url: string | null;
  description_text: string;
};

function publicCampaign(row: CampaignRow) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    objective: row.objective,
    status: row.status,
    dailyBudget: Number(row.daily_budget),
    currencyCode: row.currency_code,
    audience: row.audience,
    valueProposition: row.value_proposition,
    offer: row.offer,
    landingPageUrl: row.landing_page_url,
    selectedProductIds: row.selected_product_ids,
    strategy: row.strategy,
    creatives: row.creatives,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getCampaignProducts(
  connectionId: string,
  workspaceId: string,
  productIds: string[],
) {
  const result = await query<CampaignProductRow>(
    `SELECT product.shopify_product_id, product.title, product.product_type,
            product.minimum_price, product.currency_code,
            product.online_store_url, product.image_url, product.description_text
       FROM shopify_products product
       JOIN shopify_connections connection
         ON connection.id = product.connection_id
      WHERE product.connection_id = $1
        AND connection.workspace_id = $2
        AND product.shopify_product_id = ANY($3::text[])`,
    [connectionId, workspaceId, productIds],
  );
  return result.rows.map(
    (product): CampaignProduct => ({
      id: product.shopify_product_id,
      title: product.title,
      productType: product.product_type,
      minimumPrice: Number(product.minimum_price),
      currencyCode: product.currency_code,
      onlineStoreUrl: product.online_store_url,
      imageUrl: product.image_url,
      descriptionText: product.description_text,
    }),
  );
}

export async function createAdCampaign(input: {
  connectionId: string;
  workspaceId: string;
  name: string;
  platform: AdPlatform;
  objective: string;
  dailyBudget: number;
  currencyCode: string;
  audience: string;
  valueProposition: string;
  offer: string | null;
  landingPageUrl: string | null;
  selectedProductIds: string[];
  strategy: CampaignStrategy;
  creatives: CampaignCreative[];
}) {
  return transaction(async (client) => {
    const owned = await client.query(
      `SELECT 1 FROM shopify_connections
        WHERE id = $1 AND workspace_id = $2 AND status <> 'disconnected'`,
      [input.connectionId, input.workspaceId],
    );
    if (!owned.rowCount) throw new Error("Shopify connection not found.");
    const campaignId = randomUUID();
    const result = await client.query<CampaignRow>(
      `INSERT INTO shopify_ad_campaigns (
         id, connection_id, name, platform, objective, status, daily_budget,
         currency_code, audience, value_proposition, offer, landing_page_url,
         selected_product_ids, strategy, creatives
       ) VALUES (
         $1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11,
         $12::jsonb, $13::jsonb, $14::jsonb
       )
       RETURNING *`,
      [
        campaignId,
        input.connectionId,
        input.name,
        input.platform,
        input.objective,
        input.dailyBudget,
        input.currencyCode,
        input.audience,
        input.valueProposition,
        input.offer,
        input.landingPageUrl,
        JSON.stringify(input.selectedProductIds),
        JSON.stringify(input.strategy),
        JSON.stringify(input.creatives),
      ],
    );
    await client.query(
      `INSERT INTO shopify_ad_campaign_products (
         campaign_id, connection_id, shopify_product_id, position
       )
       SELECT $1, $2, product_id, position - 1
         FROM unnest($3::text[]) WITH ORDINALITY AS selected(product_id, position)`,
      [campaignId, input.connectionId, input.selectedProductIds],
    );
    return publicCampaign(result.rows[0]);
  });
}

export async function listAdCampaigns(
  connectionId: string,
  workspaceId: string,
) {
  const result = await query<CampaignRow>(
    `SELECT campaign.*,
            COALESCE(
              (
                SELECT jsonb_agg(product.shopify_product_id ORDER BY product.position)
                  FROM shopify_ad_campaign_products product
                 WHERE product.campaign_id = campaign.id
              ),
              campaign.selected_product_ids
            ) AS selected_product_ids
       FROM shopify_ad_campaigns campaign
       JOIN shopify_connections connection
         ON connection.id = campaign.connection_id
      WHERE campaign.connection_id = $1
        AND connection.workspace_id = $2
        AND campaign.status <> 'archived'
      ORDER BY campaign.created_at DESC`,
    [connectionId, workspaceId],
  );
  return result.rows.map(publicCampaign);
}

export async function updateAdCampaignStatus(
  connectionId: string,
  workspaceId: string,
  campaignId: string,
  status: "draft" | "ready" | "archived",
) {
  const result = await query<CampaignRow>(
    `UPDATE shopify_ad_campaigns campaign
        SET status = $4, updated_at = NOW()
      FROM shopify_connections connection
      WHERE campaign.id = $1
        AND campaign.connection_id = $2
        AND connection.id = campaign.connection_id
        AND connection.workspace_id = $3
      RETURNING campaign.*`,
    [campaignId, connectionId, workspaceId, status],
  );
  return result.rows[0] ? publicCampaign(result.rows[0]) : null;
}
