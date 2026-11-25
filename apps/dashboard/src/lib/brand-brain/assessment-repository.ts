import { query, transaction } from "@/lib/database";
import {
  canTransition,
  type RecommendationDraft,
  type RecommendationEffort,
  type RecommendationPriority,
  type RecommendationStatus,
} from "./recommend";
import {
  DIMENSION_LABELS,
  type AssessmentDimension,
  type AssessmentEvidence,
  type AssessmentFindingDraft,
  type Confidence,
  type DimensionAssessment,
} from "./assess";

type AssessmentRow = {
  workspace_id: string;
  organization_id?: string | null;
  dimension: string;
  status: string;
  confidence: string;
  completeness: number;
  evidence: unknown;
  source: string;
  explanation: string;
  gaps: unknown;
  next_action: string;
  assessed_at: Date | string;
};

export type StoredAssessment = DimensionAssessment & { assessedAt: string };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

type EvidenceRow = { label?: unknown; source?: unknown; tier?: unknown; stale?: unknown };

function asEvidence(value: unknown): AssessmentEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is EvidenceRow => !!entry && typeof entry === "object")
    .map((entry): AssessmentEvidence => ({
      label: typeof entry.label === "string" ? entry.label : "",
      source: typeof entry.source === "string" ? entry.source : "",
      tier: entry.tier === "high" || entry.tier === "medium" || entry.tier === "low" || entry.tier === "none" ? entry.tier : "low",
      stale: entry.stale === true,
    }));
}

const ASSESS_COLS = `workspace_id, dimension, status, confidence, completeness,
  evidence, source, explanation, gaps, next_action, assessed_at`;

function publicAssessment(row: AssessmentRow): StoredAssessment {
  const status = row.status === "complete" || row.status === "needs_input" || row.status === "low_confidence" ? row.status : "needs_input";
  const dimension = row.dimension as StoredAssessment["dimension"];
  return {
    dimension,
    label: DIMENSION_LABELS[dimension] ?? row.dimension,
    status,
    confidence: row.confidence === "high" || row.confidence === "medium" ? row.confidence : "low",
    completeness: Number(row.completeness) || 0,
    evidence: asEvidence(row.evidence),
    source: row.source,
    explanation: row.explanation,
    gaps: asStringArray(row.gaps),
    nextAction: row.next_action,
    assessedAt: new Date(row.assessed_at).toISOString(),
  };
}

export async function saveAssessments(
  workspaceId: string,
  dims: DimensionAssessment[],
  organizationId: string | null = null,
) {
  for (const dim of dims) {
    await query(
      `INSERT INTO brand_assessments (
         workspace_id, organization_id, dimension, status, confidence, completeness,
         evidence, source, explanation, gaps, next_action, assessed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11, NOW())
       ON CONFLICT (workspace_id, dimension) DO UPDATE SET
         organization_id = COALESCE(EXCLUDED.organization_id, brand_assessments.organization_id),
         status = EXCLUDED.status,
         confidence = EXCLUDED.confidence,
         completeness = EXCLUDED.completeness,
         evidence = EXCLUDED.evidence,
         source = EXCLUDED.source,
         explanation = EXCLUDED.explanation,
         gaps = EXCLUDED.gaps,
         next_action = EXCLUDED.next_action,
         assessed_at = NOW()`,
      [
        workspaceId,
        organizationId,
        dim.dimension,
        dim.status,
        dim.confidence,
        dim.completeness,
        JSON.stringify(dim.evidence),
        dim.source,
        dim.explanation,
        JSON.stringify(dim.gaps),
        dim.nextAction,
      ],
    );
  }
}

export async function listAssessments(workspaceId: string) {
  const result = await query<AssessmentRow>(
    `SELECT ${ASSESS_COLS} FROM brand_assessments WHERE workspace_id = $1`,
    [workspaceId],
  );
  return result.rows.map(publicAssessment);
}

