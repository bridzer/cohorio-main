import { z } from "zod";
import { defineTool, ToolInputError } from "@/lib/agent/registry";
import { providerJson } from "../http";
import { credentialFor, type Connector } from "./types";

/** Klaviyo retires a revision two years after release; keep this current. */
export const KLAVIYO_REVISION = "2026-10-15";
const BASE = "https://a.klaviyo.com/api";
const LABEL = "Klaviyo";

export type KlaviyoCredential = { apiKey: string };

function parse(plaintext: string): KlaviyoCredential {
  const apiKey = plaintext.trim();
  if (!/^pk_[A-Za-z0-9]{20,}$/.test(apiKey)) {
    throw new RangeError("Klaviyo needs a private API key (it starts with pk_).");
  }
  return { apiKey };
}

function request<T>(credential: KlaviyoCredential, path: string, init: RequestInit = {}, signal?: AbortSignal) {
  return providerJson<T>(
    LABEL,
    `${BASE}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Klaviyo-API-Key ${credential.apiKey}`,
        revision: KLAVIYO_REVISION,
        Accept: "application/vnd.api+json",
        ...(init.body ? { "Content-Type": "application/vnd.api+json" } : {}),
      },
    },
    { signal },
  );
}

type MetricList = { data?: { id: string; attributes?: { name?: string } }[] };

export function findMetricId(payload: MetricList, names: string[]) {
  for (const name of names) {
    const found = payload.data?.find((metric) => metric.attributes?.name === name);
    if (found) return found.id;
  }
  return null;
}

type ValuesReport = {
  data?: {
    attributes?: {
      results?: { groupings?: Record<string, string>; statistics?: Record<string, number> }[];
    };
  };
};

type CampaignList = {
  data?: { id: string; attributes?: { name?: string; definition?: { name?: string } } }[];
};

const STATISTICS = [
  "recipients",
  "open_rate",
  "click_rate",
  "conversion_rate",
  "conversions",
  "conversion_value",
  "revenue_per_recipient",
  "unsubscribe_rate",
] as const;

/** One row per campaign; rates stay as 0–1 fractions, as Klaviyo returns them. */
export function summarizeCampaignReport(report: ValuesReport, campaigns: CampaignList) {
  const names = new Map(
    (campaigns.data ?? []).map((campaign) => [
      campaign.id,
      campaign.attributes?.definition?.name ?? campaign.attributes?.name ?? null,
    ]),
  );
  return (report.data?.attributes?.results ?? []).map((row) => {
    const id = row.groupings?.campaign_id ?? null;
    return {
      campaignId: id,
      name: (id && names.get(id)) || "Unnamed campaign",
      channel: row.groupings?.send_channel ?? null,
      ...Object.fromEntries(STATISTICS.map((key) => [key, row.statistics?.[key] ?? null])),
    };
  });
}

const campaignPerformance = defineTool({
  name: "klaviyo_campaign_performance",
  tier: "read",
  description:
    "Klaviyo email/SMS campaign results for a timeframe: recipients, open, click, conversion and unsubscribe rates (as 0–1 fractions), conversions and revenue attributed to Placed Order. Klaviyo allows only about 2 report requests per minute, so call this at most once per request.",
  input: z.object({
    timeframe: z
      .enum(["last_7_days", "last_30_days", "last_90_days", "last_month", "this_month", "last_12_months"])
      .default("last_30_days"),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute(ctx, input) {
    const credential = await credentialFor(ctx, connector);
    const metrics = await request<MetricList>(credential, "/metrics/", {}, ctx.signal);
    const conversionMetricId = findMetricId(metrics, ["Placed Order", "Ordered Product"]);
    if (!conversionMetricId) {
      throw new ToolInputError(
        "Klaviyo has no Placed Order metric yet, so campaign conversions cannot be reported. Connect a store to Klaviyo first.",
      );
    }
    const report = await request<ValuesReport>(
      credential,
      "/campaign-values-reports/",
      {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "campaign-values-report",
            attributes: {
              statistics: STATISTICS,
              timeframe: { key: input.timeframe },
              conversion_metric_id: conversionMetricId,
            },
          },
        }),
      },
      ctx.signal,
    );
    const ids = [
      ...new Set(
        (report.data?.attributes?.results ?? [])
          .map((row) => row.groupings?.campaign_id)
          .filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9]+$/.test(id)),
      ),
    ].slice(0, input.limit);
    const campaigns = ids.length
      ? await request<CampaignList>(
          credential,
          `/campaigns/?${new URLSearchParams({ filter: `any(id,[${ids.map((id) => `'${id}'`).join(",")}])` })}`,
          {},
          ctx.signal,
        )
      : { data: [] };
    return {
      timeframe: input.timeframe,
      campaigns: summarizeCampaignReport(report, campaigns).slice(0, input.limit),
    };
  },
});

export const connector: Connector<KlaviyoCredential> = {
  provider: "klaviyo",
  label: LABEL,
  keyHint: "Private API key (pk_…) with campaigns, metrics and accounts read access",
  parse,
  async verify(credential, signal) {
    await request(credential, "/accounts/", {}, signal);
  },
  tools: [campaignPerformance],
};
