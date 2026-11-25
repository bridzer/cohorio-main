import { describe, expect, it } from "vitest";
import { CONTEXT_SECTIONS } from "../marketing-context";
import { detectGaps } from "./gaps";
import { synthesizeProposals } from "./synthesize";

describe("detectGaps", () => {
  it("flags every required empty field with a reason", () => {
    const { gaps, completeness } = detectGaps({ context: {}, proposals: [] });
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(gap.label).toBeTruthy();
      expect(gap.why).toBeTruthy();
      expect(gap.suggestion).toBeNull();
    }
    expect(completeness.overall).toBe(0);
    expect(completeness.pendingReviews).toBe(0);
  });

  it("skips sections marked not applicable and filled fields", () => {
    const { gaps, completeness } = detectGaps({
      context: {
        productOverview: {
          oneLiner: "Acme sells mugs.",
          whatItDoes: "Keeps drinks warm.",
          category: "Drinkware",
          productType: "E-commerce",
          businessModel: "DTC.",
        },
        personas: { _notApplicable: "true" },
      },
      proposals: [],
    });
    expect(gaps.some((gap) => gap.section === "personas")).toBe(false);
    expect(gaps.some((gap) => gap.field === "oneLiner")).toBe(false);
    const product = completeness.sections.find((entry) => entry.id === "productOverview");
    expect(product?.percent).toBe(100);
  });

  it("attaches pending proposals as evidence-backed suggestions", () => {
    const { gaps, completeness } = detectGaps({
      context: {},
      proposals: [
        {
          section: "productOverview",
          field: "category",
          value: "Drinkware",
          source: "Onboarding",
        },
      ],
    });
    const match = gaps.find(
      (gap) => gap.section === "productOverview" && gap.field === "category",
    );
    expect(match?.suggestion).toEqual({ value: "Drinkware", source: "Onboarding" });
    expect(completeness.pendingReviews).toBe(1);
  });
});

describe("synthesizeProposals", () => {
  it("maps category, description, and platform onto empty fields only", () => {
    const proposals = synthesizeProposals({
      organizationCategoryTitle: "Drinkware",
      analysis: {
        description: "Handmade mugs.",
        platform: "shopify",
      },
      context: {},
    });
    expect(proposals).toContainEqual({
      section: "productOverview",
      field: "category",
      value: "Drinkware",
      source: "Onboarding",
      sourceType: "user_input",
      confidence: "high",
    });
    expect(
      proposals.find((proposal) => proposal.field === "whatItDoes")?.sourceType,
    ).toBe("website");
    expect(proposals.some((proposal) => proposal.field === "businessModel")).toBe(true);
  });

  it("never overwrites filled fields or invents unmapped ones", () => {
    const proposals = synthesizeProposals({
      organizationCategoryTitle: "Drinkware",
      analysis: { description: "Handmade mugs.", platform: "shopify" },
      context: {
        productOverview: {
          category: "Already set",
          whatItDoes: "Already set",
          businessModel: "Already set",
        },
      },
    });
    expect(proposals).toEqual([]);
  });

  it("only proposes real questionnaire fields", () => {
    const proposals = synthesizeProposals({
      organizationCategoryTitle: "X",
      analysis: { description: "Y", platform: "shopify" },
      context: {},
    });
    for (const proposal of proposals) {
      const section = CONTEXT_SECTIONS.find((entry) => entry.id === proposal.section);
      expect(section?.fields.some((field) => field.id === proposal.field)).toBe(true);
    }
  });
});
