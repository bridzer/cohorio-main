import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveWorkspaceAccess } from "@/lib/access-control";
import { encryptSecret } from "@/lib/secret-box";
import {
  exchangeAuthorizationCode,
  expandShopifyScopes,
  fetchGrantedShopifyScopes,
  fetchShopSummaryWithToken,
  missingShopifyScopes,
  normalizeShopDomain,
  parseShopifyScopes,
  REQUIRED_SHOPIFY_SCOPES,
  shopifyConfig,
  verifyShopifyQueryHmac,
} from "@/lib/shopify/client";
import {
  clearOAuthState,
  consumeOAuthState,
} from "@/lib/shopify/oauth-state";
import { upsertConnection } from "@/lib/shopify/repository";
import { setWorkspaceCookie } from "@/lib/workspace";

export const runtime = "nodejs";

function commerceRedirect(
  status: "connected" | "error",
  message?: string,
) {
  const redirect = new URL("/commerce", shopifyConfig().appUrl);
  redirect.searchParams.set("shopify", status);
  if (message) redirect.searchParams.set("message", message);
  return redirect;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const nonce = params.get("state") ?? "";
  let response: NextResponse | null = null;

  try {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) {
      throw new Error("Invalid OAuth state.");
    }
    if (!verifyShopifyQueryHmac(params)) {
      throw new Error("Shopify callback signature verification failed.");
    }

    const state = consumeOAuthState(request, nonce);
    if (!state) {
      throw new Error("The Shopify connection request expired. Please retry.");
    }
    const session = await auth();
    const access = await resolveWorkspaceAccess("admin");
    if (
      !session?.user?.id ||
      session.user.id !== state.userId ||
      !access ||
      access.organizationId !== state.organizationId ||
      access.workspaceId !== state.workspaceId
    ) {
      throw new Error(
        "Your authenticated workspace no longer matches this Shopify request.",
      );
    }

    const shopDomain = normalizeShopDomain(params.get("shop") ?? "");

    const code = params.get("code");
    if (!code) throw new Error("Shopify did not return an authorization code.");

    const tokens = await exchangeAuthorizationCode(shopDomain, code);
    const grantedFromToken = parseShopifyScopes(tokens.scope);
    const grantedFromApi = await fetchGrantedShopifyScopes(
      shopDomain,
      tokens.access_token,
    );
    let grantedScopes = expandShopifyScopes([
      ...grantedFromToken,
      ...grantedFromApi,
    ]);
    const missingRequired = missingShopifyScopes(
      REQUIRED_SHOPIFY_SCOPES,
      grantedScopes,
    );

    let summary;
    try {
      summary = await fetchShopSummaryWithToken(
        shopDomain,
        tokens.access_token,
      );
    } catch (error) {
      if (missingRequired.length) {
        throw new Error(
          `Required Shopify permissions were not granted: ${missingRequired.join(", ")}. Enable them in the Shopify app API access settings, then reconnect.`,
        );
      }
      throw error;
    }
    if (missingRequired.length) {
      grantedScopes = expandShopifyScopes([
        ...grantedScopes,
        ...REQUIRED_SHOPIFY_SCOPES,
      ]);
    }
    const now = Date.now();
    const connection = await upsertConnection({
      workspaceId: state.workspaceId,
      shopDomain,
      displayName: summary.shop.name,
      shopEmail: summary.shop.email,
      currencyCode: summary.shop.currencyCode,
      timezone: summary.shop.ianaTimezone,
      accessTokenEncrypted: encryptSecret(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : null,
      tokenExpiresAt: tokens.expires_in
        ? new Date(now + tokens.expires_in * 1000)
        : null,
      refreshTokenExpiresAt: tokens.refresh_token_expires_in
        ? new Date(now + tokens.refresh_token_expires_in * 1000)
        : null,
      scopes: grantedScopes.join(","),
      productsCount: summary.productsCount.count,
      ordersCount: summary.ordersCount.count,
    });

    response = NextResponse.redirect(
      commerceRedirect("connected", connection.displayName),
    );
    setWorkspaceCookie(response, state.workspaceId);
    clearOAuthState(response, nonce);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shopify connection failed.";
    response = NextResponse.redirect(
      commerceRedirect("error", message),
    );
    if (nonce) clearOAuthState(response, nonce);
    return response;
  }
}
