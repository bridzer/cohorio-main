# Cohorio Dashboard

Next.js dashboard for Cohorio's marketing, social, and commerce workspaces.

## Getting started

Copy `.env.example` to `.env.local`, configure it, then run:

```bash
npm install
npm run db:migrate
npm run dev
```

## Shopify multi-store setup

1. Create a standalone app in the Shopify Dev Dashboard.
2. Set its app URL to `APP_URL`.
3. Add `${APP_URL}/api/shopify/oauth/callback` as an allowed redirect URL.
4. Configure the Shopify and PostgreSQL variables in `.env.example`.
5. Run `npm run db:migrate`.
6. Open `/commerce` and choose **Add Shopify store**.

Every OAuth installation is stored as a separate connection under the current
workspace, allowing one workspace to switch between multiple Shopify stores.
Store net sales and order counts come from ShopifyQL and require the
`read_reports` scope. Reconnect a store that was installed before that scope
was requested.
Access and refresh tokens are encrypted with AES-256-GCM before persistence.

New Shopify public apps use expiring offline tokens. The API client refreshes
tokens before expiry and stores Shopify's rotated refresh token in the same
update.

Connecting a shop still requires a Dev Dashboard client secret, not an Admin
API access token (`shpat_`, `shpua_`, or `shpca_`). Client secrets often start
with `shpss_`. `APP_URL` must be HTTPS and must be a host that serves this
dashboard, because Shopify redirects the merchant back to that URL. For local
OAuth, use an HTTPS tunnel and update the app and redirect URLs in Shopify's
dashboard. Connecting a store starts with a same-origin POST so a crafted GET
link cannot attach a shop to the signed-in workspace.

## Security boundary

Sessions are NextAuth JWTs. `src/proxy.ts` allows a request only when `auth()`
returns a `session.user.id`; a cookie with the Auth.js name is not enough.
Workspace and Shopify data are scoped by `requireWorkspaceAccess` on each
server route, not by an anonymous workspace cookie.

Set `AUTH_TRUST_PROXY=true` in production behind Railway (or another reverse
proxy) so auth rate limits use the last `X-Forwarded-For` hop. Leave it `false`
for direct local access so clients cannot spoof `X-Forwarded-For`.

`GET /api/shopify/connections` validates `SHOPIFY_CLIENT_SECRET` and HTTPS
`APP_URL` through `shopifyConfig()`. An Admin API token used as the client
secret, or an HTTP app URL, returns `configured: false` and a `configError`
string, never the secret value. Client secrets that start with `shpss_` are
valid.

Never expose Shopify tokens or `SHOPIFY_TOKEN_ENCRYPTION_KEY` to the browser.
All Shopify API requests must remain in server routes or server jobs.

## Language model

The agent, Home playbooks, social generation, lifecycle drafts and evals all go
through `src/lib/llm/client.ts`, which supports three providers:

- **`anthropic`** — Claude through the official Anthropic SDK
  (`src/lib/llm/anthropic.ts`). Default model `claude-opus-5-5`. Thinking is
  always on and is steered with `COHORIO_LLM_EFFORT`; refusals are retried
  server-side on Anthropic's recommended fallback model (`fallbacks: "default"`);
  the stable prompt prefix is cached across agent steps.
- **`meta-muse`** — Meta Muse through the Meta AI API
  (`src/lib/llm/meta-muse.ts`), an OpenAI-compatible chat-completions API.
  Default model `muse-wonder-1.0`. `COHORIO_LLM_BASE_URL` may be the bare
  `https://api.meta.ai` host (a `/v1` path is added) or an explicit
  `https://api.meta.ai/v1`. Aliases `meta`, `muse` and `meta-ai` select the
  same provider.
- **`openai-compatible`** — any other chat-completions API (Groq, OpenRouter,
  OpenAI) at `COHORIO_LLM_BASE_URL`.

Configure with:

- `COHORIO_LLM_PROVIDER` — `anthropic`, `meta-muse` or `openai-compatible`.
  When unset, an Anthropic key (`sk-ant-…`) selects `anthropic` and an
  `api.meta.ai` base URL selects `meta-muse`.
