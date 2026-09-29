import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  normalizeShopDomain,
  SHOPIFY_SCOPES,
  shopifyConfig,
} from "@/lib/shopify/client";
import { setOAuthState } from "@/lib/shopify/oauth-state";
import { requireWorkspaceAccess } from "@/lib/access-control";
import { setWorkspaceCookie } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const shopDomain = normalizeShopDomain(
      request.nextUrl.searchParams.get("shop") ?? "",
    );
    const access = await requireWorkspaceAccess("admin");
    const nonce = randomBytes(24).toString("base64url");
    const { clientId, appUrl } = shopifyConfig();
    const redirectUri = `${appUrl}/api/shopify/oauth/callback`;

    const authorizeUrl = new URL(
      `https://${shopDomain}/admin/oauth/authorize`,
    );
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("scope", SHOPIFY_SCOPES);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", nonce);

    const response = NextResponse.redirect(authorizeUrl);
    setOAuthState(response, nonce, {
      userId: access.userId,
      organizationId: access.organizationId,
      workspaceId: access.workspaceId,
      shopDomain,
      issuedAt: Date.now(),
    });
    setWorkspaceCookie(response, access.workspaceId);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to connect this store.";
    const redirect = new URL(
      "/commerce",
      process.env.APP_URL ?? request.nextUrl.origin,
    );
    redirect.searchParams.set("shopify", "error");
    redirect.searchParams.set("message", message);
    return NextResponse.redirect(redirect);
  }
}
