import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assetExists,
  attachLaunchAsset,
  LAUNCH_ASSET_TYPES,
  launchBelongsToWorkspace,
} from "@/lib/workspace-records/launches";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const assetSchema = z.object({
  assetType: z.enum(LAUNCH_ASSET_TYPES),
  assetId: z.uuid(),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/launches/[id]/assets">,
) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to update launches.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const launchId = (await context.params).id;
    if (!z.uuid().safeParse(launchId).success) {
      return errorResponse("Launch not found.", 404);
    }
    const parsed = assetSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(
        "Asset type must be copilot, social, or lifecycle with a valid id.",
        400,
      );
    }
    if (!(await launchBelongsToWorkspace(workspaceId, launchId))) {
      return errorResponse("Launch not found.", 404);
    }
    const { assetType, assetId } = parsed.data;
    if (!(await assetExists(workspaceId, assetType, assetId))) {
      return errorResponse("Asset not found.", 404);
    }
    await attachLaunchAsset(launchId, assetType, assetId);
    return NextResponse.json({ launchId, assetType, assetId }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    return errorResponse("Unable to attach this asset.", 503);
  }
}
