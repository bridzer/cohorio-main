import { query } from "@/lib/database";
import type { AgentRunResult } from "./loop";
import type { PendingAction, ToolStep } from "./types";

export const MEMORY_LIMIT = 50;
export const MEMORY_MAX_LENGTH = 300;

export type ThreadMessageRole = "user" | "assistant" | "event";
export type AgentActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export type AgentThread = { id: string; title: string; createdAt: string; updatedAt: string };
export type ThreadMessage = {
  id: string;
  runId: string | null;
  role: ThreadMessageRole;
  content: string;
  createdAt: string;
};
export type AgentRunRecord = {
  id: string;
  status: "running" | "completed" | "failed";
  stopReason: AgentRunResult["stopReason"] | null;
  steps: ToolStep[];
  skills: string[];
  usage: { promptTokens: number; completionTokens: number; modelCalls: number };
  createdAt: string;
  finishedAt: string | null;
};
export type AgentAction = {
  id: string;
  threadId: string;
  runId: string | null;
  tool: string;
  input: unknown;
  summary: string;
  status: AgentActionStatus;
  result: unknown;
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
};
export type WorkspaceMemory = { id: string; content: string; createdAt: string };

const iso = (value: Date | string) => new Date(value).toISOString();
const isoOrNull = (value: Date | string | null) => (value ? iso(value) : null);

