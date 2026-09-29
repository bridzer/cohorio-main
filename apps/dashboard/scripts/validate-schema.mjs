import nextEnv from "@next/env";
import pg from "pg";
import { postgresSslConfig } from "./postgres-ssl.mjs";

nextEnv.loadEnvConfig(process.cwd());
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: postgresSslConfig(),
});

const migrations = await pool.query(
  `SELECT filename, checksum IS NOT NULL AS has_checksum, execution_ms
     FROM cohorio_migrations ORDER BY filename`,
);
const extensions = await pool.query(
  `SELECT extname FROM pg_extension
    WHERE extname IN ('pgcrypto', 'citext')
    ORDER BY extname`,
);
const fks = await pool.query(
  `SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype = 'f'`,
);
const checks = await pool.query(
  `SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype = 'c'`,
);
const indexes = await pool.query(
  `SELECT COUNT(*)::int AS count FROM pg_indexes WHERE schemaname = 'public'`,
);
const orphans = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM shopify_connections c
       LEFT JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.id IS NULL) AS orphan_connections,
    (SELECT COUNT(*) FROM product_marketing_contexts c
       LEFT JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.id IS NULL) AS orphan_contexts,
    (SELECT COUNT(*) FROM shopify_ad_campaign_products p
       LEFT JOIN shopify_products pr
         ON pr.connection_id = p.connection_id
        AND pr.shopify_product_id = p.shopify_product_id
      WHERE pr.shopify_product_id IS NULL) AS orphan_campaign_products
`);
const types = await pool.query(`
  SELECT table_name, column_name, data_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name = 'id'
     AND table_name IN (
       'shopify_connections', 'shopify_ad_campaigns', 'workspaces', 'users'
     )
   ORDER BY table_name
`);
const campaignTable = await pool.query(`
  SELECT to_regclass('public.shopify_ad_campaign_products') AS table_name
`);

console.log(
  JSON.stringify(
    {
      migrations: migrations.rows,
      extensions: extensions.rows.map((row) => row.extname),
      foreignKeys: fks.rows[0].count,
      checkConstraints: checks.rows[0].count,
      indexes: indexes.rows[0].count,
      orphans: orphans.rows[0],
      uuidTypes: types.rows,
      campaignProducts: campaignTable.rows[0].table_name,
    },
    null,
    2,
  ),
);
await pool.end();
