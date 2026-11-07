export async function register() {
  // The worker needs Node APIs and Postgres; never start it in the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Off by default so local dev servers do not poll a shared database by accident.
  if (process.env.COHORIO_WORKER_ENABLED !== "true") return;
  if (!process.env.DATABASE_URL) {
    console.warn(
      "COHORIO_WORKER_ENABLED=true but DATABASE_URL is not set; the agent worker will not start.",
    );
    return;
  }
  const { startWorker } = await import("./lib/agent/worker");
  // Not awaited: register must finish before the server accepts requests.
  startWorker({ intervalMs: Number(process.env.COHORIO_WORKER_INTERVAL_MS) || undefined });
}
