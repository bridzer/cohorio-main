// Unified BrandBrainLearningService (prompt §13) — orchestrates Observe->Improve.
// Cohorio Intelligence powers the processing; Brand Brain owns the persistent knowledge.
// Keeps processing asynchronous where expensive (interpretation, aggregation).

import { query } from "@/lib/database";
import type {
  BrandLearningEvent,
  BrandLearningMemory,
  CaptureLearningEventInput,
  LearningContext,
  LearningDecision,
  LearningInsight,
  LearningInterpretation,
  OutputEvaluation,
  OutputEvaluationInput,
  PerformanceSignal,
} from "./types";
import { captureEvent, getEvent, listEvents, countEvents } from "./events";
import { classifyCategory, detectChangeNature } from "./interpreter";
import { getInterpretationByEvent, interpretEvent, listInterpretations } from "./interpreter";
import {
  createMemory,
  getMemory,
  listMemories,
  listMemoryHistory,
  listMemoryVersions,
  memoryToInsightTitle,
  promoteMemory,
  retrieveRelevantMemories,
  setMemoryStatus,
  supersedeMemory,
  updateMemory,
} from "./memories";
import { buildAdaptiveContext } from "./context-engine";
import { evaluateOutput as evalOutput, isMeaningfulEdit, listOutputEvaluations } from "./evaluation";
import {
  linkSignalToMemory,
  listPerformanceSignals,
  recommendationFromSignals,
  recordPerformanceSignal,
} from "./performance";

export type LearningPipelineResult = {
  event: BrandLearningEvent;
  interpretation: LearningInterpretation;
  // If a memory was created (learn_immediately) or queued (candidate)
  memory?: BrandLearningMemory | null;
  conflictId?: string | null;
};

export type ScopeAwareCaptureInput = CaptureLearningEventInput & {
  dedupKey?: string;
};

export class BrandBrainLearningService {
  // -------------------------------------------------
  // Step 1-2: Observe -> Capture (idempotent)
  // -------------------------------------------------
  async captureEvent(
    input: { organizationId: string; workspaceId: string; userId?: string | null },
    data: ScopeAwareCaptureInput,
  ): Promise<BrandLearningEvent> {
    const event = await captureEvent({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      data,
    });
    // Fire-and-forget interpretation so callers are never blocked (§13: "Do not delay normal interactions")
    this.interpretEvent(event.id).catch((err) => {
      console.error("BrandBrainLearningService.interpretEvent background failed", err);
    });
    return event;
  }

