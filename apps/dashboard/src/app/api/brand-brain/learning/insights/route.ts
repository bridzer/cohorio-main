import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const insights = await brandBrainLearningService.getLearningInsights(access.workspaceId, {
      currentUserId: access.userId,
    });
    const counts = await brandBrainLearningService.getCounts(access.workspaceId);
    return NextResponse.json({ insights, counts });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load learning insights." }, { status: 500 });
  }
}
