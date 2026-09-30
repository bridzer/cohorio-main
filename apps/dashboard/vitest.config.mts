import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const { combinedEnv } = nextEnv.loadEnvConfig(
  process.cwd(),
  false,
  console,
  true,
);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      TEST_DATABASE_URL: combinedEnv.TEST_DATABASE_URL,
      RUN_DB_INTEGRATION_TESTS: combinedEnv.RUN_DB_INTEGRATION_TESTS,
      AUTH_SECRET: combinedEnv.AUTH_SECRET,
    },
  },
});
