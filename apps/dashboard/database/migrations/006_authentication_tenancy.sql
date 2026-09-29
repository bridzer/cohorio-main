CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email CITEXT NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),
  session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_active_idx
  ON users (email) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at DESC);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS auth_accounts_user_idx ON auth_accounts (user_id);

CREATE TABLE IF NOT EXISTS user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_algorithm TEXT NOT NULL DEFAULT 'argon2id',
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE CASCADE,
  identifier CITEXT NOT NULL,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('verify_email', 'reset_password', 'change_email')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_action_tokens_lookup_idx
  ON auth_action_tokens (identifier, purpose, expires_at DESC);
CREATE INDEX IF NOT EXISTS auth_action_tokens_cleanup_idx
  ON auth_action_tokens (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key_hash, action)
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_cleanup_idx
  ON auth_rate_limits (updated_at);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug CITEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id UUID NOT NULL
    REFERENCES organizations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  invited_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON organization_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS organization_memberships_role_idx
  ON organization_memberships (organization_id, role, status);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES organizations (id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id UUID NOT NULL
    REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_pending_idx
  ON organization_invitations (organization_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS organization_invitations_expiry_idx
  ON organization_invitations (expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'anonymous'
    CHECK (status IN ('anonymous', 'active', 'archived')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  UNIQUE (organization_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_default_organization_idx
  ON workspaces (organization_id)
  WHERE is_default = TRUE AND organization_id IS NOT NULL
    AND status <> 'archived';
CREATE INDEX IF NOT EXISTS workspaces_organization_idx
  ON workspaces (organization_id, status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT workspace_id FROM shopify_connections
      UNION
      SELECT workspace_id FROM product_marketing_contexts
    ) workspace_ids
    WHERE workspace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Existing workspace IDs must be valid UUIDs before applying authentication migration';
  END IF;
END
$$;

INSERT INTO workspaces (id, name, slug, status)
SELECT DISTINCT workspace_id::uuid, 'Recovered workspace', 'recovered', 'anonymous'
FROM (
  SELECT workspace_id FROM shopify_connections
  UNION
  SELECT workspace_id FROM product_marketing_contexts
) workspace_ids
ON CONFLICT (id) DO NOTHING;

ALTER TABLE shopify_connections
  ALTER COLUMN workspace_id TYPE UUID USING workspace_id::uuid;
ALTER TABLE product_marketing_contexts
  ALTER COLUMN workspace_id TYPE UUID USING workspace_id::uuid;

ALTER TABLE shopify_connections
  ADD CONSTRAINT shopify_connections_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE product_marketing_contexts
  ADD CONSTRAINT product_marketing_contexts_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE shopify_connections
  VALIDATE CONSTRAINT shopify_connections_workspace_fk;
ALTER TABLE product_marketing_contexts
  VALIDATE CONSTRAINT product_marketing_contexts_workspace_fk;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID REFERENCES organizations (id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces (id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_organization_idx
  ON audit_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_workspace_idx
  ON audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON audit_events (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_type_idx
  ON audit_events (event_type, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_last_organization_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role = 'owner' AND OLD.status = 'active'
     AND (
       TG_OP = 'DELETE'
       OR NEW.role <> 'owner'
       OR NEW.status <> 'active'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM organization_memberships
       WHERE organization_id = OLD.organization_id
         AND role = 'owner'
         AND status = 'active'
         AND user_id <> OLD.user_id
     )
  THEN
    RAISE EXCEPTION 'An organization must retain at least one active owner';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

DROP TRIGGER IF EXISTS organization_memberships_owner_guard
  ON organization_memberships;
CREATE TRIGGER organization_memberships_owner_guard
BEFORE DELETE OR UPDATE OF role, status ON organization_memberships
FOR EACH ROW EXECUTE FUNCTION prevent_last_organization_owner();
