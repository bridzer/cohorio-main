# External Integrations
### 1) Integration Inventory
- PostgreSQL via pg: application persistence, DATABASE_URL.
- Auth.js: credentials and optional Google authentication; Argon2 password hashing; Resend authentication email.
- Shopify: OAuth, encrypted offline tokens, refresh, products and sales/reporting.
- Compatible LLM: server-side bearer credential, configured /chat/completions endpoint.
- Stripe: subscription checkout and signed checkout-completed webhook; incomplete subscription lifecycle handling.
- Workspace integrations: provider catalog derived from CLI filenames, encrypted key storage and settings page. Resend validation calls /domains; GA4 checks nonempty text; other providers check length >=8. Configured means stored, not proven operational.

### 2) Data Stores
PostgreSQL stores tenants, marketing context, runs, social posts, lifecycle drafts, Shopify connections/products/campaigns, billing usage and integration ciphertext. Migrations 001-008, 011 and 012 exist; proposed 009/010/013/014 are absent. [TODO] Applied database state was not checked.

### 3) Secrets and Credentials Handling
Environment variables supply server credentials; secret-box encrypts saved provider credentials, Shopify tokens and stored Stripe identifiers. No local secret files were opened for this review. [TODO] Repository-wide secret scanning and rotation policy were not assessed. The example environment omits Stripe variables.

### 4) Reliability and Failure Behavior
LLM helper rejects missing key and empty responses, but has no explicit timeout/retry in its inspected fetch. Lifecycle generation falls back to templates without a model key or when parsed model output is invalid. Shopify README documents offline token refresh. [TODO] Live provider reliability was not tested.

### 5) Observability for Integrations
Errors are generally returned via route JSON. No tracing/metrics layer appears in the inspected generation wrappers. [TODO] Verify deployed monitoring, alerting and request correlation.

### 6) Evidence
- apps/dashboard/src/auth.ts
- apps/dashboard/src/lib/auth/security.ts
- apps/dashboard/src/lib/integrations/adapter.ts
- apps/dashboard/src/lib/integrations/store.ts
- apps/dashboard/src/lib/llm/client.ts
- apps/dashboard/src/lib/lifecycle-drafts.ts
- apps/dashboard/src/lib/billing/stripe.ts
- apps/dashboard/README.md
