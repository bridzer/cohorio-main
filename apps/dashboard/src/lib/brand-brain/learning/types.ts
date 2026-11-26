// Central types for the Brand Brain Learning Loop
// Mirrors prompt.md §3.D / §5.B / §13 and adapts to workspace-scoped conventions.

export const LEARNING_EVENT_TYPES = [
  "accepted",
  "edited",
  "rejected",
  "dismissed",
  "deferred",
  "approved",
  "corrected",
  "positioning_changed",
  "audience_changed",
  "voice_changed",
  "content_preference_changed",
  "strategy_changed",
  "rated",
  "commented",
  "performance_signal",
  "output_generated",
  "brand_knowledge_approved",
  "brand_knowledge_corrected",
] as const;
export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

export const FEEDBACK_CATEGORIES = [
  "BRAND_FACT_CORRECTION",
  "BRAND_VOICE_PREFERENCE",
  "AUDIENCE_CORRECTION",
  "POSITIONING_PREFERENCE",
  "CONTENT_STYLE_PREFERENCE",
  "FORMATTING_PREFERENCE",
  "STRATEGIC_DECISION",
  "PRODUCT_INFORMATION_CORRECTION",
  "RECOMMENDATION_FEEDBACK",
  "OUTPUT_QUALITY_FEEDBACK",
  "PERFORMANCE_SIGNAL",
  "TEMPORARY_TASK_PREFERENCE",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const LEARNING_CATEGORIES = [
  "BUSINESS_KNOWLEDGE",
  "BRAND_KNOWLEDGE",
  "USER_PREFERENCE",
  "STRATEGIC_LEARNING",
  "OPERATIONAL_LEARNING",
  "PERFORMANCE_LEARNING",
] as const;
export type LearningCategory = (typeof LEARNING_CATEGORIES)[number];

export const LEARNING_SCOPES = ["TASK", "USER", "BRAND", "ORGANIZATION"] as const;
export type LearningScope = (typeof LEARNING_SCOPES)[number];

export const LEARNING_STATUSES = [
  "CANDIDATE",
  "ACTIVE",
  "NEEDS_REVIEW",
  "SUPERSEDED",
  "REJECTED",
] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

export const CONFLICT_STATUSES = [
  "OPEN",
  "RESOLVED_KEEP_EXISTING",
  "RESOLVED_ACCEPT_INCOMING",
  "DISMISSED",
] as const;
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export const CHANGE_NATURES = [
  "factual",
  "stylistic",
  "strategic",
  "contextual",
  "formatting",
  "unknown",
] as const;
export type ChangeNature = (typeof CHANGE_NATURES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const LEARNING_ACTIONS = [
  "learn_immediately",
  "candidate",
  "request_clarification",
  "ignore",
] as const;
export type LearningAction = (typeof LEARNING_ACTIONS)[number];

// ---------------------------------------------------------------------------
// BrandLearningEvent (prompt §3.D, adapted to existing workspace conventions)
// ---------------------------------------------------------------------------
export type BrandLearningEvent = {
  id: string;
  organizationId: string;
  workspaceId: string; // = brandId in prompt; workspace is the brand
  userId?: string | null;

  eventType: LearningEventType;
  sourceModule: string;

  entityType?: string | null;
  entityId?: string | null;

  originalValue?: unknown;
  resultingValue?: unknown;

  feedback?: {
    action?: string;
    rating?: number;
    reason?: string;
    comment?: string;
  };

  context?: Record<string, unknown>;

  dedupHash?: string;
  createdAt: string;
};

// Input allowed when capturing (server fills org/ws/user + dedup)
export type CaptureLearningEventInput = Omit<
  BrandLearningEvent,
  "id" | "organizationId" | "workspaceId" | "userId" | "createdAt" | "dedupHash"
> & {
  // Optional override for dedup key suffix (e.g. a stable external id)
  dedupKey?: string;
  // Optional: store large doc refs as pointers — we do this for free by keeping
  // originalValue/resultingValue small; if caller passes large strings they are truncated.
};

// ---------------------------------------------------------------------------
// LearningInterpretation (prompt §4)
// ---------------------------------------------------------------------------
export type LearningInterpretation = {
  id: string;
  eventId: string;
  workspaceId: string;
  organizationId: string;
  category: FeedbackCategory;
  whatChanged?: string | null;
  whatWasSuggested?: string | null;
  whatPreferredInstead?: string | null;
  changeNature: ChangeNature;
  isPersistent: boolean;
  isTaskSpecific: boolean;
  confidence: number; // 0..1
  confidenceLevel: ConfidenceLevel;
  learningAction: LearningAction;
  reasoning?: string | null;
  conflictsWith?: Record<string, unknown> | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// BrandLearningMemory (prompt §5.B)
// ---------------------------------------------------------------------------
export type BrandLearningMemory = {
  id: string;
  organizationId: string;
  workspaceId: string;
  category: LearningCategory;
  subject: string;
  learnedValue: unknown;
  sourceEventIds: string[];
  confidence: number;
  evidenceCount: number;
  scope: LearningScope;
  scopeUserId?: string | null;
  status: LearningStatus;
  firstObservedAt: string;
  lastObservedAt: string;
  lastValidatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LearningMemoryCandidate = {
  workspaceId: string;
  organizationId: string;
  category: LearningCategory;
  subject: string;
  learnedValue: unknown;
  sourceEventIds: string[];
  confidence: number;
  scope: LearningScope;
  scopeUserId?: string | null;
  status?: LearningStatus; // default CANDIDATE
};

// ---------------------------------------------------------------------------
// Conflicts & approvals
// ---------------------------------------------------------------------------
export type LearningConflict = {
  id: string;
  organizationId: string;
  workspaceId: string;
  memoryId?: string | null;
  interpretationId?: string | null;
  existingValue: unknown;
  incomingValue: unknown;
  conflictType: "fact" | "voice" | "positioning" | "audience" | "strategy" | "preference";
  status: ConflictStatus;
  resolvedByUserId?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LearningDecision = {
  keepExisting: boolean;
  note?: string;
};

// ---------------------------------------------------------------------------
// Output evaluation (prompt §8) & performance signals (prompt §9)
// ---------------------------------------------------------------------------
export type OutputEvaluation = {
  id: string;
  organizationId: string;
  workspaceId: string;
  entityType: string;
  entityId?: string | null;
  outputType: string;
  originalOutput?: unknown;
  finalOutput?: unknown;
  brandVoiceScore?: number | null;
  brandIdentityScore?: number | null;
  audienceScore?: number | null;
  positioningScore?: number | null;
  factualScore?: number | null;
  preferenceScore?: number | null;
  overallScore?: number | null;
  issues: Array<{ dimension: string; severity: string; message: string; suggestion?: string }>;
  suggestions: Array<{ message: string }>;
  wasEdited: boolean;
  editDistanceRatio?: number | null;
  evaluator: "heuristic" | "llm" | "hybrid";
  evaluatedAt: string;
  createdAt: string;
};

export type OutputEvaluationInput = {
  workspaceId: string;
  organizationId: string;
  entityType: string;
  entityId?: string | null;
  outputType: string;
  originalOutput?: unknown;
  finalOutput?: unknown;
  // Optional: pass Brand Brain context snapshot so evaluation can score against it
  brandContextMarkdown?: string;
};

export type PerformanceSignal = {
  id: string;
  organizationId: string;
  workspaceId: string;
  entityType?: string | null;
  entityId?: string | null;
  channel?: string | null;
  contentType?: string | null;
  metric: string;
  value: number;
  baselineValue?: number | null;
  deltaRatio?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  sourceProvider: string;
  insight?: string | null;
  isCorrelation: boolean;
  recommendation?: string | null;
  memoryId?: string | null;
  metadata?: Record<string, unknown>;
  recordedAt: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Task context for adaptive retrieval (prompt §7)
// ---------------------------------------------------------------------------
export type LearningContext = {
  taskType?: string;
  channel?: string;
  contentType?: string;
  audience?: string;
  // Freeform query to relevancy-score against memories
  query?: string;
  // Scope hint: if present, only memories at or narrower than this scope are applied.
  requestedScope?: LearningScope;
  // If set, USER-scoped memories are only returned for this user.
  currentUserId?: string;
};

export type LearningInsight = {
  // Human-readable insight derived from an ACTIVE memory
  id: string;
  title: string;
  detail: string;
  category: LearningCategory;
  subject: string;
  confidence: number;
  evidenceCount: number;
  scope: LearningScope;
  status: LearningStatus;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function isLearningEventType(v: string): v is LearningEventType {
  return (LEARNING_EVENT_TYPES as readonly string[]).includes(v);
}
export function isFeedbackCategory(v: string): v is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(v);
}
export function isLearningCategory(v: string): v is LearningCategory {
  return (LEARNING_CATEGORIES as readonly string[]).includes(v);
}
export function isLearningScope(v: string): v is LearningScope {
  return (LEARNING_SCOPES as readonly string[]).includes(v);
}
export function isLearningStatus(v: string): v is LearningStatus {
  return (LEARNING_STATUSES as readonly string[]).includes(v);
}

export function confidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

export function normalizeLearningScope(
  scope: string | undefined,
  fallback: LearningScope = "BRAND",
): LearningScope {
  return scope && isLearningScope(scope) ? scope : fallback;
}