type ThreadRow = { id: string; title: string; created_at: Date; updated_at: Date };
const publicThread = (row: ThreadRow): AgentThread => ({
  id: row.id,
  title: row.title,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export function threadTitle(prompt: string) {
  const line = prompt.split("\n").find((candidate) => candidate.trim())?.trim() ?? "New conversation";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export async function createThread(workspaceId: string, userId: string, title: string) {
  const result = await query<ThreadRow>(
    `INSERT INTO agent_threads (workspace_id, created_by, title)
     VALUES ($1, $2, $3)
     RETURNING id, title, created_at, updated_at`,
    [workspaceId, userId, title],
  );
  return publicThread(result.rows[0]);
}

export async function getThread(workspaceId: string, threadId: string) {
  const result = await query<ThreadRow>(
    `SELECT id, title, created_at, updated_at
       FROM agent_threads
      WHERE id = $1 AND workspace_id = $2`,
    [threadId, workspaceId],
  );
  return result.rows[0] ? publicThread(result.rows[0]) : null;
}

export async function listThreads(workspaceId: string, limit = 30) {
  const result = await query<ThreadRow>(
    `SELECT id, title, created_at, updated_at
       FROM agent_threads
      WHERE workspace_id = $1
      ORDER BY updated_at DESC
      LIMIT $2`,
    [workspaceId, limit],
  );
  return result.rows.map(publicThread);
}

type MessageRow = {
  id: string;
  run_id: string | null;
  role: ThreadMessageRole;
  content: string;
  created_at: Date;
};
const publicMessage = (row: MessageRow): ThreadMessage => ({
  id: row.id,
  runId: row.run_id,
  role: row.role,
  content: row.content,
  createdAt: iso(row.created_at),
});

export async function appendMessage(input: {
  workspaceId: string;
  threadId: string;
  runId: string | null;
  role: ThreadMessageRole;
  content: string;
}) {
  await query(
    `WITH inserted AS (
       INSERT INTO agent_messages (workspace_id, thread_id, run_id, role, content)
       SELECT $1, id, $3, $4, $5 FROM agent_threads WHERE id = $2 AND workspace_id = $1
       RETURNING thread_id
     )
     UPDATE agent_threads SET updated_at = NOW()
      WHERE id IN (SELECT thread_id FROM inserted)`,
    [input.workspaceId, input.threadId, input.runId, input.role, input.content],
  );
}

/** Most recent messages, returned oldest first. */
export async function listThreadMessages(workspaceId: string, threadId: string, limit = 200) {
  const result = await query<MessageRow>(
    `SELECT id, run_id, role, content, created_at
       FROM (
         SELECT id, run_id, role, content, created_at, seq
           FROM agent_messages
          WHERE thread_id = $1 AND workspace_id = $2
          ORDER BY seq DESC
          LIMIT $3
       ) recent
      ORDER BY seq ASC`,
    [threadId, workspaceId, limit],
  );
  return result.rows.map(publicMessage);
}

type RunRow = {
  id: string;
  status: AgentRunRecord["status"];
  stop_reason: AgentRunRecord["stopReason"];
  steps: ToolStep[];
  skills: string[];
  prompt_tokens: number;
  completion_tokens: number;
  model_calls: number;
  created_at: Date;
  finished_at: Date | null;
};
const publicRun = (row: RunRow): AgentRunRecord => ({
  id: row.id,
  status: row.status,
  stopReason: row.stop_reason,
  steps: row.steps,
  skills: row.skills,
  usage: {
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    modelCalls: row.model_calls,
  },
  createdAt: iso(row.created_at),
  finishedAt: isoOrNull(row.finished_at),
});

export async function startRun(input: {
  workspaceId: string;
  threadId: string;
  userId: string;
  prompt: string;
}) {
  const result = await query<{ id: string }>(
    `INSERT INTO agent_runs (workspace_id, thread_id, user_id, prompt)
     SELECT $1, id, $3, $4 FROM agent_threads WHERE id = $2 AND workspace_id = $1
     RETURNING id`,
    [input.workspaceId, input.threadId, input.userId, input.prompt],
  );
  if (!result.rows[0]) throw new Error("Agent thread not found.");
  return result.rows[0].id;
}

export async function finishRun(
  workspaceId: string,
  runId: string,
  result: AgentRunResult,
  copilotRunId: string | null,
) {
  await query(
    `UPDATE agent_runs
        SET status = 'completed', stop_reason = $3, output = $4, copilot_run_id = $5,
            steps = $6::jsonb, skills = $7::jsonb, prompt_tokens = $8,
            completion_tokens = $9, model_calls = $10, finished_at = NOW()
      WHERE id = $1 AND workspace_id = $2`,
    [
      runId,
      workspaceId,
      result.stopReason,
      result.output,
      copilotRunId,
      JSON.stringify(result.steps),
      JSON.stringify(result.skillsLoaded),
      result.usage.promptTokens,
      result.usage.completionTokens,
      result.usage.modelCalls,
    ],
  );
}

export async function failRun(workspaceId: string, runId: string) {
  await query(
    `UPDATE agent_runs SET status = 'failed', finished_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND status = 'running'`,
    [runId, workspaceId],
  );
}

export async function listThreadRuns(workspaceId: string, threadId: string) {
  const result = await query<RunRow>(
    `SELECT id, status, stop_reason, steps, skills, prompt_tokens, completion_tokens,
            model_calls, created_at, finished_at
       FROM agent_runs
      WHERE thread_id = $1 AND workspace_id = $2
      ORDER BY created_at ASC
      LIMIT 200`,
    [threadId, workspaceId],
  );
  return result.rows.map(publicRun);
}

type ActionRow = {
  id: string;
  thread_id: string;
  run_id: string | null;
  tool: string;
  input: unknown;
  summary: string;
  status: AgentActionStatus;
  result: unknown;
  error: string | null;
  created_at: Date;
  decided_at: Date | null;
};
const ACTION_COLUMNS =
  "id, thread_id, run_id, tool, input, summary, status, result, error, created_at, decided_at";
const publicAction = (row: ActionRow): AgentAction => ({
  id: row.id,
  threadId: row.thread_id,
  runId: row.run_id,
  tool: row.tool,
  input: row.input,
  summary: row.summary,
  status: row.status,
  result: row.result,
  error: row.error,
  createdAt: iso(row.created_at),
  decidedAt: isoOrNull(row.decided_at),
});

export async function insertActions(input: {
  workspaceId: string;
  threadId: string;
  runId: string;
  userId: string;
  actions: PendingAction[];
}) {
  const inserted: AgentAction[] = [];
  for (const action of input.actions) {
    const result = await query<ActionRow>(
      `INSERT INTO agent_actions (workspace_id, thread_id, run_id, tool, input, summary, requested_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING ${ACTION_COLUMNS}`,
      [
        input.workspaceId,
        input.threadId,
        input.runId,
        action.tool,
        JSON.stringify(action.input),
        action.summary,
        input.userId,
      ],
    );
    inserted.push(publicAction(result.rows[0]));
  }
  return inserted;
}

export async function listActions(
  workspaceId: string,
  filter: { status?: AgentActionStatus; threadId?: string } = {},
) {
  const result = await query<ActionRow>(
    `SELECT ${ACTION_COLUMNS}
       FROM agent_actions
      WHERE workspace_id = $1
        AND ($2::text IS NULL OR status = $2)
        AND ($3::uuid IS NULL OR thread_id = $3)
      ORDER BY created_at DESC
      LIMIT 100`,
    [workspaceId, filter.status ?? null, filter.threadId ?? null],
  );
  return result.rows.map(publicAction);
}

/**
 * Moves a pending action to approved or rejected. The status predicate makes
 * this the single gate against double execution: only one caller gets a row.
 */
export async function claimAction(
  workspaceId: string,
  actionId: string,
  userId: string,
  decision: "approved" | "rejected",
) {
  const result = await query<ActionRow>(
    `UPDATE agent_actions
        SET status = $4, decided_by = $3, decided_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
      RETURNING ${ACTION_COLUMNS}`,
    [actionId, workspaceId, userId, decision],
  );
  return result.rows[0] ? publicAction(result.rows[0]) : null;
}

export async function completeAction(
  workspaceId: string,
  actionId: string,
  outcome: { status: "executed"; result: unknown } | { status: "failed"; error: string },
) {
  const result = await query<ActionRow>(
    `UPDATE agent_actions
        SET status = $3, result = $4::jsonb, error = $5
      WHERE id = $1 AND workspace_id = $2 AND status = 'approved'
      RETURNING ${ACTION_COLUMNS}`,
    [
      actionId,
      workspaceId,
      outcome.status,
      outcome.status === "executed" ? JSON.stringify(outcome.result ?? null) : null,
      outcome.status === "failed" ? outcome.error : null,
    ],
  );
  return result.rows[0] ? publicAction(result.rows[0]) : null;
}

type MemoryRow = { id: string; content: string; created_at: Date };
const publicMemory = (row: MemoryRow): WorkspaceMemory => ({
  id: row.id,
  content: row.content,
  createdAt: iso(row.created_at),
});

export async function listMemories(workspaceId: string) {
  const result = await query<MemoryRow>(
    `SELECT id, content, created_at
       FROM workspace_memories
      WHERE workspace_id = $1
      ORDER BY created_at ASC
      LIMIT $2`,
    [workspaceId, MEMORY_LIMIT],
  );
  return result.rows.map(publicMemory);
}

/** Returns null when the workspace already holds MEMORY_LIMIT memories. */
export async function addMemory(input: {
  workspaceId: string;
  userId: string;
  content: string;
  sourceRunId?: string | null;
}) {
  const result = await query<MemoryRow>(
    `INSERT INTO workspace_memories (workspace_id, content, created_by, source_run_id)
     SELECT $1, $2, $3, $4
      WHERE (SELECT count(*) FROM workspace_memories WHERE workspace_id = $1) < $5
     RETURNING id, content, created_at`,
    [input.workspaceId, input.content, input.userId, input.sourceRunId ?? null, MEMORY_LIMIT],
  );
  return result.rows[0] ? publicMemory(result.rows[0]) : null;
}

export async function deleteMemory(workspaceId: string, memoryId: string) {
  const result = await query(
    `DELETE FROM workspace_memories WHERE id = $1 AND workspace_id = $2`,
    [memoryId, workspaceId],
  );
  return Boolean(result.rowCount);
}
