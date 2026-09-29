CREATE TABLE IF NOT EXISTS shopify_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  display_name TEXT NOT NULL,
  shop_email TEXT,
  currency_code TEXT,
  timezone TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scopes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'error', 'disconnected')),
  products_count INTEGER NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, shop_domain)
);

CREATE INDEX IF NOT EXISTS shopify_connections_workspace_idx
  ON shopify_connections (workspace_id, status);

CREATE INDEX IF NOT EXISTS shopify_connections_token_expiry_idx
  ON shopify_connections (token_expires_at)
  WHERE status = 'active';
