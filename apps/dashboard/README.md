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
through `src/lib/llm/client.ts`, which supports two providers:

- **`anthropic`** — Claude through the official Anthropic SDK
  (`src/lib/llm/anthropic.ts`). Default model `claude-opus-5-5`. Thinking is
  always on and is steered with `COHORIO_LLM_EFFORT`; refusals are retried
  server-side on Anthropic's recommended fallback model (`fallbacks: "default"`);
  the stable prompt prefix is cached across agent steps.
- **`openai-compatible`** — any chat-completions API (Groq, OpenRouter, OpenAI)
  at `COHORIO_LLM_BASE_URL`.

Configure with:

- `COHORIO_LLM_PROVIDER` — `anthropic` or `openai-compatible`. When unset, an
  Anthropic key (`sk-ant-…`) selects `anthropic`.
- `COHORIO_LLM_API_KEY` — server-only key for the chosen provider. Leave it
  empty to fail closed: generation returns HTTP 400 with
  `COHORIO_LLM_API_KEY is not configured.` and inserts nothing.
- `COHORIO_LLM_MODEL` — model id. For `anthropic` it must be a Claude id
  (defaults to `claude-opus-5-5`); a non-Claude id is rejected with a clear
  error rather than sent.
- `COHORIO_LLM_EFFORT` — `anthropic` only: `low`, `medium` (default), `high`,
  `xhigh` or `max`. Higher effort thinks more and costs more.
- `COHORIO_LLM_BASE_URL` — `openai-compatible` only, e.g.
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
Stripe webhook for `checkout.session.completed` at
`${APP_URL}/api/billing/webhook` and set `STRIPE_WEBHOOK_SECRET`. The webhook
is the only billing route reachable without a session, and it rejects requests
whose `Stripe-Signature` is missing, invalid, or older than 300 seconds. With
no Stripe key every workspace stays on `free`.

## Connected tools

`/settings/integrations` stores one credential per workspace and provider,
encrypted with `SHOPIFY_TOKEN_ENCRYPTION_KEY`. The provider list mirrors the
file names in `tools/clis/`, but **the dashboard never executes those CLI
scripts**. It calls provider HTTP APIs directly with the workspace credential.
Responses report only whether a provider is configured.

- **Resend**: paste an API key. Lifecycle drafts can then be sent one at a time.
- **GA4**: paste an OAuth access token with Analytics read access plus the
  numeric property id. Commerce Analytics then shows 28-day sessions next to
  Shopify net sales; otherwise it shows `GA4 is not connected.`
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
| `klaviyo` | Private key `pk_…` with campaigns, metrics and accounts read scopes | Campaign results attributed to Placed Order (Klaviyo allows ~2 report calls a minute) |
| `plausible` | `{"apiKey":"…","siteId":"example.com"}` (Plausible Cloud only) | Visitors, visits, pageviews, bounce rate, duration; by day, page, source, channel, country, device |
| `dataforseo` | `{"login":"…","password":"API password"}` | Keyword volume, CPC and trend; current top Google results. **Each call is billed** to that DataForSEO account |

API versions are pinned in the connectors and must be kept current: Meta
Marketing API `v25.0` (also used for publishing) and Klaviyo revision
`2026-10-15`. Meta retires Marketing API versions about a year after release;
Klaviyo retires revisions two years after release.

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
When `notify` is on, the creator gets an email through the platform Resend key
(`RESEND_API_KEY` and `AUTH_EMAIL_FROM`).

Runs need a background worker. Set `COHORIO_WORKER_ENABLED=true` on the
deployed service; the worker starts from `src/instrumentation.ts` and polls the
`agent_jobs` table. Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so running
the worker on several instances is safe. The automations page warns when no
worker has reported a heartbeat in the last two minutes.

The worker also marks interactive agent runs that have been "running" for more
than 30 minutes as failed, which happens when a server restarts mid-run.
Scheduled social posts are still not delivered to networks: no posting
integration exists yet.
