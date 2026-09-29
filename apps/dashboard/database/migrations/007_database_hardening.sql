DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM shopify_connections
    WHERE id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) OR EXISTS (
    SELECT 1 FROM shopify_ad_campaigns
    WHERE id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Application-generated Shopify connection and campaign IDs must be UUIDs';
  END IF;
END
$$;

ALTER TABLE shopify_products
  DROP CONSTRAINT IF EXISTS shopify_products_connection_id_fkey;
ALTER TABLE shopify_daily_metrics
  DROP CONSTRAINT IF EXISTS shopify_daily_metrics_connection_id_fkey;
ALTER TABLE shopify_ad_campaigns
  DROP CONSTRAINT IF EXISTS shopify_ad_campaigns_connection_id_fkey;

ALTER TABLE shopify_connections
  ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE shopify_products
  ALTER COLUMN connection_id TYPE UUID USING connection_id::uuid;
ALTER TABLE shopify_daily_metrics
  ALTER COLUMN connection_id TYPE UUID USING connection_id::uuid;
ALTER TABLE shopify_ad_campaigns
  ALTER COLUMN id TYPE UUID USING id::uuid,
  ALTER COLUMN connection_id TYPE UUID USING connection_id::uuid;

ALTER TABLE shopify_products
  ADD CONSTRAINT shopify_products_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES shopify_connections (id)
  ON DELETE CASCADE;
ALTER TABLE shopify_daily_metrics
  ADD CONSTRAINT shopify_daily_metrics_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES shopify_connections (id)
  ON DELETE CASCADE;
ALTER TABLE shopify_ad_campaigns
  ADD CONSTRAINT shopify_ad_campaigns_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES shopify_connections (id)
  ON DELETE CASCADE;

ALTER TABLE shopify_ad_campaigns
  ADD CONSTRAINT shopify_ad_campaigns_id_connection_unique
  UNIQUE (id, connection_id);

CREATE TABLE IF NOT EXISTS shopify_ad_campaign_products (
  campaign_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  shopify_product_id TEXT NOT NULL,
  position SMALLINT NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, shopify_product_id),
  CONSTRAINT shopify_ad_campaign_products_campaign_fk
    FOREIGN KEY (campaign_id, connection_id)
    REFERENCES shopify_ad_campaigns (id, connection_id)
    ON DELETE CASCADE,
  CONSTRAINT shopify_ad_campaign_products_product_fk
    FOREIGN KEY (connection_id, shopify_product_id)
    REFERENCES shopify_products (connection_id, shopify_product_id)
    ON DELETE CASCADE
);

INSERT INTO shopify_ad_campaign_products (
  campaign_id, connection_id, shopify_product_id, position
)
SELECT campaign.id, campaign.connection_id, selected.product_id, selected.position - 1
FROM shopify_ad_campaigns campaign
CROSS JOIN LATERAL jsonb_array_elements_text(campaign.selected_product_ids)
  WITH ORDINALITY AS selected(product_id, position)
JOIN shopify_products product
  ON product.connection_id = campaign.connection_id
 AND product.shopify_product_id = selected.product_id
ON CONFLICT DO NOTHING;

ALTER TABLE users
  ADD CONSTRAINT users_active_email_verified
    CHECK (status <> 'active' OR email_verified_at IS NOT NULL),
  ADD CONSTRAINT users_deleted_lifecycle
    CHECK ((status = 'deleted') = (deleted_at IS NOT NULL));

ALTER TABLE user_credentials
  ADD CONSTRAINT user_credentials_lock_lifecycle
    CHECK (locked_until IS NULL OR last_failed_at IS NOT NULL);

ALTER TABLE auth_action_tokens
  DROP CONSTRAINT IF EXISTS auth_action_tokens_purpose_check,
  ADD CONSTRAINT auth_action_tokens_purpose_check
    CHECK (purpose IN (
      'verify_email', 'reset_password', 'change_email', 'session_bootstrap'
    )),
  ADD CONSTRAINT auth_action_tokens_expiry_lifecycle
    CHECK (expires_at > created_at),
  ADD CONSTRAINT auth_action_tokens_consumed_lifecycle
    CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  ADD CONSTRAINT auth_action_tokens_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object');

ALTER TABLE auth_accounts
  ADD CONSTRAINT auth_accounts_type_valid
    CHECK (type IN ('oauth', 'oidc', 'email')),
  ADD CONSTRAINT auth_accounts_provider_present
    CHECK (length(btrim(provider)) > 0 AND length(btrim(provider_account_id)) > 0);

ALTER TABLE organizations
  ADD CONSTRAINT organizations_name_not_blank
    CHECK (length(btrim(name)) > 0),
  ADD CONSTRAINT organizations_archive_lifecycle
    CHECK ((status = 'archived') = (archived_at IS NOT NULL));

