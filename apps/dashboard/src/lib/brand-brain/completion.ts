import { createHash } from "node:crypto";
import { CONTEXT_SECTIONS, type MarketingContext } from "@/lib/marketing-context";
import { getMarketingContext } from "@/lib/marketing-context-repository";
import { getOnboardingSession } from "@/lib/onboarding-repository";
import { getWebsiteAnalysis } from "@/lib/brand-discovery/analysis-repository";
import { listBrandAssetExcerpts } from "@/lib/brand-discovery/asset-repository";
import { listIntegrationStatus } from "@/lib/integrations/store";
import { listProviderIds } from "@/lib/integrations/providers";
import { ORGANIZATION_CATEGORIES } from "@/lib/onboarding";
import { detectGaps } from "./gaps";
import {
  createIntelligenceJob,
  getLatestIntelligenceJob,
  type IntelligenceJob,
  updateIntelligenceJob,
} from "./assessment-repository";
import { getProvenance, proposeItems, type ProposalInput } from "./provenance";
import { synthesizeProposals } from "./synthesize";

/**
 * Milestone 3 — Automatic Brand Brain Completion
 *
 * 10-step per-section process from the spec §5E, implemented as a
 * single idempotent pass that can run after onboarding and any time new
 * information arrives. Never blocks the dashboard (job-based, retryable).
 */

export type CompletionMetrics = {
  overallBefore: number;
  overallAfter: number;
  gapsBefore: number;
  gapsAfter: number;
  candidatesGenerated: number;
  provisionalSaved: number;
  approvalsQueued: number;
  skippedIdempotent: number;
};

export type CompletionReport = {
  job: IntelligenceJob;
  metrics: CompletionMetrics;
  pendingApprovals: number;
};

function isSensitiveDemographicGuess(value: string) {
  // Block unsupported demographic claims (age/gender/ethnicity) unless the
  // value already exists verbatim in evidence-backed sources — synthesis
  // itself never invents these, but guard the pipeline exit too.
  return /\b(men|women|male|female|aged?\s*\d|years?\s*old|ethnic|race)\b/i.test(value)
    && !value.includes("interest");
}

function hashGaps(gaps: { section: string; field: string }[]) {
  return createHash("sha256")
    .update(JSON.stringify(gaps.map((g) => `${g.section}.${g.field}`).sort()))
    .digest("hex")
    .slice(0, 12);
}

export async function runBrandCompletion(
  workspaceId: string,
  options: {
    organizationId?: string | null;
    trigger?: "onboarding" | "manual" | "evidence" | string;
    brandName?: string | null;
  } = {},
): Promise<CompletionReport> {
  // Idempotency: if a completion is already in-flight, return its status
  const active = await getLatestIntelligenceJob(workspaceId, "brand_completion");
  if (active && ["QUEUED", "ANALYZING", "GENERATING"].includes(active.status)) {
    const gaps = await detectGapsFor(workspaceId);
    return {
      job: active,
      metrics: {
        overallBefore: gaps.completeness.overall,
        overallAfter: gaps.completeness.overall,
        gapsBefore: gaps.gaps.length,
        gapsAfter: gaps.gaps.length,
        candidatesGenerated: 0,
        provisionalSaved: 0,
        approvalsQueued: gaps.completeness.pendingReviews,
        skippedIdempotent: 0,
      },
      pendingApprovals: gaps.completeness.pendingReviews,
    };
  }

  // Fresh job: track trigger for audit
  let job = await createIntelligenceJob({
    workspaceId,
    organizationId: options.organizationId ?? null,
    jobKind: "brand_completion",
    idempotencyKey: `completion:${hashGaps((await detectGapsFor(workspaceId)).gaps)}:${Date.now().toString(36)}`,
    initialInput: { trigger: options.trigger ?? "manual", brandName: options.brandName ?? null },
  });
  await updateIntelligenceJob(workspaceId, job.id, { status: "ANALYZING" });

  try {
    // 1-4: Retrieve knowledge, evaluate completeness, retrieve evidence, identify missing
    const before = await detectGapsFor(workspaceId);
    const gapsBefore = before.gaps.length;
    const overallBefore = before.completeness.overall;

    if (gapsBefore === 0) {
      job = (await updateIntelligenceJob(workspaceId, job.id, {
        status: "COMPLETED",
        result: { gapsBefore: 0, gapsAfter: 0, overallBefore, overallAfter: overallBefore },
      })) ?? job;
      return {
        job,
        metrics: {
          overallBefore, overallAfter: overallBefore, gapsBefore: 0, gapsAfter: 0,
          candidatesGenerated: 0, provisionalSaved: 0, approvalsQueued: 0, skippedIdempotent: 0,
        },
        pendingApprovals: before.completeness.pendingReviews,
      };
    }

    await updateIntelligenceJob(workspaceId, job.id, {
      status: "GENERATING",
      partialResult: { gapsBefore, overallBefore },
    });

    // 5-6: Generate candidates, evaluate confidence (synthesis does both with documented methodology)
    const evidence = await collectSynthesisInput(workspaceId, options.brandName ?? null);
    const candidates = synthesizeProposals(evidence).filter(
      (c) => !isSensitiveDemographicGuess(c.value),
    );

    // 7-8: Save provisional + create approvals (same store: NEEDS_REVIEW queue). Idempotent via proposeItems.
    let provisionalSaved = 0;
    let skippedIdempotent = 0;
    if (candidates.length) {
      const result = await proposeItems(workspaceId, candidates);
      provisionalSaved = result.proposed;
      skippedIdempotent = result.skipped;
    }

    // 9: Update completion metrics
    const after = await detectGapsFor(workspaceId);
    const metrics: CompletionMetrics = {
      overallBefore,
      overallAfter: after.completeness.overall,
      gapsBefore,
      gapsAfter: after.gaps.length,
      candidatesGenerated: candidates.length,
      provisionalSaved,
      approvalsQueued: after.completeness.pendingReviews,
      skippedIdempotent,
    };

    // 10: Notify is via job result + dashboard polling (no blocking toast dependency)
    const finalStatus = metrics.approvalsQueued > 0 ? "REVIEW_REQUIRED" : "COMPLETED";
    job = (await updateIntelligenceJob(workspaceId, job.id, {
      status: finalStatus,
      result: {
        metrics,
        pendingApprovals: metrics.approvalsQueued,
      },
      partialResult: { gapsAfter: metrics.gapsAfter, overallAfter: metrics.overallAfter },
    })) ?? job;

    return { job, metrics, pendingApprovals: metrics.approvalsQueued };
  } catch (error) {
    await updateIntelligenceJob(workspaceId, job.id, {
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Brand completion failed.",
    }).catch(() => undefined);
    throw error;
  }
}

