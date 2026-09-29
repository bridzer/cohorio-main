import nextEnv from "@next/env";
import pg from "pg";
import { postgresSslConfig } from "./postgres-ssl.mjs";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: postgresSslConfig(),
});

try {
  const [tokens, invitations, rateLimits] = await Promise.all([
    pool.query(
      `DELETE FROM auth_action_tokens
        WHERE expires_at < NOW() - INTERVAL '7 days'
           OR consumed_at < NOW() - INTERVAL '7 days'`,
    ),
    pool.query(
      `DELETE FROM organization_invitations
        WHERE expires_at < NOW() - INTERVAL '30 days'
           OR accepted_at < NOW() - INTERVAL '30 days'
           OR revoked_at < NOW() - INTERVAL '30 days'`,
    ),
    pool.query(
      `DELETE FROM auth_rate_limits
        WHERE updated_at < NOW() - INTERVAL '2 days'`,
    ),
  ]);
  console.log(
    `Auth cleanup complete: ${tokens.rowCount} tokens, ${invitations.rowCount} invitations, ${rateLimits.rowCount} rate limits.`,
  );
} finally {
  await pool.end();
}
