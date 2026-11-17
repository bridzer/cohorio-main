import type { NextRequest, NextResponse } from "next/server";
import { signValue, signaturesMatch } from "@/lib/secret-box";
import { metaOAuthClient } from "./meta";

const TEN_MINUTES = 60 * 10;

type MetaOAuthState = {
  userId: string;
  workspaceId: string;
  issuedAt: number;
};

const CALLBACK_PATH = "/api/integrations/meta-ads/oauth/callback";

function cookieName(nonce: string) {
  return `meta_ads_oauth_${nonce}`;
}

function signingSecret() {
  const client = metaOAuthClient();
  if (!client) throw new Error("Meta OAuth is not configured.");
  return client.appSecret;
}

export function metaAdsRedirectUri() {
  const appUrl = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${appUrl}${CALLBACK_PATH}`;
}

export function setMetaOAuthState(response: NextResponse, nonce: string, state: MetaOAuthState) {
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = signValue(encoded, signingSecret());
  response.cookies.set(cookieName(nonce), `${encoded}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: CALLBACK_PATH,
    maxAge: TEN_MINUTES,
  });
}

export function consumeMetaOAuthState(request: NextRequest, nonce: string) {
  const raw = request.cookies.get(cookieName(nonce))?.value;
  if (!raw) return null;
  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;
  const encoded = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  let expected: string;
  try {
    expected = signValue(encoded, signingSecret());
  } catch {
    return null;
  }
  if (!signaturesMatch(signature, expected)) return null;
  try {
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as MetaOAuthState;
    if (!state.workspaceId || !state.userId || Date.now() - state.issuedAt > TEN_MINUTES * 1000) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearMetaOAuthState(response: NextResponse, nonce: string) {
  response.cookies.set(cookieName(nonce), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: CALLBACK_PATH,
    maxAge: 0,
  });
}
