import { NextRequest, NextResponse } from "next/server";
import { auditAgentEvent } from "@/lib/agent/audit";
import { resolveWorkspaceAccess } from "@/lib/access-control";
import {
  exchangeForLongLivedToken,
  exchangeMetaCode,
  listMetaAdAccounts,
  listMetaPages,
  metaRedirectUri,
  selectMetaAccount,
  selectMetaPage,
  serializeMetaCredential,
  type MetaAdAccount,
  type MetaPage,
} from "@/lib/integrations/meta";
import {
  clearMetaOAuthState,
  consumeMetaOAuthState,
} from "@/lib/integrations/meta-oauth-state";
import { saveIntegration } from "@/lib/integrations/store";

export const runtime = "nodejs";

/** Cap picker payloads so the redirect URL stays small. */
const MAX_OPTIONS = 50;

type AccountOption = Pick<MetaAdAccount, "id" | "name">;
type PageOption = Pick<MetaPage, "id" | "name">;

function trimOptions<T extends { id: string; name: string }>(items: T[]) {
  return items
    .slice(0, MAX_OPTIONS)
    .map((item) => ({ id: item.id, name: item.name }));
}

function connectionsRedirect(
  status: "connected" | "choose" | "error",
  params?: {
    message?: string;
    account?: string;
    count?: number;
    options?: MetaAdAccount[];
    page?: string;
    pageCount?: number;
    pageOptions?: MetaPage[];
  },
) {
  const appUrl = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const redirect = new URL("/connections", appUrl);
  redirect.searchParams.set("meta-ads", status);
  if (params?.message) redirect.searchParams.set("message", params.message);
  if (params?.account) redirect.searchParams.set("account", params.account);
  if (params?.count !== undefined) redirect.searchParams.set("accounts", String(params.count));
  if (params?.options?.length) {
    redirect.searchParams.set(
      "options",
      Buffer.from(JSON.stringify(trimOptions<AccountOption>(params.options))).toString("base64url"),
    );
  }
  if (params?.page) redirect.searchParams.set("page", params.page);
  if (params?.pageCount !== undefined) redirect.searchParams.set("pages", String(params.pageCount));
  if (params?.pageOptions?.length) {
    redirect.searchParams.set(
      "pageOptions",
      Buffer.from(JSON.stringify(trimOptions<PageOption>(params.pageOptions))).toString("base64url"),
    );
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
      throw new Error("The Meta connection request expired. Please retry.");
    }
    const access = await resolveWorkspaceAccess("member");
    if (!access || access.userId !== state.userId || access.workspaceId !== state.workspaceId) {
      throw new Error("Your signed-in workspace no longer matches this Meta request.");
    }
    const code = params.get("code") ?? "";
    if (!code) throw new Error("Facebook did not return an authorization code.");
    const shortLived = await exchangeMetaCode(code, metaRedirectUri());
    const accessToken = await exchangeForLongLivedToken(shortLived);
    const [accounts, pages] = await Promise.all([
      listMetaAdAccounts(accessToken),
      listMetaPages(accessToken),
    ]);
    if (!accounts.length) {
      throw new Error("This Facebook user has no accessible ad accounts. Create or request access to one, then retry.");
    }
    const singleAccount = selectMetaAccount(accounts);
    const chosenAccount = singleAccount ?? accounts[0];
    // One Page attaches silently; several attach the first and offer a picker.
    const chosenPage = selectMetaPage(pages) ?? pages[0] ?? null;
    await saveIntegration(
      state.workspaceId,
      "meta-ads",
      serializeMetaCredential(accessToken, chosenAccount, chosenPage),
    );
    await auditAgentEvent({
      workspaceId: state.workspaceId,
      actorUserId: state.userId,
      eventType: "integration.connected",
      targetType: "integration",
      targetId: "meta-ads",
      metadata: {
        verified: true,
        oauth: true,
        accountId: chosenAccount.id,
        ...(chosenPage ? { pageId: chosenPage.id } : {}),
      },
    });
    const needsAccountChoice = !singleAccount;
    const needsPageChoice = pages.length > 1;
    response = NextResponse.redirect(
      needsAccountChoice || needsPageChoice
        ? connectionsRedirect("choose", {
            account: chosenAccount.name,
            ...(needsAccountChoice
              ? { count: accounts.length, options: accounts }
              : {}),
            ...(chosenPage ? { page: chosenPage.name } : {}),
            ...(needsPageChoice
              ? { pageCount: pages.length, pageOptions: pages }
              : {}),
          })
        : connectionsRedirect("connected", {
            account: chosenAccount.name,
            ...(chosenPage ? { page: chosenPage.name } : {}),
          }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect Meta.";
    response = NextResponse.redirect(connectionsRedirect("error", { message }));
  }
  return finish(response);
}
