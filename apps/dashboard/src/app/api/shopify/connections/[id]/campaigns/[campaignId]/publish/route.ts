import { NextRequest, NextResponse } from "next/server";
import { AdNetworkError, PublishConfigError } from "@/lib/ads/publish";
import {
  CampaignNotFoundError,
  publishWorkspaceCampaign,
} from "@/lib/ads/publish-campaign";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/campaigns/[campaignId]/publish">,
) {
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const { id, campaignId } = await context.params;
    if (!UUID.test(id) || !UUID.test(campaignId)) {
      return errorResponse("Campaign not found.", 404);
    }
    const body = (await request.json()) as { confirm?: unknown };
    if (body?.confirm !== true) {
      return errorResponse("Confirm the publish before Cohorio sends this campaign.", 400);
    }
    const published = await publishWorkspaceCampaign(workspaceId, id, campaignId);
    return NextResponse.json({ campaign: published });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    if (error instanceof CampaignNotFoundError) {
      return errorResponse(error.message, 404);
    }
    if (error instanceof PublishConfigError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof AdNetworkError) {
      return errorResponse(error.message, 502);
    }
    return errorResponse("Unable to publish this campaign.", 503);
  }
}
