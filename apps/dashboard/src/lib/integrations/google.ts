import { createHash } from "node:crypto";
import { ProviderError } from "./http";

// Shared Google OAuth for Google integrations (GA4, Google Ads). Reuses the
// same OAuth client as Google sign-in (AUTH_GOOGLE_* or GOOGLE_OAUTH_*).
// Access tokens are cached in memory per refresh token; refresh tokens
// themselves are stored encrypted with the workspace's other credentials.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const LABEL = "Google";

export function googleOAuthClient() {
  const clientId =
    process.env.AUTH_GOOGLE_ID?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret =
    process.env.AUTH_GOOGLE_SECRET?.trim() ||
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function googleOAuthConfigured() {
  return googleOAuthClient() !== null;
}

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

async function tokenRequest(params: URLSearchParams, signal?: AbortSignal) {
  const client = googleOAuthClient();
  if (!client) {
    throw new ProviderError(
      LABEL,
      null,
      "Google OAuth is not configured on this server (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).",
    );
  }
  params.set("client_id", client.clientId);
  params.set("client_secret", client.clientSecret);
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ProviderError(LABEL, null, "Google did not respond. Try again shortly.");
  }
  if (!response.ok) {
    // Token endpoint bodies can echo grant details; never forward them.
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderError(
      LABEL,
      response.status,
      response.status === 400 || response.status === 401
        ? "Google rejected the saved connection. Reconnect it in Settings → Marketing tools."
        : `Google returned an error (HTTP ${response.status}).`,
    );
  }
  return (await response.json()) as TokenPayload;
}

/** Exchanges an authorization code from the GA4 connect flow. */
export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const payload = await tokenRequest(
    new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
  if (!payload.access_token || !payload.refresh_token) {
    throw new ProviderError(
      LABEL,
      null,
      "Google did not return a refresh token. Revoke Cohorio's access in your Google account and connect again.",
    );
  }
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token };
}

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

/**
 * A fresh access token for a stored refresh token, cached until a minute
 * before Google says it expires. Keyed by a hash so refresh tokens are
 * never used as map keys in logs or dumps.
 */
export async function freshGoogleAccessToken(refreshToken: string, signal?: AbortSignal) {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const payload = await tokenRequest(
    new URLSearchParams({ refresh_token: refreshToken, grant_type: "refresh_token" }),
    signal,
  );
  if (!payload.access_token) {
    throw new ProviderError(LABEL, null, "Google did not return an access token.");
  }
  const ttlSeconds = Math.max(60, (payload.expires_in ?? 3600) - 60);
  tokenCache.set(key, {
    accessToken: payload.access_token,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return payload.access_token;
}

/** Test hook: forget cached access tokens. */
export function clearGoogleTokenCache() {
  tokenCache.clear();
}
