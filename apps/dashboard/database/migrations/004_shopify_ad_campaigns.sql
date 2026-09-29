CREATE TABLE IF NOT EXISTS shopify_ad_campaigns (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL
    REFERENCES shopify_connections (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL
    CHECK (platform IN ('meta', 'google', 'tiktok')),
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'archived')),
  daily_budget NUMERIC(18, 2) NOT NULL,
  currency_code TEXT NOT NULL,
  audience TEXT NOT NULL,
  value_proposition TEXT NOT NULL,
  offer TEXT,
  landing_page_url TEXT,
  selected_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  strategy JSONB NOT NULL,
  creatives JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shopify_ad_campaigns_connection_idx
  ON shopify_ad_campaigns (connection_id, status, created_at DESC);