ALTER TABLE organization_invitations
  ALTER COLUMN invited_by_user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS organization_invitations_invited_by_user_id_fkey,
  ADD CONSTRAINT organization_invitations_invited_by_user_id_fkey
    FOREIGN KEY (invited_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT organization_invitations_expiry_lifecycle
    CHECK (expires_at > created_at),
  ADD CONSTRAINT organization_invitations_terminal_state
    CHECK (accepted_at IS NULL OR revoked_at IS NULL);

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_name_not_blank
    CHECK (length(btrim(name)) > 0),
  ADD CONSTRAINT workspaces_settings_object
    CHECK (jsonb_typeof(settings) = 'object'),
  ADD CONSTRAINT workspaces_ownership_lifecycle
    CHECK (
      (status = 'anonymous' AND organization_id IS NULL AND claimed_at IS NULL)
      OR
      (status IN ('active', 'archived') AND organization_id IS NOT NULL)
    ),
  ADD CONSTRAINT workspaces_archive_lifecycle
    CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  ADD CONSTRAINT workspaces_default_active
    CHECK (NOT is_default OR (status = 'active' AND organization_id IS NOT NULL));

ALTER TABLE shopify_connections
  ADD CONSTRAINT shopify_connections_domain_canonical
    CHECK (
      shop_domain = lower(shop_domain)
      AND shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
    ),
  ADD CONSTRAINT shopify_connections_counts_nonnegative
    CHECK (products_count >= 0 AND orders_count >= 0),
  ADD CONSTRAINT shopify_connections_currency_iso
    CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');

ALTER TABLE shopify_products
  ADD CONSTRAINT shopify_products_inventory_valid
    CHECK (minimum_price >= 0 AND revenue_30d >= 0 AND units_sold_30d >= 0),
  ADD CONSTRAINT shopify_products_counts_nonnegative
    CHECK (media_count >= 0 AND variants_count >= 0),
  ADD CONSTRAINT shopify_products_cro_score_range
    CHECK (cro_score BETWEEN 0 AND 100),
  ADD CONSTRAINT shopify_products_status_valid
    CHECK (status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
  ADD CONSTRAINT shopify_products_currency_iso
    CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT shopify_products_tags_array
    CHECK (jsonb_typeof(tags) = 'array'),
  ADD CONSTRAINT shopify_products_recommendations_array
    CHECK (jsonb_typeof(cro_recommendations) = 'array');

ALTER TABLE shopify_daily_metrics
  ADD CONSTRAINT shopify_daily_metrics_nonnegative
    CHECK (revenue >= 0 AND orders_count >= 0);

ALTER TABLE shopify_ad_campaigns
  ADD CONSTRAINT shopify_ad_campaigns_name_not_blank
    CHECK (length(btrim(name)) > 0),
  ADD CONSTRAINT shopify_ad_campaigns_budget_positive
    CHECK (daily_budget > 0),
  ADD CONSTRAINT shopify_ad_campaigns_currency_iso
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT shopify_ad_campaigns_products_array
    CHECK (jsonb_typeof(selected_product_ids) = 'array'),
  ADD CONSTRAINT shopify_ad_campaigns_strategy_object
    CHECK (jsonb_typeof(strategy) = 'object'),
  ADD CONSTRAINT shopify_ad_campaigns_creatives_array
    CHECK (jsonb_typeof(creatives) = 'array');

ALTER TABLE product_marketing_contexts
  ADD CONSTRAINT product_marketing_contexts_sections_object
    CHECK (jsonb_typeof(sections) = 'object');

DROP INDEX IF EXISTS users_active_idx;
DROP INDEX IF EXISTS product_marketing_contexts_updated_idx;
DROP INDEX IF EXISTS shopify_daily_metrics_period_idx;
DROP INDEX IF EXISTS shopify_products_performance_idx;
DROP INDEX IF EXISTS shopify_products_cro_score_idx;

ALTER TABLE cohorio_migrations
  ADD COLUMN IF NOT EXISTS checksum TEXT,
  ADD COLUMN IF NOT EXISTS execution_ms INTEGER;

CREATE INDEX IF NOT EXISTS shopify_connections_id_workspace_idx
  ON shopify_connections (id, workspace_id);
CREATE INDEX IF NOT EXISTS workspaces_active_org_idx
  ON workspaces (organization_id, is_default DESC, created_at)
  WHERE status = 'active';
CREATE INDEX shopify_connections_active_list_idx
  ON shopify_connections (workspace_id, installed_at DESC)
  WHERE status <> 'disconnected';
CREATE INDEX shopify_products_performance_idx
  ON shopify_products (connection_id, revenue_30d DESC, title);
CREATE INDEX shopify_products_cro_score_idx
  ON shopify_products (connection_id, cro_score, revenue_30d DESC, title);
CREATE INDEX shopify_ad_campaigns_active_list_idx
  ON shopify_ad_campaigns (connection_id, created_at DESC)
  WHERE status <> 'archived';
CREATE INDEX shopify_ad_campaign_products_connection_idx
  ON shopify_ad_campaign_products (connection_id, shopify_product_id);
CREATE INDEX audit_events_created_brin_idx
  ON audit_events USING BRIN (created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'auth_accounts', 'user_credentials', 'organizations',
    'organization_memberships', 'workspaces', 'shopify_connections',
    'shopify_ad_campaigns', 'product_marketing_contexts'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END
$$;
