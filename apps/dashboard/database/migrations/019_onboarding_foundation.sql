-- Milestone 1: onboarding foundation (profiles + resumable wizard sessions).
-- Additive only. workspace_id follows the repo convention for
-- workspace-scoped tables (TEXT, tenancy enforced in application code via
-- requireWorkspaceAccess, as with product_marketing_contexts).

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  address_line1 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  workspace_id TEXT PRIMARY KEY,
  current_stage TEXT NOT NULL DEFAULT 'profile'
    CHECK (current_stage IN ('profile', 'objective', 'brand', 'channels', 'integrations', 'activation')),
  stages JSONB NOT NULL DEFAULT '{}'::jsonb,
  objective TEXT
    CHECK (objective IS NULL OR objective IN ('business', 'social')),
  brand_path TEXT
    CHECK (brand_path IS NULL OR brand_path IN ('import', 'build')),
  organization_category TEXT,
  business_name TEXT,
  website_url TEXT,
  selected_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_objective TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_sessions_updated_idx
  ON onboarding_sessions (updated_at DESC);
