---
goal: Implement the eight Cohorio product concepts on top of the completed dashboard workspace
version: 1.0
date_created: 2026-10-01
last_updated: 2026-10-20
owner: Cohorio
status: Completed
tags:
  - feature
  - architecture
  - dashboard
  - integrations
  - security
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

`plan/feature-cohorio-dashboard-workspace-1.md` is the finished baseline: auth, Brand Brain, Shopify OAuth, ShopifyQL product sales, product CRO, campaign CSV drafts, six Home playbooks, lifecycle drafts, and social posts for LinkedIn, X, and Instagram. This plan implements the remaining product surface described in `codebase_analysis.md` section 5 (Products 1–8).

Do not re-implement tasks in the workspace plan. Do not edit applied migrations `001`–`008`. Provider tokens stay server-side and encrypted. The dashboard must not spawn `tools/clis/*.js`.

## 1. Requirements & Constraints

- **REQ-001**: `apps/dashboard/src/lib/skills/catalog.ts` must expose every directory under the resolved skills root that contains `SKILL.md`, plus the six legacy ids `social-content`, `ad-creative`, `copywriting`, `page-cro`, `email-sequence`, and `seo-audit`.
- **REQ-002**: Home in `apps/dashboard/src/app/page.tsx` must list those catalog entries from `GET /api/skills`. Ask Cohorio must POST `{ skillId, prompt }` using the selected catalog id. Free text with no selection keeps `skillId: "copywriting"`.
- **REQ-003**: Social buttons Add URL, Upload, and Add a visual in `apps/dashboard/src/app/social/page.tsx` must either perform the action defined in this plan or be removed. Goal and voice values must be included in `POST /api/social/generate`.
- **REQ-004**: `GET /api/assets` must return one list for the current workspace covering `copilot_runs`, `social_posts`, `lifecycle_drafts`, and `shopify_ad_campaigns`.
- **REQ-005**: Social generation must accept `LinkedIn`, `X`, `Instagram`, `TikTok`, and `Facebook`. Calendar must group by `scheduled_for`. Schedule must persist the ISO timestamp the user submits.
- **REQ-006**: A public `http` or `https` URL submitted as social source must be fetched server-side to text. Private, link-local, and metadata addresses must be rejected before the fetch.
- **REQ-007**: Product pages must be able to copy JSON-LD built only from stored Shopify product fields. Lifecycle generation must also write a draft named `Review request`.
- **REQ-008**: Each successful copilot run, social generation, and lifecycle generation inserts one `workspace_task_events` row. A workspace on plan `free` that already has 5 events in the current UTC month receives HTTP 402 and no LLM call.
- **REQ-009**: Plans are exactly `free` (5 tasks per UTC month, price 0), `pro` (no task cap, 4900 cents per month), and `team` (no task cap, 14900 cents per month). Currency is USD.
- **REQ-010**: Workspace integration credentials are stored encrypted per `(workspace_id, provider)`. Missing credentials return HTTP 400 with the provider name and do not call that provider.
- **REQ-011**: Lifecycle send, ad-network publish, and social publish run only after a same-origin POST whose body contains `confirm: true`. Generation endpoints never send.
- **REQ-012**: Commerce Analytics, when a GA4 credential exists, shows GA4 sessions beside Shopify net sales. With no GA4 credential it shows only Shopify data and the text `GA4 is not connected.`
- **REQ-013**: RevOps stores leads, a numeric score, and a stage in `subscriber|lead|mql|sql|opportunity|customer` for the workspace. No stage is invented for a person who is not in `revops_leads`.
- **REQ-014**: A launch record can attach existing copilot, social, and lifecycle rows. It does not create a second copy of their bodies.
- **REQ-015**: Cancel-flow steps and retention offers are stored as rows and rendered as an ordered list. The page must not claim a drag-and-drop builder.
- **SEC-001**: Every new mutating route calls `assertSameOrigin` from `apps/dashboard/src/lib/auth/request.ts` and returns `originErrorResponse` on `INVALID_ORIGIN`.
- **SEC-002**: Every new query uses `requireWorkspaceAccess` and includes `workspace_id` in the SQL predicate.
- **SEC-003**: `COHORIO_LLM_API_KEY`, `COHORIO_IMAGE_API_KEY`, `STRIPE_SECRET_KEY`, Shopify tokens, and integration credentials never appear in a browser response, log line, or thrown error message.
- **SEC-004**: `assertPublicHttpUrl` rejects hosts that resolve to loopback, private, link-local, or `169.254.169.254`, and rejects non-http(s) schemes. Follow at most 3 redirects and re-check each target.
- **CON-001**: Next migration numbers are `009` through `014` as named in the tasks. Do not edit `001`–`008`.
- **CON-002**: No new npm runtime dependency. HTTP uses `fetch`. Tokens use `encryptSecret` / `decryptSecret` in `apps/dashboard/src/lib/secret-box.ts`.
- **CON-003**: Do not spawn `tools/clis/*.js` or `tools/clis` via `child_process`. Adapters call the provider HTTP API with the workspace credential.
- **CON-004**: Do not change files under `skills/` except adding `skills/form/SKILL.md` in TASK-006.
- **CON-005**: Skill root resolution stays in `resolveSkillsRoot` (`process.cwd()/skills`, then `process.cwd()/../../skills`).
- **GUD-001**: Match existing route style: `runtime = "nodejs"`, JSON `{ error }` bodies, viewer for GET and member for POST/PATCH/DELETE.
- **PAT-001**: Plaintext for generated copy. Ciphertext only for third-party credentials and Stripe customer ids if stored.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Every skill is selectable, and social controls no longer pretend to work.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | In `apps/dashboard/src/lib/skills/catalog.ts`, export `LEGACY_PLAYBOOKS` with the current six keys and directories. Export `listSkillDirectories()` using `fs.promises.readdir` on `resolveSkillsRoot()`, keeping only directories that contain `SKILL.md`. Export `resolvePlaybook(skillId)` so a legacy key or a directory name resolves, and any other id throws `Unknown playbook: ${skillId}.` | ✅ | 2026-10-01 |
| TASK-002 | In `apps/dashboard/src/lib/skills/load-skill.ts`, export `readSkillFrontmatter(directory)` that returns `{ name, description }` from the YAML between the first two `---` lines. If either field is missing, throw `Skill frontmatter is incomplete for ${directory}.` Do not raise the 80_000 character cap. | ✅ | 2026-10-01 |
| TASK-003 | Add `apps/dashboard/src/app/api/skills/route.ts` `GET`. `requireWorkspaceAccess("viewer")`. Return `{ skills: [{ id, title, description }] }` for every directory from `listSkillDirectories()`, where `id` is the directory name, `title` is frontmatter `name`, and `description` is frontmatter `description` sliced to 240 characters. | ✅ | 2026-10-01 |
| TASK-004 | Replace the hardcoded `tasks` array in `apps/dashboard/src/app/page.tsx` with the `GET /api/skills` payload. Keep `social-content` as a shortcut button that `router.push("/social")`. All other cards and Ask Cohorio use the selected `skillId`. When the select is empty, Ask Cohorio sends `copywriting`. | ✅ | 2026-10-01 |
| TASK-005 | Extend `apps/dashboard/src/lib/skills/catalog.test.ts` so each directory from `listSkillDirectories()` resolves, each legacy id still resolves, and `resolvePlaybook("missing")` throws. | ✅ | 2026-10-01 |
| TASK-006 | Add `skills/form/SKILL.md` with frontmatter `name: form` and a description that says to use it for lead, contact, and non-signup forms. Body under 200 lines points the reader at `skills/cro/references/form.md`. Do not edit other skill files. | ✅ | 2026-10-01 |
| TASK-007 | In `apps/dashboard/src/app/social/page.tsx`, pass `goal` and `voice` on `POST /api/social/generate`. In `apps/dashboard/src/app/api/social/generate/route.ts`, append `Goal: ${goal}` and `Voice: ${voice}` to the user message after `source`. Allowed goal values: `Build authority`, `Drive engagement`, `Generate leads`, `Drive traffic`. Allowed voice values: `Clear & insightful`, `Bold & contrarian`, `Warm & conversational`, `Concise & tactical`. Any other value is HTTP 400. | ✅ | 2026-10-01 |
| TASK-008 | Remove the Add URL, Upload, and Add a visual buttons from `apps/dashboard/src/app/social/page.tsx` in this phase. Phase 3 and Phase 4 put back the behaviors that those labels claim. | ✅ | 2026-10-01 |

