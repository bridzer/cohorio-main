import { query, transaction } from "@/lib/database";
import {
  getMarketingContext,
  saveMarketingContextSection,
} from "@/lib/marketing-context-repository";
import { isContextSectionId } from "@/lib/marketing-context";

/**
 * Brand Brain trust layer (Milestone 3). Values live in
 * product_marketing_contexts; this module tracks where each field came from,
 * how confident we are, and whether a human approved it — plus snapshots.
 */

export const PROVENANCE_STATUSES = [
  "VERIFIED",
  "USER_CONFIRMED",
  "AI_INFERRED",
  "NEEDS_REVIEW",
  "UNKNOWN",
] as const;

export type ProvenanceStatus = (typeof PROVENANCE_STATUSES)[number];

export const SOURCE_TYPES = [
  "user_input",
  "website",
  "document",
  "integration",
  "ai_inference",
  "system",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export type Confidence = "high" | "medium" | "low";

export type ProvenanceEntry = {
  section: string;
  field: string;
  source: string;
  sourceType: SourceType;
  confidence: Confidence;
  status: ProvenanceStatus;
  proposedValue: string | null;
  updatedAt: string;
};

type ProvenanceRow = {
  section: string;
  field: string;
  source: string;
  source_type: string;
  confidence: string;
  status: string;
  proposed_value: string | null;
  updated_at: Date | string;
};

function asSourceType(value: string): SourceType {
  return (SOURCE_TYPES as readonly string[]).includes(value)
    ? (value as SourceType)
    : "system";
}

function asStatus(value: string): ProvenanceStatus {
  return (PROVENANCE_STATUSES as readonly string[]).includes(value)
    ? (value as ProvenanceStatus)
    : "UNKNOWN";
}

function asConfidence(value: string): Confidence {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function publicEntry(row: ProvenanceRow): ProvenanceEntry {
  return {
    section: row.section,
    field: row.field,
    source: row.source,
    sourceType: asSourceType(row.source_type),
    confidence: asConfidence(row.confidence),
    status: asStatus(row.status),
    proposedValue: row.proposed_value,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const COLUMNS = `section, field, source, source_type, confidence,
  status, proposed_value, updated_at`;

export async function getProvenance(workspaceId: string) {
  const result = await query<ProvenanceRow>(
    `SELECT ${COLUMNS} FROM brand_brain_provenance WHERE workspace_id = $1`,
    [workspaceId],
  );
  const entries: Record<string, ProvenanceEntry> = {};
  for (const row of result.rows) {
    entries[`${row.section}.${row.field}`] = publicEntry(row);
  }
  return entries;
}

/** Stamp user-typed fields as confirmed (called after context saves). */
export async function markFieldsUserConfirmed(
  workspaceId: string,
  sectionId: string,
  fieldIds: string[],
  source = "user",
) {
  const fields = [...new Set(fieldIds.map((field) => field.trim()).filter(Boolean))];
  if (!fields.length) return;
  await query(
    `INSERT INTO brand_brain_provenance (
       workspace_id, section, field, source, source_type,
       confidence, status, proposed_value, updated_at
     )
     SELECT $1, $2, pending.field, $4, 'user_input', 'high', 'USER_CONFIRMED', NULL, NOW()
       FROM unnest($3::text[]) AS pending(field)
     ON CONFLICT (workspace_id, section, field) DO UPDATE SET
       source = EXCLUDED.source,
       source_type = 'user_input',
       confidence = 'high',
       status = 'USER_CONFIRMED',
       proposed_value = NULL,
       updated_at = NOW()`,
    [workspaceId, sectionId, fields, source],
  );
}

export type ProposalInput = {
  section: string;
  field: string;
  value: string;
  source: string;
  sourceType: SourceType;
  confidence: Confidence;
};

/**
 * Queue evidence-backed proposals. Never overwrites human-confirmed or
 * verified rows; identical pending proposals are skipped. Returns counts so
 * callers can report honestly what happened.
 */
export async function proposeItems(
  workspaceId: string,
  items: ProposalInput[],
) {
  const cleaned = items
    .map((item) => ({
      section: item.section.trim(),
      field: item.field.trim(),
      value: item.value.trim(),
      source: item.source.trim() || "system",
      sourceType: item.sourceType,
      confidence: item.confidence,
    }))
    .filter((item) => item.section && item.field && item.value);
  if (!cleaned.length) return { proposed: 0, skipped: items.length };

  const existing = await getProvenance(workspaceId);
  const candidates = cleaned.filter((item) => {
    const current = existing[`${item.section}.${item.field}`];
    if (!current) return true;
    if (current.status === "USER_CONFIRMED" || current.status === "VERIFIED") {
      return false;
    }
    if (current.status === "NEEDS_REVIEW" && current.proposedValue === item.value) {
      return false;
    }
    return true;
  });
  const skipped = items.length - candidates.length;
  if (!candidates.length) return { proposed: 0, skipped };

  const result = await query(
    `INSERT INTO brand_brain_provenance (
       workspace_id, section, field, source, source_type,
       confidence, status, proposed_value, updated_at
     )
     SELECT $1, section, field, source, source_type, confidence,
            'NEEDS_REVIEW', proposed_value, NOW()
       FROM unnest(
         $2::text[], $3::text[], $4::text[], $5::text[],
         $6::text[], $7::text[]
       ) AS proposal(section, field, proposed_value, source, source_type, confidence)
     ON CONFLICT (workspace_id, section, field) DO UPDATE SET
       source = EXCLUDED.source,
       source_type = EXCLUDED.source_type,
       confidence = EXCLUDED.confidence,
       status = 'NEEDS_REVIEW',
       proposed_value = EXCLUDED.proposed_value,
       updated_at = NOW()
     WHERE brand_brain_provenance.status NOT IN ('USER_CONFIRMED', 'VERIFIED')`,
    [
      workspaceId,
      candidates.map((item) => item.section),
      candidates.map((item) => item.field),
      candidates.map((item) => item.value),
      candidates.map((item) => item.source),
      candidates.map((item) => item.sourceType),
      candidates.map((item) => item.confidence),
    ],
  );
  const proposed = result.rowCount ?? 0;
  return { proposed, skipped: skipped + (candidates.length - proposed) };
}

/** Approve a pending proposal (optionally with an edited value). Writes the
 *  value into the section, then stamps it human-confirmed. */
export async function approveProposal(
  workspaceId: string,
  section: string,
  field: string,
  editedValue?: string,
) {
  const existing = await getProvenance(workspaceId);
  const current = existing[`${section}.${field}`];
  if (!current || current.status !== "NEEDS_REVIEW") {
    throw new RangeError("That suggestion is no longer pending review.");
  }
  const value = (editedValue ?? current.proposedValue ?? "").trim();
  if (!value) {
    throw new RangeError("An approved value cannot be empty.");
  }
  if (!isContextSectionId(section)) {
    throw new RangeError("Unknown Brand Brain section.");
  }
  const stored = await getMarketingContext(workspaceId);
  const merged = { ...((stored?.sections[section] ?? {}) as Record<string, unknown>), [field]: value };
  await saveMarketingContextSection(
    workspaceId,
    section,
    merged as Record<string, string>,
  );
  await markFieldsUserConfirmed(workspaceId, section, [field], current.source);
  return { section, field, value };
}

/** Reject a pending proposal. The value was never confirmed, so the row goes. */
export async function rejectProposal(workspaceId: string, section: string, field: string) {
  const result = await query(
    `DELETE FROM brand_brain_provenance
      WHERE workspace_id = $1 AND section = $2 AND field = $3
        AND status = 'NEEDS_REVIEW'`,
    [workspaceId, section, field],
  );
  return (result.rowCount ?? 0) > 0;
}

export type BrainVersion = {
  id: string;
  version: number;
  note: string;
  createdAt: string;
};

const VERSION_KEEP = 20;

async function insertVersion(
  workspaceId: string,
  snapshot: unknown,
  note: string,
): Promise<BrainVersion> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await transaction(async (client) => {
        const maxResult = await client.query<{ max: string | null }>(
          `SELECT MAX(version) AS max FROM brand_brain_versions WHERE workspace_id = $1`,
          [workspaceId],
        );
        const version = Number(maxResult.rows[0]?.max ?? 0) + 1;
        const inserted = await client.query<{
          id: string;
          version: number;
          note: string;
          created_at: Date | string;
        }>(
          `INSERT INTO brand_brain_versions (workspace_id, version, snapshot, note)
           VALUES ($1, $2, $3::jsonb, $4)
           RETURNING id, version, note, created_at`,
          [workspaceId, version, JSON.stringify(snapshot ?? {}), note.slice(0, 500)],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Unable to save version.");
        await client.query(
          `DELETE FROM brand_brain_versions
            WHERE workspace_id = $1
              AND id NOT IN (
                SELECT id FROM brand_brain_versions
                 WHERE workspace_id = $1
                 ORDER BY version DESC
                 LIMIT ${VERSION_KEEP}
              )`,
          [workspaceId],
        );
        return {
          id: row.id,
          version: row.version,
          note: row.note,
          createdAt: new Date(row.created_at).toISOString(),
        };
      });
    } catch (error) {
      const conflict =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "23505";
      if (conflict && attempt === 0) continue;
      throw error;
    }
  }
  throw new Error("Unable to save version.");
}

export async function snapshotVersion(workspaceId: string, note: string) {
  const stored = await getMarketingContext(workspaceId);
  return insertVersion(workspaceId, stored?.sections ?? {}, note || "Manual snapshot");
}

export async function listVersions(workspaceId: string) {
  const result = await query<{ id: string; version: number; note: string; created_at: Date | string }>(
    `SELECT id, version, note, created_at FROM brand_brain_versions
      WHERE workspace_id = $1
      ORDER BY version DESC`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    version: row.version,
    note: row.note,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Restore sections from a version. Takes a safety snapshot first; provenance
 * is intentionally left untouched (a restore reverts values, not their
 * approval history — recorded in the snapshot notes).
 */
export async function restoreVersion(workspaceId: string, version: number) {
  const found = await query<{ snapshot: unknown }>(
    `SELECT snapshot FROM brand_brain_versions
      WHERE workspace_id = $1 AND version = $2`,
    [workspaceId, version],
  );
  const snapshot = found.rows[0]?.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    throw new RangeError("That version does not exist.");
  }
  await snapshotVersion(workspaceId, `Before restoring version ${version}`);
  await query(
    `INSERT INTO product_marketing_contexts (workspace_id, sections, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET
       sections = EXCLUDED.sections,
       updated_at = NOW()`,
    [workspaceId, JSON.stringify(snapshot)],
  );
  return { version };
}
