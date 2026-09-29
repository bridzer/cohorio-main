import { NextRequest, NextResponse } from "next/server";
import {
  updateShopifyProduct,
  type ShopifyProductUpdateInput,
} from "@/lib/shopify/client";
import {
  getConnectionForWorkspace,
  listShopifyProducts,
  productBelongsToConnection,
} from "@/lib/shopify/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import { assertSameOrigin } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/products">,
) {
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    const id = (await context.params).id;
    const connection = await getConnectionForWorkspace(id, workspaceId);
    if (!connection) {
      return NextResponse.json(
        { error: "Shopify connection not found." },
        { status: 404 },
      );
    }

    const products = await listShopifyProducts(id, workspaceId);
    const averageScore = products.length
      ? Math.round(
          products.reduce((total, product) => total + product.croScore, 0) /
            products.length,
        )
      : 0;

    return NextResponse.json({
      summary: {
        products: products.length,
        averageScore,
        needsWork: products.filter((product) => product.croScore < 60).length,
        highPriorityIssues: products.reduce(
          (total, product) =>
            total +
            product.croRecommendations.filter(
              (recommendation) => recommendation.priority === "high",
            ).length,
          0,
        ),
      },
      products,
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load products.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function optionalString(
  value: unknown,
  field: string,
  maximumLength: number,
) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new RangeError(
      `${field} must be a string under ${maximumLength} characters.`,
    );
  }
  return value.trim();
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/products">,
) {
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const id = (await context.params).id;
    const connection = await getConnectionForWorkspace(id, workspaceId);
    if (!connection) {
      return NextResponse.json(
        { error: "Shopify connection not found." },
        { status: 404 },
      );
    }
    if (!connection.scopes.includes("write_products")) {
      return NextResponse.json(
        {
          error:
            "Reconnect this Shopify store to approve product editing access.",
          code: "SHOPIFY_REAUTH_REQUIRED",
        },
        { status: 409 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const productId = body.productId;
    if (
      typeof productId !== "string" ||
      !/^gid:\/\/shopify\/Product\/\d+$/.test(productId)
    ) {
      return NextResponse.json(
        { error: "A valid Shopify product ID is required." },
        { status: 400 },
      );
    }
    if (!(await productBelongsToConnection(id, workspaceId, productId))) {
      return NextResponse.json(
        { error: "Product not found for this Shopify connection." },
        { status: 404 },
      );
    }

    const title = optionalString(body.title, "Title", 255);
    if (title !== undefined && !title) {
      return NextResponse.json(
        { error: "Product title cannot be empty." },
        { status: 400 },
      );
    }
    const descriptionHtml = optionalString(
      body.descriptionHtml,
      "Description",
      100_000,
    );
    const vendor = optionalString(body.vendor, "Vendor", 255);
    const productType = optionalString(body.productType, "Product type", 255);
    const seoTitle = optionalString(body.seoTitle, "SEO title", 255);
    const seoDescription = optionalString(
      body.seoDescription,
      "SEO description",
      1_000,
    );

    let tags: string[] | undefined;
    if (body.tags !== undefined) {
      if (
        !Array.isArray(body.tags) ||
        body.tags.length > 250 ||
        body.tags.some(
          (tag) => typeof tag !== "string" || tag.trim().length > 255,
        )
      ) {
        return NextResponse.json(
          { error: "Tags must be a list of up to 250 text values." },
          { status: 400 },
        );
      }
      tags = [...new Set(body.tags.map((tag) => String(tag).trim()).filter(Boolean))];
    }

    let status: ShopifyProductUpdateInput["status"];
    if (body.status !== undefined) {
      if (
        body.status !== "ACTIVE" &&
        body.status !== "DRAFT" &&
        body.status !== "ARCHIVED"
      ) {
        return NextResponse.json(
          { error: "Product status is invalid." },
          { status: 400 },
        );
      }
      status = body.status;
    }

    const product: ShopifyProductUpdateInput = { id: productId };
    if (title !== undefined) product.title = title;
    if (descriptionHtml !== undefined) {
      product.descriptionHtml = descriptionHtml;
    }
    if (vendor !== undefined) product.vendor = vendor;
    if (productType !== undefined) product.productType = productType;
    if (tags !== undefined) product.tags = tags;
    if (status !== undefined) product.status = status;
    if (seoTitle !== undefined || seoDescription !== undefined) {
      product.seo = {};
      if (seoTitle !== undefined) product.seo.title = seoTitle;
      if (seoDescription !== undefined) {
        product.seo.description = seoDescription;
      }
    }
    if (Object.keys(product).length === 1) {
      return NextResponse.json(
        { error: "No supported product changes were provided." },
        { status: 400 },
      );
    }

    const updatedProduct = await updateShopifyProduct(
      id,
      workspaceId,
      product,
    );
    return NextResponse.json({ updated: true, product: updatedProduct });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to update this product.";
    const status = error instanceof RangeError ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
