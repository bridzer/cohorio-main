-- Milestone 1 (assessment engine extension): enrich website_analyses with
-- structured discovery outputs, add organization_id isolation columns, and add
-- brand_assessment_findings, intelligence_sources, and intelligence_jobs.
-- Strictly additive and safe for existing rows.

ALTER TABLE website_analyses
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS inferred_business_model TEXT,
  ADD COLUMN IF NOT EXISTS products_services JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS messaging JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_audiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS positioning TEXT,
  ADD COLUMN IF NOT EXISTS voice_characteristics JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS marketing_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS seo_opportunities JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_info JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pages_crawled JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS intelligence_summary TEXT;

ALTER TABLE brand_assessments
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE brand_recommendations
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS edited_by TEXT,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS brand_assessment_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID,
  dimension TEXT NOT NULL CHECK (dimension IN (
    'identity', 'business-model', 'product-clarity', 'audience',
    'value-prop', 'positioning', 'voice', 'visual-identity',
    'market', 'differentiation', 'marketing-presence', 'seo'
  )),
  finding_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'gap', 'conflict')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, dimension, finding_key)
);

CREATE INDEX IF NOT EXISTS brand_assessment_findings_workspace_idx
  ON brand_assessment_findings (workspace_id, dimension, severity);

CREATE TABLE IF NOT EXISTS intelligence_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('website', 'document', 'onboarding', 'integration', 'research', 'user_input')
  ),
  source_key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  url TEXT,
  reliability TEXT NOT NULL DEFAULT 'medium' CHECK (reliability IN ('high', 'medium', 'low')),
  excerpt TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, source_type, source_key)
);

CREATE INDEX IF NOT EXISTS intelligence_sources_workspace_idx
  ON intelligence_sources (workspace_id, source_type, fetched_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID,
  job_kind TEXT NOT NULL CHECK (job_kind IN ('brand_assessment', 'brand_discovery', 'brand_completion')),
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (
    status IN ('QUEUED', 'ANALYZING', 'GENERATING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  partial_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_jobs_workspace_idx
  ON intelligence_jobs (workspace_id, job_kind, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_jobs_active_idempotency_idx
  ON intelligence_jobs (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('QUEUED', 'ANALYZING', 'GENERATING');
