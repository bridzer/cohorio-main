ALTER TABLE lifecycle_drafts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE lifecycle_drafts
  DROP CONSTRAINT IF EXISTS lifecycle_drafts_status_check;

ALTER TABLE lifecycle_drafts
  ADD CONSTRAINT lifecycle_drafts_status_check
    CHECK (status IN ('draft', 'sent'));

ALTER TABLE workspace_integrations
  ADD COLUMN IF NOT EXISTS ga4_property_id TEXT;