### Implementation Phase 2

- GOAL-002: One workspace asset list backs Home recent work and a library page.

Depends on Phase 1 only for navigation. Data tables already exist.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | Add `apps/dashboard/src/lib/assets.ts` exporting `listWorkspaceAssets(workspaceId)` that returns at most 100 rows ordered by `created_at DESC`. Each row is `{ type, id, title, createdAt, href }`. Sources: `copilot_runs` (`type: "copilot"`, `title` = first line of `prompt`, `href: "/"`), `social_posts` (`type: "social"`, `title` = first 80 characters of `body`, `href: "/social"`), `lifecycle_drafts` (`type: "lifecycle"`, `title` = `name`, `href: "/commerce"`), `shopify_ad_campaigns` joined to `shopify_connections` on `connection_id` where `shopify_connections.workspace_id` matches (`type: "campaign"`, `title` = `name`, `href: "/commerce"`). | ✅ | 2026-10-01 |
| TASK-010 | Add `apps/dashboard/src/app/api/assets/route.ts` `GET` for `requireWorkspaceAccess("viewer")` returning `{ assets }`. | ✅ | 2026-10-01 |
| TASK-011 | Add `apps/dashboard/src/app/library/page.tsx` that renders the asset list. Empty copy is `No saved assets.` Add a Library link in the existing main nav of `apps/dashboard/src/app/page.tsx`. Home recent work reads `/api/assets` instead of only `/api/copilot/runs`. | ✅ | 2026-10-01 |

