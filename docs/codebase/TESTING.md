# Testing Patterns
### 1) Test Stack and Commands
Vitest ^4.1.10, Node environment, assertions and mocks from Vitest. npm test; npm run lint; npm run build. Auth flow operator script: npm run auth:test-flow (requires a deliberately configured environment; not run). [TODO] No dedicated coverage command or threshold is defined in the inspected configuration.

### 2) Test Layout
Tests live alongside lib modules under src/**/*.test.ts. src/test/setup.ts supplies common setup. vitest.config.mts loads environment configuration with @next/env and defines @ alias resolution.

### 3) Test Scope Matrix
Unit/module tests cover auth validation/roles/request boundaries, database configuration, Shopify reporting/CRO/campaigns, social generation, context rendering, catalog, assets, quotas and workspace routing. Tenancy integration suite is opt-in. [TODO] Browser end-to-end coverage was not established by this review.

### 4) Mocking and Isolation Strategy
Module tests use Vitest mocks where needed; database integration tests require RUN_DB_INTEGRATION_TESTS and TEST_DATABASE_URL. Use a dedicated disposable database. Live database/provider checks were not enabled or executed for this review.

### 5) Coverage and Quality Signals
2026-10-19 npm test: 17 files passed, 1 skipped; 53 tests passed, 7 skipped. This verifies module behavior, not production deployment or live provider flows. Production build and TypeScript passed, with two provider-catalog filesystem tracing warnings. Lint status is recorded in CONCERNS.md.

### 6) Evidence
- apps/dashboard/vitest.config.mts
- apps/dashboard/src/test/setup.ts
- apps/dashboard/src/lib/auth/tenancy.integration.test.ts
- apps/dashboard/src/lib/billing/quota.test.ts
- .github/workflows/dashboard.yml
- Terminal npm test output from this review
