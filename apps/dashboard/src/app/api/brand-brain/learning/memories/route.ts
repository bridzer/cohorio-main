import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";
import { assertSameOrigin, originErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const scope = searchParams.get("scope") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);
    const memories = await brandBrainLearningService.listMemories(access.workspaceId, {
      category,
      status,
      scope,
      search,
      limit,
      currentUserId: access.userId,
    });
    return NextResponse.json({ memories });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load learning memories." }, { status: 500 });
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
    if (!body || typeof body.subject !== "string" || !body.subject.trim()) {
      return NextResponse.json({ error: "subject is required." }, { status: 400 });
    }
    const validCategories = new Set(["BUSINESS_KNOWLEDGE","BRAND_KNOWLEDGE","USER_PREFERENCE","STRATEGIC_LEARNING","OPERATIONAL_LEARNING","PERFORMANCE_LEARNING"]);
    const category = typeof body.category === "string" && validCategories.has(body.category) ? body.category : "USER_PREFERENCE";
    const scope = typeof body.scope === "string" && new Set(["TASK","USER","BRAND","ORGANIZATION"]).has(body.scope) ? body.scope : "BRAND";
    // Only owner/admin can create ORGANIZATION-scoped memories
    if (scope === "ORGANIZATION" && !new Set(["owner","admin"]).has(access.role)) {
      return NextResponse.json({ error: "Only owners and admins can set organization-wide learning." }, { status: 403 });
    }
    const memory = await brandBrainLearningService.createMemory({
      organizationId: access.organizationId,
      workspaceId: access.workspaceId,
      category: category as import("@/lib/brand-brain/learning/types").LearningCategory,
      subject: body.subject as string,
      learnedValue: body.learnedValue ?? body.value ?? null,
      sourceEventIds: Array.isArray(body.sourceEventIds) ? (body.sourceEventIds as string[]) : [],
      confidence: typeof body.confidence === "number" ? body.confidence : 0.72,
      scope: scope as import("@/lib/brand-brain/learning/types").LearningScope,
      scopeUserId: scope === "USER" ? access.userId : null,
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Unable to create learning memory." }, { status: 500 });
  }
}