### Implementation Phase 3

- GOAL-003: Social source fetch, five platforms, and a real schedule timestamp.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-012 | Add `apps/dashboard/database/migrations/009_social_platforms.sql` that drops and re-adds `social_posts_platform_check` so `platform` is one of `LinkedIn`, `X`, `Instagram`, `TikTok`, `Facebook`. Do not rewrite existing rows. | ✅ | 2026-10-20 |
| TASK-013 | Add `assertPublicHttpUrl(url: string)` in `apps/dashboard/src/lib/http/public-url.ts` implementing SEC-004. Add `apps/dashboard/src/lib/http/public-url.test.ts` with cases for `http://127.0.0.1/`, `http://169.254.169.254/`, `http://10.0.0.1/`, and a public `https://example.com/` acceptance using a mocked DNS lookup argument so the test does not hit the network. | ✅ | 2026-10-20 |
| TASK-014 | Add `apps/dashboard/src/app/api/social/source/route.ts` `POST` body `{ url: string }` (member, same-origin). Run `assertPublicHttpUrl`, `fetch` with a 10 second timeout, read at most 100_000 bytes, strip tags to text, and return `{ text }` truncated to 8_000 characters. Non-public URLs return HTTP 400 `That URL is not allowed.` | ✅ | 2026-10-20 |
| TASK-015 | Restore Add URL on the social composer. If the field is an `http` or `https` URL, call TASK-014 and set `source` to `text`. Restore Upload for `.txt` and `.md` only, using `File.text()` in the browser, capped at 8_000 characters. Do not accept other file types. | ✅ | 2026-10-20 |
| TASK-016 | Extend `clipSocialPost` in `apps/dashboard/src/lib/social/generate.ts` with TikTok 2_200 characters and Facebook 4_000 characters. Update `apps/dashboard/src/app/api/social/generate/route.ts` and `apps/dashboard/src/app/api/social/posts/route.ts` allowed platform lists to the five names. Update the social composer platform toggles to the same five. | ✅ | 2026-10-20 |
| TASK-017 | In `scheduleActivePost` in `apps/dashboard/src/app/social/page.tsx`, read a `datetime-local` input and PATCH `{ status: "scheduled", scheduledFor }` with that value. If the input is empty, keep tomorrow 10:00 local. Calendar continues to group by the UTC date prefix of `scheduledFor`. | ✅ | 2026-10-20 |

### Implementation Phase 4

- GOAL-004: Social images and a month calendar use saved rows only.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-018 | Add `apps/dashboard/database/migrations/010_social_images.sql` adding nullable `image_url TEXT` to `social_posts`. | ✅ | 2026-10-20 |
| TASK-019 | Add `apps/dashboard/src/lib/images/client.ts` `createMarketingImage(prompt: string)`. POST `${COHORIO_IMAGE_BASE_URL}/images/generations` with bearer `COHORIO_IMAGE_API_KEY`, JSON `{ model: COHORIO_IMAGE_MODEL, prompt, size: "1024x1024" }`. If `COHORIO_IMAGE_API_KEY` is empty, throw `COHORIO_IMAGE_API_KEY is not configured.` Return the first URL string from `data[0].url`. | ✅ | 2026-10-20 |
| TASK-020 | Add `apps/dashboard/src/app/api/social/images/route.ts` `POST` body `{ postId: uuid, prompt: string }` (member, same-origin). Load the post for the workspace. On success, set `image_url`. Missing key returns HTTP 400 and does not update the row. Restore Add a visual so it submits the current post text as `prompt`. | ✅ | 2026-10-20 |
| TASK-021 | Add a month grid to the Calendar view in `apps/dashboard/src/app/social/page.tsx`. Days with a `scheduled_for` post show the post count from `savedPosts`. Clicking a day lists those posts. Do not invent posts for empty days. | ✅ | 2026-10-20 |
| TASK-022 | Document `COHORIO_IMAGE_API_KEY`, `COHORIO_IMAGE_BASE_URL`, and `COHORIO_IMAGE_MODEL` in `apps/dashboard/.env.example` and `apps/dashboard/README.md` as server-only and optional. | ✅ | 2026-10-20 |

