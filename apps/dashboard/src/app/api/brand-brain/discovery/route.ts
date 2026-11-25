import { NextRequest, NextResponse } from "next/server";
import {
  buildDiscoveryPlan,
  saveDiscoveryAnswers,
  type DiscoverySubmissionItem,
} from "@/lib/brand-brain/discovery";
import { isContextSectionId } from "@/lib/marketing-context";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/brand-brain/discovery?categoryId=ecommerce
 * Returns the full discovery plan with mode-annotated questions.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const categoryId = request.nextUrl.searchParams.get("categoryId") ?? "";
    if (!categoryId) {
      return errorResponse("categoryId query parameter is required.", 400);
    }
    const plan = await buildDiscoveryPlan({
      workspaceId: access.workspaceId,
      userId: access.userId,
      organizationName: access.organizationName ?? "",
      categoryId,
      businessName: request.nextUrl.searchParams.get("businessName"),
    });
    return NextResponse.json(plan);
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) {
      return errorResponse(error.message, 400);
    }
    return NextResponse.json(
      { error: "Unable to build discovery plan." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/brand-brain/discovery
 * Saves accepted/edited discovery answers into Brand Brain.
 * Body: { categoryId?: string, answers: DiscoverySubmissionItem[] }
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as {
      categoryId?: unknown;
      answers?: unknown;
    } | null;

    if (!body || !Array.isArray(body.answers)) {
      return errorResponse("answers must be an array.", 400);
    }

    const answers: DiscoverySubmissionItem[] = [];
    for (const raw of body.answers) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const questionId = typeof item.questionId === "string" ? item.questionId.trim() : "";
      const section = typeof item.section === "string" ? item.section.trim() : "";
      const field = typeof item.field === "string" ? item.field.trim() : "";
      const value = typeof item.value === "string" ? item.value.trim() : "";
      const action = typeof item.action === "string" ? item.action : "";
      const source = typeof item.source === "string" ? item.source : null;

      if (!questionId || !section || !field) continue;
      if (action !== "accept" && action !== "edit" && action !== "reject" && action !== "skip") continue;
      if (!isContextSectionId(section)) continue;

      answers.push({ questionId, section, field, value, action, source });
    }

    const categoryId =
      typeof body.categoryId === "string" ? body.categoryId.trim() : null;

    const result = await saveDiscoveryAnswers({
      workspaceId: access.workspaceId,
      categoryId,
      answers,
    });
    return NextResponse.json(result);
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json(
      { error: "Unable to save discovery answers." },
      { status: 500 },
    );
  }
}
