import { NextRequest, NextResponse } from "next/server";
import { objectiveById } from "@/lib/objectives";
import {
  completeOnboardingSession,
  getOnboardingSession,
} from "@/lib/onboarding-repository";
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

import { runBrandCompletion } from "@/lib/brand-brain/completion";

/**
 * Finishes onboarding for the workspace. The first three stages must be
 * complete and an objective chosen; channels/integrations stay optional per
 * the no-forced-connections rule. The timestamp is server-owned.
 * After persisting completion, kicks off brand brain auto-completion in the
 * background (non-blocking, idempotent).
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as {
      selectedObjective?: unknown;
    } | null;
    const selectedObjective =
      typeof body?.selectedObjective === "string" ? body.selectedObjective.trim() : "";
    if (!selectedObjective || !objectiveById(selectedObjective)) {
      return errorResponse("Choose a valid first objective.", 400);
    }
    const existing = await getOnboardingSession(access.workspaceId);
    if (
      !existing ||
      existing.stages.profile !== "complete" ||
      existing.stages.objective !== "complete" ||
      existing.stages.brand !== "complete"
    ) {
      return errorResponse(
        "Finish the profile, objective, and brand steps first.",
        409,
      );
    }
    const session = await completeOnboardingSession(access.workspaceId, selectedObjective);
    if (!session) {
      return errorResponse("Onboarding session not found.", 404);
    }
    // Fire-and-forget: do not block dashboard entry; job tracks status.
    void runBrandCompletion(access.workspaceId, {
      organizationId: access.organizationId ?? null,
      trigger: "onboarding",
    }).catch(() => undefined);
    return NextResponse.json({ session });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to complete onboarding." }, { status: 500 });
  }
}
