-- 008_brand_brain_learning_loop.sql
-- Brand Brain Learning Loop: Feedback collection, interpretation,
-- persistent learning memories, output evaluation, and performance signals.
-- Reuses tenant isolation model: organization_id + workspace_id scoping.

-- ============================================================
-- Learning event store (Observe -> Capture -> Record)
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'accepted',
    'edited',
    'rejected',
    'dismissed',
    'deferred',
    'approved',
    'corrected',
    'positioning_changed',
    'audience_changed',
    'voice_changed',
    'content_preference_changed',
    'strategy_changed',
    'rated',
    'commented',
    'performance_signal',
    'output_generated',
    'brand_knowledge_approved',
    'brand_knowledge_corrected'
  )),

  source_module TEXT NOT NULL CHECK (length(btrim(source_module)) > 0),

  entity_type TEXT,
  entity_id TEXT,

  -- References to original vs final — small JSONB payloads or refs, not full docs
  original_value JSONB,
  resulting_value JSONB,

  -- User feedback envelope
  feedback_action TEXT,
  feedback_rating SMALLINT CHECK (feedback_rating IS NULL OR (feedback_rating BETWEEN 1 AND 5)),
  feedback_reason TEXT,
  feedback_comment TEXT,

  -- Arbitrary context (task type, channel, campaign, etc.)
  context JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),

  -- Idempotency: SHA-256 hash of (workspace_id, user_id, event_type, source_module, entity_type, entity_id, dedup_key)
  dedup_hash TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (workspace_id, dedup_hash)
);

