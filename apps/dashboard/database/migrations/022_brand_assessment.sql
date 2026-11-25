-- Milestone 1 (assessment engine): dimension snapshots and structured
-- recommendations with lifecycle statuses. Additive only; v1 context and
-- provenance tables are untouched.

CREATE TABLE IF NOT EXISTS brand_assessments (
  workspace_id TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN (
    'identity', 'business-model', 'product-clarity', 'audience',
    'value-prop', 'positioning', 'voice', 'visual-identity',
    'market', 'differentiation', 'marketing-presence', 'seo'
  )),
  status TEXT NOT NULL CHECK (status IN ('complete', 'needs_input', 'low_confidence')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  completeness INTEGER NOT NULL DEFAULT 0 CHECK (completeness BETWEEN 0 AND 100),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_action TEXT NOT NULL DEFAULT '',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, dimension)
);

CREATE TABLE IF NOT EXISTS brand_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  section TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  why TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  effort TEXT NOT NULL DEFAULT 'M' CHECK (effort IN ('S', 'M', 'L')),
  workflow JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN (
    'NEW', 'REVIEW_REQUIRED', 'ACCEPTED', 'IN_PROGRESS',
    'COMPLETED', 'DISMISSED', 'DEFERRED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);

-- One open row per issue: re-running assessment never duplicates an
-- unresolved recommendation. Terminal states may recur as fresh rows.
CREATE UNIQUE INDEX IF NOT EXISTS brand_recommendations_open_idx
  ON brand_recommendations (workspace_id, dedupe_key)
  WHERE status NOT IN ('COMPLETED', 'DISMISSED');

CREATE INDEX IF NOT EXISTS brand_recommendations_workspace_idx
  ON brand_recommendations (workspace_id, status, priority, created_at DESC);
