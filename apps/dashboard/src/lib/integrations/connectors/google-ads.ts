import { z } from "zod";
import { defineTool, ToolInputError } from "@/lib/agent/registry";
import { providerJson } from "../http";
import { freshGoogleAccessToken } from "../google";
import { credentialFor, parseJsonCredential, requiredString, type Connector } from "./types";

/** Google Ads API versions retire on a fixed schedule; keep this current. */
export const GOOGLE_ADS_VERSION = "v19";
const API = `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}`;
const LABEL = "Google Ads";

export type GoogleAdsCredential = {
  developerToken: string;
  customerId: string;
  loginCustomerId: string | null;
  refreshToken: string | null;
  accessToken: string | null;
};

function digits(value: unknown, field: string) {
  const text = requiredString(value, field, LABEL).replace(/-/g, "");
  if (!/^\d{6,12}$/.test(text)) {
    throw new RangeError(`Google Ads ${field} must be 6 to 12 digits (dashes are fine).`);
  }
  return text;
}

function parse(plaintext: string): GoogleAdsCredential {
  const value = parseJsonCredential(plaintext, LABEL);
  const optional = (field: unknown) =>
    typeof field === "string" && field.trim() ? field.trim() : null;
  const credential: GoogleAdsCredential = {
    developerToken: requiredString(value.developerToken, "developerToken", LABEL),
    customerId: digits(value.customerId, "customerId"),
    loginCustomerId: value.loginCustomerId ? digits(value.loginCustomerId, "loginCustomerId") : null,
    refreshToken: optional(value.refreshToken),
    accessToken: optional(value.accessToken),
  };
  if (!credential.refreshToken && !credential.accessToken) {
    throw new RangeError("Google Ads credentials need a refreshToken (recommended) or an accessToken.");
  }
  return credential;
}

/** Refresh-token credentials self-heal; a pasted access token lasts ~1 hour. */
export async function googleAdsAccessToken(credential: GoogleAdsCredential, signal?: AbortSignal) {
  if (credential.refreshToken) {
    try {
      return await freshGoogleAccessToken(credential.refreshToken, signal);
    } catch (error) {
      if (credential.accessToken) return credential.accessToken;
      throw error;
    }
  }
  if (credential.accessToken) return credential.accessToken;
  throw new ToolInputError("Google Ads is not connected. Connect it in Settings → Marketing tools.");
}

type SearchStreamChunk = {
  results?: {
    campaign?: { id?: string; name?: string; status?: string };
    metrics?: {
      impressions?: string;
      clicks?: string;
      costMicros?: string;
      averageCpc?: string;
      ctr?: string;
      conversions?: number;
      conversionsValue?: number;
    };
  }[];
};

async function search(
  credential: GoogleAdsCredential,
  query: string,
  signal?: AbortSignal,
) {
  const accessToken = await googleAdsAccessToken(credential, signal);
  const chunks = await providerJson<SearchStreamChunk[]>(
    LABEL,
    `${API}/customers/${credential.customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": credential.developerToken,
        ...(credential.loginCustomerId
          ? { "login-customer-id": credential.loginCustomerId }
          : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
    { signal },
  );
  return chunks.flatMap((chunk) => chunk.results ?? []);
}

const micros = (value: string | undefined) =>
  value === undefined ? null : Number(value) / 1_000_000;
const count = (value: string | undefined) => (value === undefined ? null : Number(value));

/** Flattens GAQL rows into the numbers a marketer reads. */
export function summarizeGoogleAdsRows(rows: SearchStreamChunk["results"]) {
  return (rows ?? []).map((row) => ({
    campaign: row.campaign?.name ?? "Unnamed",
    campaignId: row.campaign?.id ?? null,
    status: row.campaign?.status ?? null,
    impressions: count(row.metrics?.impressions),
    clicks: count(row.metrics?.clicks),
    cost: micros(row.metrics?.costMicros),
    averageCpc: micros(row.metrics?.averageCpc),
    ctr: row.metrics?.ctr === undefined ? null : Number(row.metrics.ctr),
    conversions: row.metrics?.conversions ?? null,
    conversionValue: row.metrics?.conversionsValue ?? null,
  }));
}

const RANGES = {
  last_7d: "LAST_7_DAYS",
  last_14d: "LAST_14_DAYS",
  last_30d: "LAST_30_DAYS",
  last_90d: "LAST_90_DAYS",
} as const;

const performance = defineTool({
  name: "google_ads_performance",
  tier: "read",
  description:
    "Google Ads campaign results from the connected account: impressions, clicks, cost (account currency), average CPC, CTR, conversions and conversion value, best-spending campaigns first. Cost is a plain number, not micros.",
  input: z.object({
    dateRange: z.enum(Object.keys(RANGES) as [keyof typeof RANGES, ...(keyof typeof RANGES)[]]).default("last_30d"),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  async execute(ctx, input) {
    const credential = await credentialFor(ctx, connector);
    const rows = await search(
      credential,
      [
        "SELECT campaign.id, campaign.name, campaign.status,",
        "metrics.impressions, metrics.clicks, metrics.cost_micros,",
        "metrics.average_cpc, metrics.ctr, metrics.conversions, metrics.conversions_value",
        "FROM campaign",
        `WHERE segments.date DURING ${RANGES[input.dateRange]}`,
        "ORDER BY metrics.cost_micros DESC",
        `LIMIT ${input.limit}`,
      ].join(" "),
      ctx.signal,
    );
    return { dateRange: input.dateRange, rows: summarizeGoogleAdsRows(rows) };
  },
});

export const connector: Connector<GoogleAdsCredential> = {
  provider: "google-ads",
  label: LABEL,
  keyHint: '{"refreshToken":"…","developerToken":"…","customerId":"123-456-7890"}',
  parse,
  async verify(credential, signal) {
    await search(
      credential,
      "SELECT customer.id FROM customer LIMIT 1",
      signal,
    );
  },
  tools: [performance],
};
