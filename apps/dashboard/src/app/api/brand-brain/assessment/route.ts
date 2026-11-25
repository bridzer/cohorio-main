import { NextRequest, NextResponse } from "next/server";
import { brandBrainService } from "@/lib/brand-brain/service";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    return NextResponse.json(
      await brandBrainService.getStoredAssessment(access.workspaceId),
    );
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load assessment." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const result = await brandBrainService.runBrandAssessment(access.workspaceId, {
      organizationId: access.organizationId,
      trackJob: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to run assessment." }, { status: 500 });
  }
}
