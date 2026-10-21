CREATE TABLE IF NOT EXISTS revops_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  email TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (
    stage IN ('subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer')
  ),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS revops_leads_workspace_created_idx
  ON revops_leads (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS launches_workspace_created_idx
  ON launches (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS launch_assets (
  launch_id UUID NOT NULL REFERENCES launches (id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('copilot', 'social', 'lifecycle')),
  asset_id UUID NOT NULL,
  PRIMARY KEY (launch_id, asset_type, asset_id)
);

CREATE TABLE IF NOT EXISTS retention_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('survey', 'offer', 'confirm')),
  body TEXT NOT NULL,
  UNIQUE (workspace_id, position)
);

-- Network ids returned by a confirmed ad publish (Meta creative ids, the
-- Google Ads campaign resource name, or TikTok ad ids).
ALTER TABLE shopify_ad_campaigns
  ADD COLUMN IF NOT EXISTS published_reference TEXT;
