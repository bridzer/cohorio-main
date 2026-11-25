import { NextRequest, NextResponse } from "next/server";
import { getWebsiteAnalysis } from "@/lib/brand-discovery/analysis-repository";
import { brandBrainService } from "@/lib/brand-brain/service";
import { PublicUrlError } from "@/lib/http/public-url";
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

/** Minimum gap between analyses so one workspace cannot hammer target sites. */
const COOLDOWN_MS = 60_000;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    return NextResponse.json({
      analysis: await getWebsiteAnalysis(access.workspaceId),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json(
      { error: "Unable to load website analysis." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as {
      websiteUrl?: unknown;
      businessName?: unknown;
    } | null;
    const explicitUrl =
      typeof body?.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const explicitName =
      typeof body?.businessName === "string" ? body.businessName.trim() : "";
    const session = await getOnboardingSession(access.workspaceId);
    const url = explicitUrl || session?.websiteUrl || "";
    if (!url || !/^https?:\/\/.+\..+/.test(url)) {
      return errorResponse("Enter a valid website URL starting with http(s)://.", 400);
    }

    const previous = await getWebsiteAnalysis(access.workspaceId);
    if (previous) {
      const age = Date.now() - new Date(previous.updatedAt).getTime();
      if (age < COOLDOWN_MS) {
        return NextResponse.json(
          {
            error: `Analysis is cooling down. Retry in ${Math.ceil((COOLDOWN_MS - age) / 1000)}s.`,
            analysis: previous,
          },
          { status: 429 },
        );
      }
    }

    try {
      const discovered = await brandBrainService.discoverExistingBrand({
        brandId: access.workspaceId,
        organizationId: access.organizationId,
        websiteUrl: url,
        businessName: explicitName || session?.businessName || null,
      });
      // Reusable completion: new website intelligence may fill gaps.
      // Fire-and-forget so the analysis response stays fast (< Cohorio Intelligence + completion).
      void brandBrainService
        .runCompletion(access.workspaceId, {
          organizationId: access.organizationId,
          trigger: "evidence",
        })
        .catch(() => undefined);
      return NextResponse.json(discovered);
    } catch (fetchError) {
      if (fetchError instanceof PublicUrlError) {
        return errorResponse(
          "That URL is not allowed. Use a public http(s) website address.",
          400,
        );
      }
      throw fetchError;
    }
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to analyze this website.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
