# Coding Conventions
### 1) Naming Rules
Observed: camelCase functions such as skillForJob; PascalCase types such as WorkspaceDefinition; uppercase constants such as SOCIAL_PLATFORMS. Library filenames use kebab-case; SQL columns use snake_case. React component files include ProductCroWorkspace.tsx.

### 2) Formatting and Linting
ESLint uses next/core-web-vitals and next/typescript, excluding generated Next/build output. TypeScript strict=true. Run npm run lint. [TODO] Establish a separate formatter policy if needed; none is established by the inspected lint configuration.

### 3) Import and Module Conventions
Dashboard uses @/lib aliases and relative imports. tsconfig maps @/* to ./src/*. No explicit import-order or barrel policy is specified in the inspected configuration.

### 4) Error and Logging Conventions
Helpers throw errors; routes generally translate them into JSON { error } with HTTP status codes and shared access/origin/quota error helpers. Some routes forward Error.message to clients; provider errors need sanitization. Plan SEC-003 prohibits secret values in responses/logs. [TODO] Establish structured logging and redaction verification.

### 5) Testing Conventions
Adjacent src/**/*.test.ts, Vitest in Node, shared src/test/setup.ts; integration tests are opt-in. [TODO] Coverage threshold is not configured in inspected Vitest configuration. Repository instructions request Conventional Commits.

### 6) Evidence
- apps/dashboard/eslint.config.mjs
- apps/dashboard/tsconfig.json
- apps/dashboard/vitest.config.mts
- apps/dashboard/src/app/api/workspaces/run/route.ts
- AGENTS.md
- plan/feature-cohorio-full-product-1.md
