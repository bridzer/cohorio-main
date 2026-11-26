import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";
import { assertSameOrigin, originErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 80), 500);
    const history = await brandBrainLearningService.getLearningHistory(access.workspaceId, limit);
    return NextResponse.json({ history });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load learning history." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("viewer");
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 80), 500);
    const history = await brandBrainLearningService.getLearningHistory(access.workspaceId, limit);
    return NextResponse.json({ history });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load learning history." }, { status: 500 });
  }
}
