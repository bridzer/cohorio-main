import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContext: vi.fn(),
  saveContext: vi.fn(),
  getProvenance: vi.fn(),
  markConfirmed: vi.fn(),
  proposeItems: vi.fn(),
  approveProposal: vi.fn(),
  snapshotVersion: vi.fn(),
  getWebsite: vi.fn(),
  saveWebsite: vi.fn(),
  listAssets: vi.fn(),
  listExcerpts: vi.fn(),
  getSession: vi.fn(),
  saveSession: vi.fn(),
  listProviders: vi.fn(),
  listIntegrationStatus: vi.fn(),
  crawlWebsite: vi.fn(),
  synthesizeIntel: vi.fn(),
  saveAssessments: vi.fn(),
  saveFindings: vi.fn(),
  insertRecommendations: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  saveSource: vi.fn(),
  editRec: vi.fn(),
}));

vi.mock("@/lib/marketing-context-repository", () => ({
  getMarketingContext: mocks.getContext,
  saveMarketingContextSection: mocks.saveContext,
}));
vi.mock("./provenance", () => ({
  getProvenance: mocks.getProvenance,
  markFieldsUserConfirmed: mocks.markConfirmed,
  proposeItems: mocks.proposeItems,
  approveProposal: mocks.approveProposal,
  snapshotVersion: mocks.snapshotVersion,
}));
vi.mock("@/lib/brand-discovery/analysis-repository", () => ({
  getWebsiteAnalysis: mocks.getWebsite,
  saveWebsiteAnalysis: mocks.saveWebsite,
}));
vi.mock("@/lib/brand-discovery/asset-repository", () => ({
  listBrandAssets: mocks.listAssets,
  listBrandAssetExcerpts: mocks.listExcerpts,
}));
vi.mock("@/lib/onboarding-repository", () => ({
  getOnboardingSession: mocks.getSession,
  saveOnboardingSession: mocks.saveSession,
}));
vi.mock("@/lib/integrations/providers", () => ({
  listProviderIds: mocks.listProviders,
}));
vi.mock("@/lib/integrations/store", () => ({
  listIntegrationStatus: mocks.listIntegrationStatus,
}));
vi.mock("@/lib/brand-discovery/crawl", () => ({
  crawlWebsiteForBrand: mocks.crawlWebsite,
}));
vi.mock("@/lib/brand-discovery/intelligence", () => ({
  synthesizeWebsiteBrandIntelligence: mocks.synthesizeIntel,
}));
vi.mock("./assessment-repository", () => ({
  saveAssessments: mocks.saveAssessments,
  saveAssessmentFindings: mocks.saveFindings,
  insertRecommendations: mocks.insertRecommendations,
  listAssessments: vi.fn(),
  listAssessmentFindings: vi.fn(),
  listRecommendations: vi.fn(),
  transitionRecommendation: vi.fn(),
  editRecommendation: mocks.editRec,
  createIntelligenceJob: mocks.createJob,
  updateIntelligenceJob: mocks.updateJob,
  getLatestIntelligenceJob: vi.fn(),
  saveIntelligenceSource: mocks.saveSource,
}));

import { BrandBrainService } from "./service";

