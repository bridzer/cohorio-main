import type { PoolClient } from "pg";
import { query } from "@/lib/database";

export type JobKind = "automation" | "notify";

export type AgentJob = {
  id: string;
  workspaceId: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

type JobRow = {
  id: string;
  workspace_id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

const publicJob = (row: JobRow): AgentJob => ({
  id: row.id,
  workspaceId: row.workspace_id,
  kind: row.kind,
  payload: row.payload,
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
});

/** Longer than the longest job is allowed to run, so a live job is never reclaimed. */
export const JOB_LEASE_MINUTES = 15;

type Runner = Pick<PoolClient, "query">;

/**
 * Queues a job. Returns null when an equivalent automation job is already
 * queued or running (enforced by a partial unique index).
 */
export async function enqueueJob(
  input: {
    workspaceId: string;
    kind: JobKind;
    payload: Record<string, unknown>;
    maxAttempts?: number;
    runAfter?: Date;
  },
  runner: Runner = { query: query as Runner["query"] },
) {
  const result = await runner.query<{ id: string }>(
    `INSERT INTO agent_jobs (workspace_id, kind, payload, max_attempts, run_after)
     VALUES ($1, $2, $3::jsonb, $4, COALESCE($5, NOW()))
     ON CONFLICT ((payload ->> 'automationId'))
       WHERE kind = 'automation' AND status IN ('queued', 'running')
       DO NOTHING
     RETURNING id`,
    [
      input.workspaceId,
      input.kind,
      JSON.stringify(input.payload),
      input.maxAttempts ?? 1,
      input.runAfter ?? null,
    ],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Atomically claims the next runnable job: queued and due, or running with an
 * expired lease (its worker died) and attempts left. SKIP LOCKED lets several
 * workers poll the same table without blocking or double-claiming.
 */
export async function claimNextJob() {
  const result = await query<JobRow>(
    `UPDATE agent_jobs
        SET status = 'running',
            attempts = attempts + 1,
            locked_until = NOW() + make_interval(mins => $1),
            started_at = NOW()
      WHERE id = (
        SELECT id FROM agent_jobs
         WHERE attempts < max_attempts
           AND ((status = 'queued' AND run_after <= NOW())
             OR (status = 'running' AND locked_until < NOW()))
         ORDER BY run_after
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING id, workspace_id, kind, payload, attempts, max_attempts`,
    [JOB_LEASE_MINUTES],
  );
  return result.rows[0] ? publicJob(result.rows[0]) : null;
}

export async function completeJob(id: string) {
  await query(
    `UPDATE agent_jobs
        SET status = 'completed', locked_until = NULL, finished_at = NOW(), last_error = NULL
      WHERE id = $1`,
    [id],
  );
}

/** Retries with exponential backoff while attempts remain, then fails for good. */
export async function failJob(job: AgentJob, error: string) {
  const retry = job.attempts < job.maxAttempts;
  await query(
    `UPDATE agent_jobs
        SET status = $2,
            last_error = $3,
            locked_until = NULL,
            run_after = CASE WHEN $2 = 'queued'
                             THEN NOW() + make_interval(secs => $4) ELSE run_after END,
            finished_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END
      WHERE id = $1`,
    [job.id, retry ? "queued" : "failed", error.slice(0, 500), 30 * 2 ** (job.attempts - 1)],
  );
}

/** Jobs whose worker died on their final attempt can never be reclaimed; close them out. */
export async function failAbandonedJobs() {
  const result = await query<{
    id: string;
    workspace_id: string;
    kind: JobKind;
    payload: Record<string, unknown>;
  }>(
    `UPDATE agent_jobs
        SET status = 'failed', locked_until = NULL, finished_at = NOW(),
            last_error = 'The worker stopped before this job finished.'
      WHERE status = 'running' AND locked_until < NOW() AND attempts >= max_attempts
      RETURNING id, workspace_id, kind, payload`,
  );
  return result.rows;
}

/** Interactive runs whose server process died mid-run would otherwise stay "running" forever. */
export async function failStaleAgentRuns() {
  await query(
    `UPDATE agent_runs SET status = 'failed', finished_at = NOW()
      WHERE status = 'running' AND created_at < NOW() - INTERVAL '30 minutes'`,
  );
}

export async function recordHeartbeat(workerId: string) {
  await query(
    `INSERT INTO cohorio_worker_heartbeats (worker_id, last_seen_at) VALUES ($1, NOW())
     ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = NOW()`,
    [workerId],
  );
}

export async function workerOnline(withinSeconds = 120) {
  const result = await query<{ online: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM cohorio_worker_heartbeats
        WHERE last_seen_at > NOW() - make_interval(secs => $1)
     ) AS online`,
    [withinSeconds],
  );
  return Boolean(result.rows[0]?.online);
}
