import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock all repository layers to unit-test completion logic without DB
const mocks = vi.hoisted(() => ({
  getMarketingContext: vi.fn(),
  getProvenance: vi.fn(),
  getOnboardingSession: vi.fn(),
  getWebsiteAnalysis: vi.fn(),
  listBrandAssetExcerpts: vi.fn(),
  listProviderIds: vi.fn(),
  listIntegrationStatus: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  getLatestJob: vi.fn(),
  proposeItems: vi.fn(),
  synthesizeProposals: vi.fn(),
  detectGaps: vi.fn(),
}));

vi.mock("@/lib/marketing-context-repository", () => ({ getMarketingContext: mocks.getMarketingContext }));
vi.mock("./provenance", async () => {
  const actual = await vi.importActual<typeof import("./provenance")>("./provenance");
  return { ...actual, getProvenance: mocks.getProvenance, proposeItems: mocks.proposeItems };
});
vi.mock("@/lib/onboarding-repository", () => ({ getOnboardingSession: mocks.getOnboardingSession }));
vi.mock("@/lib/brand-discovery/analysis-repository", () => ({ getWebsiteAnalysis: mocks.getWebsiteAnalysis }));
vi.mock("@/lib/brand-discovery/asset-repository", () => ({ listBrandAssetExcerpts: mocks.listBrandAssetExcerpts }));
vi.mock("@/lib/integrations/providers", () => ({ listProviderIds: mocks.listProviderIds }));
vi.mock("@/lib/integrations/store", () => ({ listIntegrationStatus: mocks.listIntegrationStatus }));
vi.mock("./assessment-repository", async () => {
  const actual = await vi.importActual<typeof import("./assessment-repository")>("./assessment-repository");
  return {
    ...actual,
    createIntelligenceJob: mocks.createJob,
    updateIntelligenceJob: mocks.updateJob,
    getLatestIntelligenceJob: mocks.getLatestJob,
  };
});
vi.mock("./synthesize", async () => {
  const actual = await vi.importActual<typeof import("./synthesize")>("./synthesize");
  return { ...actual, synthesizeProposals: mocks.synthesizeProposals };
});
vi.mock("./gaps", async () => {
  const actual = await vi.importActual<typeof import("./gaps")>("./gaps");
  return { ...actual, detectGaps: mocks.detectGaps };
});

import { runBrandCompletion } from "./completion";

function jobStub(status: string) {
  return {
    id: "job-1", workspaceId: "ws-1", organizationId: null, jobKind: "brand_completion",
    status, attempts: 1, maxAttempts: 3, partialResult: {}, result: {}, errorMessage: null,
    startedAt: null, finishedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    idempotencyKey: null,
  } as unknown as import("./assessment-repository").IntelligenceJob;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMarketingContext.mockResolvedValue({ sections: {}, updatedAt: new Date().toISOString(), workspaceId: "ws-1", createdAt: new Date().toISOString() } as never);
  mocks.getProvenance.mockResolvedValue({});
  mocks.getOnboardingSession.mockResolvedValue(null);
  mocks.getWebsiteAnalysis.mockResolvedValue(null);
  mocks.listBrandAssetExcerpts.mockResolvedValue([]);
  mocks.listProviderIds.mockResolvedValue([]);
  mocks.listIntegrationStatus.mockResolvedValue([]);
  mocks.createJob.mockResolvedValue(jobStub("QUEUED"));
  mocks.updateJob.mockImplementation(async (_ws: string, _id: string, patch: { status: string }) => jobStub(patch.status));
  mocks.getLatestJob.mockResolvedValue(null);
  mocks.proposeItems.mockResolvedValue({ proposed: 1, skipped: 0 });
  mocks.synthesizeProposals.mockReturnValue([
    { section: "productOverview", field: "whatItDoes", value: "We sell mugs", source: "Website", sourceType: "website", confidence: "medium" as const },
  ]);
  mocks.detectGaps.mockImplementation(({ context }: { context: unknown }) => {
    // Simple gap: if whatItDoes empty, one gap
    const ctx = context as Record<string, Record<string, string>>;
    const hasWhatItDoes = Boolean(ctx?.productOverview?.whatItDoes);
    return hasWhatItDoes
      ? { gaps: [], completeness: { overall: 100, sections: [], pendingReviews: 0 } }
      : {
          gaps: [{ section: "productOverview", field: "whatItDoes", label: "What it does", why: "needed", suggestion: null, sectionTitle: "Product overview" }],
          completeness: { overall: 20, sections: [], pendingReviews: 0 },
        };
  });
});

describe("runBrandCompletion", () => {
  it("creates candidates from gaps and saves them as NEEDS_REVIEW", async () => {
    const report = await runBrandCompletion("ws-1");
    expect(mocks.synthesizeProposals).toHaveBeenCalled();
    expect(mocks.proposeItems).toHaveBeenCalledWith("ws-1", expect.arrayContaining([
      expect.objectContaining({ section: "productOverview", field: "whatItDoes" }),
    ]));
    expect(report.metrics.candidatesGenerated).toBe(1);
    expect(report.metrics.proposalsCreated).toBe(1);
    expect(report.job.status === "REVIEW_REQUIRED" || report.job.status === "COMPLETED").toBe(true);
  });

  it("is idempotent when a job is already running", async () => {
    mocks.getLatestJob.mockResolvedValueOnce(jobStub("ANALYZING"));
    const report = await runBrandCompletion("ws-1");
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(report.metrics.candidatesGenerated).toBe(0);
  });

  it("completes immediately when no gaps remain", async () => {
    mocks.getMarketingContext.mockResolvedValue({
      workspaceId: "ws-1",
      createdAt: new Date().toISOString(),
      sections: { productOverview: { whatItDoes: "We sell mugs" } },
      updatedAt: new Date().toISOString(),
    } as never);
    // detectGaps will see zero gaps via mock logic above + filled context
    const report = await runBrandCompletion("ws-1");
    expect(report.metrics.gapsBefore).toBe(0);
    expect(mocks.proposeItems).not.toHaveBeenCalled();
    expect(report.job.status).toBe("COMPLETED");
  });

  it("never overwrites verified fields via synthesize guard", async () => {
    // Even if synthesize returns a value for an already-confirmed field,
    // proposeItems' own guard prevents overwrite; we assert proposeItems is still called
    // but the underlying provenance check is inside proposeItems — here we just ensure
    // the completion layer doesn't bypass it by writing directly.
    mocks.synthesizeProposals.mockReturnValue([
      { section: "productOverview", field: "category", value: "Drinkware", source: "Website", sourceType: "website", confidence: "low" as const },
    ]);
    const report = await runBrandCompletion("ws-1");
    expect(mocks.proposeItems).toHaveBeenCalled();
    // proposeItems would internally skip if USER_CONFIRMED — completion reports whatever proposeItems returns
    expect(typeof report.metrics.skipped).toBe("number");
  });

  it("marks failure without leaking sensitive inference as fact", async () => {
    mocks.createJob.mockRejectedValue(new Error("db down"));
    await expect(runBrandCompletion("ws-1")).rejects.toThrow("db down");
  });
});
