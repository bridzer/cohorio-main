import { NextRequest, NextResponse } from "next/server";
import {
  isSuggestibleCampaignField,
  suggestCampaignField,
} from "@/lib/shopify/campaign-suggestions";
import type { AdPlatform } from "@/lib/shopify/ad-campaign";
import {
  MISSING_BRAND_BRAIN_CONTEXT,
  workspaceContextMarkdown,
} from "@/lib/marketing-context-prompt";
import {
  getConnectionForWorkspace,
} from "@/lib/shopify/repository";
import { getCampaignProducts } from "@/lib/shopify/campaign-repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

function errorResponse(error: unknown, fallback: string) {
  const originResponse = originErrorResponse(error);
  if (originResponse) return originResponse;
  const accessResponse = accessErrorResponse(error);
  if (accessResponse) return accessResponse;
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof RangeError ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

function platform(value: unknown): AdPlatform {
  if (value === "meta" || value === "google" || value === "tiktok") return value;
  throw new RangeError("Choose Meta, Google Ads, or TikTok.");
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/campaign-suggestions">,
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
    const body = (await request.json()) as Record<string, unknown>;
    if (!isSuggestibleCampaignField(body.field)) {
      throw new RangeError("That field has no Brand Brain suggestion.");
    }
    const adPlatform = body.platform === undefined ? "meta" : platform(body.platform);
    const objective =
      typeof body.objective === "string" && body.objective.trim().length <= 80
        ? body.objective.trim()
        : "";
    const rawIds = body.productIds ?? [];
    if (
      !Array.isArray(rawIds) ||
      rawIds.length > 10 ||
      rawIds.some(
        (productId) =>
          typeof productId !== "string" ||
          !/^gid:\/\/shopify\/Product\/\d+$/.test(productId),
      )
    ) {
      throw new RangeError("Choose up to 10 Shopify products.");
    }
    const productIds = [...new Set(rawIds.map(String))];
    const products = productIds.length
      ? await getCampaignProducts(id, workspaceId, productIds)
      : [];
    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "One or more selected products were not found." },
        { status: 404 },
      );
    }
    const brandMarkdown = await workspaceContextMarkdown(workspaceId);
    const suggestion = suggestCampaignField({
      field: body.field,
      brandMarkdown,
      platform: adPlatform,
      objective,
      products,
    });
    return NextResponse.json({
      suggestion,
      brandBrainEmpty: brandMarkdown === MISSING_BRAND_BRAIN_CONTEXT,
    });
  } catch (error) {
    return errorResponse(error, "Unable to suggest a value.");
  }
}
