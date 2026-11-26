import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";
import { assertSameOrigin, originErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { searchParams } = new URL(request.url);
    const outputType = searchParams.get("outputType") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? 30), 200);
    const evaluations = await brandBrainLearningService.listOutputEvaluations(access.workspaceId, { outputType, limit });
    return NextResponse.json({ evaluations });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load output evaluations." }, { status: 500 });
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
    if (!body || typeof body.entityType !== "string" || typeof body.outputType !== "string") {
      return NextResponse.json({ error: "entityType and outputType are required." }, { status: 400 });
    }
    const evaluation = await brandBrainLearningService.evaluateOutput({
      organizationId: access.organizationId,
      workspaceId: access.workspaceId,
      entityType: body.entityType,
      entityId: typeof body.entityId === "string" ? body.entityId : null,
      outputType: body.outputType,
      originalOutput: body.originalOutput,
      finalOutput: body.finalOutput,
    });
    return NextResponse.json({ evaluation }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Unable to evaluate output." }, { status: 500 });
  }
}
