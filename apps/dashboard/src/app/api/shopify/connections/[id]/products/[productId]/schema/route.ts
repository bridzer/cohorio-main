import { NextRequest, NextResponse } from "next/server";
import { getShopifyProduct } from "@/lib/shopify/repository";
import { productJsonLd } from "@/lib/shopify/product-schema";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/products/[productId]/schema">,
) {
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    const { id, productId } = await context.params;
    const product = await getShopifyProduct(
      id,
      workspaceId,
      decodeURIComponent(productId),
    );
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json({ jsonLd: productJsonLd(product) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to build product schema.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
