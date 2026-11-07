-- Per-run model cost tracking and the subscription lifecycle state the Stripe
-- webhook keeps in sync. stripe_customer_ref is a SHA-256 hash of the Stripe
-- customer id so webhook events can find the workspace; the id itself stays
-- encrypted in stripe_customer_id.

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12, 6);

CREATE INDEX IF NOT EXISTS agent_runs_workspace_created_cost_idx
  ON agent_runs (workspace_id, created_at DESC);

ALTER TABLE workspace_plans
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete'));
ALTER TABLE workspace_plans ADD COLUMN IF NOT EXISTS stripe_customer_ref TEXT;

CREATE INDEX IF NOT EXISTS workspace_plans_stripe_customer_ref_idx
  ON workspace_plans (stripe_customer_ref);
