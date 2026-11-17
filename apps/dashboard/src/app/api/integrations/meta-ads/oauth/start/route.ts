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
  META_OAUTH_SCOPES,
  metaAuthorizeUrl,
  metaOAuthClient,
  metaRedirectUri,
} from "@/lib/integrations/meta";
import { setMetaOAuthState } from "@/lib/integrations/meta-oauth-state";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Starts the Meta Ads "Connect with Facebook" flow; the browser follows the URL. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const client = metaOAuthClient();
    if (!client) {
      return errorResponse(
        "Meta OAuth is not configured on this server (META_APP_ID / META_APP_SECRET), so Meta Ads cannot be connected this way. Paste a token instead.",
        400,
      );
    }
    const nonce = randomBytes(24).toString("base64url");
    const url = metaAuthorizeUrl({
      appId: client.appId,
      redirectUri: metaRedirectUri(),
      state: nonce,
      scopes: META_OAUTH_SCOPES,
    });
    const response = NextResponse.json({ url });
    setMetaOAuthState(response, nonce, {
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
    const message = error instanceof Error ? error.message : "Unable to start the Meta Ads connection.";
    return errorResponse(message, 503);
  }
}
