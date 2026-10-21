import { z } from "zod";
import { defineTool } from "@/lib/agent/registry";
import { providerJson } from "../http";
import { credentialFor, parseJsonCredential, requiredString, type Connector } from "./types";

/** Marketing API versions retire about a year after release; keep this current. */
export const META_GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const LABEL = "Meta Ads";

export type MetaCredential = { accessToken: string; accountId: string };

function parse(plaintext: string): MetaCredential {
  const value = parseJsonCredential(plaintext, LABEL);
  const accountId = requiredString(value.accountId, "accountId", LABEL).replace(/^act_/, "");
  if (!/^\d{1,20}$/.test(accountId)) throw new RangeError("Meta Ads accountId must be digits, with or without act_.");
  return { accessToken: requiredString(value.accessToken, "accessToken", LABEL), accountId };
}

function get<T>(credential: MetaCredential, path: string, params: Record<string, string>, signal?: AbortSignal) {
  const url = `${GRAPH}${path}?${new URLSearchParams(params)}`;
  return providerJson<T>(LABEL, url, { headers: { Authorization: `Bearer ${credential.accessToken}` } }, { signal });
}

type Action = { action_type?: string; value?: string };
type InsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  spend?: string;
  account_currency?: string;
  actions?: Action[];
  action_values?: Action[];
  purchase_roas?: Action[];
};

const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

function firstMatch(list: Action[] | undefined, types: string[]) {
  for (const type of types) {
    const found = list?.find((item) => item.action_type === type);
    if (found?.value !== undefined) return Number(found.value);
  }
  return null;
}

const number = (value: string | undefined) => (value === undefined ? null : Number(value));

/** Flattens Graph insight rows into the numbers a marketer reads. */
export function summarizeInsights(rows: InsightRow[]) {
  return rows.map((row) => ({
    name: row.campaign_name ?? row.adset_name ?? row.ad_name ?? "Unnamed",
    campaignId: row.campaign_id ?? null,
    spend: number(row.spend),
    currency: row.account_currency ?? null,
    impressions: number(row.impressions),
    reach: number(row.reach),
    clicks: number(row.clicks),
    ctr: number(row.ctr),
    cpc: number(row.cpc),
    purchases: firstMatch(row.actions, PURCHASE_TYPES),
    purchaseValue: firstMatch(row.action_values, PURCHASE_TYPES),
    roas: firstMatch(row.purchase_roas, PURCHASE_TYPES),
    leads: firstMatch(row.actions, LEAD_TYPES),
  }));
}

const performance = defineTool({
  name: "meta_ads_performance",
  tier: "read",
  description:
    "Meta (Facebook/Instagram) ad results from the connected ad account: spend, impressions, clicks, CTR, CPC, purchases, purchase value, ROAS and leads, per campaign, ad set or ad. Missing values mean Meta reported none.",
  input: z.object({
    datePreset: z
      .enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d", "this_month", "last_month"])
      .default("last_30d"),
    level: z.enum(["campaign", "adset", "ad"]).default("campaign"),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  async execute(ctx, input) {
    const credential = await credentialFor(ctx, connector);
    const payload = await get<{ data?: InsightRow[] }>(
      credential,
      `/act_${credential.accountId}/insights`,
      {
        level: input.level,
        date_preset: input.datePreset,
        limit: String(input.limit),
        fields: [
          "campaign_id", "campaign_name", "adset_name", "ad_name", "impressions", "reach",
          "clicks", "ctr", "cpc", "spend", "account_currency", "actions", "action_values", "purchase_roas",
        ].join(","),
      },
      ctx.signal,
    );
    return { datePreset: input.datePreset, level: input.level, rows: summarizeInsights(payload.data ?? []) };
  },
});

const campaigns = defineTool({
  name: "meta_ads_campaigns",
  tier: "read",
  description: "List campaigns in the connected Meta ad account with status, objective and budget.",
  input: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
  async execute(ctx, input) {
    const credential = await credentialFor(ctx, connector);
    const payload = await get<{
      data?: {
        id: string; name?: string; status?: string; effective_status?: string;
        objective?: string; daily_budget?: string; lifetime_budget?: string;
      }[];
    }>(
      credential,
      `/act_${credential.accountId}/campaigns`,
      {
        limit: String(input.limit),
        fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget",
      },
      ctx.signal,
    );
    // Budgets come back in the account currency's minor unit (e.g. cents).
    return (payload.data ?? []).map((campaign) => ({
      id: campaign.id,
      name: campaign.name ?? "Unnamed",
      status: campaign.effective_status ?? campaign.status ?? null,
      objective: campaign.objective ?? null,
      dailyBudgetMinor: number(campaign.daily_budget),
      lifetimeBudgetMinor: number(campaign.lifetime_budget),
    }));
  },
});

export const connector: Connector<MetaCredential> = {
  provider: "meta-ads",
  label: LABEL,
  keyHint: '{"accessToken":"…","accountId":"act_…"}',
  parse,
  async verify(credential, signal) {
    await get(credential, `/act_${credential.accountId}`, { fields: "name,currency" }, signal);
  },
  tools: [performance, campaigns],
};
