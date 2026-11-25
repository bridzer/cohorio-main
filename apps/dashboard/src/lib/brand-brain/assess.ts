import type { MarketingContext } from "../marketing-context";

/**
 * Brand assessment engine (Milestone 1). Deterministic and documented:
 *
 * COMPLETENESS (0-100) = required evidence items present / required total.
 *   Never mixed with the scores below.
 * CONFIDENCE (high/medium/low) = highest evidence tier present, downgraded
 *   one level for staleness (>90 days) and one for conflict. Never averaged
 *   into a single blended score.
 * VERIFICATION is tracked separately in brand_brain_provenance statuses and
 *   is referenced here, never duplicated.
 *
 * Evidence tiers: USER_CONFIRMED/VERIFIED fields = high; website, documents,
 * integrations, onboarding answers = medium; AI_INFERRED/NEEDS_REVIEW or
 * unknown provenance = low; legacy rows without provenance = medium
 * (unverified, assumed user-entered).
 */

export const ASSESSMENT_DIMENSIONS = [
  "identity",
  "business-model",
  "product-clarity",
  "audience",
  "value-prop",
  "positioning",
  "voice",
  "visual-identity",
  "market",
  "differentiation",
  "marketing-presence",
  "seo",
] as const;

export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<AssessmentDimension, string> = {
  identity: "Business identity",
  "business-model": "Business model",
  "product-clarity": "Product & service clarity",
  audience: "Target audience",
  "value-prop": "Value proposition",
  positioning: "Brand positioning",
  voice: "Brand voice",
  "visual-identity": "Visual identity",
  market: "Market understanding",
  differentiation: "Competitor differentiation",
  "marketing-presence": "Marketing presence",
  seo: "SEO readiness",
};

export type DimensionStatus = "complete" | "needs_input" | "low_confidence";
export type Confidence = "high" | "medium" | "low";

export type AssessmentEvidence = {
  label: string;
  source: string;
  tier: Exclude<Confidence, never> | "none";
  stale: boolean;
};

export type DimensionAssessment = {
  dimension: AssessmentDimension;
  label: string;
  status: DimensionStatus;
  confidence: Confidence;
  completeness: number;
  evidence: AssessmentEvidence[];
  source: string;
  explanation: string;
  gaps: string[];
  nextAction: string;
};

export type AssessmentFindingSeverity = "info" | "warning" | "gap" | "conflict";

export type AssessmentFindingDraft = {
  dimension: AssessmentDimension;
  findingKey: string;
  severity: AssessmentFindingSeverity;
  title: string;
  detail: string;
  evidence: string[];
  source: string;
  confidence: Confidence;
};

export type ProvenanceLite = {
  status: string;
  source: string;
  sourceType: string;
  updatedAt: string | null;
};

export type WebsiteAssessmentSnapshot = {
  url?: string | null;
  title: string | null;
  description: string | null;
  platform: string | null;
  hasAnalysis: boolean;
  updatedAt: string | null;
  industry?: string | null;
  inferredBusinessModel?: string | null;
  productsServices?: string[];
  messaging?: string[];
  targetAudiences?: string[];
  positioning?: string | null;
  voiceCharacteristics?: string[];
  marketingChannels?: string[];
  seoOpportunities?: string[];
  competitors?: string[];
  missingInfo?: string[];
};

export type AssessmentInput = {
  context: MarketingContext;
  provenance: Record<string, ProvenanceLite>;
  website: WebsiteAssessmentSnapshot | null;
  imageAssetCount: number;
  documentCount: number;
  organizationCategoryTitle: string | null;
  selectedChannels: string[];
  connectedProviders: string[];
};

const STALE_DAYS = 90;

