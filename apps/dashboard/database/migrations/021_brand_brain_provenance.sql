-- Milestone 3: Brand Brain provenance, review states, and versioning.
-- Additive only. Values stay in product_marketing_contexts (all existing
-- consumers keep working); this adds the trust layer beside them.

CREATE TABLE IF NOT EXISTS brand_brain_provenance (
  workspace_id TEXT NOT NULL,
  section TEXT NOT NULL,
  field TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  source_type TEXT NOT NULL DEFAULT 'user_input'
    CHECK (source_type IN ('user_input', 'website', 'document', 'integration', 'ai_inference', 'system')),
  confidence TEXT NOT NULL DEFAULT 'high'
    CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'USER_CONFIRMED'
    CHECK (status IN ('VERIFIED', 'USER_CONFIRMED', 'AI_INFERRED', 'NEEDS_REVIEW', 'UNKNOWN')),
  proposed_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, section, field)
);

CREATE TABLE IF NOT EXISTS brand_brain_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, version)
);

CREATE INDEX IF NOT EXISTS brand_brain_versions_workspace_idx
  ON brand_brain_versions (workspace_id, version DESC);

CREATE INDEX IF NOT EXISTS brand_brain_provenance_review_idx
  ON brand_brain_provenance (workspace_id, status)
  WHERE status = 'NEEDS_REVIEW';
