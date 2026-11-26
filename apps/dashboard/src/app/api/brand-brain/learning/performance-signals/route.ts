import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";
import { assertSameOrigin, originErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel") ?? undefined;
    const metric = searchParams.get("metric") ?? undefined;
    const since = searchParams.get("since") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 500);
    const signals = await brandBrainLearningService.listPerformanceSignals(access.workspaceId, { channel, metric, limit, since });
    return NextResponse.json({ signals });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load performance signals." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  }
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.metric !== "string" || !body.metric.trim()) {
      return NextResponse.json({ error: "metric is required." }, { status: 400 });
    }
    if (typeof body.value !== "number" || !Number.isFinite(body.value)) {
      return NextResponse.json({ error: "value must be a number." }, { status: 400 });
    }
    if (typeof body.sourceProvider !== "string" || !body.sourceProvider.trim()) {
      return NextResponse.json({ error: "sourceProvider is required." }, { status: 400 });
    }
    const signal = await brandBrainLearningService.recordPerformanceSignal({
      organizationId: access.organizationId,
      workspaceId: access.workspaceId,
      metric: body.metric,
      value: body.value,
      baselineValue: typeof body.baselineValue === "number" ? body.baselineValue : null,
      channel: typeof body.channel === "string" ? body.channel : null,
      contentType: typeof body.contentType === "string" ? body.contentType : null,
      entityType: typeof body.entityType === "string" ? body.entityType : null,
      entityId: typeof body.entityId === "string" ? body.entityId : null,
      periodStart: typeof body.periodStart === "string" ? body.periodStart : null,
      periodEnd: typeof body.periodEnd === "string" ? body.periodEnd : null,
      sourceProvider: body.sourceProvider,
      insight: typeof body.insight === "string" ? body.insight : null,
      recommendation: typeof body.recommendation === "string" ? body.recommendation : null,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined,
    });
    return NextResponse.json({ signal }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = error instanceof Error ? error.message : "Unable to record performance signal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
