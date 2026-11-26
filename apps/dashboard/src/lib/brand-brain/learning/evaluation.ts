// Output Evaluation Engine (§8) — heuristic scoring against Brand Brain context.
// "Do not claim an output is objectively high-quality solely because it passed an AI evaluation."
// Scores are internal quality signals (0..1), not truth claims.

import { query } from "@/lib/database";
import type { OutputEvaluation, OutputEvaluationInput } from "./types";

type EvaluationRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string | null;
  output_type: string;
  original_output: unknown | null;
  final_output: unknown | null;
  brand_voice_score: string | null;
  brand_identity_score: string | null;
  audience_score: string | null;
  positioning_score: string | null;
  factual_score: string | null;
  preference_score: string | null;
  overall_score: string | null;
  issues: unknown;
  suggestions: unknown;
  was_edited: boolean;
  edit_distance_ratio: string | null;
  evaluator: string;
  evaluated_at: Date | string;
  created_at: Date | string;
};

function toPublic(row: EvaluationRow): OutputEvaluation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    outputType: row.output_type,
    originalOutput: row.original_output,
    finalOutput: row.final_output,
    brandVoiceScore: row.brand_voice_score != null ? Number(row.brand_voice_score) : null,
    brandIdentityScore: row.brand_identity_score != null ? Number(row.brand_identity_score) : null,
    audienceScore: row.audience_score != null ? Number(row.audience_score) : null,
    positioningScore: row.positioning_score != null ? Number(row.positioning_score) : null,
    factualScore: row.factual_score != null ? Number(row.factual_score) : null,
    preferenceScore: row.preference_score != null ? Number(row.preference_score) : null,
    overallScore: row.overall_score != null ? Number(row.overall_score) : null,
    issues: Array.isArray(row.issues) ? (row.issues as OutputEvaluation["issues"]) : [],
    suggestions: Array.isArray(row.suggestions) ? (row.suggestions as OutputEvaluation["suggestions"]) : [],
    wasEdited: row.was_edited,
    editDistanceRatio: row.edit_distance_ratio != null ? Number(row.edit_distance_ratio) : null,
    evaluator: row.evaluator as OutputEvaluation["evaluator"],
    evaluatedAt: new Date(row.evaluated_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return 1;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return (dp[m]![n] ?? 0) / Math.max(m, n);
}

function toDisplayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try { return JSON.stringify(value); } catch { return String(value); }
}