export type StoredFinding = AssessmentFindingDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type FindingRow = {
  id: string;
  dimension: string;
  finding_key: string;
  severity: string;
  title: string;
  detail: string;
  evidence: unknown;
  source: string;
  confidence: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function publicFinding(row: FindingRow): StoredFinding {
  const severity =
    row.severity === "info" || row.severity === "warning" || row.severity === "gap" || row.severity === "conflict"
      ? row.severity
      : "info";
  return {
    id: row.id,
    dimension: row.dimension as AssessmentDimension,
    findingKey: row.finding_key,
    severity,
    title: row.title,
    detail: row.detail,
    evidence: asStringArray(row.evidence),
    source: row.source,
    confidence: row.confidence === "high" || row.confidence === "medium" ? row.confidence : "low",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function saveAssessmentFindings(
  workspaceId: string,
  findings: AssessmentFindingDraft[],
  organizationId: string | null = null,
) {
  await transaction(async (client) => {
    await client.query(`DELETE FROM brand_assessment_findings WHERE workspace_id = $1`, [workspaceId]);
    if (!findings.length) return;
    await client.query(
      `INSERT INTO brand_assessment_findings (
         workspace_id, organization_id, dimension, finding_key, severity,
         title, detail, evidence, source, confidence
       )
       SELECT $1, $2, f.dimension, f.finding_key, f.severity, f.title, f.detail,
              f.evidence, f.source, f.confidence
         FROM unnest(
           $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
           $8::jsonb[], $9::text[], $10::text[]
         ) AS f(dimension, finding_key, severity, title, detail, evidence, source, confidence)`,
      [
        workspaceId,
        organizationId,
        findings.map((f) => f.dimension),
        findings.map((f) => f.findingKey),
        findings.map((f) => f.severity),
        findings.map((f) => f.title),
        findings.map((f) => f.detail),
        findings.map((f) => JSON.stringify(f.evidence)),
        findings.map((f) => f.source),
        findings.map((f) => f.confidence),
      ],
    );
  });
}

export async function listAssessmentFindings(workspaceId: string) {
  const result = await query<FindingRow>(
    `SELECT id, dimension, finding_key, severity, title, detail, evidence, source, confidence, created_at, updated_at
       FROM brand_assessment_findings
      WHERE workspace_id = $1
      ORDER BY CASE severity WHEN 'conflict' THEN 0 WHEN 'gap' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC`,
    [workspaceId],
  );
  return result.rows.map(publicFinding);
}

export type StoredRecommendation = {
  id: string;
  dedupeKey: string;
  section: string | null;
  title: string;
  description: string;
  evidence: string[];
  why: string;
  solution: string;
  outcome: string;
  priority: RecommendationPriority;
  confidence: Confidence;
  effort: RecommendationEffort;
  workflow: Record<string, unknown>;
  status: RecommendationStatus;
  editedBy: string | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RecommendationRow = {
  id: string;
  dedupe_key: string;
  section: string | null;
  title: string;
  description: string;
  evidence: unknown;
  why: string;
  solution: string;
  outcome: string;
  priority: string;
  confidence: string;
  effort: string;
  workflow: unknown;
  status: string;
  edited_by?: string | null;
  edited_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const REC_COLS = `id, dedupe_key, section, title, description, evidence, why,
  solution, outcome, priority, confidence, effort, workflow, status,
  edited_by, edited_at, created_at, updated_at`;

function publicRecommendation(row: RecommendationRow): StoredRecommendation {
  const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    section: row.section,
    title: row.title,
    description: row.description,
    evidence: asStringArray(row.evidence),
    why: row.why,
    solution: row.solution,
    outcome: row.outcome,
    priority: pick(row.priority, ["high", "medium", "low"] as const, "medium"),
    confidence: pick(row.confidence, ["high", "medium", "low"] as const, "medium"),
    effort: pick(row.effort, ["S", "M", "L"] as const, "M"),
    workflow:
      row.workflow && typeof row.workflow === "object" && !Array.isArray(row.workflow)
        ? (row.workflow as Record<string, unknown>)
        : {},
    status: pick(
      row.status,
      ["NEW", "REVIEW_REQUIRED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "DISMISSED", "DEFERRED"] as const,
      "NEW",
    ),
    editedBy: row.edited_by ?? null,
    editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function insertRecommendations(
  workspaceId: string,
  drafts: RecommendationDraft[],
  organizationId: string | null = null,
): Promise<{ created: number; skipped: number }> {
  if (!drafts.length) return { created: 0, skipped: 0 };
  const result = await query<{ id: string }>(
    `INSERT INTO brand_recommendations (
       workspace_id, organization_id, dedupe_key, section, title, description, evidence,
       why, solution, outcome, priority, confidence, effort, workflow, status
     )
     SELECT $1, $2, draft.dedupe_key, draft.section, draft.title, draft.description,
            draft.evidence, draft.why, draft.solution, draft.outcome,
            draft.priority, draft.confidence, draft.effort, draft.workflow, 'NEW'
       FROM unnest(
         $3::text[], $4::text[], $5::text[], $6::text[], $7::jsonb[],
         $8::text[], $9::text[], $10::text[], $11::text[], $12::text[],
         $13::text[], $14::jsonb[]
       ) AS draft(dedupe_key, section, title, description, evidence, why,
                  solution, outcome, priority, confidence, effort, workflow)
     ON CONFLICT (workspace_id, dedupe_key)
       WHERE status NOT IN ('COMPLETED', 'DISMISSED')
     DO NOTHING
     RETURNING id`,
    [
      workspaceId,
      organizationId,
      drafts.map((item) => item.dedupeKey),
      drafts.map((item) => item.section),
      drafts.map((item) => item.title),
      drafts.map((item) => item.description),
      drafts.map((item) => JSON.stringify(item.evidence)),
      drafts.map((item) => item.why),
      drafts.map((item) => item.solution),
      drafts.map((item) => item.outcome),
      drafts.map((item) => item.priority),
      drafts.map((item) => item.confidence),
      drafts.map((item) => item.effort),
      drafts.map((item) => JSON.stringify(item.workflow)),
    ],
  );
  const created = result.rowCount ?? 0;
  return { created, skipped: drafts.length - created };
}

const OPEN_STATUSES = ["NEW", "REVIEW_REQUIRED", "ACCEPTED", "IN_PROGRESS", "DEFERRED"];

export async function listRecommendations(workspaceId: string, openOnly = true) {
  const result = await query<RecommendationRow>(
    `SELECT ${REC_COLS} FROM brand_recommendations
      WHERE workspace_id = $1${openOnly ? ` AND status = ANY($2::text[])` : ""}
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        CASE effort WHEN 'S' THEN 0 WHEN 'M' THEN 1 ELSE 2 END,
        created_at DESC`,
    openOnly ? [workspaceId, OPEN_STATUSES] : [workspaceId],
  );
  return result.rows.map(publicRecommendation);
}

export async function transitionRecommendation(
  workspaceId: string,
  id: string,
  to: RecommendationStatus,
  decidedBy: string | null,
) {
  const current = await query<{ status: string }>(
    `SELECT status FROM brand_recommendations WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
  const from = current.rows[0]?.status as RecommendationStatus | undefined;
  if (!from) throw new RangeError("That recommendation was not found.");
  if (!canTransition(from, to)) {
    throw new RangeError(`Cannot move a recommendation from ${from} to ${to}.`);
  }
  const terminal = to === "COMPLETED" || to === "DISMISSED";
  const updated = await query<RecommendationRow>(
    `UPDATE brand_recommendations
        SET status = $3, updated_at = NOW(),
            decided_at = CASE WHEN $4 THEN NOW() ELSE decided_at END,
            decided_by = COALESCE($5, decided_by)
      WHERE id = $1 AND workspace_id = $2
     RETURNING ${REC_COLS}`,
    [id, workspaceId, to, terminal, decidedBy],
  );
  const row = updated.rows[0];
  if (!row) throw new RangeError("That recommendation was not found.");
  return publicRecommendation(row);
}

export type RecommendationEditPatch = {
  title?: string;
  description?: string;
  solution?: string;
  outcome?: string;
  priority?: RecommendationPriority;
  effort?: RecommendationEffort;
};

export async function editRecommendation(
  workspaceId: string,
  id: string,
  patch: RecommendationEditPatch,
  editedBy: string | null,
) {
  const updated = await query<RecommendationRow>(
    `UPDATE brand_recommendations
        SET title = COALESCE($3, title),
            description = COALESCE($4, description),
            solution = COALESCE($5, solution),
            outcome = COALESCE($6, outcome),
            priority = COALESCE($7, priority),
            effort = COALESCE($8, effort),
            edited_by = COALESCE($9, edited_by),
            edited_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
        AND status NOT IN ('COMPLETED', 'DISMISSED')
     RETURNING ${REC_COLS}`,
    [
      id,
      workspaceId,
      patch.title?.trim() || null,
      patch.description?.trim() || null,
      patch.solution?.trim() || null,
      patch.outcome?.trim() || null,
      patch.priority ?? null,
      patch.effort ?? null,
      editedBy,
    ],
  );
  const row = updated.rows[0];
  if (!row) throw new RangeError("Recommendation not found or already closed.");
  return publicRecommendation(row);
}

export type IntelligenceJobStatus =
  | "QUEUED"
  | "ANALYZING"
  | "GENERATING"
  | "REVIEW_REQUIRED"
  | "COMPLETED"
  | "FAILED";

export type IntelligenceJobKind =
  | "brand_assessment"
  | "brand_discovery"
  | "brand_completion";

export type IntelligenceJob = {
  id: string;
  workspaceId: string;
  organizationId: string | null;
  jobKind: IntelligenceJobKind;
  idempotencyKey: string | null;
  status: IntelligenceJobStatus;
  attempts: number;
  maxAttempts: number;
  partialResult: Record<string, unknown>;
  result: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobRow = {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  job_kind: IntelligenceJobKind;
  idempotency_key: string | null;
  status: IntelligenceJobStatus;
  attempts: number;
  max_attempts: number;
  partial_result: unknown;
  result: unknown;
  error_message: string | null;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const JOB_COLS = `id, workspace_id, organization_id, job_kind, idempotency_key,
  status, attempts, max_attempts, partial_result, result, error_message,
  started_at, finished_at, created_at, updated_at`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function publicJob(row: JobRow): IntelligenceJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    organizationId: row.organization_id,
    jobKind: row.job_kind,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attempts: Number(row.attempts) || 0,
    maxAttempts: Number(row.max_attempts) || 3,
    partialResult: asRecord(row.partial_result),
    result: asRecord(row.result),
    errorMessage: row.error_message,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function createIntelligenceJob(input: {
  workspaceId: string;
  organizationId?: string | null;
  jobKind: IntelligenceJobKind;
  idempotencyKey?: string | null;
  initialInput?: Record<string, unknown>;
}): Promise<IntelligenceJob> {
  const inserted = await query<JobRow>(
    `INSERT INTO intelligence_jobs (
       workspace_id, organization_id, job_kind, idempotency_key, status, attempts, input
     )
     VALUES ($1, $2, $3, $4, 'QUEUED', 1, $5::jsonb)
     ON CONFLICT (workspace_id, idempotency_key)
       WHERE idempotency_key IS NOT NULL AND status IN ('QUEUED', 'ANALYZING', 'GENERATING')
     DO NOTHING
     RETURNING ${JOB_COLS}`,
    [
      input.workspaceId,
      input.organizationId ?? null,
      input.jobKind,
      input.idempotencyKey ?? null,
      JSON.stringify(input.initialInput ?? {}),
    ],
  );
  if (inserted.rows[0]) return publicJob(inserted.rows[0]);
  if (input.idempotencyKey) {
    const existing = await query<JobRow>(
      `SELECT ${JOB_COLS} FROM intelligence_jobs
        WHERE workspace_id = $1 AND idempotency_key = $2
        ORDER BY created_at DESC LIMIT 1`,
      [input.workspaceId, input.idempotencyKey],
    );
    if (existing.rows[0]) return publicJob(existing.rows[0]);
  }
  throw new Error("Unable to create intelligence job.");
}

export async function updateIntelligenceJob(
  workspaceId: string,
  jobId: string,
  patch: {
    status: IntelligenceJobStatus;
    partialResult?: Record<string, unknown>;
    result?: Record<string, unknown>;
    errorMessage?: string | null;
  },
) {
  const isTerminal =
    patch.status === "COMPLETED" ||
    patch.status === "FAILED" ||
    patch.status === "REVIEW_REQUIRED";
  const result = await query<JobRow>(
    `UPDATE intelligence_jobs
        SET status = $3,
            partial_result = COALESCE($4::jsonb, partial_result),
            result = COALESCE($5::jsonb, result),
            error_message = $6,
            started_at = COALESCE(started_at, CASE WHEN $3 IN ('ANALYZING', 'GENERATING') THEN NOW() ELSE NULL END),
            finished_at = CASE WHEN $7 THEN NOW() ELSE finished_at END,
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
     RETURNING ${JOB_COLS}`,
    [
      jobId,
      workspaceId,
      patch.status,
      patch.partialResult ? JSON.stringify(patch.partialResult) : null,
      patch.result ? JSON.stringify(patch.result) : null,
      patch.errorMessage ?? null,
      isTerminal,
    ],
  );
  return result.rows[0] ? publicJob(result.rows[0]) : null;
}

export async function getLatestIntelligenceJob(
  workspaceId: string,
  jobKind?: IntelligenceJobKind,
) {
  const result = await query<JobRow>(
    `SELECT ${JOB_COLS} FROM intelligence_jobs
      WHERE workspace_id = $1${jobKind ? " AND job_kind = $2" : ""}
      ORDER BY created_at DESC
      LIMIT 1`,
    jobKind ? [workspaceId, jobKind] : [workspaceId],
  );
  return result.rows[0] ? publicJob(result.rows[0]) : null;
}

export async function saveIntelligenceSource(
  workspaceId: string,
  input: {
    organizationId?: string | null;
    sourceType: "website" | "document" | "onboarding" | "integration" | "research" | "user_input";
    sourceKey: string;
    title: string;
    url?: string | null;
    reliability: Confidence;
    excerpt?: string | null;
    metadata?: Record<string, unknown>;
    checksum?: string | null;
  },
) {
  await query(
    `INSERT INTO intelligence_sources (
       workspace_id, organization_id, source_type, source_key, title,
       url, reliability, excerpt, metadata, checksum, fetched_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW(), NOW())
     ON CONFLICT (workspace_id, source_type, source_key) DO UPDATE SET
       organization_id = COALESCE(EXCLUDED.organization_id, intelligence_sources.organization_id),
       title = EXCLUDED.title,
       url = EXCLUDED.url,
       reliability = EXCLUDED.reliability,
       excerpt = EXCLUDED.excerpt,
       metadata = EXCLUDED.metadata,
       checksum = EXCLUDED.checksum,
       fetched_at = NOW(),
       updated_at = NOW()`,
    [
      workspaceId,
      input.organizationId ?? null,
      input.sourceType,
      input.sourceKey.slice(0, 200),
      input.title.slice(0, 240),
      input.url ?? null,
      input.reliability,
      input.excerpt ? input.excerpt.slice(0, 4_000) : null,
      JSON.stringify(input.metadata ?? {}),
      input.checksum ?? null,
    ],
  );
}
