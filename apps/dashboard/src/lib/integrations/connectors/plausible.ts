import { z } from "zod";
import { defineTool } from "@/lib/agent/registry";
import { providerJson } from "../http";
import { credentialFor, parseJsonCredential, requiredString, type Connector } from "./types";

// Plausible Cloud only. A self-hosted base URL would let a saved credential
// point server-side requests at arbitrary hosts, so it is not accepted.
const ENDPOINT = "https://plausible.io/api/v2/query";
const LABEL = "Plausible";

export type PlausibleCredential = { apiKey: string; siteId: string };

function parse(plaintext: string): PlausibleCredential {
  const value = parseJsonCredential(plaintext, LABEL);
  const siteId = requiredString(value.siteId, "siteId", LABEL).toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(siteId)) {
    throw new RangeError("Plausible siteId must be the site's domain, e.g. example.com.");
  }
  return { apiKey: requiredString(value.apiKey, "apiKey", LABEL), siteId };
}

type QueryResult = { results?: { metrics?: number[]; dimensions?: string[] }[] };

function query(credential: PlausibleCredential, body: Record<string, unknown>, signal?: AbortSignal) {
  return providerJson<QueryResult>(
    LABEL,
    ENDPOINT,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ site_id: credential.siteId, ...body }),
    },
    { signal },
  );
}

/** Zips Plausible's positional arrays back into named fields. */
export function namedRows(result: QueryResult, metrics: string[], dimensions: string[]) {
  return (result.results ?? []).map((row) => ({
    ...Object.fromEntries(dimensions.map((name, index) => [name, row.dimensions?.[index] ?? null])),
    ...Object.fromEntries(metrics.map((name, index) => [name, row.metrics?.[index] ?? null])),
  }));
}

const DATE_RANGES = ["day", "7d", "28d", "30d", "91d", "month", "6mo", "12mo", "year"] as const;
const BREAKDOWNS = {
  none: null,
  daily: "time:day",
  pages: "event:page",
  sources: "visit:source",
  channels: "visit:channel",
  countries: "visit:country",
  devices: "visit:device",
  entry_pages: "visit:entry_page",
} as const;

const traffic = defineTool({
  name: "plausible_traffic",
  tier: "read",
  description:
    "Website traffic from Plausible: visitors, visits, pageviews, bounce rate (%) and visit duration (seconds), in total or broken down by day, page, source, channel, country, device or entry page.",
  input: z.object({
    dateRange: z.enum(DATE_RANGES).default("30d"),
    breakdown: z.enum(Object.keys(BREAKDOWNS) as [keyof typeof BREAKDOWNS, ...(keyof typeof BREAKDOWNS)[]]).default("none"),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  async execute(ctx, input) {
    const credential = await credentialFor(ctx, connector);
    const dimension = BREAKDOWNS[input.breakdown];
    const metrics = ["visitors", "visits", "pageviews", "bounce_rate", "visit_duration"];
    const dimensions = dimension ? [dimension] : [];
    const result = await query(
      credential,
      {
        metrics,
        date_range: input.dateRange,
        dimensions,
        ...(dimension && dimension !== "time:day" ? { order_by: [["visitors", "desc"]] } : {}),
        pagination: { limit: input.limit },
      },
      ctx.signal,
    );
    return {
      site: credential.siteId,
      dateRange: input.dateRange,
      breakdown: input.breakdown,
      rows: namedRows(result, metrics, dimensions),
    };
  },
});

export const connector: Connector<PlausibleCredential> = {
  provider: "plausible",
  label: LABEL,
  keyHint: '{"apiKey":"…","siteId":"example.com"}',
  parse,
  async verify(credential, signal) {
    await query(credential, { metrics: ["visitors"], date_range: "day" }, signal);
  },
  tools: [traffic],
};
