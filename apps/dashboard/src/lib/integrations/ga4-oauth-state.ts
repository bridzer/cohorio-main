import type { NextRequest, NextResponse } from "next/server";
import { signValue, signaturesMatch } from "@/lib/secret-box";
import { googleOAuthClient } from "./google";

const TEN_MINUTES = 60 * 10;

type Ga4OAuthState = {
  userId: string;
  workspaceId: string;
  issuedAt: number;
};

function cookieName(nonce: string) {
  return `ga4_oauth_${nonce}`;
}

function signingSecret() {
  const client = googleOAuthClient();
  if (!client) throw new Error("Google OAuth is not configured.");
  return client.clientSecret;
}

export function ga4RedirectUri() {
  const appUrl = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${appUrl}/api/integrations/ga4/oauth/callback`;
}

export function setGa4OAuthState(response: NextResponse, nonce: string, state: Ga4OAuthState) {
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = signValue(encoded, signingSecret());
  response.cookies.set(cookieName(nonce), `${encoded}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/ga4/oauth/callback",
    maxAge: TEN_MINUTES,
  });
}

export function consumeGa4OAuthState(request: NextRequest, nonce: string) {
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
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Ga4OAuthState;
    if (!state.workspaceId || !state.userId || Date.now() - state.issuedAt > TEN_MINUTES * 1000) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearGa4OAuthState(response: NextResponse, nonce: string) {
  response.cookies.set(cookieName(nonce), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/ga4/oauth/callback",
    maxAge: 0,
  });
}
