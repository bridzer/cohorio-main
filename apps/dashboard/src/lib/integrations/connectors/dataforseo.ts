import { z } from "zod";
import { defineTool, ToolInputError } from "@/lib/agent/registry";
import { providerJson } from "../http";
import { credentialFor, parseJsonCredential, requiredString, type Connector } from "./types";

const BASE = "https://api.dataforseo.com/v3";
const LABEL = "DataForSEO";

export type DataForSeoCredential = { login: string; password: string };

function parse(plaintext: string): DataForSeoCredential {
  const value = parseJsonCredential(plaintext, LABEL);
  return {
    login: requiredString(value.login, "login", LABEL),
    password: requiredString(value.password, "password", LABEL),
  };
}

type TaskResponse<Item> = {
  status_code?: number;
  tasks?: { status_code?: number; status_message?: string; result?: Item[] | null }[];
};

async function call<Item>(
  credential: DataForSeoCredential,
  path: string,
  body: unknown,
  signal?: AbortSignal,
) {
  const auth = Buffer.from(`${credential.login}:${credential.password}`).toString("base64");
  const payload = await providerJson<TaskResponse<Item>>(
    LABEL,
    `${BASE}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { signal, timeoutMs: 45_000 },
  );
  // DataForSEO reports task failures inside a 200 response; 20000 means success.
  const task = payload.tasks?.[0];
  if (payload.status_code !== 20000 || !task || task.status_code !== 20000) {
    throw new ToolInputError(`${LABEL} could not complete the request${task?.status_message ? `: ${task.status_message.slice(0, 120)}` : "."}`);
  }
  return task.result ?? [];
}

const location = z
  .number()
  .int()
  .positive()
  .default(2840)
  .describe("DataForSEO location code, e.g. 2840 United States, 2826 United Kingdom, 2124 Canada, 2036 Australia");
const language = z.string().regex(/^[a-z]{2}$/).default("en").describe("Two-letter language code");

type VolumeItem = {
  keyword?: string;
  search_volume?: number | null;
  competition?: string | null;
  competition_index?: number | null;
  cpc?: number | null;
  monthly_searches?: { year: number; month: number; search_volume: number }[] | null;
};

export function summarizeVolumes(items: VolumeItem[]) {
  return items.map((item) => ({
    keyword: item.keyword ?? "",
    monthlySearches: item.search_volume ?? null,
    competition: item.competition ?? null,
    competitionIndex: item.competition_index ?? null,
    cpc: item.cpc ?? null,
    trend: (item.monthly_searches ?? []).slice(0, 12).map((month) => ({
      month: `${month.year}-${String(month.month).padStart(2, "0")}`,
      searches: month.search_volume,
    })),
  }));
}

const keywordVolume = defineTool({
  name: "seo_keyword_volume",
  tier: "read",
  description:
    "Google search volume, CPC and competition for up to 50 keywords from DataForSEO, with 12 months of trend. Each call is billed to the workspace's DataForSEO account, so batch keywords into one call.",
  input: z.object({
    keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
    locationCode: location,
    languageCode: language,
  }),
  async execute(ctx, input) {
    const credential = await credentialFor(ctx, connector);
    const items = await call<VolumeItem>(
      credential,
      "/keywords_data/google_ads/search_volume/live",
      [{ keywords: [...new Set(input.keywords.map((keyword) => keyword.toLowerCase()))], location_code: input.locationCode, language_code: input.languageCode }],
      ctx.signal,
    );
    return { locationCode: input.locationCode, keywords: summarizeVolumes(items) };
  },
});

type SerpResult = {
  items?: { type?: string; rank_group?: number; title?: string; url?: string; domain?: string; description?: string }[];
};

const serp = defineTool({
  name: "seo_google_results",
  tier: "read",
  untrusted: true,
  description:
    "The current top Google organic results for one keyword (rank, title, URL, domain, snippet) from DataForSEO. Use it to see who ranks and how they position. Billed per call.",
  input: z.object({
    keyword: z.string().trim().min(1).max(120),
    locationCode: location,
    languageCode: language,
    depth: z.number().int().min(10).max(30).default(10),
  }),
  async execute(ctx, input) {
    const credential = await credentialFor(ctx, connector);
    const results = await call<SerpResult>(
      credential,
      "/serp/google/organic/live/regular",
      [{ keyword: input.keyword, location_code: input.locationCode, language_code: input.languageCode, depth: input.depth }],
      ctx.signal,
    );
    return {
      keyword: input.keyword,
      results: (results[0]?.items ?? [])
        .filter((item) => item.type === "organic")
        .map((item) => ({
          rank: item.rank_group ?? null,
          title: item.title ?? "",
          url: item.url ?? "",
          domain: item.domain ?? "",
          // Snippets are third-party page text: data, not instructions.
          snippet: (item.description ?? "").slice(0, 300),
        })),
    };
  },
});

export const connector: Connector<DataForSeoCredential> = {
  provider: "dataforseo",
  label: LABEL,
  keyHint: '{"login":"you@example.com","password":"API password"}',
  parse,
  async verify(credential, signal) {
    await call(credential, "/appendix/user_data", undefined, signal);
  },
  tools: [keywordVolume, serp],
};