  // -------------------------------------------------
  // Step 3-4: Interpret -> Evaluate
  // -------------------------------------------------
  /**
   * Interpret a single event: classify, score confidence, detect conflicts,
   * decide learning_action, persist interpretation. Idempotent by event_id.
   * When learning_action=learn_immediately and no conflict, may create a memory inline.
   * For candidate / conflict cases, memory stays pending review.
   */
  async interpretEvent(eventId: string): Promise<LearningInterpretation> {
    // Find the event (need org/ws ids) — scan is okay; events table indexed
    const anyWorkspace = await query<{
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
    }>(
      `SELECT id, organization_id, workspace_id, user_id, event_type, source_module,
              entity_type, entity_id, original_value, resulting_value,
              feedback_action, feedback_rating, feedback_reason, feedback_comment,
              context, dedup_hash, created_at
         FROM brand_learning_events WHERE id = $1`,
      [eventId],
    );
    const row = anyWorkspace.rows[0];
    if (!row) throw new RangeError("Learning event not found.");

    const event: BrandLearningEvent = {
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      eventType: row.event_type as BrandLearningEvent["eventType"],
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

    // Evidence: count recent similar events for repeated-pattern detection (§6.B)
    const evidence = await this.collectEvidenceForEvent(event);
    const interpretation = await interpretEvent({
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      event,
      evidence,
    });

    // Auto-materialize only when safe: learn_immediately + no open conflict
    if (interpretation.learningAction === "learn_immediately" && !interpretation.conflictsWith) {
      try {
        await this.materializeFromInterpretation(interpretation, event);
      } catch (err) {
        console.error("BrandBrain materialize failed for event", event.id, err);
      }
    }

    // If a conflict was detected, persist a brand_learning_conflicts OPEN row
    if (interpretation.conflictsWith && row.organization_id && row.workspace_id) {
      const conflictType = inferConflictType(interpretation.category);
      try {
        await query(
          `INSERT INTO brand_learning_conflicts (
             organization_id, workspace_id, interpretation_id, existing_value, incoming_value, conflict_type, status
           ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,'OPEN')
           ON CONFLICT DO NOTHING`,
          [
            row.organization_id,
            row.workspace_id,
            interpretation.id,
            JSON.stringify(interpretation.conflictsWith),
            JSON.stringify({
              subject: interpretation.category,
              incomingPreview: String(event.resultingValue ?? "").slice(0, 600),
            }),
            conflictType,
          ],
        );
      } catch (err) {
        console.error("BrandBrain conflict insert failed", err);
      }
    }

    return interpretation;
  }

  private async collectEvidenceForEvent(
    event: BrandLearningEvent,
  ): Promise<{ count: number; consistency: number; recencyScore: number; conflictingCount: number }> {
    const windowDays = 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const similar = await query<{ id: string; created_at: Date | string; resulting_value: unknown }>(
      `SELECT id, created_at, resulting_value
         FROM brand_learning_events
        WHERE workspace_id = $1
          AND source_module = $2
          AND event_type = $3
          AND created_at >= $4::timestamptz
        ORDER BY created_at DESC LIMIT 20`,
      [event.workspaceId, event.sourceModule, event.eventType, since],
    );
    if (similar.rows.length <= 1) {
      return { count: 1, consistency: 0.5, recencyScore: 0.8, conflictingCount: 0 };
    }
    // Consistency: how similar are resulting_values among supporting events?
    const values = similar.rows.map((r) => String(r.resulting_value ?? "")).filter(Boolean);
    let consistency = 0.5;
    if (values.length >= 2) {
      let hits = 0;
      const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
      const base = tokens(String(event.resultingValue ?? ""));
      if (base.size) {
        for (const v of values.slice(0, 5)) {
          if (v === String(event.resultingValue ?? "")) continue;
          const other = tokens(v);
          let common = 0;
          for (const t of base) if (other.has(t)) common += 1;
          hits += common / Math.max(base.size, 1);
        }
        consistency = Math.max(0.2, Math.min(0.95, hits / Math.max(values.length - 1, 1)));
      }
    }
    const recentCount = similar.rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 7 * 24 * 60 * 60 * 1000).length;
    const recencyScore = similar.rows.length ? recentCount / similar.rows.length : 0.5;
    return { count: similar.rows.length, consistency, recencyScore, conflictingCount: 0 };
  }

  private async materializeFromInterpretation(
    interpretation: LearningInterpretation,
    event: BrandLearningEvent,
  ): Promise<BrandLearningMemory | null> {
    // Deduplicate: if a memory with same subject+category already ACTIVE for this workspace, bump evidence instead
    const subject = buildSubject(interpretation, event);
    const category = mapCategoryToMemoryCategory(interpretation.category);
    const existing = await query<{ id: string }>(
      `SELECT id FROM brand_learning_memories
        WHERE workspace_id = $1 AND category = $2 AND subject = $3 AND status = 'ACTIVE'
        LIMIT 1`,
      [event.workspaceId, category, subject],
    );
    if (existing.rows[0]) {
      const current = await getMemory(event.workspaceId, existing.rows[0].id);
      if (current) {
        return updateMemory(
          event.workspaceId,
          current.id,
          {
            confidence: Math.min(0.99, current.confidence + 0.04),
            evidenceCount: current.evidenceCount + 1,
            addSourceEventIds: [event.id],
            lastValidatedAt: new Date().toISOString(),
          },
          undefined,
          `Evidence bump from event ${event.id.slice(0, 8)}`,
        );
      }
    }

    const learnedValue = event.resultingValue ?? event.feedback?.comment ?? event.feedback?.reason ?? interpretation.whatPreferredInstead;
    // TASK-scoped learnings are ephemeral: don't persist as long-term memory
    const scope = interpretation.isTaskSpecific ? "TASK" as const : "BRAND" as const;
    if (scope === "TASK") return null;

    return createMemory({
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      category,
      subject,
      learnedValue,
      sourceEventIds: [event.id],
      confidence: interpretation.confidence,
      scope,
      status: "ACTIVE",
    });
  }

  // -------------------------------------------------
  // Step 5: Learn — candidate creation (explicit / repeated signals)
  // -------------------------------------------------
  async createMemory(input: {
    organizationId: string;
    workspaceId: string;
    category: BrandLearningMemory["category"];
    subject: string;
    learnedValue: unknown;
    sourceEventIds: string[];
    confidence?: number;
    scope?: BrandLearningMemory["scope"];
    scopeUserId?: string | null;
    status?: BrandLearningMemory["status"];
  }): Promise<BrandLearningMemory> {
    return createMemory({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      category: input.category,
      subject: input.subject,
      learnedValue: input.learnedValue,
      sourceEventIds: input.sourceEventIds,
      confidence: input.confidence ?? 0.55,
      scope: input.scope ?? "BRAND",
      scopeUserId: input.scopeUserId ?? null,
      status: input.status,
    });
  }