function isStale(updatedAt: string | null | undefined) {
  if (!updatedAt) return false;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return Number.isFinite(ageMs) && ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

const TIER_RANK: Record<Confidence | "none", number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

const RANK_TIER: Record<number, Confidence> = { 3: "high", 2: "medium", 1: "low", 0: "low" };

function fieldValue(context: MarketingContext, section: string, field: string) {
  const values = context[section as keyof MarketingContext] as
    | Record<string, unknown>
    | undefined;
  const value = values?.[field];
  return typeof value === "string" ? value.trim() : "";
}

function fieldEvidence(
  input: AssessmentInput,
  section: string,
  field: string,
  label: string,
): AssessmentEvidence | null {
  const value = fieldValue(input.context, section, field);
  if (!value) return null;
  const prov = input.provenance[`${section}.${field}`];
  let tier: Confidence = "medium";
  let source = "Brand Brain (legacy entry)";
  if (prov) {
    if (prov.status === "USER_CONFIRMED" || prov.status === "VERIFIED") tier = "high";
    else tier = "low";
    source = prov.source || "Brand Brain";
  }
  const stale = isStale(prov?.updatedAt ?? null);
  return { label, source, tier, stale };
}

function websiteEvidence(
  input: AssessmentInput,
  label: string,
  present: boolean,
): AssessmentEvidence | null {
  if (!present || !input.website) return null;
  return {
    label,
    source: "Website analysis",
    tier: "medium",
    stale: isStale(input.website.updatedAt),
  };
}

function assessDimension(
  dimension: AssessmentDimension,
  items: (AssessmentEvidence | null)[],
  total: number,
  nextAction: { needsInput: string; lowConfidence: string },
  extra?: {
    conflicted?: boolean;
    conflictNote?: string;
    /** Supporting evidence: lifts confidence, never gates completeness. */
    bonus?: (AssessmentEvidence | null)[];
    gaps?: string[];
  },
): DimensionAssessment {
  const required = items.filter(
    (item): item is AssessmentEvidence => item !== null,
  );
  const bonus = (extra?.bonus ?? []).filter(
    (item): item is AssessmentEvidence => item !== null,
  );
  const evidence = [...required, ...bonus];
  const completeness =
    total === 0 ? 100 : Math.round((required.length / total) * 100);
  let rank = Math.max(0, ...evidence.map((item) => TIER_RANK[item.tier]));
  const stale = evidence.some((item) => item.stale);
  if (stale && rank > 0) rank -= 1;
  if (extra?.conflicted && rank > 0) rank -= 1;
  const confidence = RANK_TIER[Math.max(rank, evidence.length ? 1 : 0) as 0 | 1 | 2 | 3];
  const status: DimensionStatus =
    completeness < 100 ? "needs_input" : confidence === "high" ? "complete" : "low_confidence";
  const top = [...evidence].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])[0];
  const sources = [...new Set(evidence.map((item) => item.source))];
  const explanation =
    `${required.length} of ${total} required items present` +
    (bonus.length ? `, plus ${bonus.length} supporting item(s)` : "") +
    (top ? `; strongest evidence: ${top.label} (${top.source}, ${top.tier} confidence)` : "") +
    (stale ? "; some evidence is older than 90 days" : "") +
    (extra?.conflicted && extra.conflictNote ? `; ${extra.conflictNote}` : "") +
    ".";
  return {
    dimension,
    label: DIMENSION_LABELS[dimension],
    status,
    confidence,
    completeness,
    evidence,
    source: sources.slice(0, 3).join(", ") || "none yet",
    explanation,
    gaps: [...(extra?.gaps ?? [])],
    nextAction: status === "complete" ? "" : status === "needs_input" ? nextAction.needsInput : nextAction.lowConfidence,
  };
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 3);
}

/**
 * Runs all twelve dimensions. Pure and deterministic: same inputs always
 * produce the same assessment — confidence is computed, never invented.
 */
