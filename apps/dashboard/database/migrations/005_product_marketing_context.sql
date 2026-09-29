CREATE TABLE IF NOT EXISTS product_marketing_contexts (
  workspace_id TEXT PRIMARY KEY,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_marketing_contexts_updated_idx
  ON product_marketing_contexts (updated_at DESC);
