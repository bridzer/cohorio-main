-- Agent conversations, run records, human-approved actions and workspace memory.
-- Every table carries workspace_id; repositories filter on it for tenancy.

CREATE TABLE IF NOT EXISTS agent_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  created_by UUID NOT NULL REFERENCES users (id),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_threads_workspace_updated_idx
  ON agent_threads (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  thread_id UUID NOT NULL REFERENCES agent_threads (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  stop_reason TEXT
    CHECK (stop_reason IN ('completed', 'step_limit', 'tool_limit', 'token_limit')),
  prompt TEXT NOT NULL,
  output TEXT,
  copilot_run_id UUID REFERENCES copilot_runs (id),
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  model_calls INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_runs_workspace_created_idx
  ON agent_runs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_thread_created_idx
  ON agent_runs (thread_id, created_at);

-- Conversational transcript only: user prompts, final answers and action
-- events. Per-tool detail lives in agent_runs.steps.
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  thread_id UUID NOT NULL REFERENCES agent_threads (id) ON DELETE CASCADE,
  run_id UUID REFERENCES agent_runs (id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'event')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_messages_thread_seq_idx
  ON agent_messages (thread_id, seq);

CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  thread_id UUID NOT NULL REFERENCES agent_threads (id) ON DELETE CASCADE,
  run_id UUID REFERENCES agent_runs (id) ON DELETE SET NULL,
  tool TEXT NOT NULL,
  input JSONB NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  requested_by UUID NOT NULL REFERENCES users (id),
  decided_by UUID REFERENCES users (id),
  decided_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_actions_workspace_status_idx
  ON agent_actions (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
  created_by UUID REFERENCES users (id),
  source_run_id UUID REFERENCES agent_runs (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workspace_memories_workspace_created_idx
  ON workspace_memories (workspace_id, created_at DESC);
