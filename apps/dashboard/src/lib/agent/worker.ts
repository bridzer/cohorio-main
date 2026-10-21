import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { roleAllows } from "@/lib/auth/roles";
import { assertTaskQuota, recordTaskEvent, TaskQuotaError } from "@/lib/billing/quota";
import { runAgentTurn, ThreadNotFoundError } from "./index";
import {
  creatorRole,
  enqueueDueAutomations,
  getAutomationForRun,
  recordAutomationResult,
} from "./automations";
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failAbandonedJobs,
  failJob,
  failStaleAgentRuns,
  recordHeartbeat,
  type AgentJob,
} from "./jobs";
import { sendAutomationEmail } from "./notify";

/** Hard ceiling for one scheduled run; well inside the job lease. */
const AUTOMATION_TIMEOUT_MS = 10 * 60_000;
const JOBS_PER_TICK = 5;

function scheduledPrompt(name: string, prompt: string) {
  return [
    `[Scheduled run of the automation "${name}". Nobody is watching this run live,`,
    "so do not ask questions: make reasonable assumptions, state them, and finish the work.",
    "Anything that needs approval will wait for a person.]",
    "",
    prompt,
  ].join("\n");
}

async function queueNotification(
  workspaceId: string,
  payload: { automationId: string; threadId: string | null; status: "completed" | "failed"; pendingApprovals: number },
) {
  await enqueueJob({ workspaceId, kind: "notify", payload, maxAttempts: 3 });
}

export async function runAutomationJob(job: AgentJob) {
  const automationId = String(job.payload.automationId ?? "");
  const automation = await getAutomationForRun(job.workspaceId, automationId);
  if (!automation) return; // Deleted after it was queued.
  // Paused after the scheduler queued it. A manual "Run now" still runs.
  if (!automation.enabled && job.payload.manual !== true) return;

  const creator = await creatorRole(job.workspaceId, automation.createdBy);
  if (!creator || !roleAllows(creator.role, "member")) {
    await recordAutomationResult(job.workspaceId, automation.id, {
      status: "skipped",
      error: "The person who created this automation no longer has member access. It was paused.",
      disable: true,
    });
    return;
  }
  try {
    await assertTaskQuota(job.workspaceId);
  } catch (error) {
    if (error instanceof TaskQuotaError) {
      await recordAutomationResult(job.workspaceId, automation.id, {
        status: "skipped",
        error: "Skipped: the workspace has used this month's task allowance.",
      });
      return;
    }
    throw error;
  }

  const ctx = {
    workspaceId: job.workspaceId,
    userId: automation.createdBy,
    role: creator.role,
    signal: AbortSignal.timeout(AUTOMATION_TIMEOUT_MS),
  };
  const prompt = scheduledPrompt(automation.name, automation.prompt);
  let turn;
  try {
    turn = await runAgentTurn({ ctx, prompt, threadId: automation.threadId ?? undefined });
  } catch (error) {
    if (!(error instanceof ThreadNotFoundError)) {
      await recordAutomationResult(job.workspaceId, automation.id, {
        status: "failed",
        error: "The run stopped before it finished.",
      });
      if (automation.notifyEmail) {
        await queueNotification(job.workspaceId, {
          automationId: automation.id,
          threadId: automation.threadId,
          status: "failed",
          pendingApprovals: 0,
        });
      }
      throw error;
    }
    // The automation's conversation was deleted; start a fresh one.
    turn = await runAgentTurn({ ctx, prompt });
  }
  await recordTaskEvent(job.workspaceId, "copilot");
  await recordAutomationResult(job.workspaceId, automation.id, {
    status: "completed",
    threadId: turn.threadId,
  });
  if (automation.notifyEmail) {
    await queueNotification(job.workspaceId, {
      automationId: automation.id,
      threadId: turn.threadId,
      status: "completed",
      pendingApprovals: turn.actions.length,
    });
  }
}

export async function runNotifyJob(job: AgentJob) {
  const automation = await getAutomationForRun(job.workspaceId, String(job.payload.automationId ?? ""));
  if (!automation) return;
  const creator = await creatorRole(job.workspaceId, automation.createdBy);
  if (!creator) return;
  await sendAutomationEmail({
    to: creator.email,
    automationName: automation.name,
    threadId: typeof job.payload.threadId === "string" ? job.payload.threadId : null,
    status: job.payload.status === "failed" ? "failed" : "completed",
    pendingApprovals: Number(job.payload.pendingApprovals ?? 0),
  });
}

const HANDLERS: Record<AgentJob["kind"], (job: AgentJob) => Promise<void>> = {
  automation: runAutomationJob,
  notify: runNotifyJob,
};

/** Claims and runs one job. Returns false when the queue had nothing runnable. */
export async function processNextJob() {
  const job = await claimNextJob();
  if (!job) return false;
  try {
    await HANDLERS[job.kind](job);
    await completeJob(job.id);
  } catch (error) {
    console.error(`Agent job ${job.kind} ${job.id} failed`, error);
    await failJob(job, error instanceof Error && error.name === "TimeoutError"
      ? "The run hit its time limit."
      : "The job failed.");
  }
  return true;
}

async function closeAbandonedJobs() {
  for (const job of await failAbandonedJobs()) {
    const automationId = job.payload.automationId;
    if (job.kind !== "automation" || typeof automationId !== "string") continue;
    await recordAutomationResult(job.workspace_id, automationId, {
      status: "failed",
      error: "The worker stopped before this run finished.",
    });
  }
}

export async function workerTick(workerId: string) {
  await recordHeartbeat(workerId);
  await enqueueDueAutomations();
  await closeAbandonedJobs();
  await failStaleAgentRuns();
  for (let processed = 0; processed < JOBS_PER_TICK; processed += 1) {
    if (!(await processNextJob())) break;
  }
}

declare global {
  var __cohorioWorker: { stop: () => Promise<void> } | undefined;
}

/**
 * Polls the queue on an interval inside this server process. Ticks never
 * overlap, and SIGTERM lets the current job finish before the process exits.
 */
export function startWorker(options: { intervalMs?: number } = {}) {
  if (globalThis.__cohorioWorker) return globalThis.__cohorioWorker;
  const intervalMs = Math.max(5_000, options.intervalMs ?? 15_000);
  const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> = Promise.resolve();

  const loop = () => {
    if (stopped) return;
    current = workerTick(workerId)
      .catch((error) => console.error("Agent worker tick failed", error))
      .finally(() => {
        if (!stopped) timer = setTimeout(loop, intervalMs);
      });
  };
  const stop = async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await current;
  };
  process.once("SIGTERM", () => void stop());
  console.info(`Cohorio agent worker started (${workerId}, every ${intervalMs / 1000}s).`);
  timer = setTimeout(loop, 1_000);
  globalThis.__cohorioWorker = { stop };
  return globalThis.__cohorioWorker;
}
