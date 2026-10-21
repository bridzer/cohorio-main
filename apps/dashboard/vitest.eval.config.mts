import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const MODEL_KEYS = [
  "COHORIO_LLM_PROVIDER",
  "COHORIO_LLM_API_KEY",
  "COHORIO_LLM_BASE_URL",
  "COHORIO_LLM_MODEL",
  "COHORIO_LLM_EFFORT",
];

/**
 * Next skips .env.local when NODE_ENV is "test", which Vitest sets, so read the
 * model settings directly. Real environment variables (e.g. CI secrets) win.
 */
function modelEnv() {
  const values: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    const filePath = path.join(root, file);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match || !MODEL_KEYS.includes(match[1])) continue;
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  for (const key of MODEL_KEYS) {
    if (process.env[key]) values[key] = process.env[key] as string;
  }
  return values;
}

// Live agent evals call the configured language model and cost tokens.
// Kept out of `npm test`; run with `npm run eval`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.eval.ts"],
    env: modelEnv(),
    testTimeout: 300_000,
    hookTimeout: 60_000,
    // Sequential: provider rate limits and readable output matter more than speed.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
