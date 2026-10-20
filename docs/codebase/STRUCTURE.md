# Codebase Structure
### 1) Top-Level Map
- apps/dashboard/: runnable Next.js application, SQL migrations, scripts and tests.
- skills/: 50 directories containing SKILL.md in this working tree.
- tools/clis/: 61 standalone JavaScript marketing tools; tools/integrations/ and tools/composio/ document integrations.
- plan/: implementation specifications and progress records.
- .github/workflows/dashboard.yml: dashboard CI.
- codebase_analysis.md: older skills-library analysis and product concepts; incomplete as a description of the current application.

### 2) Entry Points
apps/dashboard/src/app/layout.tsx and page.tsx form the dashboard entry; app/api/**/route.ts implements server endpoints; src/proxy.ts protects requests. package.json scripts select Next.js. tools/clis/*.js are independent CLI entry points. No social delivery worker was found in the inspected source inventory.

### 3) Module Boundaries
app/: pages and HTTP handlers; lib/: auth, tenant access, database repositories, skills, Shopify, generation, billing and integration storage. database/migrations/: schema history; scripts/: operator commands. The product plan prohibits spawning CLI scripts from dashboard routes.

### 4) Naming and Organization Rules
Routes follow App Router directory names. Library modules generally use kebab-case, React commerce components PascalCase, tests adjacent as *.test.ts. @/* maps to src/*.

### 5) Evidence
- apps/dashboard/src/app/layout.tsx
- apps/dashboard/src/app/page.tsx
- apps/dashboard/src/proxy.ts
- apps/dashboard/tsconfig.json
- plan/feature-cohorio-full-product-1.md
