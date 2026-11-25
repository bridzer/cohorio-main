import { NextRequest, NextResponse } from "next/server";
import { ORGANIZATION_CATEGORIES } from "@/lib/onboarding";
import { getWebsiteAnalysis } from "@/lib/brand-discovery/analysis-repository";
import {
  proposeItems,
  snapshotVersion,
} from "@/lib/brand-brain/provenance";
import { synthesizeProposals } from "@/lib/brand-brain/synthesize";
import { getMarketingContext } from "@/lib/marketing-context-repository";
import { getOnboardingSession } from "@/lib/onboarding-repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

/**
 * Evidence-grounded synthesis run (Milestone 3). Proposes values from the
 * onboarding session and website analysis only — no external research, no
 * guessing. Everything lands as NEEDS_REVIEW; a version snapshot is taken
 * first so the run is fully reversible.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const [session, analysis, stored] = await Promise.all([
      getOnboardingSession(access.workspaceId),
      getWebsiteAnalysis(access.workspaceId),
      getMarketingContext(access.workspaceId),
    ]);
    const category = ORGANIZATION_CATEGORIES.find(
      (entry) => entry.id === session?.organizationCategory,
    );
    const candidates = synthesizeProposals({
      organizationCategoryTitle: category?.title ?? null,
      analysis: analysis
        ? {
            description: analysis.description,
            platform: analysis.platform,
          }
        : null,
      context: stored?.sections ?? {},
    });
    if (!candidates.length) {
      return NextResponse.json({ proposed: 0, skipped: 0, version: null });
    }
    const { proposed, skipped } = await proposeItems(access.workspaceId, candidates);
    const version = await snapshotVersion(
      access.workspaceId,
      `Synthesis run: ${proposed} proposed, ${skipped} skipped`,
    );
    return NextResponse.json({ proposed, skipped, version });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to run synthesis." }, { status: 500 });
  }
}
