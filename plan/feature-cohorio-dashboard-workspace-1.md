---
goal: Complete the Cohorio dashboard from a working auth/Shopify v0 into an honest e-commerce marketing workspace
version: 1.0
date_created: 2026-09-29
last_updated: 2026-10-01
owner: Cohorio
status: In progress
tags:
  - feature
  - architecture
  - dashboard
  - shopify
  - security
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

This plan turns `apps/dashboard` into a product whose UI only shows data it can load or generate. Auth, Brand Brain, Shopify OAuth, ShopifyQL store totals, product CRO write-back, and campaign drafts already exist. Home, Social, Commerce Lifecycle, and Commerce Analytics still render mock copy. In-repo skills under `skills/*/SKILL.md` are never loaded by the dashboard.

Security items shipped in commit `aed154d` (Postgres certificate verification, Google credential linking denial, Shopify granted-scope enforcement, Brand Brain CSRF, POST OAuth start) are marked completed below and must not be re-implemented. Remaining work is hardening, honest UI, Brand Brain consumption, ShopifyQL product sales, a skill runner, social persistence, and CI.

Do not execute `tools/clis/*.js` from HTTP routes in this version. Do not add Meta, Google Ads, or TikTok send APIs in this version. Campaigns stay CSV/draft export.

## 1. Requirements & Constraints

