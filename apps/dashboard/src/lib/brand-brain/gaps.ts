import {
  CONTEXT_SECTIONS,
  type MarketingContext,
} from "../marketing-context";

/**
 * Information-gap detection (Milestone 3, spec §8). Pure and client-safe:
 * required-but-empty v1 fields become gaps with a reason each; existing
 * NEEDS_REVIEW proposals attach as evidence-backed suggestions.
 */

export type GapSuggestion = {
  value: string;
  source: string;
};

export type BrainGap = {
  section: string;
  sectionTitle: string;
  field: string;
  label: string;
  why: string;
  suggestion: GapSuggestion | null;
};

export type GapProposal = {
  section: string;
  field: string;
  value: string;
  source: string;
};

const WHY: Record<string, string> = {
  "productOverview.oneLiner": "Every strategy, campaign, and post opens from this one line.",
  "productOverview.whatItDoes": "AI outputs describe your product from this — vague here means vague everywhere.",
  "productOverview.category": "Category drives channel picks, keyword angles, and competitor framing.",
  "productOverview.productType": "Business-type language powers SEO titles and ad angles.",
  "productOverview.businessModel": "Pricing and buying model shape offers, budgets, and calls to action.",
  "targetAudience.targetCompanies": "Campaign targeting and audience suggestions are built from this.",
  "targetAudience.decisionMakers": "Messaging and ad angles address these roles directly.",
  "targetAudience.primaryUseCase": "Use cases anchor product stories and landing angles.",
  "personas.stakeholders": "Multi-stakeholder deals need every voice mapped.",
  "personas.stakeholders": "Multi-stakeholder deals stall when a voice is unmapped.",
  "problems.coreProblem": "Pain-led copy outperforms feature lists — this is the fuel.",
  "problems.alternativesFallShort": "Differentiation angles come from where alternatives fail.",
  "problems.cost": "Cost-of-problem numbers power urgency and ROI claims.",
  "problems.emotionalTension": "Emotional resonance starts here.",
  "competition.direct": "You cannot position without named competitors.",
  "differentiation.differentiators": "The single most reused input for headlines and angles.",
  "differentiation.approach": "Method stories differentiate when features look alike.",
  "differentiation.benefits": "Benefits translate capabilities into outcomes buyers pay for.",
  "differentiation.whyChoose": "The clearest buying reason, reused across surfaces.",
  "objections.topObjections": "Objection handling lifts conversion on pages and in sales copy.",
  "objections.antiPersona": "Knowing who to repel sharpens targeting and saves spend.",
  "switching.push": "Push frustrations write high-converting switch messaging.",
  "switching.pull": "Pull forces name your magnetic advantages.",
  "switching.habit": "Habit blockers must be answered before buyers move.",
  "switching.anxiety": "Unanswered switching anxiety kills checkout and signup.",
  "customerLanguage.problemLanguage": "Verbatim customer words beat internal jargon in copy.",
  "customerLanguage.solutionLanguage": "How buyers describe you is how prospects recognize you.",
  "customerLanguage.wordsToUse": "Preferred vocabulary keeps every output on-brand.",
  "brandVoice.tone": "Tone is applied to every generated word.",
  "brandVoice.style": "Style rules keep outputs recognizable as you.",
  "brandVoice.personality": "Personality adjectives steer voice when rules run out.",
  "proofPoints.evidence": "Cited proof is the difference between claims and credibility.",
  "goals.businessGoal": "Every recommendation is ranked against this goal.",
  "goals.conversionAction": "Calls to action and campaign objectives derive from this.",
};

const DEFAULT_WHY = "Required for grounded outputs in this area.";

export type SectionCompleteness = {
  id: string;
  title: string;
  requiredTotal: number;
  requiredFilled: number;
  percent: number;
};

export function detectGaps(input: {
  context: MarketingContext;
  proposals: GapProposal[];
}): {
  gaps: BrainGap[];
  completeness: { sections: SectionCompleteness[]; overall: number; pendingReviews: number };
} {
  const gaps: BrainGap[] = [];
  const sections: SectionCompleteness[] = [];
  let totalRequired = 0;
  let totalFilled = 0;

  for (const section of CONTEXT_SECTIONS) {
    const values = input.context[section.id];
    if (values?._notApplicable === "true") {
      sections.push({
        id: section.id,
        title: section.title,
        requiredTotal: 0,
        requiredFilled: 0,
        percent: 100,
      });
      continue;
    }
    let requiredTotal = 0;
    let requiredFilled = 0;
    for (const field of section.fields) {
      if (!field.required) continue;
      requiredTotal += 1;
      totalRequired += 1;
      const value = values?.[field.id]?.trim() ?? "";
      if (value) {
        requiredFilled += 1;
        totalFilled += 1;
        continue;
      }
      const suggestion = input.proposals.find(
        (proposal) => proposal.section === section.id && proposal.field === field.id,
      );
      gaps.push({
        section: section.id,
        sectionTitle: section.title,
        field: field.id,
        label: field.label,
        why: WHY[`${section.id}.${field.id}`] ?? DEFAULT_WHY,
        suggestion: suggestion
          ? { value: suggestion.value, source: suggestion.source }
          : null,
      });
    }
    sections.push({
      id: section.id,
      title: section.title,
      requiredTotal,
      requiredFilled,
      percent: requiredTotal ? Math.round((requiredFilled / requiredTotal) * 100) : 100,
    });
  }

  return {
    gaps,
    completeness: {
      sections,
      overall: totalRequired ? Math.round((totalFilled / totalRequired) * 100) : 100,
      pendingReviews: input.proposals.length,
    },
  };
}
