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
import { googleOAuthClient } from "@/lib/integrations/google";
import { ga4RedirectUri, setGa4OAuthState } from "@/lib/integrations/ga4-oauth-state";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Starts the GA4 "Connect with Google" flow; the browser follows the URL. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const client = googleOAuthClient();
    if (!client) {
      return errorResponse(
        "Google sign-in is not configured on this server, so GA4 cannot be connected this way. Paste a credential instead.",
        400,
      );
    }
    const nonce = randomBytes(24).toString("base64url");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", client.clientId);
    url.searchParams.set("redirect_uri", ga4RedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/analytics.readonly");
    // offline + forced consent is what makes Google return a refresh token.
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", nonce);
    const response = NextResponse.json({ url: url.toString() });
    setGa4OAuthState(response, nonce, {
      userId: access.userId,
      workspaceId: access.workspaceId,
      issuedAt: Date.now(),
    });
    return response;
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message = error instanceof Error ? error.message : "Unable to start the GA4 connection.";
    return errorResponse(message, 503);
  }
}
