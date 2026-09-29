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

For local OAuth, `APP_URL` must be an HTTPS URL reachable by Shopify. Use an
HTTPS tunnel and update the app and redirect URLs in Shopify's dashboard.

## Security boundary

The current prototype identifies an anonymous workspace with an HTTP-only
cookie. Add application authentication before production so the workspace ID is
derived from the authenticated organization.

Never expose Shopify tokens or `SHOPIFY_TOKEN_ENCRYPTION_KEY` to the browser.
All Shopify API requests must remain in server routes or server jobs.