- **REQ-001**: Every number, date, activity row, health score, and usage counter rendered in `apps/dashboard/src/app/page.tsx`, `apps/dashboard/src/app/social/page.tsx`, and `apps/dashboard/src/app/commerce/page.tsx` must come from the authenticated workspace database, Shopify sync payload, or a persisted copilot/social row. Remove hardcoded `82`, `$18.4k`, `Wednesday, August 12`, `7 of 50 tasks`, `Renews Sep 1`, and the `activity` constant array.
- **REQ-002**: Brand Brain rows in `product_marketing_contexts` must be injected into product CRO scoring, ad campaign generation, social post generation, and copilot prompts via `contextToMarkdown` from `apps/dashboard/src/lib/marketing-context.ts`.
- **REQ-003**: Home playbook identifiers in `apps/dashboard/src/app/page.tsx` (`social-content`, `ad-creative`, `copywriting`, `page-cro`, `email-sequence`, `seo-audit`) must resolve to existing skill directories: `skills/social`, `skills/ad-creative`, `skills/copywriting`, `skills/cro`, `skills/emails`, `skills/seo-audit`.
- **REQ-004**: Shopify product `revenue_30d` and `units_sold_30d` must be computed from ShopifyQL, not from paging `orders` with `MAX_ORDER_PAGES = 40` in `apps/dashboard/src/lib/shopify/client.ts`.
- **REQ-005**: Commerce nav sections `Overview`, `Products`, `Campaigns`, `Lifecycle`, and `Analytics` must each render a distinct body. `Lifecycle` and `Analytics` must not fall through to Overview JSX.
- **REQ-006**: `apps/dashboard/src/proxy.ts` `proxy()` must reject requests when the Auth.js session cookie is missing or the JWT is invalid, not merely when the cookie name is absent.
- **REQ-007**: `clientIp` in `apps/dashboard/src/lib/auth/request.ts` must ignore `x-forwarded-for` and `x-real-ip` unless `AUTH_TRUST_PROXY=true`.
- **REQ-008**: `GET /api/shopify/connections` in `apps/dashboard/src/app/api/shopify/connections/route.ts` must run `assertShopifyClientSecret` and `assertShopifyAppUrl` (via `shopifyConfig()`) and return `{ configured: false, configError }` on failure without echoing secrets.
- **REQ-009**: Copilot runs persist in Postgres, scoped by `workspace_id`, and are listed on Home instead of the hardcoded `activity` array.
- **REQ-010**: Social Create, Calendar, Library, and Analytics must read and write `social_posts` for the current workspace. `setView` already exists; each view must render distinct markup.
- **SEC-001**: All new mutating API routes must call `assertSameOrigin` from `apps/dashboard/src/lib/auth/request.ts` and return `originErrorResponse` on `INVALID_ORIGIN`.
- **SEC-002**: All new Shopify and copilot queries must go through `requireWorkspaceAccess` and include `workspace_id` in every SQL predicate, matching `apps/dashboard/src/lib/shopify/repository.ts`.
- **SEC-003**: LLM requests use server-only `COHORIO_LLM_API_KEY`. Never send that key, Shopify tokens, or `SHOPIFY_TOKEN_ENCRYPTION_KEY` to the browser.
- **SEC-004**: Do not restore `allowDangerousEmailAccountLinking` or `rejectUnauthorized: false` as the TLS default.
- **CON-001**: Next migration filename is `apps/dashboard/database/migrations/008_workspace_marketing_runtime.sql`. Do not edit applied migrations `001`–`007`.
- **CON-002**: Skill files stay at repo-root `skills/`. Railway `railway.json` builds from the repo root. Skill loader must resolve `path.join(process.cwd(), "skills")` and `path.join(process.cwd(), "..", "..", "skills")` and use the first directory that contains `social/SKILL.md`.
- **CON-003**: No new npm runtime dependencies except if TypeScript types are already covered. LLM HTTP uses `fetch`. Shopify remains Admin GraphQL plus `shopifyqlQuery`.
- **CON-004**: Campaigns remain local drafts plus CSV. Do not call Meta, Google Ads, or TikTok marketing APIs in this version.
- **CON-005**: Do not spawn `tools/clis/*.js` from dashboard routes in this version.
- **GUD-001**: Keep `SKILL.md` files unchanged unless a path in REQ-003 is wrong; adapt the dashboard mapper instead.
- **GUD-002**: Follow existing route patterns: `runtime = "nodejs"`, `accessErrorResponse`, JSON `{ error }` bodies.
- **PAT-001**: ShopifyQL strings live in dedicated modules next to `apps/dashboard/src/lib/shopify/daily-sales.ts`, with a sibling `*.test.ts` parser test.
- **PAT-002**: Use `encryptSecret` only for third-party tokens. Copilot output and social copy are not secrets; store plaintext with workspace FK.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Finish remaining dashboard hardening so session gating, rate-limit IPs, Shopify config errors, and operator docs match the auth model that already exists.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Postgres TLS: `postgresSslConfig` in `apps/dashboard/src/lib/database.ts` and `apps/dashboard/scripts/postgres-ssl.mjs` verifies certificates when `DATABASE_SSL=true`. Already shipped in `aed154d`. | ✅ | 2026-09-29 |
| TASK-002 | Google sign-in in `apps/dashboard/src/auth.ts` omits `allowDangerousEmailAccountLinking` and returns `/sign-in?error=OAuthAccountNotLinked` when `getCredentialUser(email)` exists and `getUserByAccount("google", providerAccountId)` is null. Already shipped in `aed154d`. | ✅ | 2026-09-29 |
| TASK-003 | Shopify OAuth callback `apps/dashboard/src/app/api/shopify/oauth/callback/route.ts` calls `assertRequiredShopifyScopes` and compares `normalizeShopDomain(params.shop)` to `state.shopDomain`. Already shipped in `aed154d`. | ✅ | 2026-09-29 |
| TASK-004 | `PUT` `apps/dashboard/src/app/api/marketing-context/route.ts` calls `assertSameOrigin`. Shopify OAuth start is POST-only in `apps/dashboard/src/app/api/shopify/oauth/start/route.ts`. Already shipped in `aed154d`. | ✅ | 2026-09-29 |
| TASK-005 | Change `apps/dashboard/src/proxy.ts` `proxy()` to import `{ auth }` from `@/auth`, `await auth()`, and treat a missing `session.user.id` as unauthenticated (401 JSON for `/api/*`, redirect to `/sign-in` otherwise). Keep `PUBLIC_PATHS` unchanged. Do not treat cookie presence as authenticated. | ✅ | 2026-09-29 |
| TASK-006 | Change `clientIp` in `apps/dashboard/src/lib/auth/request.ts` to: if `process.env.AUTH_TRUST_PROXY !== "true"` return `"direct"`; else read `x-forwarded-for` last comma-separated hop (the peer Railway/proxy added), then `x-real-ip`, else `"unknown"`. Add `AUTH_TRUST_PROXY=false` plus comment to `apps/dashboard/.env.example`. Set production Railway env `AUTH_TRUST_PROXY=true` in operator docs only via README, not via committing secrets. | ✅ | 2026-09-29 |
| TASK-007 | In `GET` `apps/dashboard/src/app/api/shopify/connections/route.ts`, wrap `shopifyConfig()` in try/catch. On throw, return HTTP 200 `{ configured: false, connections: [], configError: error.message }` after `requireWorkspaceAccess("viewer")`. On success, keep listing connections. Update `apps/dashboard/src/app/commerce/page.tsx` to display `configError` in the existing warning banner next to `shopifyConfigured`. | ✅ | 2026-09-29 |
| TASK-008 | Replace the Security boundary section in `apps/dashboard/README.md` (lines that still describe an anonymous workspace cookie as the identity model) with: sessions come from NextAuth JWT; workspace ID comes from `requireWorkspaceAccess`; Shopify tokens never go to the browser. Keep the Shopify HTTPS tunnel and client-secret warnings. | ✅ | 2026-09-29 |

