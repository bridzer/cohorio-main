// Events: capture, dedup, persistence, audit trail
import { createHash } from "node:crypto";
import { query } from "@/lib/database";
import type { BrandLearningEvent, CaptureLearningEventInput, LearningEventType } from "./types";
import { isLearningEventType } from "./types";

type EventRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  user_id: string | null;
  event_type: string;
  source_module: string;
  entity_type: string | null;
  entity_id: string | null;
  original_value: unknown | null;
  resulting_value: unknown | null;
  feedback_action: string | null;
  feedback_rating: number | null;
  feedback_reason: string | null;
  feedback_comment: string | null;
  context: Record<string, unknown> | null;
  dedup_hash: string;
  created_at: Date | string;
};

function toPublic(row: EventRow): BrandLearningEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    eventType: row.event_type as LearningEventType,
    sourceModule: row.source_module,
    entityType: row.entity_type,
    entityId: row.entity_id,
    originalValue: row.original_value ?? undefined,
    resultingValue: row.resulting_value ?? undefined,
    feedback: {
      action: row.feedback_action ?? undefined,
      rating: row.feedback_rating ?? undefined,
      reason: row.feedback_reason ?? undefined,
      comment: row.feedback_comment ?? undefined,
    },
    context: (row.context ?? {}) as Record<string, unknown>,
    dedupHash: row.dedup_hash,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function truncateValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > 8_000) {
    return value.slice(0, 8_000) + "…[truncated]";
  }
  if (value !== null && typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      if (json.length > 8_000) {
        // Store a compact pointer instead of the full doc
        return { _truncated: true, _preview: json.slice(0, 7_000) + "…[truncated]" };
      }
    } catch {
      // non-serializable
      return { _unserializable: true };
    }
  }
  return value;
}

export function buildDedupHash(input: {
  workspaceId: string;
  userId?: string | null;
  eventType: string;
  sourceModule: string;
  entityType?: string | null;
  entityId?: string | null;
  dedupKey?: string;
  // include a 1-minute bucket so repeated clicks dedup but genuine re-edits don't
  createdAtBucket?: string;
}): string {
  const normalized = {
    workspaceId: input.workspaceId,
    userId: input.userId ?? "",
    eventType: input.eventType,
    sourceModule: input.sourceModule,
    entityType: input.entityType ?? "",
    entityId: input.entityId ?? "",
    dedupKey: input.dedupKey ?? "",
    bucket: input.createdAtBucket ?? new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:MM
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 32);
}

export function validateCaptureInput(input: CaptureLearningEventInput): string | null {
  if (!isLearningEventType(input.eventType)) return `Unknown eventType: ${String(input.eventType)}`;
  if (!input.sourceModule?.trim()) return "sourceModule is required.";
  if (input.sourceModule.length > 120) return "sourceModule too long.";
  if (input.feedback?.rating != null && (input.feedback.rating < 1 || input.feedback.rating > 5))
    return "feedback.rating must be 1-5.";
  return null;
}

export async function captureEvent(input: {
  organizationId: string;
  workspaceId: string;
  userId?: string | null;
  data: CaptureLearningEventInput;
}): Promise<BrandLearningEvent> {
  const error = validateCaptureInput(input.data);
  if (error) throw new RangeError(error);

  const dedupHash = buildDedupHash({
    workspaceId: input.workspaceId,
    userId: input.userId ?? null,
    eventType: input.data.eventType,
    sourceModule: input.data.sourceModule,
    entityType: input.data.entityType ?? null,
    entityId: input.data.entityId ?? null,
    dedupKey: input.data.dedupKey,
  });

  // Idempotent insert: ON CONFLICT (workspace_id, dedup_hash) DO NOTHING returns nothing,
  // so we then SELECT the existing row.
  const inserted = await query<EventRow>(
    `INSERT INTO brand_learning_events (
       organization_id, workspace_id, user_id, event_type, source_module,
       entity_type, entity_id, original_value, resulting_value,
       feedback_action, feedback_rating, feedback_reason, feedback_comment,
       context, dedup_hash
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8::jsonb,$9::jsonb,
       $10,$11,$12,$13,
       $14::jsonb,$15
     )
     ON CONFLICT (workspace_id, dedup_hash) DO NOTHING
     RETURNING id, organization_id, workspace_id, user_id, event_type, source_module,
               entity_type, entity_id, original_value, resulting_value,
               feedback_action, feedback_rating, feedback_reason, feedback_comment,
               context, dedup_hash, created_at`,
    [
      input.organizationId,
      input.workspaceId,
      input.userId ?? null,
      input.data.eventType,
      input.data.sourceModule.trim(),
      input.data.entityType ?? null,
      input.data.entityId ?? null,
      JSON.stringify(truncateValue(input.data.originalValue) ?? null),
      JSON.stringify(truncateValue(input.data.resultingValue) ?? null),
      input.data.feedback?.action ?? null,
      input.data.feedback?.rating ?? null,
      input.data.feedback?.reason ?? null,
      input.data.feedback?.comment ?? null,
      JSON.stringify((input.data.context ?? {}) as Record<string, unknown>),
      dedupHash,
    ],
  );
  if (inserted.rows[0]) return toPublic(inserted.rows[0]);

  const existing = await query<EventRow>(
    `SELECT id, organization_id, workspace_id, user_id, event_type, source_module,
            entity_type, entity_id, original_value, resulting_value,
            feedback_action, feedback_rating, feedback_reason, feedback_comment,
            context, dedup_hash, created_at
       FROM brand_learning_events
      WHERE workspace_id = $1 AND dedup_hash = $2`,
    [input.workspaceId, dedupHash],
  );
  if (!existing.rows[0]) throw new Error("Unable to capture learning event.");
  return toPublic(existing.rows[0]);
}

export async function getEvent(workspaceId: string, eventId: string) {
  const result = await query<EventRow>(
    `SELECT id, organization_id, workspace_id, user_id, event_type, source_module,
            entity_type, entity_id, original_value, resulting_value,
            feedback_action, feedback_rating, feedback_reason, feedback_comment,
            context, dedup_hash, created_at
       FROM brand_learning_events
      WHERE id = $1 AND workspace_id = $2`,
    [eventId, workspaceId],
  );
  return result.rows[0] ? toPublic(result.rows[0]) : null;
}

export async function listEvents(
  workspaceId: string,
  options: {
    limit?: number;
    before?: string; // cursor = created_at ISO of last row
    eventType?: string;
    sourceModule?: string;
    userId?: string;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const clauses: string[] = ["workspace_id = $1"];
  const values: unknown[] = [workspaceId];
  let paramIndex = 2;

  if (options.before) {
    clauses.push(`created_at < $${paramIndex++}`);
    values.push(new Date(options.before));
  }
  if (options.eventType) {
    clauses.push(`event_type = $${paramIndex++}`);
    values.push(options.eventType);
  }
  if (options.sourceModule) {
    clauses.push(`source_module = $${paramIndex++}`);
    values.push(options.sourceModule);
  }
  if (options.userId) {
    clauses.push(`user_id = $${paramIndex++}`);
    values.push(options.userId);
  }

  const result = await query<EventRow>(
    `SELECT id, organization_id, workspace_id, user_id, event_type, source_module,
            entity_type, entity_id, original_value, resulting_value,
            feedback_action, feedback_rating, feedback_reason, feedback_comment,
            context, dedup_hash, created_at
       FROM brand_learning_events
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}`,
    [...values, limit],
  );
  return result.rows.map(toPublic);
}

export async function countEvents(workspaceId: string) {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM brand_learning_events WHERE workspace_id = $1`,
    [workspaceId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