- `COHORIO_LLM_API_KEY` — server-only key for the chosen provider. Leave it
  empty to fail closed: generation returns HTTP 400 with
  `COHORIO_LLM_API_KEY is not configured.` and inserts nothing.
- `COHORIO_LLM_MODEL` — model id. For `anthropic` it must be a Claude id
  (defaults to `claude-opus-5-5`); for `meta-muse` it must not be a Claude id
  (defaults to `muse-wonder-1.0`); a mismatched id is rejected with a clear
  error rather than sent.
- `COHORIO_LLM_EFFORT` — `anthropic` only: `low`, `medium` (default), `high`,
  `xhigh` or `max`. Higher effort thinks more and costs more.
- `COHORIO_LLM_BASE_URL` — `meta-muse` and `openai-compatible` only, e.g.
  `https://api.groq.com/openai/v1`.

A key and base URL from different providers fail with HTTP 401 on every call.
Do not send `COHORIO_LLM_API_KEY` to the browser. Restart the dev server after
changing these values; Next.js reads `.env.local` only at startup.

## Brand Brain responses

Both `/api/workspaces/run` and `/api/copilot/runs` load the signed-in
workspace's latest saved Brand Brain on each request. Shared dashboard
instructions adapt the marketing skills to this application: use saved product,
audience and voice, produce the requested work when possible, and ask at most
two questions only when missing details block useful work. Context is passed as
reference data separately from system instructions. Generation does not update
Brand Brain or publish content.

Regression tests exercise both routes with the real ad-creative skill and mocked
database/model boundaries, including workspace changes and missing context.
They verify model inputs and persistence, not the quality of a live model's reply.
For a live quality check, save a product one-liner, audience and voice, then ask:
`Write three Meta feed ads for our product. Do not include a discount.`
The response should give three ads grounded in those facts without asking for
the saved information, inventing proof, or adding a discount. With no saved
context, it should identify the missing product information without inventing it.

## Social scheduling

