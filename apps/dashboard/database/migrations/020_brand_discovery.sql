-- Milestone 2: brand discovery (website import + asset uploads). Additive only.

-- Latest website analysis per workspace (upserted on each run).
CREATE TABLE IF NOT EXISTS website_analyses (
  workspace_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  business_model TEXT NOT NULL DEFAULT 'unknown',
  confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('high', 'medium', 'low')),
  title TEXT,
  description TEXT,
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  phones JSONB NOT NULL DEFAULT '[]'::jsonb,
  socials JSONB NOT NULL DEFAULT '[]'::jsonb,
  headings JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uploaded brand assets. Originals stored as bytea (no object storage
-- configured yet); extracted_text holds dependency-free extractions
-- (txt/md/csv). Binary formats are stored and listed; their text extraction
-- arrives with the document pipeline (no new npm deps in this milestone).
CREATE TABLE IF NOT EXISTS brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  blob BYTEA NOT NULL,
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, sha256)
);

CREATE INDEX IF NOT EXISTS brand_assets_workspace_idx
  ON brand_assets (workspace_id, created_at DESC);
