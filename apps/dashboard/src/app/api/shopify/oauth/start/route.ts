import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";
import {
  normalizeShopDomain,
  SHOPIFY_SCOPES,
  shopifyConfig,
} from "@/lib/shopify/client";
import { setOAuthState } from "@/lib/shopify/oauth-state";
import { setWorkspaceCookie } from "@/lib/workspace";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { error: "Use POST to start Shopify OAuth." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("admin");
    const payload = (await request.json().catch(() => null)) as {
      shop?: unknown;
    } | null;
    const shopDomain = normalizeShopDomain(
      typeof payload?.shop === "string" ? payload.shop : "",
    );
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

    const response = NextResponse.json({
      authorizeUrl: authorizeUrl.toString(),
    });
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
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to connect this store.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
