import { NextRequest, NextResponse } from "next/server";
import { classifyWebsite } from "@/lib/brand-discovery/classify";
import { extractWebsiteFacts } from "@/lib/brand-discovery/extract";
import {
  getWebsiteAnalysis,
  saveWebsiteAnalysis,
} from "@/lib/brand-discovery/analysis-repository";
import { fetchPublicHtml, PublicUrlError } from "@/lib/http/public-url";
import { getOnboardingSession, saveOnboardingSession } from "@/lib/onboarding-repository";
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
    } | null;
    const explicit =
      typeof body?.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const session = await getOnboardingSession(access.workspaceId);
    const url = explicit || session?.websiteUrl || "";
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

    let html: string;
    try {
      ({ html } = await fetchPublicHtml(url));
    } catch (fetchError) {
      if (fetchError instanceof PublicUrlError) {
        return errorResponse(
          "That URL is not allowed. Use a public http(s) website address.",
          400,
        );
      }
      throw fetchError;
    }
    if (!html.trim()) {
      return errorResponse("The website returned an empty page.", 502);
    }

    const classification = classifyWebsite({ url, html });
    const facts = extractWebsiteFacts(html);
    const analysis = await saveWebsiteAnalysis(access.workspaceId, {
      url,
      platform: classification.platform,
      businessModel: classification.businessModel,
      confidence: classification.confidence,
      title: facts.title,
      description: facts.description,
      emails: facts.emails,
      phones: facts.phones,
      socials: facts.socials,
      headings: facts.headings,
      signals: classification.signals,
    });
    // Remember the URL for the onboarding session (merge-safe patch).
    await saveOnboardingSession(access.workspaceId, { websiteUrl: url });
    return NextResponse.json({ analysis });
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