### Implementation Phase 2

- GOAL-002: Remove mock marketing chrome so Home and Commerce never present invented performance or quota.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | In `apps/dashboard/src/app/page.tsx`, delete the `activity` constant. Replace the activity list UI with data from `GET /api/copilot/runs` (TASK-021). Until that route exists, render an empty state: `No runs yet`. Remove the `usage-pill` block (`7 of 50 tasks`, `Renews Sep 1`). Replace hardcoded `Wednesday, August 12` with `new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date())`. | ✅ | 2026-09-29 |
| TASK-010 | In `apps/dashboard/src/app/page.tsx`, when `activeNav` is `Assets`, `Performance`, or `Connections`, render a dedicated empty panel: Assets lists copilot run outputs with `skill_id` and `created_at`; Performance shows a sentence that commerce metrics live on `/commerce`; Connections links to `/commerce` for Shopify and `/settings` for members. Do not reuse the Overview task grid for those nav items. | ✅ | 2026-09-29 |
| TASK-011 | In `apps/dashboard/src/app/commerce/page.tsx`, delete the hardcoded Store health card value `82` and CSS width `82%` as a fake score. Compute health as `Math.round(overview.complete ? 100 : (overview.metrics.products > 0 ? 50 : 0))` from `StoreOverview`, or hide the card when `overview` is null. Remove `$18.4k attributed this month` from the Lifecycle preview card; show `No attribution until a provider is connected` or omit the subtitle. | ✅ | 2026-09-29 |
| TASK-012 | In `apps/dashboard/src/app/commerce/page.tsx`, remove the in-memory `initialFlows` revenue strings from Overview. Overview may list flow names only after TASK-018 persists rows; until then show a single CTA `Generate lifecycle drafts` that routes to section `Lifecycle`. | ✅ | 2026-09-29 |

### Implementation Phase 3

- GOAL-003: Make Brand Brain the input to CRO, campaigns, and social copy instead of a siloed onboarding form.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-013 | Add `apps/dashboard/src/lib/marketing-context-prompt.ts` exporting `workspaceContextMarkdown(workspaceId: string): Promise<string>` that calls `getMarketingContext` from `apps/dashboard/src/lib/marketing-context-repository.ts` and `contextToMarkdown`. Return `"No Brand Brain context saved."` when the row is missing. | ✅ | 2026-09-29 |
| TASK-014 | Change `analyzeProductCro` in `apps/dashboard/src/lib/shopify/product-cro.ts` to accept optional `brandContextMarkdown: string`. When the markdown contains a non-empty product one-liner or voice section, append one `ProductCroRecommendation` with `area: "Value proposition"` if `product.descriptionText` does not share a 12-character case-insensitive substring with the one-liner field extracted from markdown heading `Product overview`. Keep existing numeric scoring. Update `apps/dashboard/src/app/api/shopify/connections/[id]/products/route.ts` to load context markdown for `access.workspaceId` and pass it into analysis. | ✅ | 2026-09-29 |
| TASK-015 | Change `generateCampaign` (or the exported generator in `apps/dashboard/src/lib/shopify/ad-campaign.ts`) to accept `brandContextMarkdown: string` and prepend the first 500 characters of that markdown to `CampaignCreative.grounding`. Thread the value from `apps/dashboard/src/app/api/shopify/connections/[id]/campaigns/route.ts` using TASK-013. | ✅ | 2026-09-29 |
| TASK-016 | Change social generation in `apps/dashboard/src/app/social/page.tsx` to `POST /api/social/generate` (TASK-023) instead of `window.setTimeout` local templates. The API must prepend Brand Brain markdown to the model or template prompt. | ✅ | 2026-09-29 |

