import { describe, expect, it } from "vitest";
import {
  assessBrand,
  assessmentOverall,
  ASSESSMENT_DIMENSIONS,
  deriveAssessmentFindings,
} from "./assess";
import { canTransition, deriveRecommendations } from "./recommend";
import type { MarketingContext } from "../marketing-context";

const FULL: MarketingContext = {
  productOverview: {
    oneLiner: "Acme sells mugs.",
    whatItDoes: "Keeps drinks warm.",
    category: "Drinkware",
    productType: "E-commerce",
    businessModel: "DTC.",
  },
  targetAudience: {
    targetCompanies: "Coffee shops.",
    decisionMakers: "Owners.",
    primaryUseCase: "Serve signature drinks.",
  },
  personas: { stakeholders: "Owner, barista." },
  problems: {
    coreProblem: "Cold coffee.",
    alternativesFallShort: "Thin mugs.",
    cost: "Refills.",
    emotionalTension: "Disappointment.",
  },
  competition: { direct: "Big Mug Co.", secondary: "Paper cups." },
  differentiation: {
    differentiators: "Double-wall.",
    approach: "Kiln-fired.",
    benefits: "Fewer refills.",
    whyChoose: "Chip-free guarantee.",
  },
  objections: { topObjections: "Price.", antiPersona: "Tea only." },
  switching: { push: "Breakage.", pull: "Guarantee.", habit: "Cheap mugs.", anxiety: "Price." },
  customerLanguage: {
    problemLanguage: "Goes cold.",
    solutionLanguage: "Stays warm.",
    wordsToUse: "Warm, sturdy.",
  },
  brandVoice: { tone: "Warm.", style: "Direct.", personality: "Friendly." },
  proofPoints: { evidence: "4.9 stars." },
  goals: { businessGoal: "Grow revenue.", conversionAction: "Buy online." },
};

const CONFIRMED = Object.fromEntries(
  Object.entries({
    "productOverview.oneLiner": 1,
    "productOverview.whatItDoes": 1,
    "productOverview.category": 1,
  }).map(([key]) => [
    key,
    { status: "USER_CONFIRMED", source: "user", sourceType: "user_input", updatedAt: new Date().toISOString() },
  ]),
);

const BASE = {
  context: FULL,
  provenance: {},
  website: null,
  imageAssetCount: 0,
  documentCount: 0,
  organizationCategoryTitle: null,
  selectedChannels: [],
  connectedProviders: [],
};

