CREATE TABLE IF NOT EXISTS workspace_plans (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces (id),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT
);

CREATE TABLE IF NOT EXISTS workspace_task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  kind TEXT NOT NULL CHECK (kind IN ('copilot', 'social', 'lifecycle')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workspace_task_events_workspace_created_idx
  ON workspace_task_events (workspace_id, created_at DESC);
