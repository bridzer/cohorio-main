# Architecture
### 1) System Overview
Cohorio combines a marketing skills library with a persistent marketing dashboard. The root README and codebase_analysis.md emphasize the original library; dashboard source implements an additional application. Job forms for intelligence, conversion, content, SEO, paid marketing, measurement, retention, growth and sales map to skill prompts; these forms do not by themselves implement operational CRM, publishing or analytics systems.

### 2) Main Request and Data Flows
Home request -> /api/workspaces/run -> same-origin validation -> member workspace access -> job/answer validation -> quota check -> skill Markdown plus saved Brand Brain -> compatible chat-completions API -> copilot_runs insert -> task event insert -> response. /api/assets unions copilot, social, lifecycle and campaign records for the current workspace. Shopify has separate OAuth, connection/sync and commerce routes.

### 3) Component Responsibilities
Pages collect input and render results. Route handlers authorize and orchestrate. Repositories query PostgreSQL with workspace predicates. Skill loaders read local instructions. completeChat calls the configured model. Integration storage encrypts credentials; provider validation is mostly a placeholder rather than a functional provider adapter.

### 4) Reused Patterns
Shared requireWorkspaceAccess and assertSameOrigin enforce route boundaries; repositories centralize persistence; skillForJob provides a server-side job allowlist. Database calls use parameterized SQL. No queue is involved in the inspected generation path.

### 5) Known Architectural Risks
Quota checking, result insertion and usage recording are separate operations: concurrency and partial failure can break accounting. Scheduling stores a status/timestamp without a discovered delivery worker. Saved generations are separate runs; this path does not reconstruct a multi-turn conversation. [TODO] Verify operational behavior in an isolated configured environment.

### 6) Evidence
- apps/dashboard/src/app/api/workspaces/run/route.ts
- apps/dashboard/src/lib/workspaces-server.ts
- apps/dashboard/src/lib/copilot-repository.ts
- apps/dashboard/src/lib/assets.ts
- apps/dashboard/src/lib/billing/quota.ts