  async promoteMemory(input: {
    workspaceId: string;
    memoryId: string;
    userId?: string | null;
    confidence?: number;
  }) {
    return promoteMemory(input.workspaceId, input.memoryId, input.userId ?? null, input.confidence);
  }

  async setMemoryStatus(input: {
    workspaceId: string;
    memoryId: string;
    status: BrandLearningMemory["status"];
    userId?: string | null;
    note?: string;
  }) {
    return setMemoryStatus(input.workspaceId, input.memoryId, input.status, input.userId ?? null, input.note);
  }

  // -------------------------------------------------
  // Retrieval: task-specific adaptive context
  // -------------------------------------------------
  async retrieveMemories(workspaceId: string, taskContext: LearningContext): Promise<BrandLearningMemory[]> {
    return retrieveRelevantMemories(workspaceId, taskContext, { limit: 10 });
  }

  async getAdaptiveContext(input: {
    workspaceId: string;
    organizationId: string;
    taskContext: LearningContext;
  }) {
    return buildAdaptiveContext({
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      taskContext: input.taskContext,
    });
  }

  // -------------------------------------------------
  // Step 7-9: Evaluate -> Learn (output diff -> candidate)
  // -------------------------------------------------
  async evaluateOutput(input: OutputEvaluationInput): Promise<OutputEvaluation> {
    return evalOutput(input);
  }

  async evaluateAndMaybeLearnFromEdit(input: {
    organizationId: string;
    workspaceId: string;
    userId?: string | null;
    sourceModule: string;
    entityType: string;
    entityId?: string | null;
    originalOutput: unknown;
    finalOutput: unknown;
    outputType: string;
  }): Promise<{ evaluation: OutputEvaluation; event?: BrandLearningEvent; interpretation?: LearningInterpretation }> {
    const evaluation = await evalOutput({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      outputType: input.outputType,
      originalOutput: input.originalOutput,
      finalOutput: input.finalOutput,
    });

    const origText = typeof input.originalOutput === "string" ? input.originalOutput : JSON.stringify(input.originalOutput ?? "");
    const finalText = typeof input.finalOutput === "string" ? input.finalOutput : JSON.stringify(input.finalOutput ?? "");
    if (!isMeaningfulEdit({ originalText: origText, finalText })) {
      return { evaluation };
    }

    const event = await this.captureEvent(
      { organizationId: input.organizationId, workspaceId: input.workspaceId, userId: input.userId ?? null },
      {
        eventType: "edited",
        sourceModule: input.sourceModule,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        originalValue: input.originalOutput,
        resultingValue: input.finalOutput,
        feedback: { action: "edited", reason: "User edited AI output" },
        context: { outputType: input.outputType, evaluationId: evaluation.id },
      },
    );
    const interpretation = await this.interpretEvent(event.id);
    return { evaluation, event, interpretation };
  }

