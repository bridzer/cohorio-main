import type { NextRequest, NextResponse } from "next/server";
import { signValue, signaturesMatch } from "@/lib/secret-box";
import { shopifyConfig } from "./client";

const TEN_MINUTES = 60 * 10;

type OAuthState = {
  userId: string;
  organizationId: string;
  workspaceId: string;
  shopDomain: string;
  issuedAt: number;
};

function cookieName(nonce: string) {
  return `shopify_oauth_${nonce}`;
}

export function setOAuthState(
  response: NextResponse,
  nonce: string,
  state: OAuthState,
) {
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = signValue(encoded, shopifyConfig().clientSecret);
  response.cookies.set(cookieName(nonce), `${encoded}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/shopify/oauth/callback",
    maxAge: TEN_MINUTES,
  });
}

export function consumeOAuthState(request: NextRequest, nonce: string) {
  const raw = request.cookies.get(cookieName(nonce))?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;
  const encoded = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const expected = signValue(encoded, shopifyConfig().clientSecret);
  if (!signaturesMatch(signature, expected)) return null;

  try {
    const state = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as OAuthState;
    if (
      !state.workspaceId ||
      !state.userId ||
      !state.organizationId ||
      !state.shopDomain ||
      Date.now() - state.issuedAt > TEN_MINUTES * 1000
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearOAuthState(response: NextResponse, nonce: string) {
  response.cookies.set(cookieName(nonce), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/shopify/oauth/callback",
    maxAge: 0,
  });
}