async function detectGapsFor(workspaceId: string) {
  const [stored, provenance] = await Promise.all([
    getMarketingContext(workspaceId),
    getProvenance(workspaceId),
  ]);
  const proposals = Object.values(provenance)
    .filter((e) => e.status === "NEEDS_REVIEW" && e.proposedValue)
    .map((e) => ({ section: e.section, field: e.field, value: e.proposedValue as string, source: e.source }));
  return detectGaps({ context: stored?.sections ?? {}, proposals });
}

async function collectSynthesisInput(
  workspaceId: string,
  brandNameHint: string | null,
): Promise<Parameters<typeof synthesizeProposals>[0]> {
  const [session, website, stored, assetExcerpts, connections] = await Promise.all([
    getOnboardingSession(workspaceId).catch(() => null),
    getWebsiteAnalysis(workspaceId).catch(() => null),
    getMarketingContext(workspaceId),
    listBrandAssetExcerpts(workspaceId, 6).catch(() => [] as { extractedText: string }[]),
    (async () => {
      const ids = await listProviderIds().catch(() => [] as string[]);
      const statuses = await listIntegrationStatus(workspaceId, ids).catch(() => [] as { provider: string; configured: boolean }[]);
      return { ids, statuses };
    })(),
  ]);

  const category = ORGANIZATION_CATEGORIES.find((c) => c.id === session?.organizationCategory);
  const docExcerpt = assetExcerpts.map((a) => a.extractedText).join("\n").slice(0, 1200) || null;

  const websiteEnriched = website
    ? {
        description: website.description,
        platform: website.platform,
        url: website.url,
        targetAudiences: website.targetAudiences,
        positioning: website.positioning,
        voiceCharacteristics: website.voiceCharacteristics,
        industry: website.industry,
        productsServices: website.productsServices,
        _docExcerpt: docExcerpt,
        _brandName: brandNameHint ?? session?.businessName ?? null,
      }
    : {
        description: docExcerpt,
        platform: null as string | null,
        url: null as string | null,
        targetAudiences: [] as string[],
        positioning: null as string | null,
        voiceCharacteristics: [] as string[],
        industry: null as string | null,
        productsServices: [] as string[],
        _docExcerpt: docExcerpt,
        _brandName: brandNameHint ?? session?.businessName ?? null,
      };

  return {
    organizationCategoryTitle: category?.title ?? null,
    analysis: websiteEnriched as never,
    context: stored?.sections ?? {},
  };
}

export async function getCompletionStatus(workspaceId: string) {
  const [gapsReport, job] = await Promise.all([
    detectGapsFor(workspaceId),
    getLatestIntelligenceJob(workspaceId, "brand_completion"),
  ]);
  return {
    gaps: gapsReport.gaps,
    completeness: gapsReport.completeness,
    job,
    pendingReviews: gapsReport.completeness.pendingReviews,
  };
}
