import {
  CONTEXT_SECTIONS,
  type MarketingContext,
} from "../marketing-context";

/**
 * Evidence-grounded synthesis proposals (Milestone 3). Deterministic and
 * conservative: only empty target fields, only traceable sources, everything
 * emitted as NEEDS_REVIEW for a human to approve. Anything that would require
 * guessing (business name placement, audience inference, competitor names) is
 * deliberately NOT proposed here — external research stays a later milestone
 * with explicit provider consent.
 */

export type SynthesisProposal = {
  section: string;
  field: string;
  value: string;
  source: string;
  sourceType: "website" | "user_input" | "system";
  confidence: "high" | "medium" | "low";
};

export type SynthesisInput = {
  organizationCategoryTitle?: string | null;
  analysis?: {
    description?: string | null;
    platform?: string | null;
    url?: string | null;
  } | null;
  context: MarketingContext;
};

function fieldEmpty(context: MarketingContext, section: string, field: string) {
  const values = context[section as keyof MarketingContext] as
    | Record<string, unknown>
    | undefined;
  const value = values?.[field];
  return typeof value !== "string" || !value.trim();
}

function knownField(section: string, field: string) {
  const definition = CONTEXT_SECTIONS.find((entry) => entry.id === section);
  return Boolean(definition?.fields.some((entry) => entry.id === field));
}

export function synthesizeProposals(input: SynthesisInput): SynthesisProposal[] {
  const proposals: SynthesisProposal[] = [];
  const consider = (proposal: SynthesisProposal) => {
    if (!knownField(proposal.section, proposal.field)) return;
    if (!fieldEmpty(input.context, proposal.section, proposal.field)) return;
    if (!proposal.value.trim()) return;
    proposals.push(proposal);
  };

  const category = input.organizationCategoryTitle?.trim();
  if (category) {
    consider({
      section: "productOverview",
      field: "category",
      value: category,
      source: "Onboarding",
      sourceType: "user_input",
      confidence: "high",
    });
  }

  const description = input.analysis?.description?.trim();
  if (description) {
    consider({
      section: "productOverview",
      field: "whatItDoes",
      value: description,
      source: "Website analysis",
      sourceType: "website",
      confidence: "medium",
    });
  }

  if (input.analysis?.platform === "shopify") {
    consider({
      section: "productOverview",
      field: "businessModel",
      value: "Direct-to-consumer e-commerce via a Shopify storefront.",
      source: "Website analysis",
      sourceType: "website",
      confidence: "medium",
    });
  }

  return proposals;
}
