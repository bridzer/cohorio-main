import { createHash } from "node:crypto";
import { channelById } from "@/lib/channels";
import {
  getWebsiteAnalysis,
  saveWebsiteAnalysis,
  type WebsiteAnalysis,
} from "@/lib/brand-discovery/analysis-repository";
import {
  listBrandAssetExcerpts,
  listBrandAssets,
} from "@/lib/brand-discovery/asset-repository";
import { crawlWebsiteForBrand } from "@/lib/brand-discovery/crawl";
import { synthesizeWebsiteBrandIntelligence } from "@/lib/brand-discovery/intelligence";
import { listProviderIds } from "@/lib/integrations/providers";
import { listIntegrationStatus } from "@/lib/integrations/store";
import {
  CONTEXT_SECTIONS,
  isContextSectionId,
  type ContextSectionId,
  type MarketingContext,
} from "@/lib/marketing-context";
import {
  getMarketingContext,
  saveMarketingContextSection,
} from "@/lib/marketing-context-repository";
import { ORGANIZATION_CATEGORIES } from "@/lib/onboarding";
import {
  getOnboardingSession,
  saveOnboardingSession,
} from "@/lib/onboarding-repository";
import {
  assessBrand,
  assessmentOverall,
  deriveAssessmentFindings,
  type AssessmentFindingDraft,
  type AssessmentInput,
  type Confidence,
  type DimensionAssessment,
  type WebsiteAssessmentSnapshot,
} from "./assess";
import {
  createIntelligenceJob,
  editRecommendation,
  getLatestIntelligenceJob,
  insertRecommendations,
  listAssessmentFindings,
  listAssessments,
  listRecommendations,
  saveAssessmentFindings,
  saveAssessments,
  saveIntelligenceSource,
  transitionRecommendation,
  updateIntelligenceJob,
  type IntelligenceJob,
  type RecommendationEditPatch,
  type StoredAssessment,
  type StoredFinding,
  type StoredRecommendation,
} from "./assessment-repository";
import { detectGaps, type BrainGap, type SectionCompleteness } from "./gaps";
import {
  approveProposal,
  getProvenance,
  markFieldsUserConfirmed,
  proposeItems,
  snapshotVersion,
  type ProposalInput,
  type ProvenanceStatus,
  type SourceType,
} from "./provenance";
import {
  deriveRecommendations,
  type RecommendationDraft,
  type RecommendationStatus,
} from "./recommend";
import { synthesizeProposals } from "./synthesize";

export type CompletenessReport = {
  sections: SectionCompleteness[];
  overall: number;
  pendingReviews: number;
  gaps: BrainGap[];
};

export type ConfidenceAssessment = {
  dimensions: DimensionAssessment[];
  findings: AssessmentFindingDraft[];
  overall: { completeness: number; confidence: Confidence };
};

export type KnowledgeItem = {
  section: string;
  field: string;
  label: string;
  value: string;
  source: string;
  sourceType: SourceType;
  confidence: Confidence;
  status: ProvenanceStatus;
  score: number;
  updatedAt: string | null;
};

export type KnowledgeCandidate = ProposalInput;

export type BrandRecommendationInput = {
  brandId: string;
  organizationId?: string | null;
  draft: RecommendationDraft;
};

export type ApprovalRequestInput = {
  brandId: string;
  proposals: ProposalInput[];
};

export type ApprovalDecision = {
  action: "approve" | "reject";
  section: string;
  field: string;
  value?: string;
};

export type KnowledgeUpdate = {
  section: ContextSectionId;
  values: Record<string, string>;
  source?: string;
  note?: string;
};

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

function websiteSnapshot(website: WebsiteAnalysis | null): WebsiteAssessmentSnapshot | null {
  if (!website) return null;
  return {
    url: website.url,
    title: website.title,
    description: website.description,
    platform: website.platform,
    hasAnalysis: true,
    updatedAt: website.updatedAt,
    industry: website.industry,
    inferredBusinessModel: website.inferredBusinessModel,
    productsServices: website.productsServices,
    messaging: website.messaging,
    targetAudiences: website.targetAudiences,
    positioning: website.positioning,
    voiceCharacteristics: website.voiceCharacteristics,
    marketingChannels: website.marketingChannels,
    seoOpportunities: website.seoOpportunities,
    competitors: website.competitors,
    missingInfo: website.missingInfo,
  };
}

