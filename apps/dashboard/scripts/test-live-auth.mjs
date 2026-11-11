// Live-site auth smoke test. Uses TEST_EMAIL / TEST_PASSWORD from .env.local
// (loaded via @next/env, never printed) against the deployed site.
//
//   node scripts/test-live-auth.mjs [baseUrl]
//
// Checks, in order: auth pages render, credentials sign-in, session identity,
// wrong-password refusal, and — only if sign-in fails — whether resending the
// verification email works (which separates "account pending" from "email
// delivery is down": a delivery failure comes back 503).
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = (process.argv[2] ?? "https://www.sokomkononi.com").replace(/\/$/, "");
const email = process.env.TEST_EMAIL?.trim();
const password = process.env.TEST_PASSWORD ?? "";
if (!email || !password) {
  console.error("TEST_EMAIL / TEST_PASSWORD are not set in .env.local.");
  process.exit(1);
}

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function cookieHeader(response, existing = "") {
  const jar = new Map(
    existing.split("; ").filter(Boolean).map((pair) => [pair.split("=")[0], pair]),
  );
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    jar.set(pair.split("=")[0], pair);
  }
  return [...jar.values()].join("; ");
}

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

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

try {
  for (const page of ["/sign-in", "/register", "/verify-email", "/forgot-password"]) {
    const response = await fetch(`${baseUrl}${page}`);
    check(`GET ${page} renders`, response.status === 200, String(response.status));
  }

  const jar = await signIn({ email, password });
  check("credentials sign-in with TEST_EMAIL succeeds", Boolean(jar));

  if (jar) {
    const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: jar },
    });
    const session = await sessionResponse.json().catch(() => null);
    check(
      "session belongs to the test account",
      session?.user?.email?.toLowerCase() === email.toLowerCase(),
      session?.user?.email ? "email matches" : "no session user",
    );
    const account = await fetch(`${baseUrl}/api/account`, { headers: { Cookie: jar } });
    check("signed-in API access works (/api/account)", account.status === 200, String(account.status));
    check(
      "a wrong password is refused",
      (await signIn({ email, password: "Wrong-Password-9" })) === null,
    );
  } else {
    // Sign-in failed: is the account pending, or is email delivery down?
    const resend = await post("/api/auth/resend-verification", { email });
    check(
      "resend-verification responds (pending account recovery path)",
      resend.status === 200,
      `${resend.status} ${resend.body.error ?? ""}`.trim(),
    );
    if (resend.status === 200) {
      console.log(
        "INFO  Sign-in failed but resend-verification accepted: the test account is most likely still PENDING. Check the test inbox for the verification link, click it, then re-run.",
      );
    } else {
      console.log(
        "INFO  Resend-verification failed too: email delivery on the server is broken (see the 503 detail above), so the account can never be verified until delivery is fixed.",
      );
    }
  }
} catch (error) {
  check("live test completed without crashing", false, error instanceof Error ? error.message : String(error));
}

const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed against ${baseUrl}.`);
process.exitCode = failed.length ? 1 : 0;
