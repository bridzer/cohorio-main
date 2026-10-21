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

Home playbooks, social generation, and lifecycle drafts call an
OpenAI-compatible chat completions endpoint. Configure it with:

- `COHORIO_LLM_API_KEY` — server-only bearer token. Leave it empty to fail
  closed. Copilot and social generation return HTTP 400 with
  `COHORIO_LLM_API_KEY is not configured.` and do not insert a row.
- `COHORIO_LLM_BASE_URL` — API origin plus version path, for example
  `https://api.groq.com/openai/v1` or `https://api.openai.com/v1`.
- `COHORIO_LLM_MODEL` — model id accepted by that endpoint.

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