### Implementation Phase 4

- GOAL-004: Drive Commerce Analytics and product 30-day sales from ShopifyQL and `shopify_daily_metrics`; make Lifecycle a real section without fake revenue.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-017 | Add `apps/dashboard/src/lib/shopify/product-sales.ts` with ShopifyQL text `FROM sales SHOW net_sales, net_items_sold GROUP BY product_id SINCE startOfDay(-29d) UNTIL today` (adjust column names only if `parseErrors` from Shopify documents different identifiers; cover the parser in `apps/dashboard/src/lib/shopify/product-sales.test.ts`). Export `productMetricsFromShopifyql` mapping `product_id` → `{ revenue30d, unitsSold30d }`. In `fetchShopifyOverview` in `apps/dashboard/src/lib/shopify/client.ts`, delete `MAX_ORDER_PAGES` order pagination used for product revenue (the loop around `payload.orders.nodes` that mutates `revenue30d`). Keep GraphQL product catalog paging. Merge ShopifyQL product metrics onto catalog products by Shopify product GID/id. Set `overview.complete` false if ShopifyQL `parseErrors` is non-empty. | ✅ | 2026-10-01 |
| TASK-018 | Create migration `apps/dashboard/database/migrations/008_workspace_marketing_runtime.sql` adding: table `copilot_runs` (`id uuid pk default gen_random_uuid()`, `workspace_id text not null references workspaces(id)`, `user_id text not null references users(id)`, `skill_id text not null`, `prompt text not null`, `output text not null`, `created_at timestamptz not null default now()`); table `social_posts` (`id uuid pk`, `workspace_id text not null references workspaces(id)`, `platform text not null check (platform in ('LinkedIn','X','Instagram'))`, `body text not null`, `source_prompt text`, `scheduled_for timestamptz null`, `status text not null check (status in ('draft','scheduled','published'))`, `created_at timestamptz not null default now()`); table `lifecycle_drafts` (`id uuid pk`, `workspace_id text not null references workspaces(id)`, `name text not null`, `trigger text not null`, `body_markdown text not null`, `created_at timestamptz not null default now()`). Add indexes on `(workspace_id, created_at desc)` for each table. Run via `npm run db:migrate` from repo root. | ✅ | 2026-10-01 |
| TASK-019 | Add `apps/dashboard/src/app/commerce/CommerceAnalytics.tsx` and render it when `section === "Analytics"` in `apps/dashboard/src/app/commerce/page.tsx`. Fetch `GET /api/shopify/connections/[id]/overview` (existing). Chart `overview` daily series already stored in `shopify_daily_metrics` (fields used by `fetchShopifyOverview`). Wire existing date-range buttons to filter that series in memory by `7d`, `30d`, `60d` using metric dates. Do not show invented attributed revenue. | ✅ | 2026-10-01 |
| TASK-020 | Add `apps/dashboard/src/app/api/lifecycle/drafts/route.ts` with `GET` (viewer) and `POST` (member, `assertSameOrigin`). `POST` body `{ connectionId?: string }` loads Brand Brain markdown plus `skills/emails/SKILL.md` via the skill loader (TASK-022) and, if `COHORIO_LLM_API_KEY` is set, calls `completeChat` (TASK-024) to produce three drafts named `Abandoned checkout`, `Post-purchase`, `Win-back`; else fill `body_markdown` from a deterministic template that quotes the Brand Brain one-liner and does not invent revenue. Insert into `lifecycle_drafts`. Render `section === "Lifecycle"` in `apps/dashboard/src/app/commerce/page.tsx` as that list. Toggles must update a `status` column only if added in 008; otherwise omit toggles and use the `status` check constraint on social posts only. For lifecycle, no fake enablement of Klaviyo sends. | ✅ | 2026-10-01 |

