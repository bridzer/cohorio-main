// End-to-end check of every email/password auth flow against a running dev
// server. Needs the server started without an email transport (no SMTP_* or
// RESEND_API_KEY) so verification and reset links come back as developmentUrl.
// Creates one throwaway user and soft-deletes it afterwards.
//
//   AUTH_TEST_BASE_URL=http://localhost:3000 node scripts/test-auth-flows.mjs
import nextEnv from "@next/env";
import pg from "pg";
import { postgresSslConfig } from "./postgres-ssl.mjs";

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3000";
const email = `auth-flow-test-${Date.now()}@example.com`;
const password = "FlowTest-Password-1";
const newPassword = "FlowTest-Password-2";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: postgresSslConfig() });
const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function post(path, body, { origin = baseUrl, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function cookieHeader(response, existing = "") {
  const jar = new Map(existing.split("; ").filter(Boolean).map((pair) => [pair.split("=")[0], pair]));
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    jar.set(pair.split("=")[0], pair);
  }
  return [...jar.values()].join("; ");
}

/** Auth.js credentials sign-in; returns the session cookie jar or null. */
async function signIn(fields) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  let jar = cookieHeader(csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar,
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${baseUrl}/`, ...fields }),
  });
  jar = cookieHeader(response, jar);
  return /authjs\.session-token=/.test(jar) ? jar : null;
}

async function sessionEmail(jar) {
  const response = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: jar } });
  const session = await response.json().catch(() => null);
  return session?.user?.email ?? null;
}

const tokenFrom = (url) => (url ? new URL(url).searchParams.get("token") : null);

async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    const userId = user.rows[0]?.id;
    if (userId) {
      const orgs = await client.query(
        "SELECT organization_id FROM organization_memberships WHERE user_id = $1",
        [userId],
      );
      for (const { organization_id: orgId } of orgs.rows) {
        await client.query(
          `UPDATE workspaces SET status = 'archived', is_default = FALSE, archived_at = NOW(), updated_at = NOW()
            WHERE organization_id = $1`,
          [orgId],
        );
        await client.query(
          "UPDATE organizations SET status = 'archived', archived_at = NOW(), updated_at = NOW() WHERE id = $1",
          [orgId],
        );
      }
      await client.query(
        `UPDATE users SET status = 'deleted', deleted_at = NOW(),
                email = CONCAT('deleted+', id::text, '@invalid.local'),
                session_version = session_version + 1, updated_at = NOW()
          WHERE id = $1`,
        [userId],
      );
      await client.query(
        "UPDATE auth_action_tokens SET consumed_at = COALESCE(consumed_at, NOW()) WHERE user_id = $1",
        [userId],
      );
    }
    await client.query("COMMIT");
    return Boolean(userId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  // Registration
  const weak = await post("/api/auth/register", { name: "Flow Test", email, password: "short", consent: true });
  check("register rejects a weak password", weak.status === 400, `${weak.status} ${weak.body.error ?? ""}`);

  const foreign = await post(
    "/api/auth/register",
    { name: "Flow Test", email, password, consent: true },
    { origin: "https://evil.example" },
  );
  check("register rejects a cross-site request", foreign.status === 403, String(foreign.status));

  const register = await post("/api/auth/register", { name: "Flow Test", email, password, consent: true });
  check(
    "register creates a pending account",
    register.status === 202 && Boolean(register.body.developmentUrl),
    `${register.status} ${register.body.error ?? ""}`,
  );

  const duplicate = await post("/api/auth/register", { name: "Flow Test", email, password, consent: true });
  check("registering the same email again gives the same generic answer", duplicate.status === 202, String(duplicate.status));

  check("password sign-in is refused before email verification", (await signIn({ email, password })) === null);

  // Verification
  const resend = await post("/api/auth/resend-verification", { email });
  check(
    "resend verification issues a new link",
    resend.status === 200 && Boolean(resend.body.developmentUrl),
    `${resend.status} ${resend.body.error ?? ""}`,
  );
  const verifyToken = tokenFrom(resend.body.developmentUrl ?? register.body.developmentUrl);
  const verify = await post("/api/auth/verify-email", { token: verifyToken });
  check(
    "email verification succeeds",
    verify.status === 200 && Boolean(verify.body.completionToken),
    `${verify.status} ${verify.body.error ?? ""}`,
  );
  const badVerify = await post("/api/auth/verify-email", { token: "x".repeat(43) });
  check("a forged verification token is rejected", badVerify.status === 400, String(badVerify.status));

  // Sign-in and session
  const completionJar = verify.body.completionToken
    ? await signIn({ completionToken: verify.body.completionToken })
    : null;
  check("verification signs the user in", Boolean(completionJar));
  check(
    "the session belongs to the new user",
    completionJar ? (await sessionEmail(completionJar)) === email : false,
  );

  const passwordJar = await signIn({ email, password });
  check("password sign-in works after verification", Boolean(passwordJar));
  check("a wrong password is refused", (await signIn({ email, password: "Wrong-Password-9" })) === null);
  check(
    "an unknown email is refused",
    (await signIn({ email: `nobody-${Date.now()}@example.com`, password })) === null,
  );

  const account = passwordJar
    ? await fetch(`${baseUrl}/api/account`, { headers: { Cookie: passwordJar } })
    : null;
  check("signed-in API access works", account?.status === 200, String(account?.status ?? "no session"));
  const anonymous = await fetch(`${baseUrl}/api/account`);
  check("API access without a session is refused", anonymous.status === 401, String(anonymous.status));

  // Sign-out
  if (passwordJar) {
    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { Cookie: passwordJar } });
    const jar = cookieHeader(csrfResponse, passwordJar);
    const { csrfToken } = await csrfResponse.json();
    const signOut = await fetch(`${baseUrl}/api/auth/signout`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar, "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ csrfToken, callbackUrl: `${baseUrl}/sign-in` }),
    });
    const cleared = signOut.headers.getSetCookie().some((cookie) => /authjs\.session-token=;|authjs\.session-token=(?:;|$)/.test(cookie) || /authjs\.session-token=.*Max-Age=0/i.test(cookie) || /authjs\.session-token=.*Expires=Thu, 01 Jan 1970/i.test(cookie));
    check("sign-out clears the session cookie", cleared, String(signOut.status));
  }

  // Password reset
  const unknownForgot = await post("/api/auth/forgot-password", { email: `nobody-${Date.now()}@example.com` });
  check(
    "forgot-password does not reveal unknown emails",
    unknownForgot.status === 200 && !unknownForgot.body.developmentUrl,
    String(unknownForgot.status),
  );
  const forgot = await post("/api/auth/forgot-password", { email });
  check(
    "forgot-password issues a reset link",
    forgot.status === 200 && Boolean(forgot.body.developmentUrl),
    `${forgot.status} ${forgot.body.error ?? ""}`,
  );
  const resetToken = tokenFrom(forgot.body.developmentUrl);
  const weakReset = await post("/api/auth/reset-password", { token: resetToken, password: "short" });
  check("reset rejects a weak new password", weakReset.status === 400, String(weakReset.status));
  const reset = await post("/api/auth/reset-password", { token: resetToken, password: newPassword });
  check("password reset succeeds", reset.status === 200, `${reset.status} ${reset.body.error ?? ""}`);
  const reuse = await post("/api/auth/reset-password", { token: resetToken, password: "FlowTest-Password-3" });
  check("a used reset link cannot be reused", reuse.status === 400, String(reuse.status));
  check("the old password no longer works", (await signIn({ email, password })) === null);
  check("the new password works", Boolean(await signIn({ email, password: newPassword })));
  if (passwordJar) {
    check("sessions from before the reset are revoked", (await sessionEmail(passwordJar)) === null);
  }
} catch (error) {
  check("flow completed without crashing", false, error instanceof Error ? error.message : String(error));
} finally {
  const removed = await cleanup().catch(() => false);
  console.log(removed ? "\nTest user soft-deleted." : "\nNo test user to clean up.");
  await pool.end();
  const failed = results.filter((result) => !result.passed);
  console.log(`${results.length - failed.length}/${results.length} checks passed.`);
  process.exitCode = failed.length ? 1 : 0;
}
