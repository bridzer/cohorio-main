import { NextRequest, NextResponse } from "next/server";
import {
  generateAdCampaign,
  type AdPlatform,
  type CampaignBrief,
} from "@/lib/shopify/ad-campaign";
import {
  createAdCampaign,
  getCampaignProducts,
  listAdCampaigns,
  updateAdCampaignStatus,
} from "@/lib/shopify/campaign-repository";
import { getConnectionForWorkspace } from "@/lib/shopify/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import { assertSameOrigin } from "@/lib/auth/request";

export const runtime = "nodejs";

function text(
  value: unknown,
  field: string,
  maximum: number,
  required = true,
) {
  if (typeof value !== "string" || value.trim().length > maximum) {
    throw new RangeError(`${field} must be under ${maximum} characters.`);
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw new RangeError(`${field} is required.`);
  }
  return normalized;
}

function errorResponse(error: unknown, fallback: string) {
  const accessResponse = accessErrorResponse(error);
  if (accessResponse) return accessResponse;
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof RangeError ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/campaigns">,
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
    return NextResponse.json({
      campaigns: await listAdCampaigns(id, workspaceId),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load campaigns.");
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/campaigns">,
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
    if (
      body.platform !== "meta" &&
      body.platform !== "google" &&
      body.platform !== "tiktok"
    ) {
      throw new RangeError("Choose Meta, Google Ads, or TikTok.");
    }
    const platform: AdPlatform = body.platform;
    const objective = text(body.objective, "Objective", 80);
    const dailyBudget = Number(body.dailyBudget);
    if (
      !Number.isFinite(dailyBudget) ||
      dailyBudget <= 0 ||
      dailyBudget > 1_000_000
    ) {
      throw new RangeError("Daily budget must be greater than zero.");
    }
    if (
      !Array.isArray(body.productIds) ||
      body.productIds.length < 1 ||
      body.productIds.length > 10 ||
      body.productIds.some(
        (productId) =>
          typeof productId !== "string" ||
          !/^gid:\/\/shopify\/Product\/\d+$/.test(productId),
      )
    ) {
      throw new RangeError("Choose between 1 and 10 Shopify products.");
    }
    const productIds = [...new Set(body.productIds.map(String))];
    const products = await getCampaignProducts(id, workspaceId, productIds);
    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "One or more selected products were not found." },
        { status: 404 },
      );
    }

    const landingPageUrl = text(
      body.landingPageUrl ?? "",
      "Landing page URL",
      2_000,
      false,
    );
    if (landingPageUrl) {
      let parsed: URL;
      try {
        parsed = new URL(landingPageUrl);
      } catch {
        throw new RangeError("Landing page URL must be a valid HTTPS URL.");
      }
      if (parsed.protocol !== "https:") {
        throw new RangeError("Landing page URL must use HTTPS.");
      }
    }

    const brief: CampaignBrief = {
      name: text(body.name, "Campaign name", 120),
      platform,
      objective,
      dailyBudget,
      currencyCode: connection.currencyCode ?? "USD",
      audience: text(body.audience, "Audience", 500),
      valueProposition: text(
        body.valueProposition,
        "Value proposition",
        1_000,
      ),
      offer:
        text(body.offer ?? "", "Offer", 500, false) || null,
      landingPageUrl: landingPageUrl || null,
    };
    const generated = generateAdCampaign(brief, products);
    const campaign = await createAdCampaign({
      connectionId: id,
      workspaceId,
      ...brief,
      selectedProductIds: productIds,
      strategy: generated.strategy,
      creatives: generated.creatives,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to build this campaign.");
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/campaigns">,
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
    const campaignId = text(body.campaignId, "Campaign ID", 100);
    if (
      body.status !== "draft" &&
      body.status !== "ready" &&
      body.status !== "archived"
    ) {
      throw new RangeError("Campaign status is invalid.");
    }
    const campaign = await updateAdCampaignStatus(
      id,
      workspaceId,
      campaignId,
      body.status,
    );
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ campaign });
  } catch (error) {
    return errorResponse(error, "Unable to update this campaign.");
  }
}
