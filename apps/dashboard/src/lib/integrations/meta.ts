import { ProviderError } from "./http";
import { providerJson } from "./http";
import { META_GRAPH_VERSION } from "./connectors/meta-ads";

// Shared Meta (Facebook) OAuth for the Meta Ads "Connect with Facebook" flow.
// Mirrors the GA4 Google flow: short-lived code -> 60-day token, tokens stored
// encrypted with the workspace's other credentials. Meta has no refresh
// tokens; long-lived tokens last about 60 days and then need reconnecting.

const LABEL = "Meta Ads";
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;

/** Read-only scopes matching today's Meta connector tools plus Page selection. */
export const META_OAUTH_SCOPES = ["ads_read", "pages_show_list", "pages_read_engagement"];

export function metaOAuthClient() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function metaOAuthConfigured() {
  return metaOAuthClient() !== null;
}

export function metaRedirectUri() {
  const appUrl = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${appUrl}/api/integrations/meta-ads/oauth/callback`;
}

/** Pure builder so the authorize URL is unit-testable without network access. */
export function metaAuthorizeUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}) {
  const url = new URL(DIALOG);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (input.scopes ?? META_OAUTH_SCOPES).join(","));
  url.searchParams.set("state", input.state);
  return url.toString();
}

type TokenPayload = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

/** Never forwards Meta's response body: it can echo secrets or grant details. */
async function tokenRequest(params: URLSearchParams): Promise<string> {
  let payload: TokenPayload;
  try {
    payload = await providerJson<TokenPayload>(
      LABEL,
      `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${params.toString()}`,
    );
  } catch (error) {
    if (error instanceof ProviderError && error.status === null) throw error;
    throw new ProviderError(
      LABEL,
      error instanceof ProviderError ? error.status : null,
      "Meta rejected the authorization. Please try connecting again.",
    );
  }
  if (!payload.access_token) {
    throw new ProviderError(LABEL, null, "Meta did not return an access token.");
  }
  return payload.access_token;
}

/** Exchanges the authorization code from the Facebook dialog for a short-lived token. */
export function exchangeMetaCode(code: string, redirectUri: string) {
  const client = metaOAuthClient();
  if (!client) {
    throw new ProviderError(LABEL, null, "Meta OAuth is not configured on this server (META_APP_ID / META_APP_SECRET).");
  }
  return tokenRequest(
    new URLSearchParams({
      client_id: client.appId,
      client_secret: client.appSecret,
      redirect_uri: redirectUri,
      code,
    }),
  );
}

/** Upgrades a short-lived (~hours) token to a long-lived (~60 days) one. */
export function exchangeForLongLivedToken(shortLivedToken: string) {
  const client = metaOAuthClient();
  if (!client) {
    throw new ProviderError(LABEL, null, "Meta OAuth is not configured on this server (META_APP_ID / META_APP_SECRET).");
  }
  return tokenRequest(
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: client.appId,
      client_secret: client.appSecret,
      fb_exchange_token: shortLivedToken,
    }),
  );
}

export type MetaAdAccount = {
  id: string;
  name: string;
  currency: string | null;
};

type AdAccountsPayload = {
  data?: { account_id?: string | number; name?: string; currency?: string }[];
};

/** Ad accounts the Facebook user can access with this token. */
export async function listMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  let payload: AdAccountsPayload;
  try {
    const url = `${GRAPH}/me/adaccounts?${new URLSearchParams({ fields: "account_id,name,currency", limit: "100" })}`;
    payload = await providerJson<AdAccountsPayload>(
      LABEL,
      url,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(LABEL, null, "Meta did not respond. Try again shortly.");
  }
  return (payload.data ?? [])
    .map((row) => ({
      id: String(row.account_id ?? "").trim(),
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Unnamed ad account",
      currency: typeof row.currency === "string" ? row.currency : null,
    }))
    .filter((row) => /^\d{1,20}$/.test(row.id));
}

/**
 * Exactly one accessible account connects silently; zero or many need the
 * caller to error or offer a picker. Pure and unit-tested.
 */
export function selectMetaAccount(accounts: MetaAdAccount[]) {
  return accounts.length === 1 ? accounts[0] : null;
}

export type MetaPage = {
  id: string;
  name: string;
  category: string | null;
};

type PagesPayload = {
  data?: { id?: string | number; name?: string; category?: string }[];
};

/** Facebook Pages the user manages with this token. */
export async function listMetaPages(accessToken: string): Promise<MetaPage[]> {
  let payload: PagesPayload;
  try {
    const url = `${GRAPH}/me/accounts?${new URLSearchParams({ fields: "id,name,category", limit: "100" })}`;
    payload = await providerJson<PagesPayload>(
      LABEL,
      url,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(LABEL, null, "Meta did not respond. Try again shortly.");
  }
  return (payload.data ?? [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Unnamed Page",
      category: typeof row.category === "string" ? row.category : null,
    }))
    .filter((row) => /^\d{1,30}$/.test(row.id));
}

/**
 * Exactly one manageable Page attaches silently; zero or many need the
 * caller to skip or offer a picker. Pure and unit-tested.
 */
export function selectMetaPage(pages: MetaPage[]) {
  return pages.length === 1 ? pages[0] : null;
}

/**
 * Serializes to the exact shape the meta-ads connector parses. The optional
 * page rides along as extra data: the connector reads accessToken/accountId
 * and ignores the rest, so pasted and OAuth credentials stay compatible.
 */
export function serializeMetaCredential(
  accessToken: string,
  account: MetaAdAccount,
  page?: MetaPage | null,
) {
  return JSON.stringify({
    accessToken,
    accountId: `act_${account.id}`,
    page: page ? { id: page.id, name: page.name } : null,
  });
}
