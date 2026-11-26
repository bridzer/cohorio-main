// Adaptive AI Context Engine (§7): task-specific retrieval with precedence.
// Lower-priority inferred knowledge must never override explicit instructions or approved facts.

import { query } from "@/lib/database";
import { contextToMarkdown, type MarketingContext } from "@/lib/marketing-context";
import { getMarketingContext } from "@/lib/marketing-context-repository";
import type { BrandLearningMemory, LearningContext } from "./types";
import { retrieveRelevantMemories } from "./memories";

export type AdaptiveContextPackage = {
  brandKnowledgeMarkdown: string;
  brandKnowledge: MarketingContext | null;
  preferences: BrandLearningMemory[];
  strategicInsights: BrandLearningMemory[];
  operationalNotes: BrandLearningMemory[];
  performanceInsights: BrandLearningMemory[];
  unresolvedConflicts: Array<{
    id: string;
    existingValue: unknown;
    incomingValue: unknown;
    conflictType: string;
  }>;
  // Rendered block to inject into AI prompts (bounded length, precedence-aware)
  promptBlock: string;
};

const PRECEDENCE_DESC = `Context precedence (highest wins):
1. Current explicit user instructions
2. Applicable approved brand knowledge (product_marketing_contexts)
3. Organization policies
4. Confirmed user & organization preferences (USER_PREFERENCE / BRAND_KNOWLEDGE ACTIVE memories)
5. Validated learning memories
6. Evidence-backed strategic insights
7. Provisional AI hypotheses (never above)`;

function renderMemoryForPrompt(m: BrandLearningMemory): string {
  const valueStr = typeof m.learnedValue === "string" ? m.learnedValue : JSON.stringify(m.learnedValue);
  const clipped = valueStr.slice(0, 300);
  const conf = `confidence ${(m.confidence * 100).toFixed(0)}%, ${m.evidenceCount} evidence`;
  const scopeStr = m.scope === "USER" ? `user-scoped` : m.scope.toLowerCase();
  return `- Learned preference [${m.category} / ${m.subject}] (${scopeStr}, ${conf}): "${clipped}"`;
}

/**
 * Build a task-specific context package for the next AI operation.
 * Retrieval is relevance-based (§7: "Do not send the entire learning history to every AI operation").
 */
export async function buildAdaptiveContext(input: {
  workspaceId: string;
  organizationId: string;
  taskContext: LearningContext;
  // Optional hard limit on prompt block tokens (chars); default 3500
  maxPromptChars?: number;
  // When the caller already fetched Brand Brain context, pass it to avoid a duplicate DB round-trip.
  prefetchedStored?: { sections: MarketingContext; updatedAt: string } | null;
}): Promise<AdaptiveContextPackage> {
  const maxChars = input.maxPromptChars ?? 3500;

  const storedPromise = input.prefetchedStored !== undefined
    ? Promise.resolve(
        input.prefetchedStored
          ? { sections: input.prefetchedStored.sections, updatedAt: input.prefetchedStored.updatedAt } as unknown as { sections: MarketingContext; updatedAt: string }
          : null,
      )
    : getMarketingContext(input.workspaceId) as Promise<{ sections: MarketingContext; updatedAt: string } | null>;

  const [stored, conflictsResult] = await Promise.all([
    storedPromise,
    query<{
      id: string;
      existing_value: unknown;
      incoming_value: unknown;
      conflict_type: string;
    }>(
      `SELECT id, existing_value, incoming_value, conflict_type
         FROM brand_learning_conflicts
        WHERE workspace_id = $1 AND status = 'OPEN'
        ORDER BY created_at DESC LIMIT 8`,
      [input.workspaceId],
    ).catch(() => ({ rows: [] as { id: string; existing_value: unknown; incoming_value: unknown; conflict_type: string }[] })),
  ]);

  const brandKnowledge = (stored?.sections ?? null) as MarketingContext | null;
  const brandKnowledgeMarkdown = stored
    ? contextToMarkdown(stored.sections, stored.updatedAt)
    : "No Brand Brain context saved.";

  // Retrieve ACTIVE memories scoped by relevance to the task
  const allRelevant = await retrieveRelevantMemories(
    input.workspaceId,
    {
      query: input.taskContext.query,
      channel: input.taskContext.channel,
      contentType: input.taskContext.contentType,
      currentUserId: input.taskContext.currentUserId,
    },
    { limit: 12, minConfidence: 0.35 },
  );

  const preferences = allRelevant.filter((m) => m.category === "USER_PREFERENCE" || m.category === "BRAND_KNOWLEDGE");
  const strategicInsights = allRelevant.filter((m) => m.category === "STRATEGIC_LEARNING");
  const operationalNotes = allRelevant.filter((m) => m.category === "OPERATIONAL_LEARNING");
  const performanceInsights = allRelevant.filter((m) => m.category === "PERFORMANCE_LEARNING");

  const unresolvedConflicts = conflictsResult.rows.map((r) => ({
    id: r.id,
    existingValue: r.existing_value,
    incomingValue: r.incoming_value,
    conflictType: r.conflict_type,
  }));

  // Build bounded prompt block with precedence reminder
  let promptBlock = "";
  if (preferences.length || strategicInsights.length || performanceInsights.length || unresolvedConflicts.length) {
    const lines: string[] = [
      "### Brand Brain Adaptive Learning (apply where relevant; precedence below — do not let these override explicit user instructions or verified brand facts)",
      PRECEDENCE_DESC,
      "",
    ];
    if (preferences.length) {
      lines.push("Learned preferences & brand knowledge:");
      for (const m of preferences.slice(0, 6)) lines.push(renderMemoryForPrompt(m));
      lines.push("");
    }
    if (strategicInsights.length) {
      lines.push("Strategic learnings:");
      for (const m of strategicInsights.slice(0, 3)) lines.push(renderMemoryForPrompt(m));
      lines.push("");
    }
    if (performanceInsights.length) {
      lines.push("Performance learnings (correlation, not causation — use to improve recommendations, not to blindly change brand identity):");
      for (const m of performanceInsights.slice(0, 3)) lines.push(renderMemoryForPrompt(m));
      lines.push("");
    }
    if (operationalNotes.length) {
      lines.push("Operational preferences:");
      for (const m of operationalNotes.slice(0, 2)) lines.push(renderMemoryForPrompt(m));
      lines.push("");
    }
    if (unresolvedConflicts.length) {
      lines.push(`Note: ${unresolvedConflicts.length} unresolved learning conflict(s) affect this workspace — avoid assumptions in those areas until resolved.`);
      lines.push("");
    }
    lines.push("If a learned preference conflicts with the user's current explicit instruction in this task, follow the current instruction.");
    promptBlock = lines.join("\n");
    if (promptBlock.length > maxChars) {
      promptBlock = promptBlock.slice(0, maxChars - 20) + "\n…[adaptive context truncated]";
    }
  }

  return {
    brandKnowledgeMarkdown,
    brandKnowledge,
    preferences,
    strategicInsights,
    operationalNotes,
    performanceInsights,
    unresolvedConflicts,
    promptBlock,
  };
}

/**
 * Convenience: retrieve just the prompt block string for injection into an LLM prompt.
 */
export async function adaptivePromptBlock(input: {
  workspaceId: string;
  organizationId: string;
  taskContext: LearningContext;
}): Promise<string> {
  const pkg = await buildAdaptiveContext(input);
  return pkg.promptBlock;
}
