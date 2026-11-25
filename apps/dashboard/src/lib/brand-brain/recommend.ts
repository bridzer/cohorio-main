import type { DimensionAssessment, WebsiteAssessmentSnapshot } from "./assess";

/**
 * Weakness → structured recommendation mapping (Milestone 1). Deterministic:
 * the same assessment always yields the same recommendations with stable
 * dedupe keys, so re-runs never duplicate an unresolved issue.
 */

export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationEffort = "S" | "M" | "L";
export type RecommendationStatus =
  | "NEW"
  | "REVIEW_REQUIRED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DISMISSED"
  | "DEFERRED";

export type RecommendationWorkflow =
  | { kind: "answer-fields"; section: string; fields: string[] }
  | { kind: "upload-assets" }
  | { kind: "run-analysis" }
  | { kind: "connect-provider"; provider: string }
  | { kind: "open-review" };

export type RecommendationDraft = {
  dedupeKey: string;
  section: string | null;
  title: string;
  description: string;
  evidence: string[];
  why: string;
  solution: string;
  outcome: string;
  priority: RecommendationPriority;
  confidence: "high" | "medium" | "low";
  effort: RecommendationEffort;
  workflow: RecommendationWorkflow;
};

type Rule = {
  dimension: string;
  title: string;
  description: string;
  why: string;
  solution: string;
  outcome: string;
  priority: RecommendationPriority;
  effort: RecommendationEffort;
  workflow: RecommendationWorkflow;
};

const RULES: Rule[] = [
  {
    dimension: "value-prop",
    title: "Sharpen the why-choose-you story",
    description: "The value proposition is missing or unverified.",
    why: "Every headline, ad, and pitch draws from this story.",
    solution: "Answer the differentiation questions, then confirm them in review.",
    outcome: "A verified buying reason reused across surfaces.",
    priority: "high",
    effort: "S",
    workflow: { kind: "answer-fields", section: "differentiation", fields: ["whyChoose", "benefits", "differentiators"] },
  },
  {
    dimension: "audience",
    title: "Define the buying audience",
    description: "Target companies, decision-makers, or the primary use case is missing.",
    why: "Targeting and messaging cannot work without a defined audience.",
    solution: "Complete the audience profile from known customers.",
    outcome: "Campaigns and copy aimed at real buyers.",
    priority: "high",
    effort: "S",
    workflow: { kind: "answer-fields", section: "targetAudience", fields: ["targetCompanies", "decisionMakers", "primaryUseCase"] },
  },
  {
    dimension: "business-model",
    title: "Record how the business earns",
    description: "Pricing and buying model are unclear.",
    why: "Offers, budgets, and calls to action depend on the model.",
    solution: "Record plan structure and how customers buy.",
    outcome: "Monetization the whole workspace can reference.",
    priority: "high",
    effort: "S",
    workflow: { kind: "answer-fields", section: "productOverview", fields: ["businessModel", "productType"] },
  },
  {
    dimension: "identity",
    title: "Lock the business identity",
    description: "The one-liner or category is missing or conflicts with onboarding.",
    why: "Strategy and positioning start from identity.",
    solution: "Confirm the one-liner and category, resolving any conflict.",
    outcome: "One agreed identity everywhere.",
    priority: "high",
    effort: "S",
    workflow: { kind: "answer-fields", section: "productOverview", fields: ["oneLiner", "category"] },
  },
  {
    dimension: "positioning",
    title: "Name competitors and the edge",
    description: "Positioning lacks named competitors or a buying reason.",
    why: "You cannot position against an unnamed alternative.",
    solution: "List direct competitors and the reason to choose you.",
    outcome: "A defensible competitive stance.",
    priority: "medium",
    effort: "S",
    workflow: { kind: "answer-fields", section: "competition", fields: ["direct"] },
  },
  {
    dimension: "differentiation",
    title: "Connect capabilities to benefits",
    description: "Differentiators read as features without customer outcomes.",
    why: "Buyers pay for outcomes, not capability lists.",
    solution: "Attach a customer benefit to each differentiator.",
    outcome: "Proof-backed differentiation for copy and sales.",
    priority: "medium",
    effort: "S",
    workflow: { kind: "answer-fields", section: "differentiation", fields: ["benefits", "approach"] },
  },
  {
    dimension: "voice",
    title: "Set the brand voice",
    description: "Tone, style, or vocabulary is missing.",
    why: "Ungoverned voice drifts with every generation.",
    solution: "Set tone, style, personality, and words to use.",
    outcome: "Recognizably-yours output by default.",
    priority: "medium",
    effort: "S",
    workflow: { kind: "answer-fields", section: "brandVoice", fields: ["tone", "style", "personality"] },
  },
  {
    dimension: "market",
    title: "Map the competitive set",
    description: "Direct competitors or alternatives are missing.",
    why: "Market moves are invisible without a map.",
    solution: "Record direct competitors and the alternatives buyers weigh.",
    outcome: "A living competitive map.",
    priority: "medium",
    effort: "M",
    workflow: { kind: "answer-fields", section: "competition", fields: ["direct", "secondary"] },
  },
  {
    dimension: "product-clarity",
    title: "Clarify what you sell",
    description: "The product description is missing or only from thin sources.",
    why: "Vague products produce vague marketing.",
    solution: "Describe the product plainly or upload a catalog.",
    outcome: "A product story every surface can use.",
    priority: "medium",
    effort: "S",
    workflow: { kind: "answer-fields", section: "productOverview", fields: ["whatItDoes"] },
  },
  {
    dimension: "visual-identity",
    title: "Upload brand imagery",
    description: "No logo or brand imagery is on file.",
    why: "Campaigns and social need real visuals, not placeholders.",
    solution: "Upload a logo and one or two brand images in onboarding.",
    outcome: "Grounded visuals across creatives.",
    priority: "medium",
    effort: "S",
    workflow: { kind: "upload-assets" },
  },
  {
    dimension: "seo",
    title: "Establish SEO readiness",
    description: "No website analysis exists, or on-page SEO signals need attention.",
    why: "Organic presence compounds; guesses do not.",
    solution: "Import the website and resolve the detected on-page SEO gaps.",
    outcome: "A measured SEO baseline with next actions.",
    priority: "medium",
    effort: "M",
    workflow: { kind: "run-analysis" },
  },
  {
    dimension: "marketing-presence",
    title: "Connect the first channel",
    description: "Channels are picked but nothing is connected yet.",
    why: "Insights and publishing need live connections.",
    solution: "Connect at least one selected channel.",
    outcome: "Real data flowing into the workspace.",
    priority: "medium",
    effort: "M",
    workflow: { kind: "connect-provider", provider: "" },
  },
];

