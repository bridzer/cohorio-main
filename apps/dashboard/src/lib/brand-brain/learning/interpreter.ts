// Feedback Interpretation Engine (§4)
// Determines what each interaction actually means: category, nature, persistence,
// confidence, learning action, and whether it conflicts.

import { query } from "@/lib/database";
import { getMarketingContext } from "@/lib/marketing-context-repository";
import type {
  BrandLearningEvent,
  ChangeNature,
  FeedbackCategory,
  LearningAction,
  LearningInterpretation,
} from "./types";
import { confidenceLevelFromScore } from "./types";

type InterpretationRow = {
  id: string;
  event_id: string;
  workspace_id: string;
  organization_id: string;
  category: string;
  what_changed: string | null;
  what_was_suggested: string | null;
  what_preferred_instead: string | null;
  change_nature: string;
  is_persistent: boolean;
  is_task_specific: boolean;
  confidence: string;
  confidence_level: string;
  learning_action: string;
  reasoning: string | null;
  conflicts_with: Record<string, unknown> | null;
  created_at: Date | string;
};

function toPublic(row: InterpretationRow): LearningInterpretation {
  return {
    id: row.id,
    eventId: row.event_id,
    workspaceId: row.workspace_id,
    organizationId: row.organization_id,
    category: row.category as FeedbackCategory,
    whatChanged: row.what_changed,
    whatWasSuggested: row.what_was_suggested,
    whatPreferredInstead: row.what_preferred_instead,
    changeNature: row.change_nature as ChangeNature,
    isPersistent: row.is_persistent,
    isTaskSpecific: row.is_task_specific,
    confidence: Number(row.confidence),
    confidenceLevel: row.confidence_level as LearningInterpretation["confidenceLevel"],
    learningAction: row.learning_action as LearningAction,
    reasoning: row.reasoning,
    conflictsWith: row.conflicts_with,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ------------------------------------------------------------------
// Heuristics: classify an event (no LLM needed for deterministic path)
// ------------------------------------------------------------------

// sourceModule -> hint of the brand domain involved
function sourceHint(module: string): string {
  const m = module.toLowerCase();
  if (m.includes("marketing-context") || m.includes("brand-brain") || m.includes("brain"))
    return "brand_knowledge";
  if (m.includes("social") || m.includes("lifecycle") || m.includes("copilot") || m.includes("content"))
    return "content";
  if (m.includes("revops") || m.includes("launch") || m.includes("strategy")) return "strategy";
  if (m.includes("shopify") || m.includes("commerce") || m.includes("product")) return "product";
  return "general";
}

export function classifyCategory(event: BrandLearningEvent): FeedbackCategory {
  const t = event.eventType;
  const hint = sourceHint(event.sourceModule);
  const hasRating = event.feedback?.rating != null;
  const comment = (event.feedback?.comment ?? "").toLowerCase();
  const reason = (event.feedback?.reason ?? "").toLowerCase();

  // Explicit performance signals
  if (t === "performance_signal") return "PERFORMANCE_SIGNAL";

  if (t === "voice_changed") return "BRAND_VOICE_PREFERENCE";
  if (t === "audience_changed") return "AUDIENCE_CORRECTION";
  if (t === "positioning_changed") return "POSITIONING_PREFERENCE";
  if (t === "content_preference_changed") return "CONTENT_STYLE_PREFERENCE";
  if (t === "strategy_changed") return "STRATEGIC_DECISION";

  // Brand knowledge corrections trump everything when entity is brand field
  if (
    t === "brand_knowledge_corrected" ||
    t === "corrected" ||
    (t === "edited" && reason.includes("fact"))
  ) {
    // Disambiguate by entityType / sourceModule
    if (hint === "brand_knowledge") return "BRAND_FACT_CORRECTION";
    if (hint === "product") return "PRODUCT_INFORMATION_CORRECTION";
    return "BRAND_FACT_CORRECTION";
  }

  if (t === "rejected" || t === "dismissed" || t === "deferred") return "RECOMMENDATION_FEEDBACK";

  if (hasRating || t === "rated") return "OUTPUT_QUALITY_FEEDBACK";

  if (comment.includes("format") || reason.includes("format")) return "FORMATTING_PREFERENCE";

  if (t === "edited" || t === "accepted") {
    // Try to distinguish business fact vs style vs formatting by original/resulting diff shape
    const orig = typeof event.originalValue === "string" ? event.originalValue : "";
    const next = typeof event.resultingValue === "string" ? event.resultingValue : "";
    if (orig && next) {
      const lowerOrig = orig.toLowerCase();
      const lowerNext = next.toLowerCase();
      // If only whitespace/casing/punctuation changed -> formatting
      const stripped = (s: string) => s.replace(/[\s_.,;:!?-]+/g, "").toLowerCase();
      if (stripped(orig) === stripped(next)) return "FORMATTING_PREFERENCE";
      // Shortening/length cues -> style
      if (next.length < orig.length * 0.7 && next.length < 300) return "CONTENT_STYLE_PREFERENCE";
      // If context mentions voice/style
      if (comment.includes("voice") || comment.includes("tone")) return "BRAND_VOICE_PREFERENCE";
    }
    // Default for edited with no stronger signal
    return "CONTENT_STYLE_PREFERENCE";
  }

  if (t === "commented") return "OUTPUT_QUALITY_FEEDBACK";

  // Corrected with product context
  if (hint === "product") return "PRODUCT_INFORMATION_CORRECTION";
  if (hint === "content") return "CONTENT_STYLE_PREFERENCE";

  return "TEMPORARY_TASK_PREFERENCE";
}

export function detectChangeNature(
  category: FeedbackCategory,
  event: BrandLearningEvent,
): ChangeNature {
  switch (category) {
    case "BRAND_FACT_CORRECTION":
    case "PRODUCT_INFORMATION_CORRECTION":
    case "AUDIENCE_CORRECTION":
      return "factual";
    case "BRAND_VOICE_PREFERENCE":
    case "CONTENT_STYLE_PREFERENCE":
      return "stylistic";
    case "POSITIONING_PREFERENCE":
    case "STRATEGIC_DECISION":
      return "strategic";
    case "FORMATTING_PREFERENCE":
      return "formatting";
    case "RECOMMENDATION_FEEDBACK":
    case "OUTPUT_QUALITY_FEEDBACK":
      // Could be any — look at reason/comment
      if ((event.feedback?.reason ?? "").toLowerCase().includes("fact")) return "factual";
      return "contextual";
    default:
      return "unknown";
  }
}

/**
 * Evidence-based confidence scoring (prompt §6)
 * Inputs per interpretation: explicit flag, repeat evidence, recency, consistency,
 * contradiction count, user identity signal. Tuned so isolated stylistic edits stay low.
 */
export function scoreConfidence(input: {
  isExplicit: boolean;
  evidenceCount: number; // how many similar events support this (1 = isolated)
  /**
   * 0..1 where 1 = all supporting events say the same thing in similar context
   * (caller computes by clustering). Unknown -> 0.5.
   */
  consistency: number;
  /**
   * recency: 1 = all evidence within 7d, 0 = stale (>90d) — used as multiplier
   */
  recencyScore: number;
  conflictingCount: number;
}): { score: number; isPersistent: boolean } {
  let base: number;
  if (input.isExplicit) base = 0.85; // explicit instruction
  else if (input.evidenceCount >= 5) base = 0.75;
  else if (input.evidenceCount >= 3) base = 0.58;
  else if (input.evidenceCount >= 2) base = 0.42;
  else base = 0.22; // isolated — intentionally low per prompt §6.B

  // Consistency boost/cut (±0.12)
  base += (input.consistency - 0.5) * 0.24;

  // Recency modest boost for fresh evidence, penalty for stale
  base += (input.recencyScore - 0.5) * 0.12;

  // Contradictions cut
  if (input.conflictingCount >= 2) base -= 0.18;
  else if (input.conflictingCount === 1) base -= 0.08;

  const score = Math.max(0.05, Math.min(0.95, Math.round(base * 100) / 100));
  // Persistent only when explicit or repeated & consistent & not heavily conflicted
  const isPersistent =
    input.isExplicit ||
    (input.evidenceCount >= 3 && input.consistency >= 0.7 && input.conflictingCount === 0) ||
    (input.evidenceCount >= 5 && input.consistency >= 0.5 && input.conflictingCount <= 1);
  return { score, isPersistent };
}

function decideLearningAction(input: {
  confidence: number;
  isPersistent: boolean;
  category: FeedbackCategory;
  isExplicit: boolean;
}): LearningAction {
  // Never auto-activate factual/strategic on weak signals — queue for review
  const sensitive = new Set<FeedbackCategory>([
    "BRAND_FACT_CORRECTION",
    "PRODUCT_INFORMATION_CORRECTION",
    "AUDIENCE_CORRECTION",
    "STRATEGIC_DECISION",
    "POSITIONING_PREFERENCE",
  ]);

  if (input.isExplicit && input.confidence >= 0.7) return "learn_immediately";
  if (sensitive.has(input.category) && input.confidence < 0.55) return "candidate";
  if (input.confidence >= 0.72 && input.isPersistent) return "learn_immediately";
  if (input.confidence >= 0.45) return "candidate";
  if (input.confidence >= 0.25) return "request_clarification";
  return "ignore";
}

function summarizeChange(event: BrandLearningEvent): {
  whatChanged: string | null;
  whatWasSuggested: string | null;
  whatPreferredInstead: string | null;
} {
  const orig = typeof event.originalValue === "string" ? event.originalValue : JSON.stringify(event.originalValue ?? "");
  const next = typeof event.resultingValue === "string" ? event.resultingValue : JSON.stringify(event.resultingValue ?? "");
  const clean = (s: string) => (s.trim().length > 600 ? s.trim().slice(0, 600) + "…[truncated]" : s.trim()) || null;
  if (!orig.trim() && !next.trim()) return { whatChanged: null, whatWasSuggested: null, whatPreferredInstead: null };
  const whatChanged = event.feedback?.reason?.trim() ? event.feedback.reason.trim().slice(0, 600) : null;
  return { whatChanged, whatWasSuggested: clean(orig), whatPreferredInstead: clean(next) };
}

// ------------------------------------------------------------------
// Conflict detection against current Brand Brain (never silent overwrite)
// ------------------------------------------------------------------
async function detectConflict(input: {
  workspaceId: string;
  category: FeedbackCategory;
  resultingValue: unknown;
  subjectGuess: string;
}): Promise<Record<string, unknown> | null> {
  // For factual-ish categories, compare against the relevant MarketingContext sections
  const sensitive = new Set<FeedbackCategory>([
    "BRAND_FACT_CORRECTION",
    "BRAND_VOICE_PREFERENCE",
    "AUDIENCE_CORRECTION",
    "POSITIONING_PREFERENCE",
    "PRODUCT_INFORMATION_CORRECTION",
  ]);
  if (!sensitive.has(input.category)) return null;

  const stored = await getMarketingContext(input.workspaceId);
  if (!stored) return null;
  const sections = stored.sections as Record<string, Record<string, unknown>>;
  const resultStr = typeof input.resultingValue === "string" ? input.resultingValue.trim() : JSON.stringify(input.resultingValue ?? "");
  if (!resultStr || resultStr.length < 6 || resultStr === "{}") return null;

  // Cheap textual scan: if the incoming value mentions a field value that contradicts it, flag.
  // For brand voice etc we store as provenance; expose as conflict candidate for UI.
  // We avoid semantic LLM for the cheap path — callers can run deeper check.
  for (const [sectionId, values] of Object.entries(sections)) {
    if (!values || typeof values !== "object") continue;
    for (const [fieldId, existingVal] of Object.entries(values as Record<string, unknown>)) {
      if (typeof existingVal !== "string" || !existingVal.trim()) continue;
      const existingLower = existingVal.toLowerCase();
      const incomingLower = resultStr.toLowerCase();
      // Only flag if the incoming re-states the same field's subject and differs > threshold
      // Heuristic: field appears in subject guess or the values share >50% token overlap but differ in meaning
      const overlapTokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
      const eTokens = overlapTokens(existingVal);
      const iTokens = overlapTokens(resultStr);
      if (eTokens.size === 0 || iTokens.size === 0) continue;
      let common = 0;
      for (const tok of eTokens) if (iTokens.has(tok)) common += 1;
      const overlap = common / Math.max(eTokens.size, 1);
      // low overlap but same field -> different info, not conflict; high overlap -> possible rewording, not conflict either
      // We flag when incoming explicitly negates existing (contains "not", "no longer", "instead")
      const negates = /\b(not|no longer|instead|avoid|don'?t|never|replaced)\b/i.test(resultStr);
      if (negates && overlap > 0.25 && resultStr.length < 2_000) {
        return {
          section: sectionId,
          field: fieldId,
          existingValue: existingVal.slice(0, 600),
          incomingPreview: resultStr.slice(0, 600),
          subjectGuess: input.subjectGuess,
          kind: "potential_contradiction",
        };
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------
// Public: interpret one event (idempotent by event_id)
// ------------------------------------------------------------------
export async function interpretEvent(input: {
  organizationId: string;
  workspaceId: string;
  event: BrandLearningEvent;
  // Optional evidence signals computed by caller (e.g. pattern detector). Defaults to isolated.
  evidence?: { count: number; consistency: number; recencyScore: number; conflictingCount: number };
}): Promise<LearningInterpretation> {
  const { event, organizationId, workspaceId } = input;
  const category = classifyCategory(event);
  const changeNature = detectChangeNature(category, event);
  const { whatChanged, whatWasSuggested, whatPreferredInstead } = summarizeChange(event);

  const isExplicit =
    Boolean(event.feedback?.comment?.trim()) ||
    Boolean(event.feedback?.reason?.trim() && event.feedback.reason.trim().length > 12) ||
    event.eventType === "brand_knowledge_corrected" ||
    event.eventType === "positioning_changed" ||
    event.eventType === "audience_changed" ||
    event.eventType === "voice_changed" ||
    event.eventType === "strategy_changed";

  const evidence = {
    count: input.evidence?.count ?? 1,
    consistency: input.evidence?.consistency ?? 0.5,
    recencyScore: input.evidence?.recencyScore ?? 0.8,
    conflictingCount: input.evidence?.conflictingCount ?? 0,
  };

  const { score, isPersistent } = scoreConfidence({
    isExplicit,
    evidenceCount: evidence.count,
    consistency: evidence.consistency,
    recencyScore: evidence.recencyScore,
    conflictingCount: evidence.conflictingCount,
  });

  const confidenceLevel = confidenceLevelFromScore(score);
  const learningAction = decideLearningAction({
    confidence: score,
    isPersistent,
    category,
    isExplicit,
  });

  const isTaskSpecific = !isPersistent && (category === "TEMPORARY_TASK_PREFERENCE" || category === "FORMATTING_PREFERENCE");

  const subjectGuess = (event.entityType ?? event.context?.["subject"] ?? event.feedback?.reason ?? category)
    .toString()
    .slice(0, 120);
  const conflictsWith = await detectConflict({
    workspaceId,
    category,
    resultingValue: event.resultingValue,
    subjectGuess,
  });

  const reasoningParts: string[] = [
    `Category=${category}, nature=${changeNature}`,
    isExplicit ? "explicit signal" : "implicit signal",
    `evidenceCount=${evidence.count}, consistency=${evidence.consistency.toFixed(2)}, recency=${evidence.recencyScore.toFixed(2)}, conflicts=${evidence.conflictingCount}`,
    `confidence=${score} (${confidenceLevel}), persistent=${isPersistent}, action=${learningAction}`,
  ];
  if (conflictsWith) reasoningParts.push(`potential_conflict=${JSON.stringify(conflictsWith).slice(0, 300)}`);

  // Upsert (event_id unique). Reinterpretation overwrites with latest scoring.
  const result = await query<InterpretationRow>(
    `INSERT INTO brand_learning_interpretations (
       event_id, workspace_id, organization_id, category,
       what_changed, what_was_suggested, what_preferred_instead,
       change_nature, is_persistent, is_task_specific,
       confidence, confidence_level, learning_action, reasoning, conflicts_with
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6,$7,
       $8,$9,$10,
       $11,$12,$13,$14,$15::jsonb
     )
     ON CONFLICT (event_id) DO UPDATE SET
       category = EXCLUDED.category,
       what_changed = EXCLUDED.what_changed,
       what_was_suggested = EXCLUDED.what_was_suggested,
       what_preferred_instead = EXCLUDED.what_preferred_instead,
       change_nature = EXCLUDED.change_nature,
       is_persistent = EXCLUDED.is_persistent,
       is_task_specific = EXCLUDED.is_task_specific,
       confidence = EXCLUDED.confidence,
       confidence_level = EXCLUDED.confidence_level,
       learning_action = EXCLUDED.learning_action,
       reasoning = EXCLUDED.reasoning,
       conflicts_with = EXCLUDED.conflicts_with
     RETURNING id, event_id, workspace_id, organization_id, category,
               what_changed, what_was_suggested, what_preferred_instead,
               change_nature, is_persistent, is_task_specific,
               confidence, confidence_level, learning_action, reasoning,
               conflicts_with, created_at`,
    [
      event.id,
      workspaceId,
      organizationId,
      category,
      whatChanged,
      whatWasSuggested,
      whatPreferredInstead,
      changeNature,
      isPersistent,
      isTaskSpecific,
      score,
      confidenceLevel,
      learningAction,
      reasoningParts.join("; "),
      JSON.stringify(conflictsWith),
    ],
  );
  return toPublic(result.rows[0]);
}

export async function getInterpretationByEvent(workspaceId: string, eventId: string) {
  const result = await query<InterpretationRow>(
    `SELECT id, event_id, workspace_id, organization_id, category,
            what_changed, what_was_suggested, what_preferred_instead,
            change_nature, is_persistent, is_task_specific,
            confidence, confidence_level, learning_action, reasoning,
            conflicts_with, created_at
       FROM brand_learning_interpretations
      WHERE event_id = $1 AND workspace_id = $2`,
    [eventId, workspaceId],
  );
  return result.rows[0] ? toPublic(result.rows[0]) : null;
}

export async function listInterpretations(
  workspaceId: string,
  options: { category?: string; learningAction?: string; limit?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const clauses = ["workspace_id = $1"];
  const values: unknown[] = [workspaceId];
  let idx = 2;
  if (options.category) {
    clauses.push(`category = $${idx++}`);
    values.push(options.category);
  }
  if (options.learningAction) {
    clauses.push(`learning_action = $${idx++}`);
    values.push(options.learningAction);
  }
  const result = await query<InterpretationRow>(
    `SELECT id, event_id, workspace_id, organization_id, category,
            what_changed, what_was_suggested, what_preferred_instead,
            change_nature, is_persistent, is_task_specific,
            confidence, confidence_level, learning_action, reasoning,
            conflicts_with, created_at
       FROM brand_learning_interpretations
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${idx}`,
    [...values, limit],
  );
  return result.rows.map(toPublic);
}
