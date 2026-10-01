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