describe("BrandBrainService", () => {
  const service = new BrandBrainService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContext.mockResolvedValue({
      workspaceId: "ws-1",
      sections: {
        productOverview: { oneLiner: "Acme builds roasted coffee subscriptions." },
      },
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
    mocks.getProvenance.mockResolvedValue({
      "productOverview.oneLiner": {
        section: "productOverview",
        field: "oneLiner",
        source: "user",
        sourceType: "user_input",
        confidence: "high",
        status: "USER_CONFIRMED",
        proposedValue: null,
        updatedAt: new Date().toISOString(),
      },
    });
    mocks.getWebsite.mockResolvedValue(null);
    mocks.listAssets.mockResolvedValue([]);
    mocks.listExcerpts.mockResolvedValue([]);
    mocks.getSession.mockResolvedValue({
      businessName: "Acme",
      organizationCategory: "ecommerce",
      selectedChannels: [],
    });
    mocks.listProviders.mockResolvedValue(["shopify"]);
    mocks.listIntegrationStatus.mockResolvedValue([{ provider: "shopify", configured: false }]);
    mocks.createJob.mockResolvedValue({ id: "job-1", status: "QUEUED" });
    mocks.updateJob.mockImplementation(async (_ws, _id, patch) => ({
      id: "job-1",
      ...patch,
    }));
    mocks.insertRecommendations.mockResolvedValue({ created: 5, skipped: 0 });
  });

  it("orchestrates existing-brand discovery, saves intelligence, and runs assessment", async () => {
    mocks.crawlWebsite.mockResolvedValue({
      rootUrl: "https://acme.com",
      finalUrl: "https://acme.com",
      html: "<html></html>",
      classification: {
        platform: "shopify",
        businessModel: "shopify-store",
        confidence: "high",
        signals: ["cdn.shopify.com"],
      },
      facts: {
        title: "Acme Coffee",
        description: "Fresh coffee beans.",
        generator: "Shopify",
        headings: ["Fresh Coffee"],
        emails: [],
        phones: [],
        socials: [],
      },
      seo: { opportunities: ["Add JSON-LD structured data."] },
      detectedChannels: ["Instagram"],
      pages: [
        { url: "https://acme.com", role: "homepage", title: "Acme", headings: [], excerpt: "Fresh coffee beans." },
      ],
      crawlNotes: [],
    });
    mocks.synthesizeIntel.mockResolvedValue({
      industry: "Food & Beverage",
      inferredBusinessModel: "DTC coffee subscription",
      productsServices: ["Whole bean coffee"],
      messaging: ["Fresh coffee beans."],
      targetAudiences: ["Home espresso enthusiasts"],
      positioning: "Weekly small-batch coffee",
      voiceCharacteristics: ["Warm"],
      marketingChannels: ["Instagram"],
      seoOpportunities: ["Add JSON-LD structured data."],
      competitors: [],
      missingInfo: [],
      intelligenceSummary: "Shopify coffee brand.",
      usedLlm: false,
    });
    const savedAnalysis = {
      workspaceId: "ws-1",
      organizationId: "org-1",
      url: "https://acme.com",
      platform: "shopify",
      businessModel: "shopify-store",
      confidence: "high",
      title: "Acme Coffee",
      description: "Fresh coffee beans.",
      emails: [],
      phones: [],
      socials: [],
      headings: ["Fresh Coffee"],
      signals: ["cdn.shopify.com"],
      industry: "Food & Beverage",
      inferredBusinessModel: "DTC coffee subscription",
      productsServices: ["Whole bean coffee"],
      messaging: ["Fresh coffee beans."],
      targetAudiences: ["Home espresso enthusiasts"],
      positioning: "Weekly small-batch coffee",
      voiceCharacteristics: ["Warm"],
      marketingChannels: ["Instagram"],
      seoOpportunities: ["Add JSON-LD structured data."],
      competitors: [],
      missingInfo: [],
      pagesCrawled: ["https://acme.com"],
      intelligenceSummary: "Shopify coffee brand.",
      updatedAt: new Date().toISOString(),
    };
    mocks.saveWebsite.mockResolvedValue(savedAnalysis);
    mocks.getWebsite.mockResolvedValue(savedAnalysis);

    const result = await service.discoverExistingBrand({
      brandId: "ws-1",
      organizationId: "org-1",
      websiteUrl: "https://acme.com",
    });

    expect(result.analysis.platform).toBe("shopify");
    expect(result.assessment.length).toBe(12);
    expect(result.recommendations.proposed).toBe(5);
    expect(mocks.saveSource).toHaveBeenCalledTimes(1);
    expect(mocks.saveAssessments).toHaveBeenCalledWith("ws-1", expect.any(Array), "org-1");
    expect(mocks.saveFindings).toHaveBeenCalled();
    expect(mocks.updateJob).toHaveBeenLastCalledWith(
      "ws-1",
      "job-1",
      expect.objectContaining({ status: "COMPLETED" }),
    );
  });

  it("marks intelligence job FAILED if discovery throws", async () => {
    mocks.crawlWebsite.mockRejectedValue(new Error("Upstream timeout"));
    await expect(
      service.discoverExistingBrand({
        brandId: "ws-1",
        organizationId: "org-1",
        websiteUrl: "https://acme.com",
      }),
    ).rejects.toThrow("Upstream timeout");
    expect(mocks.updateJob).toHaveBeenLastCalledWith(
      "ws-1",
      "job-1",
      expect.objectContaining({ status: "FAILED", errorMessage: "Upstream timeout" }),
    );
  });

  it("retrieves relevance-ranked knowledge and updates provenance on write", async () => {
    const items = await service.retrieveKnowledge("ws-1", "coffee");
    expect(items.length).toBe(1);
    expect(items[0]?.section).toBe("productOverview");

    mocks.saveContext.mockResolvedValue({ workspaceId: "ws-1", sections: {} });
    await service.updateKnowledge("ws-1", {
      section: "productOverview",
      values: { category: "Specialty Coffee" },
      note: "Discovery update",
    });
    expect(mocks.saveContext).toHaveBeenCalled();
    expect(mocks.markConfirmed).toHaveBeenCalledWith("ws-1", "productOverview", ["category"], "user");
    expect(mocks.snapshotVersion).toHaveBeenCalledWith("ws-1", "Discovery update");
  });
});
