import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), false, console, true);

const connectionString =
  process.env.RUN_DB_INTEGRATION_TESTS === "true"
    ? process.env.TEST_DATABASE_URL
    : undefined;
const integration = describe.skipIf(!connectionString);

integration("authentication tenancy database", () => {
  let pool: Pool;
  let client: PoolClient;
  const userA = randomUUID();
  const userB = randomUUID();
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();

  beforeAll(async () => {
    pool = new Pool({
      connectionString,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, name, email, email_verified_at, status)
       VALUES ($1, 'Tenant A', $2, NOW(), 'active'),
              ($3, 'Tenant B', $4, NOW(), 'active')`,
      [
        userA,
        `tenant-a-${userA}@example.test`,
        userB,
        `tenant-b-${userB}@example.test`,
      ],
    );
    await client.query(
      `INSERT INTO organizations (id, name, slug, created_by_user_id)
       VALUES ($1, 'Organization A', $2, $3),
              ($4, 'Organization B', $5, $6)`,
      [
        organizationA,
        `org-a-${organizationA}`,
        userA,
        organizationB,
        `org-b-${organizationB}`,
        userB,
      ],
    );
    await client.query(
      `INSERT INTO organization_memberships (
         organization_id, user_id, role, status
       ) VALUES ($1, $2, 'owner', 'active'),
                ($3, $4, 'owner', 'active')`,
      [organizationA, userA, organizationB, userB],
    );
    await client.query(
      `INSERT INTO workspaces (
         id, organization_id, name, slug, status, is_default, created_by_user_id
       ) VALUES ($1, $2, 'Workspace A', 'main', 'active', TRUE, $3),
                ($4, $5, 'Workspace B', 'main', 'active', TRUE, $6)`,
      [workspaceA, organizationA, userA, workspaceB, organizationB, userB],
    );
  });

  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
    if (pool) await pool.end();
  });

  it("has the required migration and workspace foreign keys", async () => {
    const migration = await client.query(
      `SELECT 1 FROM cohorio_migrations
        WHERE filename IN (
          '006_authentication_tenancy.sql',
          '007_database_hardening.sql'
        )`,
    );
    expect(migration.rowCount).toBe(2);
    const constraints = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY'
          AND constraint_name IN (
            'shopify_connections_workspace_fk',
            'product_marketing_contexts_workspace_fk'
          )`,
    );
    expect(Number(constraints.rows[0].count)).toBe(2);
  });

  it("denies cross-tenant workspace resolution", async () => {
    const result = await client.query(
      `SELECT w.id
         FROM workspaces w
         JOIN organization_memberships m
           ON m.organization_id = w.organization_id
        WHERE w.id = $1 AND m.user_id = $2
          AND w.status = 'active' AND m.status = 'active'`,
      [workspaceB, userA],
    );
    expect(result.rowCount).toBe(0);
  });

  it("isolates the same Shopify domain between workspaces", async () => {
    const connectionA = randomUUID();
    const connectionB = randomUUID();
    await client.query(
      `INSERT INTO shopify_connections (
         id, workspace_id, shop_domain, display_name,
         access_token_encrypted, scopes
       ) VALUES ($1, $2, 'shared.myshopify.com', 'A', 'encrypted', 'read_products'),
                ($3, $4, 'shared.myshopify.com', 'B', 'encrypted', 'read_products')`,
      [connectionA, workspaceA, connectionB, workspaceB],
    );
    const wrongTenant = await client.query(
      `SELECT id FROM shopify_connections
        WHERE id = $1 AND workspace_id = $2`,
      [connectionB, workspaceA],
    );
    expect(wrongTenant.rowCount).toBe(0);
  });

  it("prevents removing the last active owner", async () => {
    await client.query("SAVEPOINT owner_guard_test");
    await expect(
      client.query(
        `UPDATE organization_memberships SET role = 'admin'
          WHERE organization_id = $1 AND user_id = $2`,
        [organizationA, userA],
      ),
    ).rejects.toThrow(/at least one active owner/i);
    await client.query("ROLLBACK TO SAVEPOINT owner_guard_test");
  });

  it("claims an anonymous workspace without changing its ID", async () => {
    const anonymousId = randomUUID();
    await client.query(
      `INSERT INTO workspaces (id, name, slug, status)
       VALUES ($1, 'Anonymous', 'anonymous', 'anonymous')`,
      [anonymousId],
    );
    const claimed = await client.query<{ id: string }>(
      `UPDATE workspaces
          SET organization_id = $2, status = 'active', claimed_at = NOW(),
              slug = 'imported'
        WHERE id = $1 AND organization_id IS NULL
        RETURNING id`,
      [anonymousId, organizationA],
    );
    expect(claimed.rows[0].id).toBe(anonymousId);
  });

  it("keeps campaign products relationally bound to synced products", async () => {
    const connectionId = randomUUID();
    await client.query(
      `INSERT INTO shopify_connections (
         id, workspace_id, shop_domain, display_name,
         access_token_encrypted, scopes
       ) VALUES ($1, $2, 'campaign.myshopify.com', 'Campaign', 'encrypted', 'read_products')`,
      [connectionId, workspaceA],
    );
    await client.query(
      `INSERT INTO shopify_products (
         connection_id, shopify_product_id, title, handle, status
       ) VALUES ($1, 'gid://shopify/Product/1', 'Hero', 'hero', 'ACTIVE')`,
      [connectionId],
    );
    const campaignId = randomUUID();
    await client.query(
      `INSERT INTO shopify_ad_campaigns (
         id, connection_id, name, platform, objective, daily_budget,
         currency_code, audience, value_proposition, strategy, creatives
       ) VALUES (
         $1, $2, 'Launch', 'meta', 'sales', 25, 'USD', 'buyers',
         'proof', '{}'::jsonb, '[]'::jsonb
       )`,
      [campaignId, connectionId],
    );
    await client.query(
      `INSERT INTO shopify_ad_campaign_products (
         campaign_id, connection_id, shopify_product_id, position
       ) VALUES ($1, $2, 'gid://shopify/Product/1', 0)`,
      [campaignId, connectionId],
    );
    await client.query("SAVEPOINT campaign_product_fk");
    await expect(
      client.query(
        `INSERT INTO shopify_ad_campaign_products (
           campaign_id, connection_id, shopify_product_id, position
         ) VALUES ($1, $2, 'gid://shopify/Product/missing', 1)`,
        [campaignId, connectionId],
      ),
    ).rejects.toThrow();
    await client.query("ROLLBACK TO SAVEPOINT campaign_product_fk");
  });

  it("rejects an out-of-range CRO score", async () => {
    await client.query("SAVEPOINT cro_score_check");
    await expect(
      client.query(
        `INSERT INTO shopify_products (
           connection_id, shopify_product_id, title, handle, status, cro_score
         )
         SELECT id, 'gid://shopify/Product/bad', 'Bad', 'bad', 'ACTIVE', 140
           FROM shopify_connections WHERE workspace_id = $1 LIMIT 1`,
        [workspaceA],
      ),
    ).rejects.toThrow();
    await client.query("ROLLBACK TO SAVEPOINT cro_score_check");
  });
});
