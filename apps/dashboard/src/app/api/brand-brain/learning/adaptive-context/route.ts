import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { searchParams } = new URL(request.url);
    const taskType = searchParams.get("taskType") ?? searchParams.get("task") ?? undefined;
    const channel = searchParams.get("channel") ?? undefined;
    const contentType = searchParams.get("contentType") ?? undefined;
    const queryText = searchParams.get("q") ?? searchParams.get("query") ?? undefined;
    const pkg = await brandBrainLearningService.getAdaptiveContext({
      organizationId: access.organizationId,
      workspaceId: access.workspaceId,
      taskContext: {
        taskType,
        channel,
        contentType,
        query: queryText,
        currentUserId: access.userId,
      },
    });
    return NextResponse.json({ adaptiveContext: pkg });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to build adaptive context." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const pkg = await brandBrainLearningService.getAdaptiveContext({
      organizationId: access.organizationId,
      workspaceId: access.workspaceId,
      taskContext: {
        taskType: typeof body?.taskType === "string" ? body.taskType : undefined,
        channel: typeof body?.channel === "string" ? body.channel : undefined,
        contentType: typeof body?.contentType === "string" ? body.contentType : undefined,
        query: typeof body?.query === "string" ? body.query : typeof body?.q === "string" ? body.q : undefined,
        currentUserId: access.userId,
      },
    });
    return NextResponse.json({ adaptiveContext: pkg });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to build adaptive context." }, { status: 500 });
  }
}