### Implementation Phase 5

- GOAL-005: Commerce can emit product schema and a review-request draft without sending email.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-023 | Add `apps/dashboard/src/lib/shopify/product-schema.ts` exporting `productJsonLd(product)` returning a schema.org `Product` object with only `name`, `description`, `sku`, `image`, and `offers.price` when those stored fields are non-empty. Omit empty keys. Add `product-schema.test.ts` proving an empty description is omitted. | ✅ | 2026-10-20 |
| TASK-024 | Add `GET` `apps/dashboard/src/app/api/shopify/connections/[id]/products/[productId]/schema/route.ts` (viewer) returning `{ jsonLd }`. Add a Copy JSON-LD button on the product detail in `apps/dashboard/src/app/commerce/ProductCroWorkspace.tsx`. | ✅ | 2026-10-20 |
| TASK-025 | In `apps/dashboard/src/lib/lifecycle-drafts.ts`, add a fourth draft named `Review request`, trigger `order fulfilled 7 days ago`, template quoting the Brand Brain one-liner and not inventing a review count. Persist it in the same POST as the existing three drafts. | ✅ | 2026-10-20 |

### Implementation Phase 6

- GOAL-006: Free-plan task quota and Stripe checkout for Pro and Team.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-026 | Add `apps/dashboard/database/migrations/011_billing_and_usage.sql` with `workspace_plans (workspace_id uuid primary key references workspaces(id), plan text not null default 'free' check (plan in ('free','pro','team')), stripe_customer_id text, stripe_subscription_id text)` and `workspace_task_events (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id), kind text not null check (kind in ('copilot','social','lifecycle')), created_at timestamptz not null default now())`. Index `(workspace_id, created_at desc)`. | ✅ | 2026-10-20 |
| TASK-027 | Add `apps/dashboard/src/lib/billing/quota.ts` `assertTaskQuota(workspaceId)`. Count events with `created_at >= date_trunc('month', timezone('utc', now()))`. If plan is `free` and count is `>= 5`, throw `TASK_QUOTA_EXCEEDED`. `pro` and `team` do not throw. Call it in `POST` handlers for `/api/copilot/runs`, `/api/social/generate`, and `/api/lifecycle/drafts` before `completeChat`. On `TASK_QUOTA_EXCEEDED` return HTTP 402 `{ error: "Free plan includes 5 tasks per month." }` and do not insert a run, post, or draft. After a successful LLM call, insert one `workspace_task_events` row. | ✅ | 2026-10-20 |
| TASK-028 | Add `apps/dashboard/src/lib/billing/stripe.ts` using `fetch` to `https://api.stripe.com/v1/checkout/sessions` with basic auth `STRIPE_SECRET_KEY`. If the key is empty, throw `STRIPE_SECRET_KEY is not configured.` Price amounts are 4900 for `pro` and 14900 for `team`, `mode=subscription`, `currency=usd`. | ✅ | 2026-10-20 |
| TASK-029 | Add `POST /api/billing/checkout` body `{ plan: "pro" \| "team" }` (member, same-origin) returning `{ url }` from Stripe. Missing key returns HTTP 400 `Billing is not configured.` Add `POST /api/billing/webhook` verifying the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET` using the Stripe signature algorithm implemented in `apps/dashboard/src/lib/billing/stripe-signature.ts` (HMAC-SHA256, timestamp tolerance 300 seconds). On `checkout.session.completed`, set `workspace_plans.plan` from session metadata `plan` and `workspace_id`. | ✅ | 2026-10-20 |
| TASK-030 | Add a plan line to `apps/dashboard/src/app/settings/page.tsx` reading `GET /api/billing` `{ plan, used, limit }` where `limit` is `5` for `free` and `null` for `pro` and `team`. Checkout buttons call TASK-029. | ✅ | 2026-10-20 |

### Implementation Phase 7

- GOAL-007: A workspace credential vault and one HTTP adapter per in-repo CLI, without spawning those CLIs.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-031 | Add `apps/dashboard/database/migrations/012_workspace_integrations.sql` with `workspace_integrations (workspace_id uuid not null references workspaces(id), provider text not null, ciphertext text not null, created_at timestamptz not null default now(), primary key (workspace_id, provider))`. | ✅ | 2026-10-20 |
| TASK-032 | Add `apps/dashboard/src/lib/integrations/store.ts` with `saveIntegration(workspaceId, provider, plaintext)` using `encryptSecret`, and `loadIntegration` using `decryptSecret`. `GET` responses return `{ provider, configured: boolean }` only. | ✅ | 2026-10-20 |
| TASK-033 | Add `apps/dashboard/src/lib/integrations/providers.ts` exporting `PROVIDERS` as the file basenames of `tools/clis/*.js` without `.js`. `POST /api/integrations/[provider]` body `{ apiKey: string }` (member, same-origin) rejects unknown providers with HTTP 400 and stores the key. `DELETE` removes the row. `GET /api/integrations` lists `{ provider, configured }` for every provider. | ✅ | 2026-10-20 |
| TASK-034 | Add `apps/dashboard/src/app/settings/integrations/page.tsx` with one row per provider, a password input, and Save. The input value must not be copied into `localStorage` or a query string. | ✅ | 2026-10-20 |
| TASK-035 | Add `apps/dashboard/src/lib/integrations/adapter.ts` exporting `testProvider(provider, apiKey): Promise<{ ok: boolean, error?: string }>`. For `resend`, GET `https://api.resend.com/domains` with `Authorization: Bearer`. For `ga4`, return `{ ok: true }` only when `apiKey` is a non-empty string (GA4 data calls are Phase 8). For every other provider, return `{ ok: true }` when `apiKey` length is at least 8, and `{ ok: false, error: "API key is too short." }` otherwise. Do not log `apiKey`. | ✅ | 2026-10-20 |

### Implementation Phase 8

- GOAL-008: Confirmed lifecycle send through Resend, and GA4 sessions on Commerce Analytics.

Depends on Phase 7 credential storage.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-036 | Add `apps/dashboard/database/migrations/013_lifecycle_delivery.sql` adding `status text not null default 'draft' check (status in ('draft','sent'))` and `sent_at timestamptz` to `lifecycle_drafts`. | ✅ | 2026-10-20 |
| TASK-037 | Add `POST /api/lifecycle/drafts/[id]/send` body `{ confirm: true, to: string }` (member, same-origin). `to` must match a single email address. Load the Resend key from `workspace_integrations`. Missing key returns HTTP 400 `resend is not connected.` POST `https://api.resend.com/emails` with `from` = `AUTH_EMAIL_FROM`, `subject` = draft `name`, `text` = `body_markdown`. On HTTP 200, set `status` to `sent` and `sent_at` to `now()`. A false or missing `confirm` returns HTTP 400. | ✅ | 2026-10-20 |
| TASK-038 | In `apps/dashboard/src/app/commerce/LifecycleDrafts.tsx`, add Send only on a draft that is not `sent`. The button opens a confirm step that requires the address and then calls TASK-037. | ✅ | 2026-10-20 |
| TASK-039 | Add `apps/dashboard/src/lib/integrations/ga4.ts` `fetchSessions(propertyId, accessToken)` POST `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport` with body `{ dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }], metrics: [{ name: "sessions" }] }`. `propertyId` must match `^[0-9]{6,12}$`. | ✅ | 2026-10-20 |
| TASK-040 | Extend Commerce Analytics so a saved `ga4` credential and workspace setting `ga4_property_id` (column `text` on `workspace_integrations`, added in the same migration 013) loads sessions. Render the number next to net sales. If `configured` is false, render `GA4 is not connected.` and do not show a zero that looks like measured traffic. | ✅ | 2026-10-20 |

### Implementation Phase 9

- GOAL-009: Ad drafts can be published only when that network's credential exists.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-041 | Add `apps/dashboard/src/lib/ads/publish.ts` `publishCampaign(campaign, credential)` that switches on `campaign.platform`. `meta` POSTs the creative JSON to `https://graph.facebook.com/v21.0/act_${credential.accountId}/adcreatives`. `google` returns HTTP-equivalent error `Google Ads publish is not configured.` unless `credential.developerToken` is non-empty, in which case it POSTs the campaign body to `https://googleads.googleapis.com/v18/customers/${credential.customerId}/googleAds:mutate` and stores the returned resource name. `tiktok` POSTs to `https://business-api.tiktok.com/open_api/v1.3/ad/create/`. Missing fields throw `Missing ${field} for ${platform}.` and the route returns HTTP 400. | ✅ | 2026-10-20 |
| TASK-042 | Add `POST /api/shopify/connections/[id]/campaigns/[campaignId]/publish` body `{ confirm: true }` (member, same-origin). Load the campaign for the workspace connection. Load provider `meta-ads`, `google-ads`, or `tiktok-ads` matching `campaign.platform`. On success set `shopify_ad_campaigns.status` to `ready`. CSV export in `AdCampaignBuilder.tsx` stays available either way. | ✅ | 2026-10-20 |
| TASK-043 | Add a Publish button in `apps/dashboard/src/app/commerce/AdCampaignBuilder.tsx` that is disabled with title `Connect ${platform} in Settings` when `GET /api/integrations` shows that provider `configured: false`. | ✅ | 2026-10-20 |

### Implementation Phase 10

- GOAL-010: RevOps lead list, launch binder, and retention steps stored for the workspace.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-044 | Add `apps/dashboard/database/migrations/014_revops_launch_retention.sql` with `revops_leads (id uuid pk, workspace_id uuid not null references workspaces(id), email text not null, stage text not null check (stage in ('subscriber','lead','mql','sql','opportunity','customer')), score integer not null default 0 check (score between 0 and 100), created_at timestamptz not null default now(), unique (workspace_id, email))`, `launches (id uuid pk, workspace_id uuid not null references workspaces(id), name text not null, created_at timestamptz not null default now())`, `launch_assets (launch_id uuid not null references launches(id) on delete cascade, asset_type text not null check (asset_type in ('copilot','social','lifecycle')), asset_id uuid not null, primary key (launch_id, asset_type, asset_id))`, and `retention_steps (id uuid pk, workspace_id uuid not null references workspaces(id), position integer not null, kind text not null check (kind in ('survey','offer','confirm')), body text not null, unique (workspace_id, position))`. | ✅ | 2026-10-20 |
| TASK-045 | Add `GET` and `POST /api/revops/leads`. POST body `{ email, stage, score }` (member, same-origin). GET returns rows for the workspace only. Add `apps/dashboard/src/app/revops/page.tsx` listing those columns. Empty copy is `No leads yet.` | ✅ | 2026-10-20 |
| TASK-046 | Add `POST /api/launches` body `{ name }` and `POST /api/launches/[id]/assets` body `{ assetType, assetId }` (member, same-origin). The asset id must exist in the matching workspace table or the route returns HTTP 404. Add `apps/dashboard/src/app/launch/page.tsx` to create a launch and attach ids copied from `GET /api/assets`. | ✅ | 2026-10-20 |
| TASK-047 | Add `GET` and `POST /api/retention/steps`. POST replaces the workspace's steps with the submitted array of `{ position, kind, body }` inside one transaction. Add `apps/dashboard/src/app/retention/page.tsx` rendering the ordered list and a save form. Do not render a drag-and-drop claim. | ✅ | 2026-10-20 |
| TASK-048 | Add RevOps, Launch, and Retention links to the main nav in `apps/dashboard/src/app/page.tsx`. | ✅ | 2026-10-20 |

### Implementation Phase 11

- GOAL-011: Tests and operator docs cover quota, URL checks, catalog size, and publish fail-closed behavior.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-049 | Add `apps/dashboard/src/lib/billing/quota.test.ts` that, with a mocked SQL count, allows the 5th free event and rejects the 6th, and allows the 6th when plan is `pro`. | ✅ | 2026-10-20 |
| TASK-050 | Add a route test or module test that `publishCampaign` throws `Missing accountId for meta.` when the credential has no `accountId`, and does not include the credential in the error string. | ✅ | 2026-10-20 |
| TASK-051 | Extend `.github/workflows/dashboard.yml` only if new tests are not already picked up by `npm test --workspace=cohorio-dashboard`. Do not set `RUN_DB_INTEGRATION_TESTS` or `STRIPE_SECRET_KEY` in that workflow. | ✅ | 2026-10-20 |
| TASK-052 | Update `apps/dashboard/README.md` with the free, pro, and team limits from REQ-009, the confirm-to-send rule, and the statement that CLI scripts in `tools/clis/` are not executed by the dashboard. | ✅ | 2026-10-20 |

### Implementation notes (2026-10-20)

- Migration `014` also adds `shopify_ad_campaigns.published_reference` so TASK-041 has somewhere to store the Google Ads resource name (and Meta/TikTok ids).
- Ad-network credentials are stored as a JSON object in the existing vault (`meta-ads`: `accessToken`, `accountId`; `google-ads`: `accessToken`, `developerToken`, `customerId`; `tiktok-ads`: `accessToken`, `advertiserId`, `adgroupId`). TikTok needs an existing `adgroupId` to create ads.
- `POST /api/integrations/ga4` also takes `propertyId`, stored in `workspace_integrations.ga4_property_id`.
- `/api/billing/webhook` is in `PUBLIC_PATHS` in `src/proxy.ts`; without it the session gate returned 401 to Stripe. The route verifies `Stripe-Signature`.
- The Calendar keeps grouping by the browser timezone (existing documented behavior) rather than the UTC date prefix named in TASK-017.
- `productJsonLd` also emits `offers.priceCurrency` when the stored currency is present, because schema.org offers need it. SKU is not stored by the sync, so it is omitted until it is.

## 3. Alternatives

- **ALT-001**: Spawn `tools/clis/*.js` from route handlers. Rejected. Those scripts read process env, are not workspace-scoped, and the workspace plan already forbids them.
- **ALT-002**: Add the `openai` and `stripe` npm SDKs. Rejected to satisfy CON-002. `fetch` is already the dashboard HTTP style.
- **ALT-003**: Ship all 61 providers as full OAuth apps in one release. Rejected. Phase 7 stores API keys and tests them. OAuth-only providers stay unconfigured until a key or token is pasted. Phases 8 and 9 implement the send and read paths the products actually call.
- **ALT-004**: Build a visual drag-and-drop cancel-flow editor. Rejected for this version. REQ-015 stores an ordered list without a new UI dependency.
- **ALT-005**: Keep the six-playbook Home and treat the other skills as agent-only files. Rejected because Product 1 in `codebase_analysis.md` is a dashboard over the skill library, and REQ-001 makes every skill selectable.

## 4. Dependencies

- **DEP-001**: Completed plan `plan/feature-cohorio-dashboard-workspace-1.md` and migration `008_workspace_marketing_runtime.sql` applied.
- **DEP-002**: `encryptSecret` and `decryptSecret` in `apps/dashboard/src/lib/secret-box.ts`.
- **DEP-003**: `completeChat` in `apps/dashboard/src/lib/llm/client.ts` and `readSkillMarkdown` in `apps/dashboard/src/lib/skills/load-skill.ts`.
- **DEP-004**: Stripe Checkout and webhooks when `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. Billing UI must fail closed when they are empty.
- **DEP-005**: Resend HTTP API for lifecycle send, using the workspace integration key, not a hardcoded key.
- **DEP-006**: Optional `COHORIO_IMAGE_API_KEY` for social images. Generation of post text must still work when it is empty.

## 5. Files

- **FILE-001**: `apps/dashboard/src/lib/skills/catalog.ts` — all skill directories and legacy ids (TASK-001).
- **FILE-002**: `apps/dashboard/src/lib/skills/load-skill.ts` — frontmatter reader (TASK-002).
- **FILE-003**: `apps/dashboard/src/app/api/skills/route.ts` — new (TASK-003).
- **FILE-004**: `apps/dashboard/src/app/page.tsx` — catalog-driven Home (TASK-004, TASK-011, TASK-048).
- **FILE-005**: `skills/form/SKILL.md` — new form skill (TASK-006).
- **FILE-006**: `apps/dashboard/src/app/social/page.tsx` — source, platforms, schedule, calendar, image (TASK-008, TASK-015, TASK-016, TASK-017, TASK-020, TASK-021).
- **FILE-007**: `apps/dashboard/src/app/api/social/generate/route.ts` — goal, voice, five platforms (TASK-007, TASK-016).
- **FILE-008**: `apps/dashboard/src/lib/assets.ts` and `apps/dashboard/src/app/api/assets/route.ts` — new (TASK-009, TASK-010).
- **FILE-009**: `apps/dashboard/src/app/library/page.tsx` — new (TASK-011).
- **FILE-010**: `apps/dashboard/database/migrations/009_social_platforms.sql` — new (TASK-012).
- **FILE-011**: `apps/dashboard/src/lib/http/public-url.ts` — new (TASK-013).
- **FILE-012**: `apps/dashboard/src/app/api/social/source/route.ts` — new (TASK-014).
- **FILE-013**: `apps/dashboard/database/migrations/010_social_images.sql` — new (TASK-018).
- **FILE-014**: `apps/dashboard/src/lib/images/client.ts` and `apps/dashboard/src/app/api/social/images/route.ts` — new (TASK-019, TASK-020).
- **FILE-015**: `apps/dashboard/src/lib/shopify/product-schema.ts` — new (TASK-023).
- **FILE-016**: `apps/dashboard/src/lib/lifecycle-drafts.ts` — review-request draft (TASK-025).
- **FILE-017**: `apps/dashboard/database/migrations/011_billing_and_usage.sql` — new (TASK-026).
- **FILE-018**: `apps/dashboard/src/lib/billing/quota.ts` and `apps/dashboard/src/lib/billing/stripe.ts` — new (TASK-027, TASK-028).
- **FILE-019**: `apps/dashboard/src/app/api/billing/checkout/route.ts` and `apps/dashboard/src/app/api/billing/webhook/route.ts` — new (TASK-029).
- **FILE-020**: `apps/dashboard/database/migrations/012_workspace_integrations.sql` — new (TASK-031).
- **FILE-021**: `apps/dashboard/src/lib/integrations/store.ts`, `providers.ts`, `adapter.ts` — new (TASK-032, TASK-033, TASK-035).
- **FILE-022**: `apps/dashboard/src/app/settings/integrations/page.tsx` — new (TASK-034).
- **FILE-023**: `apps/dashboard/database/migrations/013_lifecycle_delivery.sql` — new (TASK-036, TASK-040).
- **FILE-024**: `apps/dashboard/src/lib/ads/publish.ts` — new (TASK-041).
- **FILE-025**: `apps/dashboard/database/migrations/014_revops_launch_retention.sql` — new (TASK-044).
- **FILE-026**: `apps/dashboard/src/app/revops/page.tsx`, `apps/dashboard/src/app/launch/page.tsx`, `apps/dashboard/src/app/retention/page.tsx` — new (TASK-045, TASK-046, TASK-047).
- **FILE-027**: `apps/dashboard/README.md` and `apps/dashboard/.env.example` — operator notes (TASK-022, TASK-052).

## 6. Testing

- **TEST-001**: `catalog.test.ts` resolves every on-disk skill directory and the six legacy ids (TASK-005).
- **TEST-002**: `public-url.test.ts` rejects loopback, RFC1918, and the cloud metadata address (TASK-013).
- **TEST-003**: `product-schema.test.ts` omits empty product fields (TASK-023).
- **TEST-004**: `quota.test.ts` blocks the 6th free-plan task and allows it on `pro` (TASK-049).
- **TEST-005**: `publishCampaign` error text does not contain the credential (TASK-050).
- **TEST-006**: `npm test --workspace=cohorio-dashboard` passes without `RUN_DB_INTEGRATION_TESTS`, `STRIPE_SECRET_KEY`, or `COHORIO_IMAGE_API_KEY`.
- **TEST-007**: Manual: with no image key, Add a visual shows `COHORIO_IMAGE_API_KEY is not configured.` and `image_url` stays null.
- **TEST-008**: Manual: lifecycle Send without `confirm: true` returns HTTP 400 and leaves `status` as `draft`.
- **TEST-009**: Manual: Home lists more than the original six playbooks after `GET /api/skills` returns the on-disk directories.

## 7. Risks & Assumptions

- **RISK-001**: Ad-network request bodies change without notice. Mitigation: TASK-041 treats a non-OK response as HTTP 502 `{ error: "The ad network rejected the campaign." }` and does not mark the campaign `ready`.
- **RISK-002**: Fetching arbitrary public URLs can be abused as a proxy. Mitigation: SEC-004, 10 second timeout, 100_000 byte cap, member auth, and same-origin.
- **RISK-003**: Stripe webhook verification implemented by hand can drift from Stripe's scheme. Mitigation: TASK-029 specifies HMAC-SHA256 and a 300 second tolerance, covered by a unit test vector of a known signed payload in `stripe-signature.test.ts` added beside TASK-029.
- **RISK-004**: Loading every `SKILL.md` into a single copilot call can exceed the model context. Mitigation: keep the 80_000 character cap already in `readSkillMarkdown`. Home only sends the selected skill.
- **ASSUMPTION-001**: `workspaces.id` and `users.id` are UUIDs, matching migration 008.
- **ASSUMPTION-002**: Operators who want Pro billing will set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Until then, every workspace remains `free`.
- **ASSUMPTION-003**: A pasted API key is an acceptable credential for Phase 7. OAuth consent screens for Google Ads and Meta are not required for the vault to exist.
- **ASSUMPTION-004**: `shopify_ad_campaigns` rows are reached only through `shopify_connections.workspace_id`, because that table has no direct `workspace_id` column.

## 8. Related Specifications / Further Reading

- [plan/feature-cohorio-dashboard-workspace-1.md](feature-cohorio-dashboard-workspace-1.md)
- [codebase_analysis.md](../codebase_analysis.md) section 5, Products 1–8
- [apps/dashboard/README.md](../apps/dashboard/README.md)
- [apps/dashboard/.env.example](../apps/dashboard/.env.example)
- [tools/REGISTRY.md](../tools/REGISTRY.md)
- [skills/cro/references/form.md](../skills/cro/references/form.md)
