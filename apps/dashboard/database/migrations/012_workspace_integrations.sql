CREATE TABLE IF NOT EXISTS workspace_integrations (
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  provider TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, provider)
);