export function assessBrand(input: AssessmentInput): DimensionAssessment[] {
  const f = (section: string, field: string, label: string) =>
    fieldEvidence(input, section, field, label);
  const categoryTitle = (input.organizationCategoryTitle ?? "").trim();
  const contextCategory = fieldValue(input.context, "productOverview", "category");
  const categoryConflict =
    Boolean(categoryTitle) &&
    Boolean(contextCategory) &&
    !tokens(categoryTitle).some((part) => tokens(contextCategory).includes(part)) &&
    !tokens(contextCategory).some((part) => tokens(categoryTitle).includes(part));

  const out: DimensionAssessment[] = [];

  const identity = assessDimension(
    "identity",
    [
      f("productOverview", "oneLiner", "One-line description"),
      f("productOverview", "category", "Product category"),
    ],
    2,
    {
      needsInput: "Add the missing identity fields in Brand Brain.",
      lowConfidence: "Confirm the identity fields so they count as verified.",
    },
    {
      bonus: [
        websiteEvidence(input, "Website title", Boolean(input.website?.title)),
        websiteEvidence(
          input,
          `Detected industry: ${input.website?.industry ?? ""}`,
          Boolean(input.website?.industry),
        ),
      ],
      ...(categoryConflict
        ? { conflicted: true, conflictNote: "onboarding category and Brain category disagree" }
        : {}),
    },
  );
  if (categoryConflict) {
    identity.gaps.push("Reconcile the onboarding category with the Brand Brain category.");
  }
  out.push(identity);

  out.push(
    assessDimension(
      "business-model",
      [
        f("productOverview", "businessModel", "Business model and pricing"),
        f("productOverview", "productType", "Product type"),
      ],
      2,
      {
        needsInput: "Record how customers buy and what plans cost.",
        lowConfidence: "Confirm the business model details.",
      },
      {
        bonus: [
          websiteEvidence(
            input,
            `Detected model: ${input.website?.inferredBusinessModel ?? input.website?.platform ?? ""}`,
            Boolean(input.website?.inferredBusinessModel || (input.website?.platform && input.website.platform !== "unknown")),
          ),
        ],
      },
    ),
  );

  out.push(
    assessDimension(
      "product-clarity",
      [f("productOverview", "whatItDoes", "What it does")],
      1,
      {
        needsInput: "Describe the product plainly, or upload a catalog.",
        lowConfidence: "Confirm the product description.",
      },
      {
        bonus: [
          input.documentCount > 0
            ? {
                label: `${input.documentCount} supporting document(s)`,
                source: "Brand assets",
                tier: "medium" as const,
                stale: false,
              }
            : null,
          websiteEvidence(
            input,
            `${input.website?.productsServices?.length ?? 0} product/service signal(s) on website`,
            Boolean(input.website?.productsServices?.length),
          ),
        ],
      },
    ),
  );

  out.push(
    assessDimension(
      "audience",
      [
        f("targetAudience", "targetCompanies", "Target companies"),
        f("targetAudience", "decisionMakers", "Decision-makers"),
        f("targetAudience", "primaryUseCase", "Primary use case"),
        f("personas", "stakeholders", "Stakeholder map"),
      ],
      4,
      {
        needsInput: "Define who buys, who decides, and the core use case.",
        lowConfidence: "Confirm the audience profile with evidence.",
      },
      {
        bonus: [
          websiteEvidence(
            input,
            `Website audience signals (${input.website?.targetAudiences?.length ?? 0})`,
            Boolean(input.website?.targetAudiences?.length),
          ),
        ],
      },
    ),
  );

  out.push(
    assessDimension(
      "value-prop",
      [
        f("differentiation", "whyChoose", "Why customers choose you"),
        f("differentiation", "benefits", "Why that is better"),
        f("differentiation", "differentiators", "Key differentiators"),
      ],
      3,
      {
        needsInput: "State the buying reason, benefits, and edge.",
        lowConfidence: "Confirm the value proposition against proof.",
      },
      {
        bonus: [
          websiteEvidence(
            input,
            `Website messaging (${input.website?.messaging?.length ?? 0} statement(s))`,
            Boolean(input.website?.messaging?.length),
          ),
        ],
      },
    ),
  );

  out.push(
    assessDimension(
      "positioning",
      [
        f("competition", "direct", "Direct competitors"),
        f("differentiation", "whyChoose", "Why customers choose you"),
      ],
      2,
      {
        needsInput: "Name direct competitors and the buying reason.",
        lowConfidence: "Confirm positioning against named competitors.",
      },
      {
        bonus: [
          websiteEvidence(
            input,
            "Website positioning statement",
            Boolean(input.website?.positioning),
          ),
        ],
      },
    ),
  );

  out.push(
    assessDimension(
      "voice",
      [
        f("brandVoice", "tone", "Tone"),
        f("brandVoice", "style", "Communication style"),
        f("brandVoice", "personality", "Brand personality"),
        f("customerLanguage", "wordsToUse", "Words to use"),
      ],
      4,
      {
        needsInput: "Set tone, style, personality, and preferred vocabulary.",
        lowConfidence: "Confirm voice with real examples.",
      },
      {
        bonus: [
          websiteEvidence(
            input,
            `Website voice traits (${input.website?.voiceCharacteristics?.length ?? 0})`,
            Boolean(input.website?.voiceCharacteristics?.length),
          ),
        ],
      },
    ),
  );

  out.push(
    assessDimension(
      "visual-identity",
      [
        input.imageAssetCount > 0
          ? {
              label: `${input.imageAssetCount} brand image(s) uploaded`,
              source: "Brand assets",
              tier: "medium" as const,
              stale: false,
            }
          : null,
      ],
      1,
      {
        needsInput: "Upload a logo or brand imagery in onboarding.",
        lowConfidence: "Confirm which image is the canonical logo.",
      },
    ),
  );

  out.push(
    assessDimension(
      "market",
      [
        f("competition", "direct", "Direct competitors"),
        f("competition", "secondary", "Secondary alternatives"),
      ],
      2,
      {
        needsInput: "List direct competitors and alternatives buyers consider.",
        lowConfidence: "Confirm the competitive set.",
      },
      {
        bonus: [
          websiteEvidence(
            input,
            `Competitors referenced (${input.website?.competitors?.length ?? 0})`,
            Boolean(input.website?.competitors?.length),
          ),
        ],
      },
    ),
  );

  out.push(
    assessDimension(
      "differentiation",
      [
        f("differentiation", "differentiators", "Key differentiators"),
        f("differentiation", "approach", "How you solve it differently"),
        f("differentiation", "benefits", "Why that is better"),
        f("differentiation", "whyChoose", "Why customers choose you"),
      ],
      4,
      {
        needsInput: "Connect capabilities to customer benefits.",
        lowConfidence: "Confirm differentiation with proof.",
      },
    ),
  );

  const connectedCount = new Set(input.connectedProviders).size;
  out.push(
    assessDimension(
      "marketing-presence",
      [
        ...(input.selectedChannels.length
          ? [
              {
                label: `${input.selectedChannels.length} channel(s) selected`,
                source: "Onboarding",
                tier: "high" as const,
                stale: false,
              },
            ]
          : []),
        ...(connectedCount > 0
          ? [
              {
                label: `${connectedCount} integration(s) connected`,
                source: "Integrations",
                tier: "high" as const,
                stale: false,
              },
            ]
          : []),
      ],
      2,
      {
        needsInput: "Pick marketing channels and connect at least one tool.",
        lowConfidence: "Confirm the channel mix still holds.",
      },
      {
        bonus: [
          websiteEvidence(
            input,
            `Website marketing signals (${input.website?.marketingChannels?.length ?? 0})`,
            Boolean(input.website?.marketingChannels?.length),
          ),
        ],
      },
    ),
  );

  const seoOpportunities = input.website?.seoOpportunities ?? [];
  out.push(
    assessDimension(
      "seo",
      [
        websiteEvidence(input, "Website analyzed", Boolean(input.website)),
        websiteEvidence(input, "Meta description present", Boolean(input.website?.description)),
      ],
      2,
      {
        needsInput: "Import the website so SEO readiness can be judged.",
        lowConfidence: "Re-analyze the site or address on-page SEO opportunities.",
      },
      {
        gaps: seoOpportunities.slice(0, 4),
      },
    ),
  );

  return out;
}