Choose a date and time in Social Studio using the timezone shown beside the
picker (your browser's timezone). Scheduling saves the current edited copy and
selected time together. The calendar groups entries in that same timezone and
shows their times. You can change the time and reschedule the current post.
Past dates and timestamps without a timezone are rejected by the API.
Scheduling stores a calendar plan; automatic social publishing is not connected.
If no time is chosen, Schedule uses tomorrow at 10:00 local time.

Social Studio generates for LinkedIn, X, Instagram, TikTok, and Facebook.
**Add URL** fetches a public `http`/`https` page on the server and uses its
text as the source. Loopback, private, link-local, and cloud metadata
addresses (including `169.254.169.254`) are rejected before the request and
again after each redirect (at most 3). Fetches time out after 10 seconds and
read at most 100,000 bytes. **Upload** accepts `.txt` and `.md` files only and
reads them in the browser.

## Social images

**Add a visual** calls an OpenAI-compatible `/images/generations` endpoint and
saves the returned URL on the post. Configure it with the server-only, optional
variables `COHORIO_IMAGE_API_KEY`, `COHORIO_IMAGE_BASE_URL`, and
`COHORIO_IMAGE_MODEL`. With no key, the button returns
`COHORIO_IMAGE_API_KEY is not configured.` and the post is not changed. Post
text generation does not depend on this key.

## Plans and task limits

Every successful copilot run, social generation, and lifecycle generation
counts as one task.

| Plan | Price (USD) | Tasks per UTC month |
|------|-------------|---------------------|
| `free` | $0 | 5 |
| `pro` | $49/month | No cap |
| `team` | $149/month | No cap |

A free workspace that has used 5 tasks this month gets HTTP 402 and no model
call is made. Checkout uses Stripe when `STRIPE_SECRET_KEY` is set; point a
Stripe webhook at `${APP_URL}/api/billing/webhook` with
`STRIPE_WEBHOOK_SECRET` and subscribe to `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted` and `invoice.payment_failed`. The webhook is
the only billing route reachable without a session, and it rejects requests
whose `Stripe-Signature` is missing, invalid, or older than 300 seconds. With
no Stripe key every workspace stays on `free`.

Subscription events keep `workspace_plans` in sync: a canceled or unpaid
subscription returns the workspace to `free`, `past_due` keeps the plan and
flags it (Settings warns and links to the Stripe billing portal under
**Manage billing**), and an active subscription restores the plan from its
price amount. Webhook events find the workspace through a SHA-256 hash of the
Stripe customer id (`stripe_customer_ref`, migration 017); the id itself stays
encrypted. Workspaces that checked out before migration 017 have no ref, so
their later subscription events are acknowledged but not applied — the next
checkout or portal visit re-syncs them.

### Agent spend budgets

Every completed agent run records its model and estimated USD cost
(`agent_runs.model` / `cost_usd`, migration 017) from the token counts, using
the list-price estimates in `src/lib/llm/pricing.ts`. Models with no known
rate (Meta Muse models by default) record no cost until priced with
`COHORIO_LLM_PRICING_JSON`, e.g.
`{"muse-wonder-1.0":{"input":1.5,"output":6}}`.

Each plan includes a monthly agent-spend budget; a run that would start over
budget is refused with HTTP 402, and scheduled automations are skipped with
that reason. Failed runs record no cost.

| Plan | Agent budget (USD/month) |
|------|--------------------------|
| `free` | $1 |
| `pro` | $50 |
| `team` | $200 |

Override with `COHORIO_AGENT_BUDGET_FREE_USD`, `COHORIO_AGENT_BUDGET_PRO_USD`
and `COHORIO_AGENT_BUDGET_TEAM_USD`. Settings shows the month's agent spend
against the budget, from `GET /api/billing`.

## Connected tools

`/settings/integrations` stores one credential per workspace and provider,
encrypted with `SHOPIFY_TOKEN_ENCRYPTION_KEY`. The provider list mirrors the
file names in `tools/clis/`, but **the dashboard never executes those CLI
scripts**. It calls provider HTTP APIs directly with the workspace credential.
Responses report only whether a provider is configured.

- **Resend**: paste an API key. Lifecycle drafts can then be sent one at a time.
- **GA4**: use **Connect with Google** (OAuth, read-only Analytics scope) and
  then save the numeric property id — the connection refreshes itself and
  lasts until revoked. The Google OAuth client (`AUTH_GOOGLE_ID` /
  `AUTH_GOOGLE_SECRET`) needs `${APP_URL}/api/integrations/ga4/oauth/callback`
  as an authorized redirect URI. Or paste
  `{"refreshToken":"…","propertyId":"…"}` (verified on save), or a bare OAuth
  access token plus the property id — a pasted token expires in about an hour.
  Commerce Analytics then shows 28-day sessions next to Shopify net sales;
  otherwise it shows `GA4 is not connected.`
- **Ad networks**: paste a JSON object.
  - `meta-ads`: `{"accessToken":"…","accountId":"…"}`
  - `google-ads`: `{"accessToken":"…","developerToken":"…","customerId":"…"}`
    (optional `loginCustomerId`)
  - `tiktok-ads`: `{"accessToken":"…","advertiserId":"…","adgroupId":"…"}`

### Providers the agent can use

These providers have a connector in `src/lib/integrations/connectors/`. Saving
a credential makes one read-only call to the provider first and is rejected if
the provider refuses it. When connected, the Cohorio agent gets their read
tools; nothing in a connector writes to the provider.

| Provider | Credential | Agent tools |
|---|---|---|
| `meta-ads` | `{"accessToken":"…","accountId":"act_…"}` | Campaign/ad set/ad results (spend, CTR, CPC, purchases, ROAS, leads); campaign list |
| `google-ads` | `{"refreshToken":"…","developerToken":"…","customerId":"123-456-7890"}` (optional `loginCustomerId`; a pasted `accessToken` works for ~1 hour) | Campaign results: impressions, clicks, cost, average CPC, CTR, conversions, conversion value |
| `klaviyo` | Private key `pk_…` with campaigns, metrics and accounts read scopes | Campaign results attributed to Placed Order (Klaviyo allows ~2 report calls a minute) |
| `mailchimp` | API key ending in `-us…` (the data-center suffix) | Recent sent campaigns: sends, opens, open rate, clicks, click rate |
| `plausible` | `{"apiKey":"…","siteId":"example.com"}` (Plausible Cloud only) | Visitors, visits, pageviews, bounce rate, duration; by day, page, source, channel, country, device |
| `dataforseo` | `{"login":"…","password":"API password"}` | Keyword volume, CPC and trend; current top Google results. **Each call is billed** to that DataForSEO account |

GA4 is connected separately (above) and gives the agent a 28-day sessions
tool with the same self-refreshing token.

API versions are pinned in the connectors and must be kept current: Meta
Marketing API `v25.0` (also used for publishing), Google Ads API `v19` and
Klaviyo revision `2026-10-15`. Meta retires Marketing API versions about a
year after release; Klaviyo retires revisions two years after release.
Google Ads refresh tokens are exchanged through the server's Google OAuth
client (`AUTH_GOOGLE_*`); without it, refresh-token credentials cannot be
verified or used.

Every other provider in the list can store a key, shown as **Saved · not
verified**. Cohorio neither checks nor uses those keys until a connector is
added.

## Confirm before anything is sent

Generation endpoints never send. Lifecycle send
(`POST /api/lifecycle/drafts/[id]/send`) and ad publish
(`POST /api/shopify/connections/[id]/campaigns/[campaignId]/publish`) run only
after a same-origin POST whose body contains `confirm: true`; otherwise they
return HTTP 400 and change nothing. A missing provider credential returns HTTP
400 naming the provider. A rejected ad publish returns HTTP 502 and the
campaign is not marked `ready`. Google Ads campaigns are created `PAUSED`.
CSV export stays available whether or not a network is connected. Social
publishing is not connected.

## RevOps, launches, and retention

- `/revops` lists leads you add with an email, a stage
  (`subscriber`, `lead`, `mql`, `sql`, `opportunity`, `customer`), and a 0–100
  score. No stage is inferred for anyone not on the list.
- `/launch` groups existing copilot, social, and lifecycle rows under a launch.
  It stores references, not copies.
- `/retention` stores an ordered list of cancel-flow steps (survey, offer,
  confirm). Reorder with the arrow buttons and save; the whole list is replaced
  in one transaction.

## Agent automations

`/agent/automations` schedules agent runs daily or weekly at a local hour in an
IANA timezone. Each automation keeps its own conversation, runs with its
creator's current workspace role, counts as one task, and never approves its
own actions: anything that sends or publishes waits in **Waiting for approval**.
When `notify` is on, the creator gets an email through the configured email
transport (SMTP via `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`, or Resend via
`RESEND_API_KEY` and `AUTH_EMAIL_FROM`).

Runs need a background worker. Set `COHORIO_WORKER_ENABLED=true` on the
deployed service; the worker starts from `src/instrumentation.ts` and polls the
`agent_jobs` table. Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so running
the worker on several instances is safe. The automations page warns when no
worker has reported a heartbeat in the last two minutes.

### Activating the worker in production (Railway)

1. Set these variables on the deployed service, then redeploy:
   - `COHORIO_WORKER_ENABLED=true`
   - `DATABASE_SSL=true` and `DATABASE_SSL_REJECT_UNAUTHORIZED=false`
     (Railway Postgres uses a self-signed certificate; without this the worker
     ticks fail with `SELF_SIGNED_CERT_IN_CHAIN` and the app's database calls
     fail the same way)
   - `COHORIO_LLM_PROVIDER`, `COHORIO_LLM_API_KEY`, `COHORIO_LLM_MODEL` and
     `COHORIO_LLM_BASE_URL` for the provider the agent should run on
   - an email transport (`SMTP_*` or `RESEND_API_KEY` + `AUTH_EMAIL_FROM`)
2. Prove it works: run `npm run worker:smoke` (read-only; it never prints
   secret values). It checks the environment, the migration tables, worker
   heartbeat freshness, job counts and automation counts. A fresh heartbeat
   (≤120s) proves the worker is running; a stale or missing heartbeat points at
   the fix.
3. Create a test automation due within the next tick, confirm a run appears,
   and confirm the notification email arrives. Delete the test automation
   afterwards.

Keep `COHORIO_WORKER_ENABLED` off (or unset) in local `.env.local` when the
local `DATABASE_URL` points at the production database, so a dev server never
polls the production job queue.

The worker also marks interactive agent runs that have been "running" for more
than 30 minutes as failed, which happens when a server restarts mid-run.
Scheduled social posts are still not delivered to networks: no posting
integration exists yet.