function queryTokens(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function scoreMatch(tokens: string[], ...haystacks: string[]) {
  if (!tokens.length) return 1;
  const combined = haystacks.join(" ").toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (combined.includes(token)) hits += 1;
  }
  return hits;
}

/**
 * Reusable application-level Brand Brain facade (Milestone 1).
 * Centralizes completeness, confidence assessment, knowledge retrieval,
 * website brand discovery, recommendations, and provenance updates.
 */
export class BrandBrainService {
  async getCompleteness(brandId: string): Promise<CompletenessReport> {
    const [stored, provenance] = await Promise.all([
      getMarketingContext(brandId),
      getProvenance(brandId),
    ]);
    const proposals = Object.values(provenance)
      .filter((entry) => entry.status === "NEEDS_REVIEW" && entry.proposedValue)
      .map((entry) => ({
        section: entry.section,
        field: entry.field,
        value: entry.proposedValue as string,
        source: entry.source,
      }));
    const { gaps, completeness } = detectGaps({
      context: stored?.sections ?? {},
      proposals,
    });
    return { ...completeness, gaps };
  }

  async collectAssessmentEvidence(brandId: string): Promise<AssessmentInput> {
    const [stored, provenance, website, assets, session, connectedProviders] =
      await Promise.all([
        getMarketingContext(brandId),
        getProvenance(brandId),
        getWebsiteAnalysis(brandId),
        listBrandAssets(brandId),
        getOnboardingSession(brandId),
        (async () => {
          const ids = await listProviderIds();
          const statuses = await listIntegrationStatus(brandId, ids);
          return statuses.filter((entry) => entry.configured).map((entry) => entry.provider);
        })(),
      ]);
    const category = ORGANIZATION_CATEGORIES.find(
      (entry) => entry.id === session?.organizationCategory,
    );
    return {
      context: stored?.sections ?? {},
      provenance: Object.fromEntries(
        Object.entries(provenance).map(([key, entry]) => [
          key,
          {
            status: entry.status,
            source: entry.source,
            sourceType: entry.sourceType,
            updatedAt: entry.updatedAt,
          },
        ]),
      ),
      website: websiteSnapshot(website),
      imageAssetCount: assets.filter((asset) => isImageMime(asset.mimeType)).length,
      documentCount: assets.filter((asset) => !isImageMime(asset.mimeType)).length,
      organizationCategoryTitle: category?.title ?? null,
      selectedChannels: (session?.selectedChannels ?? []).map((entry) => entry.id),
      connectedProviders,
    };
  }

  async assessConfidence(brandId: string): Promise<ConfidenceAssessment> {
    const input = await this.collectAssessmentEvidence(brandId);
    const dimensions = assessBrand(input);
    const findings = deriveAssessmentFindings(input, dimensions);
    const overall = assessmentOverall(dimensions);
    return { dimensions, findings, overall };
  }