function scoreTextAgainstHints(
  text: string,
  hints: { shouldContain?: string[]; shouldAvoid?: string[] },
): number {
  if (!text.trim()) return 0.5;
  const lower = text.toLowerCase();
  let score = 0.55; // neutral prior — evaluation is a signal, not a verdict
  if (hints.shouldContain?.length) {
    let hits = 0;
    for (const phrase of hints.shouldContain) if (lower.includes(phrase.toLowerCase())) hits += 1;
    score += (hits / hints.shouldContain.length) * 0.25;
  }
  if (hints.shouldAvoid?.length) {
    for (const phrase of hints.shouldAvoid) if (lower.includes(phrase.toLowerCase())) score -= 0.18;
  }
  // Heuristic: repeated buzzwords hurt voice score
  const buzz = ["revolutionary", "cutting-edge", "world-class", "unparalleled", "game-changing"];
  let buzzHits = 0;
  for (const w of buzz) if (lower.includes(w)) buzzHits += 1;
  score -= Math.min(buzzHits * 0.05, 0.15);
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

export async function evaluateOutput(input: OutputEvaluationInput): Promise<OutputEvaluation> {
  const origText = toDisplayText(input.originalOutput);
  const finalText = toDisplayText(input.finalOutput);
  const evaluatedText = finalText || origText;
  const wasEdited = Boolean(input.finalOutput) && finalText !== origText;
  const editRatio = wasEdited ? levenshteinRatio(origText.slice(0, 4000), finalText.slice(0, 4000)) : null;

  // Lightweight Brand Brain cues from markdown (avoid full LLM call)
  const md = input.brandContextMarkdown ?? "";
  const hints = {
    shouldContain: [] as string[],
    shouldAvoid: [] as string[],
  };
  // Try to pull out glossary / preferred phrases by scanning markdown for "**Words" sections
  const lines = md.split("\n");
  let inPreferred = false, inAvoid = false;
  for (const line of lines) {
    const t = line.trim();
    if (t === "**Words and phrases to use:**") { inPreferred = true; inAvoid = false; continue; }
    if (t === "**Words and phrases to avoid:**") { inPreferred = false; inAvoid = true; continue; }
    if (t.startsWith("**") && t.endsWith(":**")) { inPreferred = false; inAvoid = false; continue; }
    if (!t || t.startsWith("#") || t.startsWith("*")) continue;
    if (inPreferred && t !== "_Not provided_") hints.shouldContain.push(t.split(/[,;]/)[0]!.trim());
    if (inAvoid && t !== "_Not provided_") hints.shouldAvoid.push(t.split(/[,;]/)[0]!.trim());
  }
  if (hints.shouldContain.length > 6) hints.shouldContain = hints.shouldContain.slice(0, 6);
  if (hints.shouldAvoid.length > 6) hints.shouldAvoid = hints.shouldAvoid.slice(0, 6);

  const brandVoiceScore = scoreTextAgainstHints(evaluatedText, { shouldAvoid: hints.shouldAvoid });
  const brandIdentityScore = scoreTextAgainstHints(evaluatedText, { shouldContain: hints.shouldContain.slice(0, 3) });
  const audienceScore = 0.6 as number | null; // needs richer audience signal; return neutral
  const positioningScore = 0.6 as number | null;
  const factualScore = 0.65 as number | null; // factual accuracy requires verification; neutral placeholder
  // Preference score: if user edited, low means we drifted from preference
  const preferenceScore = wasEdited ? Math.max(0.15, 1 - (editRatio ?? 0.4) - 0.1) : 0.65;

  const scores = [brandVoiceScore, brandIdentityScore, audienceScore, positioningScore, factualScore, preferenceScore].filter(
    (v): v is number => v != null,
  );
  const overallScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;

  const issues: OutputEvaluation["issues"] = [];
  if (brandVoiceScore < 0.45) issues.push({ dimension: "brand_voice", severity: "warning", message: "Output diverges from Brand Brain voice preferences.", suggestion: "Align tone/style to the saved Brand Brain voice." });
  if (brandIdentityScore < 0.45) issues.push({ dimension: "brand_identity", severity: "warning", message: "Output underuses Brand Brain identity cues.", suggestion: "Weave the one-liner and positioning into the draft." });
  if (wasEdited && (editRatio ?? 0) > 0.35) issues.push({ dimension: "preference", severity: "info", message: `User edited ${((editRatio ?? 0) * 100).toFixed(0)}% of the draft — consider learning from this correction.`, suggestion: "Capture the edit as a learning event." });
  if (overallScore != null && overallScore < 0.5) issues.push({ dimension: "overall", severity: "warning", message: "Internal pre-check found multiple drift signals. This is an internal signal, not an objective quality verdict.", suggestion: "Review against Brand Brain before publishing." });

  const suggestions: OutputEvaluation["suggestions"] = issues.map((i) => ({ message: i.suggestion ?? i.message }));

  // Truncate stored outputs
  const truncatedOriginal = origText.length > 8_000 ? origText.slice(0, 8_000) + "…[truncated]" : input.originalOutput;
  const truncatedFinal = finalText.length > 8_000 ? finalText.slice(0, 8_000) + "…[truncated]" : input.finalOutput;

  const result = await query<EvaluationRow>(
    `INSERT INTO brand_output_evaluations (
       organization_id, workspace_id, entity_type, entity_id, output_type,
       original_output, final_output,
       brand_voice_score, brand_identity_score, audience_score, positioning_score,
       factual_score, preference_score, overall_score,
       issues, suggestions, was_edited, edit_distance_ratio, evaluator
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6::jsonb,$7::jsonb,
       $8,$9,$10,$11,
       $12,$13,$14,
       $15::jsonb,$16::jsonb,$17,$18,'heuristic'
     )
     RETURNING id, organization_id, workspace_id, entity_type, entity_id, output_type,
               original_output, final_output,
               brand_voice_score, brand_identity_score, audience_score, positioning_score,
               factual_score, preference_score, overall_score,
               issues, suggestions, was_edited, edit_distance_ratio, evaluator,
               evaluated_at, created_at`,
    [
      input.organizationId,
      input.workspaceId,
      input.entityType,
      input.entityId ?? null,
      input.outputType,
      JSON.stringify(truncatedOriginal ?? null),
      JSON.stringify(truncatedFinal ?? null),
      brandVoiceScore,
      brandIdentityScore,
      audienceScore,
      positioningScore,
      factualScore,
      preferenceScore,
      overallScore,
      JSON.stringify(issues),
      JSON.stringify(suggestions),
      wasEdited,
      editRatio,
    ],
  );
  return toPublic(result.rows[0]);
}

export async function listOutputEvaluations(
  workspaceId: string,
  options: { outputType?: string; limit?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 200);
  const clauses = ["workspace_id = $1"];
  const values: unknown[] = [workspaceId];
  let idx = 2;
  if (options.outputType) {
    clauses.push(`output_type = $${idx++}`);
    values.push(options.outputType);
  }
  const result = await query<EvaluationRow>(
    `SELECT id, organization_id, workspace_id, entity_type, entity_id, output_type,
            original_output, final_output,
            brand_voice_score, brand_identity_score, audience_score, positioning_score,
            factual_score, preference_score, overall_score,
            issues, suggestions, was_edited, edit_distance_ratio, evaluator,
            evaluated_at, created_at
       FROM brand_output_evaluations
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${idx}`,
    [...values, limit],
  );
  return result.rows.map(toPublic);
}

/**
 * Was the user's edit "meaningful" enough to warrant a learning event?
 * Ignore trivial formatting/punctuation tweaks per §8: skip if edit ratio < threshold
 * and change is only formatting.
 */
export function isMeaningfulEdit(input: { originalText: string; finalText: string }): boolean {
  const a = toDisplayText(input.originalText).trim();
  const b = toDisplayText(input.finalText).trim();
  if (!a || !b) return false;
  if (a === b) return false;
  // First: if only whitespace/punctuation/casing changed, it's not meaningful regardless of Levenshtein ratio
  const normalize = (s: string) => s.replace(/[\s_.,;:!?-]+/g, "").toLowerCase();
  if (normalize(a) === normalize(b)) return false;
  const ratio = levenshteinRatio(a.slice(0, 6000), b.slice(0, 6000));
  return ratio >= 0.06; // configurable: 6% edit distance as "meaningful"
}