### Implementation Phase 5

- GOAL-005: Run in-repo skills from Home with workspace Brand Brain and persist outputs.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-021 | Add `apps/dashboard/src/lib/skills/catalog.ts` exporting `PLAYBOOKS: Record<string, { directory: string; title: string }>` with keys `social-content` → `social`, `ad-creative` → `ad-creative`, `copywriting` → `copywriting`, `page-cro` → `cro`, `email-sequence` → `emails`, `seo-audit` → `seo-audit`. Export `resolvePlaybook(skillId: string)` that throws if the key is missing. | ✅ | 2026-10-01 |
| TASK-022 | Add `apps/dashboard/src/lib/skills/load-skill.ts` exporting `async function readSkillMarkdown(directory: string): Promise<string>`. Resolve skills root as specified in CON-002. Read `SKILL.md` with `fs.promises.readFile`. Throw if the file is missing. Cap length at 80_000 characters. | ✅ | 2026-10-01 |
| TASK-023 | Add `apps/dashboard/src/lib/llm/client.ts` exporting `completeChat(messages: { role: "system" \| "user"; content: string }[]): Promise<string>`. `POST` `${process.env.COHORIO_LLM_BASE_URL \|\| "https://api.openai.com/v1"}/chat/completions` with header `Authorization: Bearer ${process.env.COHORIO_LLM_API_KEY}`, JSON `{ model: process.env.COHORIO_LLM_MODEL \|\| "gpt-4.1-mini", messages, temperature: 0.4 }`. If `COHORIO_LLM_API_KEY` is empty, throw `Error("COHORIO_LLM_API_KEY is not configured.")`. Parse `choices[0].message.content` as string. | ✅ | 2026-10-01 |
| TASK-024 | Add `apps/dashboard/src/app/api/copilot/runs/route.ts`. `GET`: `requireWorkspaceAccess("viewer")`, select `copilot_runs` for `workspace_id` order by `created_at desc` limit 50. `POST`: `assertSameOrigin`, `requireWorkspaceAccess("member")`, body zod `{ skillId: z.string(), prompt: z.string().min(1).max(8000) }`. Load playbook, skill markdown, Brand Brain markdown. Call `completeChat` with system = skill markdown + brand markdown, user = prompt. Insert `copilot_runs`. Return the row. Map `INVALID_ORIGIN` with `originErrorResponse`. Add `COHORIO_LLM_API_KEY`, `COHORIO_LLM_BASE_URL`, `COHORIO_LLM_MODEL` to `apps/dashboard/.env.example`. | ✅ | 2026-10-01 |
| TASK-025 | Update `submitPrompt` and `selectTask` in `apps/dashboard/src/app/page.tsx`: `social-content` still `router.push("/social")`; other skills `POST /api/copilot/runs` with `{ skillId: task.skill, prompt: task.title + "\n" + task.description }` or the prompt input. On missing API key (HTTP 400/503 with that error string), set `assistantMessage` to the server error. On success, set `assistantMessage` to `output` and refresh runs. | ✅ | 2026-10-01 |

### Implementation Phase 6