const MAX_RECOMMENDATIONS = 12;

function enrichRuleDetails(
  dimension: DimensionAssessment,
  rule: Rule,
  website?: WebsiteAssessmentSnapshot | null,
) {
  let description = rule.description;
  let solution = `${rule.solution} Next: ${dimension.nextAction}`;
  const evidence = dimension.evidence.map((item) => `${item.label} (${item.source}, ${item.tier})`);

  if (dimension.gaps.length) {
    description = `${rule.description} Observed: ${dimension.gaps.slice(0, 2).join(" ")}`;
  }

  if (dimension.dimension === "seo" && website?.seoOpportunities?.length) {
    solution = `Address detected SEO items: ${website.seoOpportunities.slice(0, 3).join(" ")}`;
    evidence.push(...website.seoOpportunities.slice(0, 3));
  } else if (
    dimension.dimension === "business-model" &&
    website?.inferredBusinessModel
  ) {
    solution = `Website suggests "${website.inferredBusinessModel}". Confirm pricing and buying flow in Brand Brain.`;
  } else if (
    dimension.dimension === "product-clarity" &&
    website?.productsServices?.length
  ) {
    solution = `Confirm or refine the ${website.productsServices.length} product/service signal(s) discovered on your website (${website.productsServices.slice(0, 3).join(", ")}).`;
  } else if (
    dimension.dimension === "positioning" &&
    website?.positioning
  ) {
    solution = `Website implies: "${website.positioning}". Pair this with named competitors in Brand Brain.`;
  }

  return { description, solution, evidence };
}

/**
 * Derives stable, deduped recommendations from a fresh assessment.
 * Weak dimensions (needs_input, low_confidence) each yield at most one row;
 * providers fill connect-workflows from actually selected paid channels.
 */
export function deriveRecommendations(input: {
  assessment: DimensionAssessment[];
  selectedChannels: { channelId: string; providers: string[] }[];
  connectedProviders: string[];
  website?: WebsiteAssessmentSnapshot | null;
}): RecommendationDraft[] {
  const drafts: RecommendationDraft[] = [];
  const connected = new Set(input.connectedProviders);

  for (const dimension of input.assessment) {
    if (dimension.status === "complete") continue;
    const rule = RULES.find((entry) => entry.dimension === dimension.dimension);
    if (!rule) continue;
    const workflow = { ...rule.workflow } as RecommendationDraft["workflow"];
    if (workflow.kind === "connect-provider") {
      const candidate = input.selectedChannels.find((entry) =>
        entry.providers.some((provider) => !connected.has(provider)),
      );
      const provider = candidate?.providers.find((entry) => !connected.has(entry));
      if (!provider) continue;
      (workflow as { kind: "connect-provider"; provider: string }).provider = provider;
    }
    const { description, solution, evidence } = enrichRuleDetails(
      dimension,
      rule,
      input.website,
    );
    drafts.push({
      dedupeKey: `assessment:${dimension.dimension}`,
      section: workflow.kind === "answer-fields" ? workflow.section : null,
      title: rule.title,
      description,
      evidence,
      why: rule.why,
      solution,
      outcome: rule.outcome,
      priority: dimension.confidence === "low" && rule.priority === "high" ? "high" : rule.priority,
      confidence: dimension.confidence,
      effort: rule.effort,
      workflow,
    });
    if (drafts.length >= MAX_RECOMMENDATIONS) break;
  }
  return drafts;
}

const TERMINAL: RecommendationStatus[] = ["COMPLETED", "DISMISSED"];

export const TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  NEW: ["REVIEW_REQUIRED", "ACCEPTED", "DISMISSED", "DEFERRED"],
  REVIEW_REQUIRED: ["ACCEPTED", "DISMISSED", "DEFERRED"],
  ACCEPTED: ["IN_PROGRESS", "COMPLETED", "DISMISSED", "DEFERRED"],
  IN_PROGRESS: ["COMPLETED", "DISMISSED", "DEFERRED"],
  COMPLETED: [],
  DISMISSED: [],
  DEFERRED: ["ACCEPTED", "IN_PROGRESS", "DISMISSED"],
};

/** Guard for status changes; terminal states never move. */
export function canTransition(from: RecommendationStatus, to: RecommendationStatus) {
  if (TERMINAL.includes(from)) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}
