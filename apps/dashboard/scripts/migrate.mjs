import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import pg from "pg";

const { Pool } = pg;
nextEnv.loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const migrationsDirectory = path.join(process.cwd(), "database", "migrations");
const parsedUrl = new URL(databaseUrl);
const sslEnabled = process.env.DATABASE_SSL === "true";
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
});

function normalizeSql(sql) {
  return sql.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

function checksumVariants(sql) {
  const normalized = normalizeSql(sql);
  return new Set([
    checksum(normalized),
    checksum(sql),
    checksum(normalized.replace(/\n/g, "\r\n")),
  ]);
}

const client = await pool.connect();
try {
  await client.query("SET lock_timeout = '30s'");
  await client.query("SET statement_timeout = '10min'");
  await client.query(`
    CREATE TABLE IF NOT EXISTS cohorio_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT,
      execution_ms INTEGER
    )
  `);
  await client.query(`
    ALTER TABLE cohorio_migrations
      ADD COLUMN IF NOT EXISTS checksum TEXT,
      ADD COLUMN IF NOT EXISTS execution_ms INTEGER
  `);
  await client.query("SELECT pg_advisory_lock(hashtext('cohorio_migrations'))");

  const preflight = await client.query(`
    SELECT current_database() AS database,
           current_setting('server_version') AS version,
           EXISTS(SELECT 1 FROM pg_available_extensions WHERE name = 'pgcrypto') AS pgcrypto,
           EXISTS(SELECT 1 FROM pg_available_extensions WHERE name = 'citext') AS citext
  `);
  const info = preflight.rows[0];
  console.log(
    `Migrating ${info.database} on ${parsedUrl.hostname}:${parsedUrl.port || "5432"} (PostgreSQL ${info.version}, ssl=${sslEnabled})`,
  );
  if (!info.pgcrypto || !info.citext) {
    throw new Error("PostgreSQL extensions pgcrypto and citext must be available.");
  }

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    const digest = checksum(normalizeSql(sql));
    const applied = await client.query(
      "SELECT checksum FROM cohorio_migrations WHERE filename = $1",
      [file],
    );
    if (applied.rowCount) {
      const stored = applied.rows[0].checksum;
      if (stored && stored !== digest) {
        if (!checksumVariants(sql).has(stored)) {
          throw new Error(
            `Migration drift detected in ${file}. Applied checksum ${stored} does not match ${digest}.`,
          );
        }
        console.log(`Reconciled line-ending checksum for ${file}`);
      }
      if (stored !== digest) {
        await client.query(
          "UPDATE cohorio_migrations SET checksum = $2 WHERE filename = $1",
          [file, digest],
        );
      }
      console.log(`Skipped ${file}`);
      continue;
    }

    const started = Date.now();
    await client.query("BEGIN");
    try {
      await client.query(normalizeSql(sql));
      await client.query(
        `INSERT INTO cohorio_migrations (filename, checksum, execution_ms)
         VALUES ($1, $2, $3)`,
        [file, digest, Date.now() - started],
      );
      await client.query("COMMIT");
      console.log(`Applied ${file} in ${Date.now() - started}ms`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client
    .query("SELECT pg_advisory_unlock(hashtext('cohorio_migrations'))")
    .catch(() => undefined);
  client.release();
  await pool.end();
}