  async runBrandAssessment(
    brandId: string,
    options: { organizationId?: string | null; trackJob?: boolean } = {},
  ): Promise<{
    assessment: DimensionAssessment[];
    overall: { completeness: number; confidence: Confidence };
    findings: AssessmentFindingDraft[];
    recommendations: { proposed: number; skipped: number };
    job: IntelligenceJob | null;
  }> {
    let job: IntelligenceJob | null = null;
    if (options.trackJob) {
      job = await createIntelligenceJob({
        workspaceId: brandId,
        organizationId: options.organizationId ?? null,
        jobKind: "brand_assessment",
      });
      await updateIntelligenceJob(brandId, job.id, { status: "ANALYZING" });
    }
    try {
      const input = await this.collectAssessmentEvidence(brandId);
      const dimensions = assessBrand(input);
      const findings = deriveAssessmentFindings(input, dimensions);
      const overall = assessmentOverall(dimensions);

      if (job) {
        await updateIntelligenceJob(brandId, job.id, {
          status: "GENERATING",
          partialResult: { overall, dimensionCount: dimensions.length },
        });
      }

      await Promise.all([
        saveAssessments(brandId, dimensions, options.organizationId ?? null),
        saveAssessmentFindings(brandId, findings, options.organizationId ?? null),
      ]);

      const selectedWithProviders = input.selectedChannels.map((channelId) => ({
        channelId,
        providers: channelById(channelId)?.providers ?? [],
      }));
      const drafts = deriveRecommendations({
        assessment: dimensions,
        selectedChannels: selectedWithProviders,
        connectedProviders: input.connectedProviders,
        website: input.website,
      });
      const inserted = await insertRecommendations(
        brandId,
        drafts,
        options.organizationId ?? null,
      );
      const recommendations = { proposed: inserted.created, skipped: inserted.skipped };

      if (job) {
        job = await updateIntelligenceJob(brandId, job.id, {
          status: "COMPLETED",
          result: { overall, recommendations },
        });
      }
      return { assessment: dimensions, overall, findings, recommendations, job };
    } catch (error) {
      if (job) {
        await updateIntelligenceJob(brandId, job.id, {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message.slice(0, 500) : "Assessment failed.",
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  async getStoredAssessment(brandId: string): Promise<{
    assessment: StoredAssessment[];
    findings: StoredFinding[];
    overall: { completeness: number; confidence: Confidence };
    assessed: boolean;
    latestJob: IntelligenceJob | null;
  }> {
    const [assessment, findings, latestJob] = await Promise.all([
      listAssessments(brandId),
      listAssessmentFindings(brandId),
      getLatestIntelligenceJob(brandId),
    ]);
    if (!assessment.length) {
      return {
        assessment: [],
        findings,
        overall: { completeness: 0, confidence: "low" },
        assessed: false,
        latestJob,
      };
    }
    return {
      assessment,
      findings,
      overall: assessmentOverall(assessment),
      assessed: true,
      latestJob,
    };
  }

  /**
   * Executes existing-brand website discovery + Cohorio Intelligence synthesis +
   * Brand Assessment + Recommendation generation with partial-result persistence.
   */
  async discoverExistingBrand(input: {
    brandId: string;
    organizationId?: string | null;
    websiteUrl: string;
    businessName?: string | null;
  }) {
    const job = await createIntelligenceJob({
      workspaceId: input.brandId,
      organizationId: input.organizationId ?? null,
      jobKind: "brand_discovery",
      initialInput: { websiteUrl: input.websiteUrl },
    });

    try {
      await updateIntelligenceJob(input.brandId, job.id, { status: "ANALYZING" });

      const [crawl, session, excerpts] = await Promise.all([
        crawlWebsiteForBrand(input.websiteUrl),
        getOnboardingSession(input.brandId),
        listBrandAssetExcerpts(input.brandId, 6),
      ]);

      await updateIntelligenceJob(input.brandId, job.id, {
        status: "GENERATING",
        partialResult: {
          finalUrl: crawl.finalUrl,
          platform: crawl.classification.platform,
          pagesCrawled: crawl.pages.map((p) => p.url),
        },
      });

      const businessName =
        input.businessName?.trim() || session?.businessName?.trim() || crawl.facts.title || "";
      const intelligence = await synthesizeWebsiteBrandIntelligence({
        businessName,
        crawl,
        documentExcerpts: excerpts.map((doc) => ({
          filename: doc.filename,
          excerpt: doc.extractedText,
        })),
      });

      const analysis = await saveWebsiteAnalysis(input.brandId, {
        organizationId: input.organizationId ?? null,
        url: crawl.finalUrl,
        platform: crawl.classification.platform,
        businessModel: crawl.classification.businessModel,
        confidence: crawl.classification.confidence,
        title: crawl.facts.title,
        description: crawl.facts.description,
        emails: crawl.facts.emails,
        phones: crawl.facts.phones,
        socials: crawl.facts.socials,
        headings: crawl.facts.headings,
        signals: crawl.classification.signals,
        industry: intelligence.industry,
        inferredBusinessModel: intelligence.inferredBusinessModel,
        productsServices: intelligence.productsServices,
        messaging: intelligence.messaging,
        targetAudiences: intelligence.targetAudiences,
        positioning: intelligence.positioning,
        voiceCharacteristics: intelligence.voiceCharacteristics,
        marketingChannels: intelligence.marketingChannels,
        seoOpportunities: intelligence.seoOpportunities,
        competitors: intelligence.competitors,
        missingInfo: intelligence.missingInfo,
        pagesCrawled: crawl.pages.map((p) => p.url),
        intelligenceSummary: intelligence.intelligenceSummary,
      });

      await Promise.all([
        saveOnboardingSession(input.brandId, {
          websiteUrl: crawl.finalUrl,
          ...(businessName && !session?.businessName ? { businessName } : {}),
        }),
        ...crawl.pages.map((page) =>
          saveIntelligenceSource(input.brandId, {
            organizationId: input.organizationId ?? null,
            sourceType: "website",
            sourceKey: page.url,
            title: page.title || page.url,
            url: page.url,
            reliability: "medium",
            excerpt: page.excerpt,
            metadata: { role: page.role, headings: page.headings },
            checksum: createHash("sha256").update(page.excerpt).digest("hex"),
          }),
        ),
      ]);

      const assessed = await this.runBrandAssessment(input.brandId, {
        organizationId: input.organizationId ?? null,
        trackJob: false,
      });

      const completedJob = await updateIntelligenceJob(input.brandId, job.id, {
        status: "COMPLETED",
        result: {
          url: analysis.url,
          platform: analysis.platform,
          pagesCrawled: analysis.pagesCrawled.length,
          overall: assessed.overall,
          recommendations: assessed.recommendations,
        },
      });

      return {
        analysis,
        assessment: assessed.assessment,
        overall: assessed.overall,
        findings: assessed.findings,
        recommendations: assessed.recommendations,
        job: completedJob ?? job,
      };
    } catch (error) {
      await updateIntelligenceJob(input.brandId, job.id, {
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message.slice(0, 500) : "Brand discovery failed.",
      }).catch(() => undefined);
      throw error;
    }
  }

  async retrieveKnowledge(brandId: string, query: string): Promise<KnowledgeItem[]> {
    const [stored, provenance, website, assets] = await Promise.all([
      getMarketingContext(brandId),
      getProvenance(brandId),
      getWebsiteAnalysis(brandId),
      listBrandAssetExcerpts(brandId, 6),
    ]);
    const tokens = queryTokens(query);
    const items: KnowledgeItem[] = [];
    const context = (stored?.sections ?? {}) as MarketingContext;

    for (const section of CONTEXT_SECTIONS) {
      const values = context[section.id];
      if (!values || values._notApplicable === "true") continue;
      for (const field of section.fields) {
        const value = values[field.id]?.trim();
        if (!value) continue;
        const prov = provenance[`${section.id}.${field.id}`];
        const score = scoreMatch(tokens, section.title, field.label, value);
        if (tokens.length && score === 0) continue;
        items.push({
          section: section.id,
          field: field.id,
          label: field.label,
          value,
          source: prov?.source ?? "Brand Brain",
          sourceType: prov?.sourceType ?? "user_input",
          confidence: prov?.confidence ?? "medium",
          status: prov?.status ?? "USER_CONFIRMED",
          score: score + (prov?.status === "USER_CONFIRMED" || prov?.status === "VERIFIED" ? 2 : 0),
          updatedAt: prov?.updatedAt ?? stored?.updatedAt ?? null,
        });
      }
    }

    if (website) {
      const candidates: { field: string; label: string; value: string }[] = [
        { field: "whatItDoes", label: "Website description", value: website.description ?? "" },
        { field: "positioning", label: "Website positioning", value: website.positioning ?? "" },
        { field: "industry", label: "Website industry", value: website.industry ?? "" },
        { field: "businessModel", label: "Website business model", value: website.inferredBusinessModel ?? "" },
        { field: "productsServices", label: "Website products & services", value: website.productsServices.join("; ") },
        { field: "targetAudiences", label: "Website audience signals", value: website.targetAudiences.join("; ") },
      ];
      for (const candidate of candidates) {
        if (!candidate.value) continue;
        const score = scoreMatch(tokens, candidate.label, candidate.value);
        if (tokens.length && score === 0) continue;
        items.push({
          section: "website",
          field: candidate.field,
          label: candidate.label,
          value: candidate.value,
          source: website.url,
          sourceType: "website",
          confidence: website.confidence,
          status: "AI_INFERRED",
          score,
          updatedAt: website.updatedAt,
        });
      }
    }

    for (const asset of assets) {
      const score = scoreMatch(tokens, asset.filename, asset.extractedText);
      if (tokens.length && score === 0) continue;
      items.push({
        section: "document",
        field: asset.id,
        label: asset.filename,
        value: asset.extractedText.slice(0, 1_000),
        source: `Uploaded file: ${asset.filename}`,
        sourceType: "document",
        confidence: "medium",
        status: "NEEDS_REVIEW",
        score,
        updatedAt: asset.createdAt,
      });
    }

    return items.sort((a, b) => b.score - a.score);
  }

  async generateCandidateKnowledge(
    brandId: string,
    section?: string,
  ): Promise<KnowledgeCandidate[]> {
    const [session, analysis, stored] = await Promise.all([
      getOnboardingSession(brandId),
      getWebsiteAnalysis(brandId),
      getMarketingContext(brandId),
    ]);
    const category = ORGANIZATION_CATEGORIES.find(
      (entry) => entry.id === session?.organizationCategory,
    );
    const proposals = synthesizeProposals({
      organizationCategoryTitle: category?.title ?? null,
      analysis: analysis
        ? {
            description: analysis.description,
            platform: analysis.platform,
            url: analysis.url,
          }
        : null,
      context: stored?.sections ?? {},
    });
    return section ? proposals.filter((item) => item.section === section) : proposals;
  }

  async createRecommendation(input: BrandRecommendationInput) {
    return insertRecommendations(
      input.brandId,
      [input.draft],
      input.organizationId ?? null,
    );
  }

  async listRecommendations(brandId: string, openOnly = true): Promise<StoredRecommendation[]> {
    return listRecommendations(brandId, openOnly);
  }

  async transitionRecommendation(
    brandId: string,
    recommendationId: string,
    status: RecommendationStatus,
    decidedBy: string | null,
  ) {
    return transitionRecommendation(brandId, recommendationId, status, decidedBy);
  }

  async editRecommendation(
    brandId: string,
    recommendationId: string,
    patch: RecommendationEditPatch,
    editedBy: string | null,
  ) {
    return editRecommendation(brandId, recommendationId, patch, editedBy);
  }

  async createApprovalRequest(input: ApprovalRequestInput) {
    return proposeItems(input.brandId, input.proposals);
  }

  async approveKnowledge(brandId: string, input: ApprovalDecision) {
    if (input.action === "approve") {
      return approveProposal(brandId, input.section, input.field, input.value);
    }
    const { rejectProposal } = await import("./provenance");
    return rejectProposal(brandId, input.section, input.field);
  }

  async updateKnowledge(brandId: string, input: KnowledgeUpdate) {
    if (!isContextSectionId(input.section)) {
      throw new RangeError("Unknown Brand Brain section.");
    }
    const stored = await getMarketingContext(brandId);
    const current = (stored?.sections[input.section] ?? {}) as Record<string, string>;
    const merged = { ...current, ...input.values };
    const saved = await saveMarketingContextSection(brandId, input.section, merged);
    const updatedFields = Object.entries(input.values)
      .filter(([key, value]) => key !== "_notApplicable" && value.trim())
      .map(([key]) => key);
    if (updatedFields.length) {
      await markFieldsUserConfirmed(
        brandId,
        input.section,
        updatedFields,
        input.source ?? "user",
      );
    }
    if (input.note) {
      await snapshotVersion(brandId, input.note);
    }
    return saved;
  }

  async runCompletion(
    brandId: string,
    options: { organizationId?: string | null; trigger?: string } = {},
  ) {
    const { runBrandCompletion } = await import("./completion");
    return runBrandCompletion(brandId, options);
  }

  async getCompletionStatus(brandId: string) {
    const { getCompletionStatus } = await import("./completion");
    return getCompletionStatus(brandId);
  }
}

export const brandBrainService = new BrandBrainService();
