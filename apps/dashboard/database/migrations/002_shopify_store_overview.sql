ALTER TABLE shopify_connections
  ADD COLUMN IF NOT EXISTS overview_complete BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS shopify_products (
  connection_id TEXT NOT NULL
    REFERENCES shopify_connections (id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  handle TEXT NOT NULL,
  product_type TEXT,
  status TEXT NOT NULL,
  total_inventory INTEGER NOT NULL DEFAULT 0,
  minimum_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency_code TEXT,
  image_url TEXT,
  revenue_30d NUMERIC(18, 2) NOT NULL DEFAULT 0,
  units_sold_30d INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (connection_id, shopify_product_id)
);

CREATE INDEX IF NOT EXISTS shopify_products_performance_idx
  ON shopify_products (connection_id, revenue_30d DESC);

CREATE TABLE IF NOT EXISTS shopify_daily_metrics (
  connection_id TEXT NOT NULL
    REFERENCES shopify_connections (id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  revenue NUMERIC(18, 2) NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (connection_id, metric_date)
);

CREATE INDEX IF NOT EXISTS shopify_daily_metrics_period_idx
  ON shopify_daily_metrics (connection_id, metric_date DESC);
