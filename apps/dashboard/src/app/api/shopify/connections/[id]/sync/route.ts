import { NextRequest, NextResponse } from "next/server";
import {
  fetchShopifyOverview,
  SHOP_SUMMARY_QUERY,
  shopifyGraphql,
  type ShopifySummary,
} from "@/lib/shopify/client";
import {
  getConnectionForWorkspace,
  markConnectionError,
  saveShopifyOverview,
  updateConnectionSummary,
} from "@/lib/shopify/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import { assertSameOrigin } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/sync">,
) {
  let id = "";
  let workspaceId = "";
  try {
    assertSameOrigin(request);
    workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    id = (await context.params).id;
    const connection = await getConnectionForWorkspace(id, workspaceId);
    if (!connection) {
      return NextResponse.json(
        { error: "Shopify connection not found." },
        { status: 404 },
      );
    }

    const summary = await shopifyGraphql<ShopifySummary>(
      id,
      workspaceId,
      SHOP_SUMMARY_QUERY,
    );
    await updateConnectionSummary(id, workspaceId, {
      displayName: summary.shop.name,
      shopEmail: summary.shop.email,
      currencyCode: summary.shop.currencyCode,
      timezone: summary.shop.ianaTimezone,
      productsCount: summary.productsCount.count,
      ordersCount: summary.ordersCount.count,
    });
    const overview = await fetchShopifyOverview(id, workspaceId);
    await saveShopifyOverview(id, workspaceId, overview);

    return NextResponse.json({
      synced: true,
      summary: {
        displayName: summary.shop.name,
        productsCount: summary.productsCount.count,
        ordersCount: summary.ordersCount.count,
        overviewComplete: overview.complete,
      },
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to sync Shopify.";
    if (id && workspaceId) {
      await markConnectionError(id, workspaceId, message).catch(() => undefined);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
