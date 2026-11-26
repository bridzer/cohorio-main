import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";
import { assertSameOrigin, originErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const before = searchParams.get("before") ?? undefined;
    const eventType = searchParams.get("eventType") ?? undefined;
    const sourceModule = searchParams.get("sourceModule") ?? undefined;
    const events = await brandBrainLearningService.listEvents(access.workspaceId, {
      limit,
      before,
      eventType,
      sourceModule,
    });
    return NextResponse.json({ events });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load learning events." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required.", 503);
  }
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.eventType !== "string" || typeof body.sourceModule !== "string") {
      return errorResponse("eventType and sourceModule are required.", 400);
    }
    const event = await brandBrainLearningService.captureEvent(
      {
        organizationId: access.organizationId,
        workspaceId: access.workspaceId,
        userId: access.userId,
      },
      {
        eventType: body.eventType as import("@/lib/brand-brain/learning/types").LearningEventType,
        sourceModule: body.sourceModule,
        entityType: typeof body.entityType === "string" ? body.entityType : undefined,
        entityId: typeof body.entityId === "string" ? body.entityId : undefined,
        originalValue: body.originalValue,
        resultingValue: body.resultingValue,
        feedback:
          body.feedback && typeof body.feedback === "object"
            ? (body.feedback as { action?: string; rating?: number; reason?: string; comment?: string })
            : undefined,
        context:
          body.context && typeof body.context === "object" && !Array.isArray(body.context)
            ? (body.context as Record<string, unknown>)
            : undefined,
        dedupKey: typeof body.dedupKey === "string" ? body.dedupKey : undefined,
      },
    );
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) return errorResponse(error.message, 400);
    const message = error instanceof Error ? error.message : "Unable to capture event.";
    return errorResponse(message, 500);
  }
}
