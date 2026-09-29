import nextEnv from "@next/env";
import pg from "pg";
import { postgresSslConfig } from "./postgres-ssl.mjs";

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3000";
const email = `verification-test-${Date.now()}@example.com`;
const password = "VerificationTest123";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: postgresSslConfig(),
});

async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (user.rows[0]) {
      const userId = user.rows[0].id;
      const organizations = await client.query(
        `SELECT organization_id FROM organization_memberships
          WHERE user_id = $1`,
        [userId],
      );
      for (const row of organizations.rows) {
        await client.query(
          `UPDATE workspaces
              SET status = 'archived', is_default = FALSE,
                  archived_at = NOW(), updated_at = NOW()
            WHERE organization_id = $1`,
          [row.organization_id],
        );
        await client.query(
          `UPDATE organizations
              SET status = 'archived', archived_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [row.organization_id],
        );
      }
      await client.query(
        `UPDATE users
            SET status = 'deleted', deleted_at = NOW(),
                email = CONCAT('deleted+', id::text, '@invalid.local'),
                session_version = session_version + 1, updated_at = NOW()
          WHERE id = $1`,
        [userId],
      );
      await client.query(
        `UPDATE auth_action_tokens
            SET consumed_at = COALESCE(consumed_at, NOW())
          WHERE user_id = $1`,
        [userId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({
      name: "Verification Test",
      email,
      password,
      consent: true,
    }),
  });
  const registration = await registrationResponse.json();
  if (registrationResponse.status !== 202 || !registration.developmentUrl) {
    throw new Error(`Registration failed (${registrationResponse.status}).`);
  }

  const token = new URL(registration.developmentUrl).searchParams.get("token");
  const verificationResponse = await fetch(
    `${baseUrl}/api/auth/verify-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify({ token }),
    },
  );
  const verification = await verificationResponse.json();
  if (!verificationResponse.ok || !verification.completionToken) {
    throw new Error(`Verification failed (${verificationResponse.status}).`);
  }

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const csrfCookies = csrfResponse.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  const { csrfToken } = await csrfResponse.json();
  const signInResponse = await fetch(
    `${baseUrl}/api/auth/callback/credentials`,
    {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookies,
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({
        csrfToken,
        completionToken: verification.completionToken,
        callbackUrl: `${process.env.AUTH_URL}/auth/complete`,
      }),
    },
  );
  const sessionIssued = signInResponse.headers
    .getSetCookie()
    .some((cookie) => cookie.includes("authjs.session-token"));
  if (!signInResponse.ok || !sessionIssued) {
    throw new Error(`Credential sign-in failed (${signInResponse.status}).`);
  }

  console.log(
    JSON.stringify(
      {
        registration: registrationResponse.status,
        verification: verificationResponse.status,
        completionSignIn: signInResponse.status,
        sessionIssued,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanup();
  await pool.end();
}
