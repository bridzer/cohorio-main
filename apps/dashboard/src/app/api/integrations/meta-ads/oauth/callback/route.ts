import { NextRequest, NextResponse } from "next/server";
import { auditAgentEvent } from "@/lib/agent/audit";
import { resolveWorkspaceAccess } from "@/lib/access-control";
import {
  exchangeForLongLivedToken,
  exchangeMetaCode,
  listMetaAdAccounts,
  metaRedirectUri,
  selectMetaAccount,
  serializeMetaCredential,
  type MetaAdAccount,
} from "@/lib/integrations/meta";
import {
  clearMetaOAuthState,
  consumeMetaOAuthState,
} from "@/lib/integrations/meta-oauth-state";
import { saveIntegration } from "@/lib/integrations/store";

export const runtime = "nodejs";

/** Cap the picker payload so the redirect URL stays small. */
const MAX_ACCOUNT_OPTIONS = 50;

function connectionsRedirect(
  status: "connected" | "choose" | "error",
  params?: { message?: string; account?: string; count?: number; options?: MetaAdAccount[] },
) {
  const appUrl = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const redirect = new URL("/connections", appUrl);
  redirect.searchParams.set("meta-ads", status);
  if (params?.message) redirect.searchParams.set("message", params.message);
  if (params?.account) redirect.searchParams.set("account", params.account);
  if (params?.count !== undefined) redirect.searchParams.set("accounts", String(params.count));
  if (params?.options?.length) {
    const trimmed = params.options
      .slice(0, MAX_ACCOUNT_OPTIONS)
      .map((account) => ({ id: account.id, name: account.name }));
    redirect.searchParams.set("options", Buffer.from(JSON.stringify(trimmed)).toString("base64url"));
  }
  return redirect;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const nonce = params.get("state") ?? "";
  let response: NextResponse | null = null;
  const finish = (res: NextResponse) => {
    if (/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) clearMetaOAuthState(res, nonce);
    return res;
  };

  try {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) {
      throw new Error("Invalid OAuth state.");
    }
    if (params.get("error")) {
      throw new Error("Facebook did not approve the connection.");
    }
    const state = consumeMetaOAuthState(request, nonce);
    if (!state) {
      throw new Error("The Meta Ads connection request expired. Please retry.");
    }
    const access = await resolveWorkspaceAccess("member");
    if (!access || access.userId !== state.userId || access.workspaceId !== state.workspaceId) {
      throw new Error("Your signed-in workspace no longer matches this Meta Ads request.");
    }
    const code = params.get("code") ?? "";
    if (!code) throw new Error("Facebook did not return an authorization code.");
    const shortLived = await exchangeMetaCode(code, metaRedirectUri());
    const accessToken = await exchangeForLongLivedToken(shortLived);
    const accounts = await listMetaAdAccounts(accessToken);
    if (!accounts.length) {
      throw new Error("This Facebook user has no accessible ad accounts. Create or request access to one, then retry.");
    }
    const single = selectMetaAccount(accounts);
    const chosen = single ?? accounts[0];
    await saveIntegration(
      state.workspaceId,
      "meta-ads",
      serializeMetaCredential(accessToken, chosen),
    );
    await auditAgentEvent({
      workspaceId: state.workspaceId,
      actorUserId: state.userId,
      eventType: "integration.connected",
      targetType: "integration",
      targetId: "meta-ads",
      metadata: { verified: true, oauth: true, accountId: chosen.id },
    });
    response = NextResponse.redirect(
      single
        ? connectionsRedirect("connected", { account: chosen.name })
        : connectionsRedirect("choose", { account: chosen.name, count: accounts.length, options: accounts }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect Meta Ads.";
    response = NextResponse.redirect(connectionsRedirect("error", { message }));
  }
  return finish(response);
}
