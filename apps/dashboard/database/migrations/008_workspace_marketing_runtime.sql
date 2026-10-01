CREATE TABLE IF NOT EXISTS copilot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  user_id UUID NOT NULL REFERENCES users (id),
  skill_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS copilot_runs_workspace_created_idx
  ON copilot_runs (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  platform TEXT NOT NULL CHECK (platform IN ('LinkedIn', 'X', 'Instagram')),
  body TEXT NOT NULL,
  source_prompt TEXT,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_posts_workspace_created_idx
  ON social_posts (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lifecycle_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lifecycle_drafts_workspace_created_idx
  ON lifecycle_drafts (workspace_id, created_at DESC);