CREATE INDEX IF NOT EXISTS brand_learning_events_org_idx
  ON brand_learning_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_events_workspace_idx
  ON brand_learning_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_events_workspace_type_idx
  ON brand_learning_events (workspace_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_events_source_idx
  ON brand_learning_events (workspace_id, source_module, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_events_user_idx
  ON brand_learning_events (workspace_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_events_entity_idx
  ON brand_learning_events (workspace_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS brand_learning_events_created_brin_idx
  ON brand_learning_events USING BRIN (created_at);

-- ============================================================
-- Feedback interpretation (Interpret -> Evaluate)
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_learning_interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES brand_learning_events (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  category TEXT NOT NULL CHECK (category IN (
    'BRAND_FACT_CORRECTION',
    'BRAND_VOICE_PREFERENCE',
    'AUDIENCE_CORRECTION',
    'POSITIONING_PREFERENCE',
    'CONTENT_STYLE_PREFERENCE',
    'FORMATTING_PREFERENCE',
    'STRATEGIC_DECISION',
    'PRODUCT_INFORMATION_CORRECTION',
    'RECOMMENDATION_FEEDBACK',
    'OUTPUT_QUALITY_FEEDBACK',
    'PERFORMANCE_SIGNAL',
    'TEMPORARY_TASK_PREFERENCE'
  )),

  what_changed TEXT,
  what_was_suggested TEXT,
  what_preferred_instead TEXT,

  -- Classification axes
  change_nature TEXT CHECK (change_nature IN ('factual','stylistic','strategic','contextual','formatting','unknown')),
  is_persistent BOOLEAN NOT NULL DEFAULT FALSE,
  is_task_specific BOOLEAN NOT NULL DEFAULT TRUE,

  confidence NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('high','medium','low')),

  -- Should we learn immediately, queue as candidate, or ignore as weak signal?
  learning_action TEXT NOT NULL CHECK (learning_action IN ('learn_immediately','candidate','request_clarification','ignore')),
  reasoning TEXT,

  -- Conflict detection: does this contradict existing Brand Brain knowledge?
  conflicts_with JSONB CHECK (conflicts_with IS NULL OR jsonb_typeof(conflicts_with) = 'object'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_learning_interpretations_workspace_idx
  ON brand_learning_interpretations (workspace_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_interpretations_event_idx
  ON brand_learning_interpretations (event_id);

-- ============================================================
-- Learning memories (Learn -> Apply) — complements product_marketing_contexts
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_learning_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,

  category TEXT NOT NULL CHECK (category IN (
    'BUSINESS_KNOWLEDGE',
    'BRAND_KNOWLEDGE',
    'USER_PREFERENCE',
    'STRATEGIC_LEARNING',
    'OPERATIONAL_LEARNING',
    'PERFORMANCE_LEARNING'
  )),

  subject TEXT NOT NULL CHECK (length(btrim(subject)) > 0),
  learned_value JSONB NOT NULL,

  -- Provenance: which events support this memory
  source_event_ids UUID[] NOT NULL DEFAULT '{}',

  confidence NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_count INTEGER NOT NULL DEFAULT 1 CHECK (evidence_count >= 1),

  scope TEXT NOT NULL CHECK (scope IN ('TASK','USER','BRAND','ORGANIZATION')),
  -- USER scope requires a user_id; others are org/brand-wide
  scope_user_id UUID REFERENCES users (id) ON DELETE CASCADE,

  status TEXT NOT NULL CHECK (status IN ('CANDIDATE','ACTIVE','NEEDS_REVIEW','SUPERSEDED','REJECTED')) DEFAULT 'CANDIDATE',

  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_validated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (scope = 'USER' AND scope_user_id IS NOT NULL)
    OR
    (scope <> 'USER' AND scope_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS brand_learning_memories_workspace_idx
  ON brand_learning_memories (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_memories_workspace_category_idx
  ON brand_learning_memories (workspace_id, category, status);
CREATE INDEX IF NOT EXISTS brand_learning_memories_workspace_scope_idx
  ON brand_learning_memories (workspace_id, scope, status);
CREATE INDEX IF NOT EXISTS brand_learning_memories_workspace_subject_idx
  ON brand_learning_memories (workspace_id, subject);
CREATE INDEX IF NOT EXISTS brand_learning_memories_confidence_idx
  ON brand_learning_memories (workspace_id, confidence DESC);
CREATE INDEX IF NOT EXISTS brand_learning_memories_org_idx
  ON brand_learning_memories (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_memories_user_scope_idx
  ON brand_learning_memories (workspace_id, scope_user_id) WHERE scope = 'USER';

-- Keep updated_at current
DROP TRIGGER IF EXISTS brand_learning_memories_touch_updated_at ON brand_learning_memories;
CREATE TRIGGER brand_learning_memories_touch_updated_at
  BEFORE UPDATE ON brand_learning_memories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Learning memory version history (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_learning_memory_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES brand_learning_memories (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  version INTEGER NOT NULL CHECK (version > 0),

  -- Snapshot of the memory at this version
  snapshot JSONB NOT NULL,

  change_note TEXT NOT NULL DEFAULT '',
  changed_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (memory_id, version)
);

CREATE INDEX IF NOT EXISTS brand_learning_memory_versions_memory_idx
  ON brand_learning_memory_versions (memory_id, version DESC);
CREATE INDEX IF NOT EXISTS brand_learning_memory_versions_workspace_idx
  ON brand_learning_memory_versions (workspace_id, created_at DESC);

-- ============================================================
-- Learning conflicts (conflicting feedback vs approved knowledge)
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_learning_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,

  memory_id UUID REFERENCES brand_learning_memories (id) ON DELETE SET NULL,
  interpretation_id UUID REFERENCES brand_learning_interpretations (id) ON DELETE SET NULL,

  -- What conflicts with what
  existing_value JSONB NOT NULL,
  incoming_value JSONB NOT NULL,
  conflict_type TEXT NOT NULL CHECK (conflict_type IN ('fact','voice','positioning','audience','strategy','preference')),

  status TEXT NOT NULL CHECK (status IN ('OPEN','RESOLVED_KEEP_EXISTING','RESOLVED_ACCEPT_INCOMING','DISMISSED')) DEFAULT 'OPEN',

  resolved_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_learning_conflicts_workspace_idx
  ON brand_learning_conflicts (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_conflicts_memory_idx
  ON brand_learning_conflicts (memory_id);

DROP TRIGGER IF EXISTS brand_learning_conflicts_touch_updated_at ON brand_learning_conflicts;
CREATE TRIGGER brand_learning_conflicts_touch_updated_at
  BEFORE UPDATE ON brand_learning_conflicts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Output evaluations (Measure -> Improve)
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_output_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,

  -- What was evaluated
  entity_type TEXT NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id TEXT,
  output_type TEXT NOT NULL CHECK (length(btrim(output_type)) > 0),

  -- Original AI output vs final user-accepted version (refs or small excerpts)
  original_output JSONB,
  final_output JSONB,

  -- Dimension scores 0..1 (null = not applicable for this output type)
  brand_voice_score NUMERIC(3,2) CHECK (brand_voice_score IS NULL OR (brand_voice_score BETWEEN 0 AND 1)),
  brand_identity_score NUMERIC(3,2) CHECK (brand_identity_score IS NULL OR (brand_identity_score BETWEEN 0 AND 1)),
  audience_score NUMERIC(3,2) CHECK (audience_score IS NULL OR (audience_score BETWEEN 0 AND 1)),
  positioning_score NUMERIC(3,2) CHECK (positioning_score IS NULL OR (positioning_score BETWEEN 0 AND 1)),
  factual_score NUMERIC(3,2) CHECK (factual_score IS NULL OR (factual_score BETWEEN 0 AND 1)),
  preference_score NUMERIC(3,2) CHECK (preference_score IS NULL OR (preference_score BETWEEN 0 AND 1)),
  overall_score NUMERIC(3,2) CHECK (overall_score IS NULL OR (overall_score BETWEEN 0 AND 1)),

  -- Structured issues found (array of {dimension, severity, message, suggestion})
  issues JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(issues) = 'array'),
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suggestions) = 'array'),

  -- Did user edit? how much did it differ?
  was_edited BOOLEAN NOT NULL DEFAULT FALSE,
  edit_distance_ratio NUMERIC(4,3) CHECK (edit_distance_ratio IS NULL OR (edit_distance_ratio BETWEEN 0 AND 1)),

  evaluator TEXT NOT NULL DEFAULT 'heuristic' CHECK (evaluator IN ('heuristic','llm','hybrid')),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_output_evaluations_workspace_idx
  ON brand_output_evaluations (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_output_evaluations_entity_idx
  ON brand_output_evaluations (workspace_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS brand_output_evaluations_type_idx
  ON brand_output_evaluations (workspace_id, output_type, created_at DESC);

-- ============================================================
-- Performance signals (authorized analytics -> evidence-based recommendations)
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_performance_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,

  -- Link to content/campaign/channel (refs, not duplicated data)
  entity_type TEXT,
  entity_id TEXT,
  channel TEXT,
  content_type TEXT,

  metric TEXT NOT NULL CHECK (length(btrim(metric)) > 0),
  value NUMERIC NOT NULL,
  baseline_value NUMERIC,
  delta_ratio NUMERIC,

  -- Period this signal covers
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- Source integration (must be an authorized connected provider)
  source_provider TEXT NOT NULL CHECK (length(btrim(source_provider)) > 0),

  -- Interpretation guardrails: correlation != causation, do not auto-promote to preference
  insight TEXT,
  is_correlation BOOLEAN NOT NULL DEFAULT TRUE,
  recommendation TEXT,

  -- Whether this has been turned into a learning memory (optional)
  memory_id UUID REFERENCES brand_learning_memories (id) ON DELETE SET NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_performance_signals_workspace_idx
  ON brand_performance_signals (workspace_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS brand_performance_signals_metric_idx
  ON brand_performance_signals (workspace_id, metric, recorded_at DESC);
CREATE INDEX IF NOT EXISTS brand_performance_signals_channel_idx
  ON brand_performance_signals (workspace_id, channel, recorded_at DESC);
CREATE INDEX IF NOT EXISTS brand_performance_signals_entity_idx
  ON brand_performance_signals (workspace_id, entity_type, entity_id);

-- ============================================================
-- Learning approvals queue (separate from provenance approvals)
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_learning_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES brand_learning_memories (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  requested_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,

  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','DISMISSED')) DEFAULT 'PENDING',
  decision_note TEXT,

  decided_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_learning_approvals_workspace_idx
  ON brand_learning_approvals (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_learning_approvals_memory_idx
  ON brand_learning_approvals (memory_id);

DROP TRIGGER IF EXISTS brand_learning_approvals_touch_updated_at ON brand_learning_approvals;
CREATE TRIGGER brand_learning_approvals_touch_updated_at
  BEFORE UPDATE ON brand_learning_approvals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Extend audit_events with learning event types (optional; no FK)
-- ============================================================
-- (reuses existing audit_events table; learning events also emit audit rows
--  via application code; no schema change needed)

-- ============================================================
-- Ensure cohorio_migrations tracks this file
-- ============================================================
