-- Scheduled agent runs, a Postgres job queue for background work, and worker
-- heartbeats so the UI can tell whether anything will pick jobs up.

CREATE TABLE IF NOT EXISTS workspace_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  created_by UUID NOT NULL REFERENCES users (id),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 4000),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  weekday SMALLINT CHECK (weekday BETWEEN 0 AND 6),
  hour SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 64),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notify_email BOOLEAN NOT NULL DEFAULT TRUE,
  thread_id UUID REFERENCES agent_threads (id) ON DELETE SET NULL,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('completed', 'failed', 'skipped')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((frequency = 'weekly') = (weekday IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS workspace_automations_due_idx
  ON workspace_automations (next_run_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS workspace_automations_workspace_idx
  ON workspace_automations (workspace_id, created_at);

CREATE TABLE IF NOT EXISTS agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  kind TEXT NOT NULL CHECK (kind IN ('automation', 'notify')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_jobs_claim_idx
  ON agent_jobs (run_after) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS agent_jobs_workspace_created_idx
  ON agent_jobs (workspace_id, created_at DESC);

-- At most one queued or running job per automation, so "Run now" and the
-- scheduler cannot stack duplicate runs.
CREATE UNIQUE INDEX IF NOT EXISTS agent_jobs_one_active_automation_idx
  ON agent_jobs ((payload ->> 'automationId'))
  WHERE kind = 'automation' AND status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS cohorio_worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