  // -------------------------------------------------
  // Conflicts
  // -------------------------------------------------
  async listConflicts(workspaceId: string, status: string = "OPEN") {
    const result = await query<{
      id: string;
      organization_id: string;
      workspace_id: string;
      memory_id: string | null;
      interpretation_id: string | null;
      existing_value: unknown;
      incoming_value: unknown;
      conflict_type: string;
      status: string;
      resolved_by_user_id: string | null;
      resolved_at: Date | string | null;
      resolution_note: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT id, organization_id, workspace_id, memory_id, interpretation_id,
              existing_value, incoming_value, conflict_type, status,
              resolved_by_user_id, resolved_at, resolution_note, created_at, updated_at
         FROM brand_learning_conflicts
        WHERE workspace_id = $1 AND status = $2
        ORDER BY created_at DESC`,
      [workspaceId, status],
    );
    return result.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      workspaceId: r.workspace_id,
      memoryId: r.memory_id,
      interpretationId: r.interpretation_id,
      existingValue: r.existing_value,
      incomingValue: r.incoming_value,
      conflictType: r.conflict_type,
      status: r.status,
      resolvedByUserId: r.resolved_by_user_id,
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      resolutionNote: r.resolution_note,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async resolveConflict(
    input: { workspaceId: string; conflictId: string; userId?: string | null },
    decision: LearningDecision,
  ) {
    const status = decision.keepExisting ? "RESOLVED_KEEP_EXISTING" : "RESOLVED_ACCEPT_INCOMING";
    const result = await query(
      `UPDATE brand_learning_conflicts
          SET status = $3, resolved_by_user_id = $4, resolved_at = NOW(), resolution_note = $5, updated_at = NOW()
        WHERE id = $1 AND workspace_id = $2 AND status = 'OPEN'
        RETURNING id`,
      [input.conflictId, input.workspaceId, status, input.userId ?? null, decision.note?.slice(0, 1000) ?? null],
    );
    if (!result.rowCount) throw new RangeError("Conflict not found or already resolved.");
  }

  // -------------------------------------------------
  // Insights & history (for the Learning Review Center §10-11)
  // -------------------------------------------------
  async getLearningInsights(workspaceId: string, context: { currentUserId?: string } = {}): Promise<{
    learned: LearningInsight[];
    suggested: BrandLearningMemory[];
    conflicts: Awaited<ReturnType<BrandBrainLearningService["listConflicts"]>>;
    performance: Awaited<ReturnType<typeof listPerformanceSignals>>;
    recommendation: ReturnType<typeof recommendationFromSignals>;
  }> {
    const [active, candidates, needsReview, conflicts, signals] = await Promise.all([
      listMemories(workspaceId, { status: "ACTIVE", currentUserId: context.currentUserId, limit: 60 }),
      listMemories(workspaceId, { status: "CANDIDATE", currentUserId: context.currentUserId, limit: 30 }),
      listMemories(workspaceId, { status: "NEEDS_REVIEW", currentUserId: context.currentUserId, limit: 30 }),
      this.listConflicts(workspaceId, "OPEN"),
      listPerformanceSignals(workspaceId, { limit: 20 }),
    ]);
    const suggested = [...needsReview, ...candidates].slice(0, 30);
    const learned: LearningInsight[] = active.map((m) => ({
      id: m.id,
      title: memoryToInsightTitle(m),
      detail: typeof m.learnedValue === "string" ? m.learnedValue.slice(0, 500) : JSON.stringify(m.learnedValue).slice(0, 500),
      category: m.category,
      subject: m.subject,
      confidence: m.confidence,
      evidenceCount: m.evidenceCount,
      scope: m.scope,
      status: m.status,
      updatedAt: m.updatedAt,
    }));
    return {
      learned,
      suggested,
      conflicts,
      performance: signals,
      recommendation: recommendationFromSignals(signals),
    };
  }

  async getLearningHistory(workspaceId: string, limit = 80) {
    return listMemoryHistory(workspaceId, { limit });
  }

  // -------------------------------------------------
  // Events / interpretations / outputs / performance — thin delegates
  // -------------------------------------------------
  async listEvents(
    workspaceId: string,
    options: { limit?: number; before?: string; eventType?: string; sourceModule?: string; userId?: string } = {},
  ) {
    return listEvents(workspaceId, options);
  }

  async getEvent(workspaceId: string, eventId: string) {
    return getEvent(workspaceId, eventId);
  }

  async listInterpretations(workspaceId: string, options: { category?: string; learningAction?: string; limit?: number } = {}) {
    return listInterpretations(workspaceId, options);
  }

  async getInterpretationForEvent(workspaceId: string, eventId: string) {
    return getInterpretationByEvent(workspaceId, eventId);
  }

  async listMemories(
    workspaceId: string,
    options: { category?: string; status?: string; scope?: string; currentUserId?: string; limit?: number; search?: string } = {},
  ) {
    return listMemories(workspaceId, options);
  }

  async getMemory(workspaceId: string, memoryId: string) {
    return getMemory(workspaceId, memoryId);
  }

  async listMemoryVersions(workspaceId: string, memoryId: string) {
    return listMemoryVersions(workspaceId, memoryId);
  }

  async listOutputEvaluations(workspaceId: string, options: { outputType?: string; limit?: number } = {}) {
    return listOutputEvaluations(workspaceId, options);
  }

  async listPerformanceSignals(
    workspaceId: string,
    options: { channel?: string; metric?: string; limit?: number; since?: string } = {},
  ) {
    return listPerformanceSignals(workspaceId, options);
  }

  async recordPerformanceSignal(input: {
    organizationId: string;
    workspaceId: string;
    metric: string;
    value: number;
    baselineValue?: number | null;
    channel?: string | null;
    contentType?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    sourceProvider: string;
    insight?: string | null;
    recommendation?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<PerformanceSignal> {
    const signal = await recordPerformanceSignal({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      channel: input.channel ?? null,
      contentType: input.contentType ?? null,
      metric: input.metric,
      value: input.value,
      baselineValue: input.baselineValue ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      sourceProvider: input.sourceProvider,
      insight: input.insight ?? null,
      recommendation: input.recommendation ?? null,
      metadata: input.metadata,
    });
    // Also emit a learning event so the interpretation pipeline sees it
    try {
      await this.captureEvent(
        { organizationId: input.organizationId, workspaceId: input.workspaceId, userId: null },
        {
          eventType: "performance_signal",
          sourceModule: `analytics:${input.sourceProvider}`,
          entityType: input.entityType ?? "analytics",
          entityId: signal.id,
          resultingValue: { metric: input.metric, value: input.value, baseline: input.baselineValue, channel: input.channel },
          context: { channel: input.channel, metric: input.metric, period: { start: input.periodStart, end: input.periodEnd } },
        },
      );
    } catch {
      // best-effort
    }
    return signal;
  }

  async getCounts(workspaceId: string) {
    const [events, memoriesResult, conflicts, evaluations, signals] = await Promise.all([
      countEvents(workspaceId),
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count FROM brand_learning_memories WHERE workspace_id = $1 GROUP BY status`,
        [workspaceId],
      ),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM brand_learning_conflicts WHERE workspace_id = $1 AND status = 'OPEN'`, [workspaceId]),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM brand_output_evaluations WHERE workspace_id = $1`, [workspaceId]),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM brand_performance_signals WHERE workspace_id = $1`, [workspaceId]),
    ]);
    const byStatus = Object.fromEntries(memoriesResult.rows.map((r) => [r.status, Number(r.count)]));
    return {
      events,
      memoriesByStatus: byStatus,
      openConflicts: Number(conflicts.rows[0]?.count ?? 0),
      evaluations: Number(evaluations.rows[0]?.count ?? 0),
      performanceSignals: Number(signals.rows[0]?.count ?? 0),
    };
  }

  // Backwards-compatible helper: was an output already interpreted?
  async hadPriorCorrectionForOutput(workspaceId: string, outputPreview: string): Promise<boolean> {
    // If we already have a strong preference memory that mentions this output type, treat as "we knew not to do that"
    const relevant = await retrieveRelevantMemories(workspaceId, { query: outputPreview.slice(0, 200) }, { limit: 5, minConfidence: 0.5 });
    return relevant.length > 0;
  }
}

export const brandBrainLearningService = new BrandBrainLearningService();

function buildSubject(interpretation: LearningInterpretation, event: BrandLearningEvent): string {
  if (event.entityType && event.context?.["subject"]) return String(event.context["subject"]).trim().slice(0, 120);
  if (event.entityType) return `${event.entityType}:${interpretation.category}`.slice(0, 120);
  if (event.feedback?.reason?.trim()) return event.feedback.reason.trim().slice(0, 120);
  return interpretation.category;
}

function inferConflictType(category: string): string {
  const map: Record<string, string> = {
    BRAND_FACT_CORRECTION: "fact",
    PRODUCT_INFORMATION_CORRECTION: "fact",
    BRAND_VOICE_PREFERENCE: "voice",
    CONTENT_STYLE_PREFERENCE: "preference",
    FORMATTING_PREFERENCE: "preference",
    POSITIONING_PREFERENCE: "positioning",
    AUDIENCE_CORRECTION: "audience",
    STRATEGIC_DECISION: "strategy",
  };
  return map[category] ?? "preference";
}

function mapCategoryToMemoryCategory(cat: string): BrandLearningMemory["category"] {
  const map: Record<string, BrandLearningMemory["category"]> = {
    BRAND_FACT_CORRECTION: "BRAND_KNOWLEDGE",
    BRAND_VOICE_PREFERENCE: "USER_PREFERENCE",
    AUDIENCE_CORRECTION: "BRAND_KNOWLEDGE",
    POSITIONING_PREFERENCE: "BRAND_KNOWLEDGE",
    CONTENT_STYLE_PREFERENCE: "USER_PREFERENCE",
    FORMATTING_PREFERENCE: "USER_PREFERENCE",
    STRATEGIC_DECISION: "STRATEGIC_LEARNING",
    PRODUCT_INFORMATION_CORRECTION: "BUSINESS_KNOWLEDGE",
    RECOMMENDATION_FEEDBACK: "OPERATIONAL_LEARNING",
    OUTPUT_QUALITY_FEEDBACK: "USER_PREFERENCE",
    PERFORMANCE_SIGNAL: "PERFORMANCE_LEARNING",
    TEMPORARY_TASK_PREFERENCE: "USER_PREFERENCE",
  };
  return map[cat] ?? "USER_PREFERENCE";
}
