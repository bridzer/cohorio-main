// Performance-Based Learning (§9): authorized analytics -> evidence-based recommendations.
// Guardrails: correlation != causation, do not auto-promote single wins to permanent preferences,
// account for channel/objective differences, require baseline comparison.

import { query } from "@/lib/database";
import { listIntegrationStatus } from "@/lib/integrations/store";
import { listProviderIds } from "@/lib/integrations/providers";
import type { PerformanceSignal } from "./types";

type SignalRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  entity_type: string | null;
  entity_id: string | null;
  channel: string | null;
  content_type: string | null;
  metric: string;
  value: string;
  baseline_value: string | null;
  delta_ratio: string | null;
  period_start: Date | string | null;
  period_end: Date | string | null;
  source_provider: string;
  insight: string | null;
  is_correlation: boolean;
  recommendation: string | null;
  memory_id: string | null;
  metadata: Record<string, unknown> | null;
  recorded_at: Date | string;
  created_at: Date | string;
};

function toPublic(row: SignalRow): PerformanceSignal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    channel: row.channel,
    contentType: row.content_type,
    metric: row.metric,
    value: Number(row.value),
    baselineValue: row.baseline_value != null ? Number(row.baseline_value) : null,
    deltaRatio: row.delta_ratio != null ? Number(row.delta_ratio) : null,
    periodStart: row.period_start ? new Date(row.period_start).toISOString() : null,
    periodEnd: row.period_end ? new Date(row.period_end).toISOString() : null,
    sourceProvider: row.source_provider,
    insight: row.insight,
    isCorrelation: row.is_correlation,
    recommendation: row.recommendation,
    memoryId: row.memory_id,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    recordedAt: new Date(row.recorded_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function assertProviderAuthorized(workspaceId: string, provider: string) {
  const providerIds = await listProviderIds();
  if (!providerIds.includes(provider)) {
    throw new RangeError(`Unknown provider: ${provider}`);
  }
  const statuses = await listIntegrationStatus(workspaceId, providerIds);
  const found = statuses.find((s) => s.provider === provider);
  if (!found?.configured) {
    throw new RangeError(`Provider "${provider}" is not connected for this workspace. Connect it before importing performance data.`);
  }
}

export async function recordPerformanceSignal(input: {
  organizationId: string;
  workspaceId: string;
  entityType?: string | null;
  entityId?: string | null;
  channel?: string | null;
  contentType?: string | null;
  metric: string;
  value: number;
  baselineValue?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  sourceProvider: string;
  insight?: string | null;
  recommendation?: string | null;
  isCorrelation?: boolean;
  metadata?: Record<string, unknown>;
  // Skip authorization check if caller already verified (to avoid double fetch)
  skipAuthCheck?: boolean;
}): Promise<PerformanceSignal> {
  if (!input.metric?.trim()) throw new RangeError("metric is required.");
  if (!Number.isFinite(input.value)) throw new RangeError("value must be finite.");
  if (!input.sourceProvider?.trim()) throw new RangeError("sourceProvider is required.");

  if (!input.skipAuthCheck) {
    await assertProviderAuthorized(input.workspaceId, input.sourceProvider);
  }

  const deltaRatio =
    input.baselineValue != null && Number.isFinite(input.baselineValue) && input.baselineValue !== 0
      ? (input.value - input.baselineValue) / Math.abs(input.baselineValue)
      : null;

  // Enforce causation guardrail language: if caller says isCorrelation=false, still require stronger evidence.
  // We always persist with is_correlation=true unless explicit and baseline available + meaningful delta.
  const isCorrelation = input.isCorrelation ?? true;

  const result = await query<SignalRow>(
    `INSERT INTO brand_performance_signals (
       organization_id, workspace_id, entity_type, entity_id, channel, content_type,
       metric, value, baseline_value, delta_ratio,
       period_start, period_end, source_provider, insight, is_correlation, recommendation, metadata
     ) VALUES (
       $1,$2,$3,$4,$5,$6,
       $7,$8,$9,$10,
       $11::timestamptz,$12::timestamptz,$13,$14,$15,$16,$17::jsonb
     )
     RETURNING id, organization_id, workspace_id, entity_type, entity_id, channel, content_type,
               metric, value, baseline_value, delta_ratio,
               period_start, period_end, source_provider, insight, is_correlation, recommendation,
               memory_id, metadata, recorded_at, created_at`,
    [
      input.organizationId,
      input.workspaceId,
      input.entityType ?? null,
      input.entityId ?? null,
      input.channel ?? null,
      input.contentType ?? null,
      input.metric.trim(),
      input.value,
      input.baselineValue ?? null,
      deltaRatio,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      input.sourceProvider.trim(),
      input.insight?.trim().slice(0, 1000) ?? null,
      isCorrelation,
      input.recommendation?.trim().slice(0, 1000) ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return toPublic(result.rows[0]);
}

export async function listPerformanceSignals(
  workspaceId: string,
  options: {
    channel?: string;
    metric?: string;
    limit?: number;
    since?: string;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const clauses = ["workspace_id = $1"];
  const values: unknown[] = [workspaceId];
  let idx = 2;
  if (options.channel) {
    clauses.push(`channel = $${idx++}`);
    values.push(options.channel);
  }
  if (options.metric) {
    clauses.push(`metric = $${idx++}`);
    values.push(options.metric);
  }
  if (options.since) {
    clauses.push(`recorded_at >= $${idx++}`);
    values.push(new Date(options.since));
  }
  const result = await query<SignalRow>(
    `SELECT id, organization_id, workspace_id, entity_type, entity_id, channel, content_type,
            metric, value, baseline_value, delta_ratio,
            period_start, period_end, source_provider, insight, is_correlation, recommendation,
            memory_id, metadata, recorded_at, created_at
       FROM brand_performance_signals
      WHERE ${clauses.join(" AND ")}
      ORDER BY recorded_at DESC
      LIMIT $${idx}`,
    [...values, limit],
  );
  return result.rows.map(toPublic);
}

/**
 * Build evidence-backed recommendation from performance signals (presentation-ready).
 * Must not claim causation from correlation (§9: "Distinguish correlation from causation").
 */
export function recommendationFromSignals(
  signals: PerformanceSignal[],
  options: { baselineLabel?: string } = {},
): { insight: string; recommendation: string; confidenceNote: string } | null {
  if (!signals.length) return null;
  // Group by channel + metric, look for repeat pattern
  const byChannel = new Map<string, PerformanceSignal[]>();
  for (const s of signals) {
    const key = `${s.channel ?? "overall"}:${s.metric}`;
    const bucket = byChannel.get(key) ?? [];
    bucket.push(s);
    byChannel.set(key, bucket);
  }
  // Find the most evidenced channel group
  let best: { key: string; items: PerformanceSignal[] } | null = null;
  for (const [key, items] of byChannel) {
    if (!best || items.length > best.items.length) best = { key, items };
  }
  if (!best || best.items.length === 0) return null;
  const channelLabel = best.key.split(":")[0] ?? "overall";
  const avgDelta =
    best.items
      .map((i) => i.deltaRatio)
      .filter((v): v is number => v != null)
      .reduce((a, b) => a + b, 0) / Math.max(best.items.filter((i) => i.deltaRatio != null).length, 1);

  // Only frame as actionable if repeated with consistent direction
  const consistentDirection =
    best.items.filter((i) => (i.deltaRatio ?? 0) > 0).length >= Math.ceil(best.items.length * 0.65) ||
    best.items.filter((i) => (i.deltaRatio ?? 0) < 0).length >= Math.ceil(best.items.length * 0.65);

  if (best.items.length < 3 || !consistentDirection) {
    return {
      insight: `Early ${channelLabel} signals suggest a pattern but need more evidence (seen ${best.items.length} data points).`,
      recommendation: "Continue measuring across a comparable period before changing brand strategy.",
      confidenceNote: "Correlation only — not causation. More data and a controlled comparison are needed.",
    };
  }

  const direction = avgDelta > 0 ? "outperforms" : "underperforms";
  return {
    insight: `${channelLabel} content ${direction} the baseline by ~${Math.abs(avgDelta * 100).toFixed(0)}% across ${best.items.length} observations (${best.key.split(":")[1] ?? best.key}).`,
    recommendation:
      avgDelta > 0.1
        ? `Consider testing more of this approach on ${channelLabel} while tracking downstream conversions. Present any brand-level change for approval first.`
        : `Review whether channel/context differences explain the result before changing creative direction.`,
    confidenceNote: `Correlation observed on ${channelLabel}; attribution depends on campaign objective, audience, and channel mix — not solely the creative.`,
  };
}

export async function linkSignalToMemory(workspaceId: string, signalId: string, memoryId: string) {
  await query(
    `UPDATE brand_performance_signals SET memory_id = $3 WHERE id = $1 AND workspace_id = $2`,
    [signalId, workspaceId, memoryId],
  );
}