describe("assessBrand", () => {
  it("covers all twelve dimensions deterministically", () => {
    const first = assessBrand({ ...BASE, provenance: CONFIRMED });
    const second = assessBrand({ ...BASE, provenance: CONFIRMED });
    expect(first.map((entry) => entry.dimension)).toEqual([...ASSESSMENT_DIMENSIONS]);
    expect(first).toEqual(second);
  });

  it("marks complete only with full high-tier evidence", () => {
    expect(
      assessBrand({ ...BASE, provenance: CONFIRMED }).find(
        (entry) => entry.dimension === "identity",
      )?.status,
    ).toBe("complete");
  });

  it("treats legacy rows without provenance as medium, not high", () => {
    const [identity] = assessBrand(BASE).filter((entry) => entry.dimension === "identity");
    expect(identity?.confidence).toBe("medium");
    expect(identity?.status).toBe("low_confidence");
  });

  it("downgrades stale evidence and flags category conflict", () => {
    const stale = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const [identity] = assessBrand({
      ...BASE,
      organizationCategoryTitle: "Software",
      provenance: {
        "productOverview.oneLiner": { status: "USER_CONFIRMED", source: "u", sourceType: "user_input", updatedAt: stale },
        "productOverview.category": { status: "USER_CONFIRMED", source: "u", sourceType: "user_input", updatedAt: stale },
        "productOverview.whatItDoes": { status: "USER_CONFIRMED", source: "u", sourceType: "user_input", updatedAt: stale },
      },
    }).filter((entry) => entry.dimension === "identity");
    expect(identity?.confidence).toBe("low");
    expect(identity?.gaps.some((gap) => gap.includes("Reconcile"))).toBe(true);
  });

  it("keeps completeness and confidence separate", () => {
    // A nearly-full Brain with no provenance and no channels: highly
    // complete, yet low overall confidence driven by the empty
    // marketing-presence dimension — the metrics never collapse into one.
    const { completeness, confidence } = assessmentOverall(
      assessBrand({
        ...BASE,
        imageAssetCount: 2,
        website: {
          title: "Acme",
          description: "Mugs.",
          platform: "shopify",
          hasAnalysis: true,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    expect(completeness).toBeGreaterThan(80);
    expect(confidence).toBe("low");
  });

  it("computes overall numbers without blending them", () => {
    const dimensions = assessBrand(BASE);
    const overall = assessmentOverall(dimensions);
    expect(overall.completeness).toBeGreaterThanOrEqual(0);
    expect(["high", "medium", "low"]).toContain(overall.confidence);
    expect(assessmentOverall([])).toEqual({ completeness: 0, confidence: "low" });
  });
});

describe("deriveRecommendations", () => {
  const assessment = assessBrand(BASE);

  it("turns each weak dimension into one stable, deduped draft", () => {
    const drafts = deriveRecommendations({
      assessment,
      selectedChannels: [],
      connectedProviders: [],
    });
    const keys = drafts.map((entry) => entry.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(drafts.every((entry) => entry.dedupeKey.startsWith("assessment:"))).toBe(true);
    expect(drafts.every((entry) => ["high", "medium", "low"].includes(entry.priority))).toBe(
      true,
    );
    // Same input twice → same output (deterministic).
    expect(deriveRecommendations({ assessment, selectedChannels: [], connectedProviders: [] })).toEqual(drafts);
  });

  it("skips complete dimensions and wires connect workflows to real gaps", () => {
    const drafts = deriveRecommendations({
      assessment: assessBrand({ ...BASE, provenance: CONFIRMED }),
      selectedChannels: [{ channelId: "meta-ads", providers: ["meta-ads"] }],
      connectedProviders: [],
    });
    const connect = drafts.find((entry) => entry.workflow.kind === "connect-provider");
    expect(connect).toBeDefined();
    expect(connect?.priority).toBe("medium");
    if (connect?.workflow.kind === "connect-provider") {
      expect(connect.workflow.provider).toBe("meta-ads");
    }
  });

  it("caps output and guards status transitions", () => {
    expect(
      deriveRecommendations({ assessment, selectedChannels: [], connectedProviders: [] }).length,
    ).toBeLessThanOrEqual(12);
    expect(canTransition("NEW", "ACCEPTED")).toBe(true);
    expect(canTransition("NEW", "COMPLETED")).toBe(false);
    expect(canTransition("COMPLETED", "ACCEPTED")).toBe(false);
    expect(canTransition("DEFERRED", "ACCEPTED")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("enriches SEO recommendations and findings with concrete website signals", () => {
    const website = {
      url: "https://acme.com",
      title: "Acme",
      description: null,
      platform: "shopify",
      hasAnalysis: true,
      updatedAt: new Date().toISOString(),
      seoOpportunities: ["Add a meta description summarizing your offer.", "Add JSON-LD structured data."],
      missingInfo: ["Pricing details not found on homepage."],
    };
    const input = {
      ...BASE,
      organizationCategoryTitle: "Software",
      website,
    };
    const dimensions = assessBrand(input);
    const findings = deriveAssessmentFindings(input, dimensions);
    expect(findings.some((f) => f.severity === "conflict")).toBe(true);
    expect(findings.some((f) => f.findingKey.startsWith("website:missing:"))).toBe(true);

    const drafts = deriveRecommendations({
      assessment: dimensions,
      selectedChannels: [],
      connectedProviders: [],
      website,
    });
    const seoRec = drafts.find((d) => d.dedupeKey === "assessment:seo");
    expect(seoRec?.solution).toContain("Add a meta description");
    expect(seoRec?.evidence.some((e) => e.includes("JSON-LD"))).toBe(true);
  });
});
