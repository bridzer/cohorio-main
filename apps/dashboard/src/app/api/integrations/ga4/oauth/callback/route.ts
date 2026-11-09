import { NextRequest, NextResponse } from "next/server";
import { auditAgentEvent } from "@/lib/agent/audit";
import { resolveWorkspaceAccess } from "@/lib/access-control";
import { exchangeGoogleCode } from "@/lib/integrations/google";
import {
  clearGa4OAuthState,
  consumeGa4OAuthState,
  ga4RedirectUri,
} from "@/lib/integrations/ga4-oauth-state";
import { saveIntegration } from "@/lib/integrations/store";

export const runtime = "nodejs";

function settingsRedirect(status: "connected" | "error", message?: string) {
  const appUrl = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const redirect = new URL("/connections", appUrl);
  redirect.searchParams.set("ga4", status);
  if (message) redirect.searchParams.set("message", message);
  return redirect;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const nonce = params.get("state") ?? "";
  let response: NextResponse | null = null;
  const finish = (res: NextResponse) => {
    if (/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) clearGa4OAuthState(res, nonce);
    return res;
  };

  try {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) {
      throw new Error("Invalid OAuth state.");
    }
    if (params.get("error")) {
      throw new Error("Google did not approve the connection.");
    }
    const state = consumeGa4OAuthState(request, nonce);
    if (!state) {
      throw new Error("The GA4 connection request expired. Please retry.");
    }
    const access = await resolveWorkspaceAccess("member");
    if (!access || access.userId !== state.userId || access.workspaceId !== state.workspaceId) {
      throw new Error("Your signed-in workspace no longer matches this GA4 request.");
    }
    const code = params.get("code") ?? "";
    if (!code) throw new Error("Google did not return an authorization code.");
    const tokens = await exchangeGoogleCode(code, ga4RedirectUri());
    await saveIntegration(
      state.workspaceId,
      "ga4",
      JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
    );
    await auditAgentEvent({
      workspaceId: state.workspaceId,
      actorUserId: state.userId,
      eventType: "integration.connected",
      targetType: "integration",
      targetId: "ga4",
      metadata: { verified: true, oauth: true },
    });
    response = NextResponse.redirect(settingsRedirect("connected"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect GA4.";
    response = NextResponse.redirect(settingsRedirect("error", message));
  }
  return finish(response);
}