- GOAL-006: Persist social studio views so Calendar, Library, and Analytics are not dead tabs.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-026 | Add `apps/dashboard/src/app/api/social/posts/route.ts` with `GET` (viewer, list `social_posts` for workspace) and `POST` (member, `assertSameOrigin`, insert draft). Add `apps/dashboard/src/app/api/social/posts/[id]/route.ts` `PATCH` to set `scheduled_for` and `status` (`draft` \| `scheduled` \| `published`) with workspace predicate. | ✅ | 2026-10-01 |
| TASK-027 | Add `apps/dashboard/src/app/api/social/generate/route.ts` `POST` (`assertSameOrigin`, member). Body `{ source: string, platform: "LinkedIn" \| "X" \| "Instagram" }`. System prompt = `readSkillMarkdown("social")` + Brand Brain markdown. User prompt = `source`. If LLM key missing, return HTTP 400 with the configuration error. Insert results as `social_posts` status `draft`. | ✅ | 2026-10-01 |
| TASK-028 | Replace `window.setTimeout` generation in `apps/dashboard/src/app/social/page.tsx` with `POST /api/social/generate`. When `view === "Calendar"` render posts with `scheduled_for` grouped by date. When `view === "Library"` render all drafts. When `view === "Analytics"` show counts: drafts, scheduled, published; no fake impressions. | ✅ | 2026-10-01 |

### Implementation Phase 7

- GOAL-007: Lock the new behavior with unit tests and a dashboard GitHub Actions workflow.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-029 | Add `apps/dashboard/src/lib/auth/request.test.ts` cases for `clientIp`: without `AUTH_TRUST_PROXY` ignore a spoofed `x-forwarded-for`; with `AUTH_TRUST_PROXY=true` use the last hop. Extend existing `originErrorResponse` tests. | ✅ | 2026-10-01 |
| TASK-030 | Add `apps/dashboard/src/lib/shopify/product-sales.test.ts` for ShopifyQL row mapping. Add `apps/dashboard/src/lib/skills/catalog.test.ts` asserting REQ-003 key → directory mapping and that each directory exists under the resolved skills root when tests run from `apps/dashboard`. | ✅ | 2026-10-01 |
| TASK-031 | Add `.github/workflows/dashboard.yml` on push/PR paths `apps/dashboard/**` and `skills/**/SKILL.md`. Job: Node 20, `npm ci`, `npm test --workspace=cohorio-dashboard`, `npm run lint --workspace=cohorio-dashboard`. Do not require `RUN_DB_INTEGRATION_TESTS` in this workflow. | ✅ | 2026-10-01 |
| TASK-032 | Document `AUTH_TRUST_PROXY`, `COHORIO_LLM_*`, and Shopify `configError` in `apps/dashboard/README.md`. State that connecting a shop still requires a Dev Dashboard client secret (not `shpat_`) and an HTTPS `APP_URL` that serves this app. | ✅ | 2026-10-01 |

## 3. Alternatives

- **ALT-001**: Ship only a store-ops app (Shopify sync, CRO, drafts) and delete Home/Social shells. Rejected because Brand Brain and Home copy already promise a marketing workspace; deleting those surfaces would contradict onboarding.
- **ALT-002**: Execute `tools/clis/*.js` from API routes with env keys. Rejected because those scripts are unsandboxed process spawns with tenant-unaware credentials and are out of scope for SEC-003 / CON-005.
- **ALT-003**: Add the `openai` npm SDK. Rejected to satisfy CON-003; `fetch` matches existing dashboard HTTP style.
- **ALT-004**: Keep product 30-day revenue from order paging and raise `MAX_ORDER_PAGES`. Rejected because store totals already use ShopifyQL and order paging remains incomplete past 40 pages.
- **ALT-005**: Connect Meta/Google/TikTok send in this version. Rejected; campaign CSV export already exists and OAuth for ads is a separate product.

## 4. Dependencies

- **DEP-001**: Next.js 16.3.0 `proxy` convention in `apps/dashboard/src/proxy.ts` and NextAuth 5 `auth()` from `apps/dashboard/src/auth.ts`.
- **DEP-002**: PostgreSQL 14+ with existing extensions from `apps/dashboard/database/README.md`; migration runner `apps/dashboard/scripts/migrate.mjs`.
- **DEP-003**: Shopify Admin API version `SHOPIFY_API_VERSION` default `2026-07` and `read_reports` for ShopifyQL (`apps/dashboard/.env.example`).
- **DEP-004**: OpenAI-compatible Chat Completions endpoint for TASK-023. Optional at runtime; social/copilot must fail closed with a configuration error when the key is missing.
- **DEP-005**: Repo-root `skills/*/SKILL.md` files listed in REQ-003.
- **DEP-006**: Railway deploy uses repo-root `railway.json` (`npm ci`, `npm run build`, `npm run db:migrate`).

