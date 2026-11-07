// Read-only production-activation check for the agent worker.
//   npm run worker:smoke
// Reads .env through @next/env (same as the dev server), prints PASS/WARN/FAIL
// lines and never prints secret values — only whether variables are set.
import nextEnv from "@next/env";
import pg from "pg";
import { postgresSslConfig } from "./postgres-ssl.mjs";

nextEnv.loadEnvConfig(process.cwd());

let failures = 0;
const pass = (label, detail = "") => console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
const warn = (label, detail = "") => console.log(`WARN  ${label}${detail ? ` — ${detail}` : ""}`);
const fail = (label, detail = "") => {
  failures += 1;
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
};
const isSet = (name) => Boolean(process.env[name]?.trim());

// --- Environment configuration (names only) --------------------------------
if (isSet("DATABASE_URL")) pass("DATABASE_URL is set");
else fail("DATABASE_URL is set", "the worker and the app cannot reach Postgres without it");

if (process.env.COHORIO_WORKER_ENABLED === "true") {
  pass("COHORIO_WORKER_ENABLED=true", "the worker starts with the server (on the deployed service)");
} else {
  warn(
    "COHORIO_WORKER_ENABLED is not 'true' in this environment",
    "must be true on Railway; keep it off on local dev servers that share the production database",
  );
}

if (process.env.DATABASE_SSL === "true" && process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false") {
  warn(
    "DATABASE_SSL=true without DATABASE_SSL_REJECT_UNAUTHORIZED=false",
    "Railway Postgres uses a self-signed certificate; ticks fail with SELF_SIGNED_CERT_IN_CHAIN",
  );
} else {
  pass("Database SSL settings are consistent");
}

const smtp = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"].every(isSet);
const resend = isSet("RESEND_API_KEY") && isSet("AUTH_EMAIL_FROM");
if (smtp || resend) pass("Email transport configured", smtp ? "SMTP" : "Resend");
else warn("No email transport", "automation and account emails will not be sent (set SMTP_* or RESEND_API_KEY + AUTH_EMAIL_FROM)");

if (isSet("COHORIO_LLM_API_KEY")) {
  pass("COHORIO_LLM_API_KEY is set", `provider=${process.env.COHORIO_LLM_PROVIDER?.trim() || "(auto-detect)"}, model=${process.env.COHORIO_LLM_MODEL?.trim() || "(default)"}`);
} else {
  fail("COHORIO_LLM_API_KEY is set", "agent runs cannot call a model without it");
}

// --- Database state ----------------------------------------------------------
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: postgresSslConfig() });
try {
  await pool.query("SELECT 1");
  pass("Database connection works");

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('agent_jobs', 'workspace_automations', 'cohorio_worker_heartbeats', 'agent_runs')`,
  );
  const found = new Set(tables.rows.map((row) => row.table_name));
  for (const table of ["agent_jobs", "workspace_automations", "cohorio_worker_heartbeats", "agent_runs"]) {
    if (found.has(table)) pass(`Table ${table} exists`);
    else fail(`Table ${table} exists`, "run npm run db:migrate against this database");
  }

  if (found.has("cohorio_worker_heartbeats")) {
    const heartbeat = await pool.query(
      "SELECT max(last_seen_at) AS latest, count(*)::int AS workers FROM cohorio_worker_heartbeats",
    );
    const latest = heartbeat.rows[0]?.latest ? new Date(heartbeat.rows[0].latest) : null;
    const ageSeconds = latest ? Math.round((Date.now() - latest.getTime()) / 1000) : null;
    if (latest && ageSeconds <= 120) {
      pass("Worker heartbeat is fresh", `${heartbeat.rows[0].workers} worker(s), last seen ${ageSeconds}s ago`);
    } else if (latest) {
      fail("Worker heartbeat is fresh", `last seen ${ageSeconds}s ago — the deployed worker is stopped or failing (check Railway logs for 'Agent worker tick failed')`);
    } else {
      fail("Worker heartbeat exists", "no worker has ever reported — set COHORIO_WORKER_ENABLED=true on the deployed service and redeploy");
    }
  }

  if (found.has("agent_jobs")) {
    const jobs = await pool.query(
      "SELECT status, count(*)::int AS c FROM agent_jobs GROUP BY status ORDER BY status",
    );
    const summary = jobs.rows.map((row) => `${row.status}=${row.c}`).join(", ") || "empty queue";
    pass("Job queue readable", summary);
    const failed = await pool.query(
      "SELECT last_error, finished_at FROM agent_jobs WHERE status = 'failed' ORDER BY finished_at DESC NULLS LAST LIMIT 1",
    );
    if (failed.rows[0]) warn("Most recent failed job", `${failed.rows[0].last_error} (${failed.rows[0].finished_at ? new Date(failed.rows[0].finished_at).toISOString() : "no finish time"})`);
  }

  if (found.has("workspace_automations")) {
    const automations = await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE enabled)::int AS enabled,
              count(*) FILTER (WHERE enabled AND next_run_at <= NOW())::int AS overdue
         FROM workspace_automations`,
    );
    const row = automations.rows[0];
    pass("Automations readable", `${row.enabled}/${row.total} enabled, ${row.overdue} overdue`);
    if (row.overdue > 0) warn("Overdue automations exist", "they will run on the worker's next tick");
  }
} catch (error) {
  const code = error?.code ?? "";
  const hint =
    code === "SELF_SIGNED_CERT_IN_CHAIN"
      ? "set DATABASE_SSL_REJECT_UNAUTHORIZED=false (Railway Postgres uses a self-signed certificate)"
      : code === "ENOTFOUND"
        ? "the database host is not reachable from here (postgres.railway.internal only resolves inside Railway; use the public proxy URL locally)"
        : error.message;
  fail("Database connection works", `${code} ${hint}`.trim());
} finally {
  await pool.end();
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll hard checks passed.");
process.exitCode = failures ? 1 : 0;
