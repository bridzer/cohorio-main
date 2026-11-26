// Learning memories: structured persistence that complements product_marketing_contexts.
// Distinct scopes (TASK/USER/BRAND/ORG), approval states, versioning, provenance.

import { query, transaction } from "@/lib/database";
import type {
  BrandLearningMemory,
  LearningCategory,
  LearningScope,
  LearningStatus,
} from "./types";

type MemoryRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  category: string;
  subject: string;
  learned_value: unknown;
  source_event_ids: string[];
  confidence: string;
  evidence_count: number;
  scope: string;
  scope_user_id: string | null;
  status: string;
  first_observed_at: Date | string;
  last_observed_at: Date | string;
  last_validated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toPublic(row: MemoryRow): BrandLearningMemory {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    category: row.category as LearningCategory,
    subject: row.subject,
    learnedValue: row.learned_value,
    sourceEventIds: row.source_event_ids ?? [],
    confidence: Number(row.confidence),
    evidenceCount: row.evidence_count,
    scope: row.scope as LearningScope,
    scopeUserId: row.scope_user_id,
    status: row.status as LearningStatus,
    firstObservedAt: new Date(row.first_observed_at).toISOString(),
    lastObservedAt: new Date(row.last_observed_at).toISOString(),
    lastValidatedAt: row.last_validated_at ? new Date(row.last_validated_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const MEMORY_COLUMNS = `id, organization_id, workspace_id, category, subject, learned_value,
  source_event_ids, confidence, evidence_count, scope, scope_user_id, status,
  first_observed_at, last_observed_at, last_validated_at, created_at, updated_at`;

export async function createMemory(input: {
  organizationId: string;
  workspaceId: string;
  category: LearningCategory;
  subject: string;
  learnedValue: unknown;
  sourceEventIds: string[];
  confidence: number;
  scope: LearningScope;
  scopeUserId?: string | null;
  status?: LearningStatus;
}): Promise<BrandLearningMemory> {
  const status = input.status ?? (input.confidence >= 0.72 ? "ACTIVE" : "CANDIDATE");
  const result = await query<MemoryRow>(
    `INSERT INTO brand_learning_memories (
       organization_id, workspace_id, category, subject, learned_value,
       source_event_ids, confidence, evidence_count, scope, scope_user_id, status
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)
     RETURNING ${MEMORY_COLUMNS}`,
    [
      input.organizationId,
      input.workspaceId,
      input.category,
      input.subject.trim().slice(0, 240),
      JSON.stringify(input.learnedValue),
      input.sourceEventIds,
      Math.max(0, Math.min(0.99, input.confidence)),
      Math.max(1, input.sourceEventIds.length),
      input.scope,
      input.scope === "USER" ? (input.scopeUserId ?? null) : null,
      status,
    ],
  );
  const memory = toPublic(result.rows[0]);
  await insertVersion(memory, "Created", null);
  return memory;
}

export async function getMemory(workspaceId: string, memoryId: string) {
  const result = await query<MemoryRow>(
    `SELECT ${MEMORY_COLUMNS} FROM brand_learning_memories WHERE id = $1 AND workspace_id = $2`,
    [memoryId, workspaceId],
  );
  return result.rows[0] ? toPublic(result.rows[0]) : null;
}

export async function listMemories(
  workspaceId: string,
  options: {
    category?: string;
    status?: string;
    scope?: string;
    currentUserId?: string;
    limit?: number;
    includeSuperseded?: boolean;
    search?: string;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const clauses = ["workspace_id = $1"];
  const values: unknown[] = [workspaceId];
  let idx = 2;

  if (options.category) {
    clauses.push(`category = $${idx++}`);
    values.push(options.category);
  }
  if (options.status) {
    clauses.push(`status = $${idx++}`);
    values.push(options.status);
  } else if (!options.includeSuperseded) {
    clauses.push(`status <> 'SUPERSEDED'`);
  }
  if (options.scope) {
    clauses.push(`scope = $${idx++}`);
    values.push(options.scope);
  }
  if (options.search?.trim()) {
    clauses.push(`(subject ILIKE $${idx} OR learned_value::text ILIKE $${idx})`);
    values.push(`%${options.search.trim()}%`);
    idx += 1;
  }
  // USER-scoped memories: only show to their owner (or to admins when requested explicitly)
  // By default callers pass currentUserId to scope USER results.
  // If not passed, we still return USER rows so caller can filter — but keep SQL simple.

  const result = await query<MemoryRow>(
    `SELECT ${MEMORY_COLUMNS} FROM brand_learning_memories
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        CASE status WHEN 'NEEDS_REVIEW' THEN 1 WHEN 'CANDIDATE' THEN 2 WHEN 'ACTIVE' THEN 3 ELSE 4 END,
        confidence DESC, updated_at DESC
      LIMIT $${idx}`,
    [...values, limit],
  );
  let rows = result.rows.map(toPublic);
  if (options.currentUserId) {
    rows = rows.filter(
      (m) => m.scope !== "USER" || m.scopeUserId === options.currentUserId || m.scopeUserId == null,
    );
  }
  return rows;
}

/**
 * Relevance-scored retrieval for adaptive context (§7). Returns ACTIVE + high-confidence
 * memories most relevant to the task, without dumping the entire history.
 */
export async function retrieveRelevantMemories(
  workspaceId: string,
  taskContext: { query?: string; channel?: string; contentType?: string; currentUserId?: string },
  options: { limit?: number; minConfidence?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 30);
  const minConf = options.minConfidence ?? 0.35;

  const queryText = (taskContext.query ?? `${taskContext.channel ?? ""} ${taskContext.contentType ?? ""}`).trim();
  const tokens = queryText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

  // Fetch broader ACTIVE set then rank in JS (avoids pg extension dependency for now)
  const result = await query<MemoryRow & { rank_score?: number }>(
    `SELECT ${MEMORY_COLUMNS}
       FROM brand_learning_memories
      WHERE workspace_id = $1
        AND status = 'ACTIVE'
        AND confidence >= $2
      ORDER BY confidence DESC, evidence_count DESC, updated_at DESC
      LIMIT 80`,
    [workspaceId, minConf],
  );

  let memories = result.rows.map(toPublic);

  // Scope filtering for USER memories
  if (taskContext.currentUserId) {
    memories = memories.filter(
      (m) => m.scope !== "USER" || m.scopeUserId === taskContext.currentUserId,
    );
  } else {
    // If no user context, exclude USER-scoped entirely (private)
    memories = memories.filter((m) => m.scope !== "USER");
  }

  if (!tokens.length) return memories.slice(0, limit);

  // Relevance boost by token overlap with subject + learned_value
  const scored = memories
    .map((m) => {
      const hay = `${m.subject} ${typeof m.learnedValue === "string" ? m.learnedValue : JSON.stringify(m.learnedValue)}`.toLowerCase();
      let hits = 0;
      for (const tok of tokens) if (hay.includes(tok)) hits += 1;
      const relevance = hits / Math.max(tokens.length, 1); // 0..1
      // Combine relevance with confidence (confidence-weighted relevance)
      const score = m.confidence * 0.6 + relevance * 0.4;
      return { memory: m, score, hits };
    })
    .sort((a, b) => b.score - a.score);

  // Always keep at least the top confidence ones even if no token match
  return scored.slice(0, limit).map((s) => s.memory);
}

export async function updateMemory(
  workspaceId: string,
  memoryId: string,
  patch: {
    subject?: string;
    learnedValue?: unknown;
    confidence?: number;
    evidenceCount?: number;
    addSourceEventIds?: string[];
    lastValidatedAt?: string;
  },
  changedByUserId?: string | null,
  note?: string,
) {
  const current = await getMemory(workspaceId, memoryId);
  if (!current) throw new RangeError("Learning memory not found.");
  const prevSnapshot = current;

  const nextSubject = patch.subject?.trim() ?? current.subject;
  const nextValue = patch.learnedValue !== undefined ? patch.learnedValue : current.learnedValue;
  const nextConfidence = patch.confidence !== undefined ? Math.max(0.05, Math.min(0.99, patch.confidence)) : current.confidence;
  const addIds = patch.addSourceEventIds ?? [];
  const mergedIds = [...new Set([...current.sourceEventIds, ...addIds])];

  const result = await query<MemoryRow>(
    `UPDATE brand_learning_memories
        SET subject = $3,
            learned_value = $4::jsonb,
            confidence = $5,
            evidence_count = $6,
            source_event_ids = $7,
            last_observed_at = NOW(),
            last_validated_at = COALESCE($8::timestamptz, last_validated_at),
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING ${MEMORY_COLUMNS}`,
    [
      memoryId,
      workspaceId,
      nextSubject.slice(0, 240),
      JSON.stringify(nextValue),
      nextConfidence,
      patch.evidenceCount ?? mergedIds.length ?? current.evidenceCount,
      mergedIds,
      patch.lastValidatedAt ?? null,
    ],
  );
  const updated = toPublic(result.rows[0]);
  await insertVersion(updated, note ?? "Updated", changedByUserId ?? null, prevSnapshot);
  return updated;
}

export async function setMemoryStatus(
  workspaceId: string,
  memoryId: string,
  status: LearningStatus,
  changedByUserId?: string | null,
  note?: string,
) {
  const current = await getMemory(workspaceId, memoryId);
  if (!current) throw new RangeError("Learning memory not found.");
  const result = await query<MemoryRow>(
    `UPDATE brand_learning_memories
        SET status = $3,
            last_validated_at = CASE WHEN $3 IN ('ACTIVE','SUPERSEDED','REJECTED') THEN NOW() ELSE last_validated_at END,
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING ${MEMORY_COLUMNS}`,
    [memoryId, workspaceId, status],
  );
  const updated = toPublic(result.rows[0]);
  await insertVersion(updated, note ?? `Status -> ${status}`, changedByUserId ?? null, current);
  return updated;
}

export async function supersedeMemory(
  workspaceId: string,
  oldMemoryId: string,
  newMemoryId: string,
  changedByUserId?: string | null,
) {
  await setMemoryStatus(workspaceId, oldMemoryId, "SUPERSEDED", changedByUserId, `Superseded by ${newMemoryId.slice(0, 8)}`);
}

/**
 * Promote a CANDIDATE/NEEDS_REVIEW memory to ACTIVE (explicit approval).
 * Resets confidence to max(explicit bump, current) and stamps validation.
 */
export async function promoteMemory(
  workspaceId: string,
  memoryId: string,
  promotedByUserId?: string | null,
  explicitConfidence?: number,
) {
  const current = await getMemory(workspaceId, memoryId);
  if (!current) throw new RangeError("Learning memory not found.");
  const bumped = explicitConfidence != null ? Math.max(current.confidence, Math.min(0.99, explicitConfidence)) : Math.max(current.confidence, 0.82);
  const result = await query<MemoryRow>(
    `UPDATE brand_learning_memories
        SET status = 'ACTIVE',
            confidence = $3,
            last_validated_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING ${MEMORY_COLUMNS}`,
    [memoryId, workspaceId, bumped],
  );
  const updated = toPublic(result.rows[0]);
  await insertVersion(updated, "Promoted to ACTIVE", promotedByUserId ?? null, current);
  return updated;
}

// ------------------------------------------------------------------
// Versioning
// ------------------------------------------------------------------
type VersionRow = {
  id: string;
  memory_id: string;
  workspace_id: string;
  organization_id: string;
  version: number;
  snapshot: unknown;
  change_note: string;
  changed_by_user_id: string | null;
  created_at: Date | string;
};

async function insertVersion(
  memory: BrandLearningMemory,
  note: string,
  changedByUserId: string | null,
  previous?: BrandLearningMemory | null,
) {
  await transaction(async (client) => {
    const maxRes = await client.query<{ max: string | null }>(
      `SELECT MAX(version)::text AS max FROM brand_learning_memory_versions WHERE memory_id = $1`,
      [memory.id],
    );
    const nextVersion = Number(maxRes.rows[0]?.max ?? 0) + 1;
    const snapshot = {
      ...memory,
      previousStatus: previous?.status ?? null,
      changeNote: note,
    };
    await client.query(
      `INSERT INTO brand_learning_memory_versions
         (memory_id, workspace_id, organization_id, version, snapshot, change_note, changed_by_user_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [memory.id, memory.workspaceId, memory.organizationId, nextVersion, JSON.stringify(snapshot), note.slice(0, 500), changedByUserId],
    );
  });
}

export async function listMemoryVersions(workspaceId: string, memoryId: string) {
  const result = await query<VersionRow>(
    `SELECT id, memory_id, workspace_id, organization_id, version, snapshot, change_note, changed_by_user_id, created_at
       FROM brand_learning_memory_versions
      WHERE workspace_id = $1 AND memory_id = $2
      ORDER BY version DESC`,
    [workspaceId, memoryId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    memoryId: r.memory_id,
    workspaceId: r.workspace_id,
    organizationId: r.organization_id,
    version: r.version,
    snapshot: r.snapshot,
    changeNote: r.change_note,
    changedByUserId: r.changed_by_user_id,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function listMemoryHistory(workspaceId: string, options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 80, 1), 500);
  const result = await query<VersionRow>(
    `SELECT id, memory_id, workspace_id, organization_id, version, snapshot, change_note, changed_by_user_id, created_at
       FROM brand_learning_memory_versions
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, limit],
  );
  return result.rows.map((r) => ({
    id: r.id,
    memoryId: r.memory_id,
    workspaceId: r.workspace_id,
    organizationId: r.organization_id,
    version: r.version,
    snapshot: r.snapshot as BrandLearningMemory & { changeNote?: string; previousStatus?: string },
    changeNote: r.change_note,
    changedByUserId: r.changed_by_user_id,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export function memoryToInsightTitle(memory: BrandLearningMemory): string {
  const v = typeof memory.learnedValue === "string" ? memory.learnedValue : JSON.stringify(memory.learnedValue);
  const clipped = v.slice(0, 120);
  // Category-aware prefix
  switch (memory.category) {
    case "USER_PREFERENCE":
      return `Your preferred ${memory.subject.toLowerCase()} is "${clipped}"`;
    case "BRAND_KNOWLEDGE":
      return `${memory.subject}: ${clipped}`;
    case "STRATEGIC_LEARNING":
      return `Strategy — ${memory.subject}: ${clipped}`;
    case "PERFORMANCE_LEARNING":
      return `Performance insight — ${memory.subject}: ${clipped}`;
    case "OPERATIONAL_LEARNING":
      return `Workflow preference — ${memory.subject}: ${clipped}`;
    default:
      return `${memory.subject}: ${clipped}`;
  }
}