## 5. Files

- **FILE-001**: `apps/dashboard/src/proxy.ts` — JWT session gate (TASK-005).
- **FILE-002**: `apps/dashboard/src/lib/auth/request.ts` — trusted-proxy `clientIp` (TASK-006).
- **FILE-003**: `apps/dashboard/src/app/api/shopify/connections/route.ts` — `shopifyConfig()` config errors (TASK-007).
- **FILE-004**: `apps/dashboard/README.md` — auth model and env (TASK-008, TASK-032).
- **FILE-005**: `apps/dashboard/.env.example` — `AUTH_TRUST_PROXY`, `COHORIO_LLM_*`.
- **FILE-006**: `apps/dashboard/src/app/page.tsx` — honest Home, copilot client (TASK-009, TASK-010, TASK-025).
- **FILE-007**: `apps/dashboard/src/app/commerce/page.tsx` — health, sections, analytics/lifecycle hosts (TASK-011, TASK-012, TASK-019, TASK-020).
- **FILE-008**: `apps/dashboard/src/lib/marketing-context-prompt.ts` — new (TASK-013).
- **FILE-009**: `apps/dashboard/src/lib/shopify/product-cro.ts` — brand-aware recommendation (TASK-014).
- **FILE-010**: `apps/dashboard/src/lib/shopify/ad-campaign.ts` — grounding (TASK-015).
- **FILE-011**: `apps/dashboard/src/lib/shopify/client.ts` — remove order-page revenue (TASK-017).
- **FILE-012**: `apps/dashboard/src/lib/shopify/product-sales.ts` — new ShopifyQL module (TASK-017).
- **FILE-013**: `apps/dashboard/database/migrations/008_workspace_marketing_runtime.sql` — new tables (TASK-018).
- **FILE-014**: `apps/dashboard/src/app/commerce/CommerceAnalytics.tsx` — new (TASK-019).
- **FILE-015**: `apps/dashboard/src/app/api/lifecycle/drafts/route.ts` — new (TASK-020).
- **FILE-016**: `apps/dashboard/src/lib/skills/catalog.ts` — new (TASK-021).
- **FILE-017**: `apps/dashboard/src/lib/skills/load-skill.ts` — new (TASK-022).
- **FILE-018**: `apps/dashboard/src/lib/llm/client.ts` — new (TASK-023).
- **FILE-019**: `apps/dashboard/src/app/api/copilot/runs/route.ts` — new (TASK-024).
- **FILE-020**: `apps/dashboard/src/app/api/social/posts/route.ts` — new (TASK-026).
- **FILE-021**: `apps/dashboard/src/app/api/social/posts/[id]/route.ts` — new (TASK-026).
- **FILE-022**: `apps/dashboard/src/app/api/social/generate/route.ts` — new (TASK-027).
- **FILE-023**: `apps/dashboard/src/app/social/page.tsx` — persist views (TASK-016, TASK-028).
- **FILE-024**: `apps/dashboard/src/app/api/shopify/connections/[id]/products/route.ts` — pass brand context (TASK-014).
- **FILE-025**: `apps/dashboard/src/app/api/shopify/connections/[id]/campaigns/route.ts` — pass brand context (TASK-015).
- **FILE-026**: `.github/workflows/dashboard.yml` — new (TASK-031).
- **FILE-027**: `apps/dashboard/src/lib/auth/request.test.ts` — extend (TASK-029).
- **FILE-028**: `apps/dashboard/src/lib/shopify/product-sales.test.ts` — new (TASK-030).
- **FILE-029**: `apps/dashboard/src/lib/skills/catalog.test.ts` — new (TASK-030).

## 6. Testing

