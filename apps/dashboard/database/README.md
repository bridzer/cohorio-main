# Cohorio database

PostgreSQL is the source of truth for identity, tenancy, marketing context, and
connected commerce data. Run migrations only through `npm run db:migrate`;
applied files are immutable and protected by SHA-256 checksums.

## Ownership model

```text
users ──< organization_memberships >── organizations ──< workspaces
                                                        ├── product_marketing_contexts
                                                        └── shopify_connections
                                                            ├── shopify_products
                                                            ├── shopify_daily_metrics
                                                            └── shopify_ad_campaigns
                                                                └── shopify_ad_campaign_products
```

- Membership is organization-wide. An active member can access every active
  workspace in that organization, subject to their organization role.
- A workspace owns marketing context and Shopify connections. All Shopify
  repository operations must include the authenticated workspace ID.
- Anonymous workspaces exist only to recover or claim legacy pre-auth data.
  New authenticated accounts receive an organization and default workspace.
- Agent tables (`agent_threads`, `agent_runs`, `agent_messages`,
  `agent_actions`, `workspace_memories`) carry `workspace_id` and are only
  read or written with it. `agent_actions` moves out of `pending` through a
  single conditional update, so an approved action executes at most once.
- Campaign-product selection is relational. The JSON product ID list remains
  as a compatibility snapshot, not the integrity boundary.

## Lifecycle and deletion

- Users are soft-deleted and their email is anonymized. Sessions are revoked
  by incrementing `session_version`.
- The final active organization owner cannot be demoted, suspended, or removed.
  Transfer ownership before removing an owner.
- Workspaces and organizations are archived before any administrative purge.
  Workspace-owned data uses restrictive foreign keys; connection-owned
  snapshots cascade when a connection is explicitly purged.
- Audit rows preserve actor and target history with nullable foreign keys.
  Retention should be set according to the production compliance policy.
- Authentication tokens, invitations, and rate-limit rows are removed by
  `npm run auth:cleanup`.

## Operational requirements

- PostgreSQL 14+ with the `pgcrypto` and `citext` extensions available.
- TLS should be enabled when required by the provider (`DATABASE_SSL=true`).
  Certificate verification stays on unless you set
  `DATABASE_SSL_REJECT_UNAUTHORIZED=false` for a provider that cannot present a
  publicly trusted certificate.
- Back up a populated database before migration and run integration tests
  against a staging clone before production schema changes.
- Audit events use a BRIN index on `created_at`. Apply a retention window
  that matches the production compliance policy; `npm run auth:cleanup`
  does not purge audit history.
