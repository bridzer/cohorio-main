import { NextRequest, NextResponse } from "next/server";
import type { RecommendationEffort, RecommendationPriority, RecommendationStatus } from "@/lib/brand-brain/recommend";
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

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const ACTIONS: Record<string, RecommendationStatus> = {
  review: "REVIEW_REQUIRED",
  accept: "ACCEPTED",
  start: "IN_PROGRESS",
  complete: "COMPLETED",
  dismiss: "DISMISSED",
  defer: "DEFERRED",
};

const PRIORITIES = new Set<RecommendationPriority>(["high", "medium", "low"]);
const EFFORTS = new Set<RecommendationEffort>(["S", "M", "L"]);

export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const openOnly = request.nextUrl.searchParams.get("all") !== "true";
    return NextResponse.json({
      recommendations: await brandBrainService.listRecommendations(
        access.workspaceId,
        openOnly,
      ),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load recommendations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      id?: unknown;
      title?: unknown;
      description?: unknown;
      solution?: unknown;
      outcome?: unknown;
      priority?: unknown;
      effort?: unknown;
    } | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return errorResponse("A valid recommendation id is required.", 400);
    }

    if (body?.action === "edit") {
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : undefined;
      const description =
        typeof body.description === "string" ? body.description.trim().slice(0, 1000) : undefined;
      const solution =
        typeof body.solution === "string" ? body.solution.trim().slice(0, 1000) : undefined;
      const outcome =
        typeof body.outcome === "string" ? body.outcome.trim().slice(0, 500) : undefined;
      const priority =
        typeof body.priority === "string" && PRIORITIES.has(body.priority as RecommendationPriority)
          ? (body.priority as RecommendationPriority)
          : undefined;
      const effort =
        typeof body.effort === "string" && EFFORTS.has(body.effort as RecommendationEffort)
          ? (body.effort as RecommendationEffort)
          : undefined;
      if (!title && !description && !solution && !outcome && !priority && !effort) {
        return errorResponse("Provide at least one field to update.", 400);
      }
      const recommendation = await brandBrainService.editRecommendation(
        access.workspaceId,
        id,
        { title, description, solution, outcome, priority, effort },
        access.userId,
      );
      return NextResponse.json({ recommendation });
    }

    const to = typeof body?.action === "string" ? ACTIONS[body.action] : undefined;
    if (!to) {
      return errorResponse(
        "Action must be review, accept, start, complete, dismiss, defer, or edit.",
        400,
      );
    }
    const recommendation = await brandBrainService.transitionRecommendation(
      access.workspaceId,
      id,
      to,
      access.userId,
    );
    return NextResponse.json({ recommendation });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) {
      const missing = /not found/i.test(error.message);
      return errorResponse(error.message, missing ? 404 : 400);
    }
    return NextResponse.json({ error: "Unable to update recommendation." }, { status: 500 });
  }
}
