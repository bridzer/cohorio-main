# Implementation Status and Next Steps
Reviewed 2026-10-19; scope is current source, including pre-existing uncommitted changes. No production or live-provider readiness claim.

Brand Brain follow-up: both copilot generation routes now use shared dashboard instructions that prioritize saved facts, request useful deliverables and limit blocking clarification to two questions. Context is passed as reference data separately from system instructions. Route regression tests use the real ad-creative skill with mocked model/database boundaries to verify workspace isolation, context refresh, missing context, access denial and placement of embedded instructions. Latest verification: 63 tests passed, 7 skipped; targeted ESLint and TypeScript checks passed. Live model output quality remains unverified; the README includes a reproducible manual check. The unrelated integration-settings lint failure from the initial review remains outside this change.

### 1) Top Risks (Prioritized)
1. Brand Brain response quality: brainbrandresponse.md records a generic ad-creative questionnaire. The current runner already sends saved brand context, but also loads instruction-heavy skill text; source does not prove why that recorded output occurred. Add a focused evaluation with known saved product/audience/voice and assert that generated output uses it and asks only for missing information. Do not assume context injection is absent.
2. Billing/quota integrity: quota check and event insertion are separate queries around generation. Reserve quota atomically and define rollback/idempotency. Stripe webhook currently applies checkout completion only; add payment/subscription update/cancellation handling before relying on paid entitlements.
3. Integration trust: most provider checks validate key length only. Label stored credentials accurately and implement real authentication tests for supported providers.

### 2) Technical Debt and Implementation Inventory
| Area | Implemented in source | Remaining |
|---|---|---|
| Account/tenancy | Auth pages, verification/reset, credential/Google configuration, workspace access, members/invites/settings | Verify complete live flows and isolated tenancy tests |
| Brand Brain | Onboarding/context persistence and Markdown injected into generation | Evaluate context adherence and missing-information handling |
| AI workspaces | Job forms, prompt routing, server job-to-skill allowlist, generated-run persistence; 50 discoverable skills | Prompt quality, focused evaluations and operational workflows beyond text output |
| Asset library | Unified workspace list and library page | Links currently target broad workspace pages rather than precise asset detail |
| Shopify commerce | Multi-store OAuth, token refresh/encryption, sync, sales reporting, product CRO, campaign drafts/CSV | Live installation/report verification; JSON-LD product export |
| Social | LinkedIn/X/Instagram generation, goal/voice, saved posts, calendar grouping, persisted scheduling | URL ingestion, TikTok/Facebook, images and real delivery |
| Lifecycle | Three persisted draft types, LLM generation/template fallback | Review-request draft, confirmed send and delivery state |
| Billing | Plan/usage APIs, quota checks, checkout and signature verification; migration 011 | Settings plan/checkout UI, env/operator docs, subscription lifecycle and concurrency safety |
| Integrations | Provider list, encrypted credential vault, save/delete UI; migration 012 | Functional adapters; GA4 reporting and lifecycle delivery |
| RevOps/launch/retention | Skill-backed generation forms | Persistent leads/scoring, launch asset binder and ordered retention steps |

The full-product plan marks its first two phases complete. Subsequent work is uneven: billing backend and vault exist while earlier social/image/schema milestones remain incomplete. A plan checkbox is not deployment evidence.

### 3) Security Concerns
Provider error messages can reach route JSON through Error.message (for example LLM errors); sanitize and test secret redaction. Future URL ingestion must reject private/link-local/metadata addresses and validate redirect targets before fetching, as required by the plan. Current inspected social generation accepts text, not a URL-fetch pipeline. Existing workspace/origin checks provide useful boundaries; they do not replace integration testing.

### 4) Performance and Scaling Concerns
completeChat has no explicit fetch timeout/retry. Social platforms are generated sequentially. Assets query caps output at 100 and has no pagination. Home page mixes substantial navigation, forms and result rendering. These are source observations; no load benchmark was run.

### 5) Fragile/High-Churn Areas and Recommended Sequence
Recent four-commit history repeats dashboard env/README three times and social/commerce pages twice; uncommitted work additionally touches Home, social, catalog and generation routes. Preserve these changes and review them before committing.

Recommended implementation order:
1. Fix/evaluate Brand Brain answer quality using the recorded ad-creative case; add route-level context regression coverage.
2. Finish remaining social phase 3: five platforms and safe URL ingestion. Date/time selection and timezone display were implemented 2026-10-20; scheduling remains separate from delivery.
3. Complete small commerce gaps: product JSON-LD and review-request draft.
4. Finish billing UI/configuration, atomic quota accounting and subscription lifecycle tests.
5. Make Resend and GA4 operational with confirmed send, saved delivery state and truthful analytics empty states.
6. Add images and confirmed network publishing with appropriate provider credentials, retries and delivery workers.
7. Add persistent RevOps, launch and retention data workflows when core generation and delivery are reliable.

### 6) [ASK USER] Questions
1. [ASK USER] Should the next implementation prioritize improving the Brand Brain response shown in brainbrandresponse.md, or completing social scheduling/source ingestion? Recommendation: Brand Brain response quality first.

### 7) Evidence and Verification
- apps/dashboard/brainbrandresponse.md
- apps/dashboard/src/app/api/workspaces/run/route.ts
- apps/dashboard/src/lib/marketing-context-prompt.ts
- apps/dashboard/src/app/social/page.tsx: scheduleActivePost
- apps/dashboard/src/lib/social/generate.ts
- apps/dashboard/src/lib/lifecycle-drafts.ts
- apps/dashboard/src/lib/integrations/adapter.ts
- apps/dashboard/src/lib/billing/quota.ts
- apps/dashboard/src/app/api/billing/webhook/route.ts
- apps/dashboard/src/app/settings/page.tsx
- plan/feature-cohorio-full-product-1.md
- git status --short and git log -4 --name-only from this review
- Tests: 53 passed, 7 skipped. Production build and TypeScript passed. Build emitted two warnings in apps/dashboard/src/lib/integrations/providers.ts: dynamic filesystem discovery causes whole-project tracing; scope or precompute the provider catalog before deployment. Lint failed with one react-hooks/set-state-in-effect error at apps/dashboard/src/app/settings/integrations/page.tsx:40 (load called from effect). Fix this before treating the current working tree as CI-clean.

## Social scheduling follow-up (2026-10-20)
The Create view now accepts a browser-local date/time with an explicit timezone label, persists UTC, shows the saved schedule for the active post and supports rescheduling. Calendar grouping uses the viewer timezone and excludes non-scheduled statuses. The PATCH route validates timezone-qualified ISO timestamps and rejects past times. Scheduling also saves edited post text. No migration or publishing worker was added. Tests: 83 passed, 7 skipped. Evidence: apps/dashboard/src/app/social/page.tsx; apps/dashboard/src/lib/social/schedule.ts; apps/dashboard/src/lib/social/schedule-route.test.ts; apps/dashboard/src/app/api/social/posts/[id]/route.ts.
