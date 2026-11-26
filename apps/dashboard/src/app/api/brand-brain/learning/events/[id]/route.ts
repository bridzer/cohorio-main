import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";
import { assertSameOrigin, originErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { id } = await context.params;
    const event = await brandBrainLearningService.getEvent(access.workspaceId, id);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    const interpretation = await brandBrainLearningService.getInterpretationForEvent(access.workspaceId, id);
    return NextResponse.json({ event, interpretation });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load event." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireWorkspaceAccess("member");
    const { id } = await context.params;
    const interpretation = await brandBrainLearningService.interpretEvent(id);
    return NextResponse.json({ interpretation });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Unable to interpret event." }, { status: 500 });
  }
}