- **TEST-001**: `clientIp` ignores forwarded headers unless `AUTH_TRUST_PROXY=true` (`apps/dashboard/src/lib/auth/request.test.ts`).
- **TEST-002**: `originErrorResponse` still maps `INVALID_ORIGIN` to HTTP 403.
- **TEST-003**: `productMetricsFromShopifyql` maps ShopifyQL table rows to revenue and units (`apps/dashboard/src/lib/shopify/product-sales.test.ts`).
- **TEST-004**: `resolvePlaybook` maps the six Home skill ids in REQ-003 (`apps/dashboard/src/lib/skills/catalog.test.ts`).
- **TEST-005**: `analyzeProductCro` still scores without brand markdown; with markdown missing from the description, one extra recommendation is present.
- **TEST-006**: `npm test --workspace=cohorio-dashboard` passes on TASK-031 CI without database flags.
- **TEST-007**: Manual: `GET /api/shopify/connections` as a signed-in user with a token-shaped `SHOPIFY_CLIENT_SECRET` returns `configured: false` and a `configError` that mentions Client secret, not the secret value.
- **TEST-008**: Manual: Home prompt with LLM key unset shows the configuration error and inserts no `copilot_runs` row.
- **TEST-009**: Manual: Commerce Analytics 7d/30d/60d filters change the visible daily series from synced `shopify_daily_metrics` after a real sync.

## 7. Risks & Assumptions

- **RISK-001**: ShopifyQL `GROUP BY product_id` field names may not match Admin `2026-07` sales schema. Mitigation: TASK-017 allows renaming SHOW/GROUP columns only when Shopify `parseErrors` names the valid identifiers; parser tests use fixtures, not live Shopify.
- **RISK-002**: `auth()` inside `proxy.ts` may need Auth.js middleware helper export. Mitigation: if `auth()` cannot run in `proxy`, use `getToken` from `next-auth/jwt` with `AUTH_SECRET` and the same cookie names already listed in `proxy.ts`.
- **RISK-003**: LLM cost and prompt size from full `SKILL.md` files. Mitigation: 80_000 character cap in TASK-022; temperature 0.4.
- **RISK-004**: Railway `APP_URL` may still 404 if the service is not the dashboard. Mitigation: TASK-007 surfaces `assertShopifyAppUrl` / `shopifyConfig` errors in the Commerce banner; operators must point `APP_URL` at a host that serves this app.
- **RISK-005**: Phase 5 without `COHORIO_LLM_API_KEY` leaves copilot non-functional. Mitigation: fail closed with an explicit error; social templates must not silently invent brand-inconsistent posts when the key is missing (HTTP 400).
- **ASSUMPTION-001**: Commit `aed154d` remains on `master` and TASK-001–TASK-004 stay completed.
- **ASSUMPTION-002**: Workspace tenancy in `requireWorkspaceAccess` is the sole authorization boundary for new tables in migration 008.
- **ASSUMPTION-003**: Product GID/id returned by ShopifyQL can be joined to GraphQL product ids already stored on `shopify_products.shopify_product_id`.
- **ASSUMPTION-004**: Operators will set `AUTH_TRUST_PROXY=true` only on Railway/production behind the platform proxy.

## 8. Related Specifications / Further Reading

- [apps/dashboard/README.md](../apps/dashboard/README.md)
- [apps/dashboard/database/README.md](../apps/dashboard/database/README.md)
- [apps/dashboard/.env.example](../apps/dashboard/.env.example)
- [codebase_analysis.md](../codebase_analysis.md) Product 1 (AI Marketing Co-Pilot) and Product 3 (E-Commerce Marketing Suite)
- [tools/integrations/shopify.md](../tools/integrations/shopify.md)
- [ShopifyQL 2026-07 sales schema](https://shopify.dev/docs/api/shopifyql/2026-07)
- [Next.js 16 `proxy` (middleware replacement)](https://nextjs.org/docs/app/getting-started/proxy)
- [Auth.js session / JWT](https://authjs.dev/concepts/session-strategies)
- Commit `aed154d` — `fix: harden dashboard TLS, OAuth CSRF, and account linking`