/**
 * Produces structured findings per dimension for auditability and downstream
 * recommendations (Milestone 1).
 */
export function deriveAssessmentFindings(
  input: AssessmentInput,
  assessments: DimensionAssessment[],
): AssessmentFindingDraft[] {
  const findings: AssessmentFindingDraft[] = [];
  for (const dim of assessments) {
    if (dim.gaps.length) {
      for (let i = 0; i < dim.gaps.length; i += 1) {
        const gap = dim.gaps[i]!;
        const isConflict = gap.toLowerCase().includes("reconcile") || gap.toLowerCase().includes("conflict");
        findings.push({
          dimension: dim.dimension,
          findingKey: `${dim.dimension}:gap:${i}`,
          severity: isConflict ? "conflict" : "warning",
          title: isConflict ? "Conflicting brand signal detected" : `${dim.label} finding`,
          detail: gap,
          evidence: dim.evidence.map((item) => `${item.label} (${item.source})`),
          source: dim.source,
          confidence: dim.confidence,
        });
      }
    }
    if (dim.status === "needs_input") {
      findings.push({
        dimension: dim.dimension,
        findingKey: `${dim.dimension}:incomplete`,
        severity: "gap",
        title: `${dim.label} is ${dim.completeness}% complete`,
        detail: dim.nextAction || dim.explanation,
        evidence: dim.evidence.map((item) => `${item.label} (${item.source})`),
        source: dim.source,
        confidence: dim.confidence,
      });
    } else if (dim.status === "low_confidence") {
      findings.push({
        dimension: dim.dimension,
        findingKey: `${dim.dimension}:low-confidence`,
        severity: "warning",
        title: `${dim.label} needs verification`,
        detail: dim.explanation,
        evidence: dim.evidence.map((item) => `${item.label} (${item.source})`),
        source: dim.source,
        confidence: dim.confidence,
      });
    } else {
      findings.push({
        dimension: dim.dimension,
        findingKey: `${dim.dimension}:verified`,
        severity: "info",
        title: `${dim.label} is verified`,
        detail: dim.explanation,
        evidence: dim.evidence.map((item) => `${item.label} (${item.source})`),
        source: dim.source,
        confidence: dim.confidence,
      });
    }
  }
  for (let i = 0; i < (input.website?.missingInfo?.length ?? 0); i += 1) {
    const missing = input.website!.missingInfo![i]!;
    findings.push({
      dimension: "product-clarity",
      findingKey: `website:missing:${i}`,
      severity: "gap",
      title: "Website discovery gap",
      detail: missing,
      evidence: input.website?.url ? [`Website crawl (${input.website.url})`] : [],
      source: "Website analysis",
      confidence: "medium",
    });
  }
  return findings;
}

/** Overall numbers kept separate per the spec: completeness and confidence. */
export function assessmentOverall(dimensions: DimensionAssessment[]) {
  if (!dimensions.length) return { completeness: 0, confidence: "low" as Confidence };
  const completeness = Math.round(
    dimensions.reduce((total, dimension) => total + dimension.completeness, 0) /
      dimensions.length,
  );
  const worst = Math.min(...dimensions.map((dimension) => TIER_RANK[dimension.confidence]));
  return { completeness, confidence: RANK_TIER[worst as 1 | 2 | 3] };
}
