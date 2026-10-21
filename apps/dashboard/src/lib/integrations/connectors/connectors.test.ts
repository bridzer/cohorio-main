import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/integrations/store", () => ({ loadIntegration: mocks.load }));

import { runToolCall, UNTRUSTED_PREFIX } from "@/lib/agent/registry";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import type { AgentContext } from "@/lib/agent/types";
import { testProvider } from "../adapter";
import { CONNECTORS, connectedTools } from ".";
import { connector as dataforseo, summarizeVolumes } from "./dataforseo";
import { connector as klaviyo, KLAVIYO_REVISION, summarizeCampaignReport } from "./klaviyo";
import { connector as metaAds, META_GRAPH_VERSION, summarizeInsights } from "./meta-ads";
import { connector as plausible, namedRows } from "./plausible";

const ctx: AgentContext = { workspaceId: "workspace-a", userId: "user-a", role: "member" };
const KLAVIYO_KEY = "pk_abcdefghijklmnopqrstuvwxyz123456";
const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function call(name: string, args: unknown = {}) {
  return { id: `call-${name}`, type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
}

const allTools = [...AGENT_TOOLS, ...Object.values(CONNECTORS).flatMap((connector) => connector.tools)];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connector registry", () => {
  it("gives every tool a unique name across built-in and connector tools", () => {
    const names = allTools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps connector tools read-only and offers them only for connected providers", () => {
    for (const connector of Object.values(CONNECTORS)) {
      for (const tool of connector.tools) expect(tool.tier).toBe("read");
    }
    expect(connectedTools(["klaviyo", "mailchimp"]).map((tool) => tool.name)).toEqual([
      "klaviyo_campaign_performance",
    ]);
  });

  it("tells the model a provider is not connected instead of calling it", async () => {
    mocks.load.mockResolvedValue(null);
    const outcome = await runToolCall(allTools, ctx, call("plausible_traffic"));
    expect(outcome.content).toContain("Plausible is not connected");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads credentials for the session workspace only", async () => {
    mocks.load.mockResolvedValue(JSON.stringify({ apiKey: "k", siteId: "acme.com" }));
    fetchMock.mockResolvedValue(json({ results: [] }));
    await runToolCall(allTools, ctx, call("plausible_traffic", { workspaceId: "workspace-b" }));
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith("workspace-a", "plausible");
  });
});

describe("credential formats", () => {
  it("validates each provider's credential shape", () => {
    expect(metaAds.parse('{"accessToken":"t","accountId":"act_123"}')).toEqual({ accessToken: "t", accountId: "123" });
    expect(() => metaAds.parse('{"accessToken":"t","accountId":"act_x"}')).toThrow(RangeError);
    expect(() => metaAds.parse("not json")).toThrow(/JSON object/);
    expect(klaviyo.parse(` ${KLAVIYO_KEY} `)).toEqual({ apiKey: KLAVIYO_KEY });
    expect(() => klaviyo.parse("public-key")).toThrow(/pk_/);
    expect(plausible.parse('{"apiKey":"k","siteId":"Acme.com"}')).toEqual({ apiKey: "k", siteId: "acme.com" });
    expect(() => plausible.parse('{"apiKey":"k","siteId":"https://acme.com/x"}')).toThrow(RangeError);
    expect(() => dataforseo.parse('{"login":"a"}')).toThrow(/password/);
  });
});

describe("testProvider", () => {
  it("verifies connector credentials with a live call and reports rejection safely", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ id: "acct" }] }));
    expect(await testProvider("klaviyo", KLAVIYO_KEY)).toEqual({ ok: true, verified: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://a.klaviyo.com/api/accounts/");
    expect(init?.headers).toMatchObject({
      Authorization: `Klaviyo-API-Key ${KLAVIYO_KEY}`,
      revision: KLAVIYO_REVISION,
    });

    fetchMock.mockResolvedValueOnce(json({ errors: [{ detail: `bad key ${KLAVIYO_KEY}` }] }, 401));
    const rejected = await testProvider("klaviyo", KLAVIYO_KEY);
    expect(rejected).toMatchObject({ ok: false, verified: false });
    expect(rejected.error).toContain("rejected the saved credentials");
    expect(rejected.error).not.toContain(KLAVIYO_KEY);
  });

  it("rejects malformed credentials before any network call", async () => {
    expect(await testProvider("meta-ads", "just-a-token")).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores keys for providers without a connector but does not claim they are verified", async () => {
    expect(await testProvider("mailchimp", "abcdefgh-us1")).toEqual({ ok: true, verified: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports timeouts and network failures without details", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.1"));
    const result = await testProvider("plausible", '{"apiKey":"k","siteId":"acme.com"}');
    expect(result.error).toBe("Plausible did not respond. Try again shortly.");
  });
});

describe("Meta Ads", () => {
  it("requests insights from the current Marketing API version and flattens results", async () => {
    mocks.load.mockResolvedValue('{"accessToken":"tok","accountId":"act_42"}');
    fetchMock.mockResolvedValue(json({
      data: [{
        campaign_id: "1", campaign_name: "Spring", spend: "120.50", impressions: "10000", clicks: "250",
        ctr: "2.5", cpc: "0.48", account_currency: "USD",
        actions: [{ action_type: "link_click", value: "250" }, { action_type: "omni_purchase", value: "6" }],
        action_values: [{ action_type: "omni_purchase", value: "480" }],
        purchase_roas: [{ action_type: "omni_purchase", value: "3.98" }],
      }],
    }));
    const outcome = await runToolCall(allTools, ctx, call("meta_ads_performance", { datePreset: "last_7d" }));
    expect(outcome.step.status).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`https://graph.facebook.com/${META_GRAPH_VERSION}/act_42/insights?`);
    expect(String(url)).toContain("date_preset=last_7d");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok" });
    expect(JSON.parse(outcome.content).rows[0]).toMatchObject({
      name: "Spring", spend: 120.5, purchases: 6, purchaseValue: 480, roas: 3.98, leads: null,
    });
  });

  it("keeps publishing on the same Graph version", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../ads/publish.ts", import.meta.url), "utf8"));
    expect(source).not.toMatch(/graph\.facebook\.com\/v\d+/);
    expect(META_GRAPH_VERSION).toBe("v25.0");
  });

  it("returns null rather than zero when Meta reports no conversions", () => {
    expect(summarizeInsights([{ campaign_name: "x" }])[0]).toMatchObject({ purchases: null, spend: null });
  });
});

describe("Klaviyo", () => {
  it("finds the order metric, runs the values report and names campaigns", async () => {
    mocks.load.mockResolvedValue(KLAVIYO_KEY);
    fetchMock
      .mockResolvedValueOnce(json({ data: [{ id: "M1", attributes: { name: "Opened Email" } }, { id: "M2", attributes: { name: "Placed Order" } }] }))
      .mockResolvedValueOnce(json({
        data: { attributes: { results: [
          { groupings: { campaign_id: "C1", send_channel: "email" }, statistics: { recipients: 900, open_rate: 0.41, conversion_value: 1234.5 } },
        ] } },
      }))
      .mockResolvedValueOnce(json({ data: [{ id: "C1", attributes: { definition: { name: "October launch" } } }] }));

    const outcome = await runToolCall(allTools, ctx, call("klaviyo_campaign_performance"));
    expect(outcome.step.status).toBe("ok");
    const reportInit = fetchMock.mock.calls[1][1];
    expect(fetchMock.mock.calls[1][0]).toBe("https://a.klaviyo.com/api/campaign-values-reports/");
    expect(JSON.parse(String(reportInit?.body))).toMatchObject({
      data: { type: "campaign-values-report", attributes: { conversion_metric_id: "M2", timeframe: { key: "last_30_days" } } },
    });
    expect(decodeURIComponent(String(fetchMock.mock.calls[2][0]))).toContain("filter=any(id,['C1'])");
    expect(JSON.parse(outcome.content).campaigns[0]).toMatchObject({
      name: "October launch", channel: "email", recipients: 900, open_rate: 0.41, conversion_value: 1234.5, click_rate: null,
    });
  });

  it("explains when there is no order metric to report conversions against", async () => {
    mocks.load.mockResolvedValue(KLAVIYO_KEY);
    fetchMock.mockResolvedValueOnce(json({ data: [{ id: "M1", attributes: { name: "Opened Email" } }] }));
    const outcome = await runToolCall(allTools, ctx, call("klaviyo_campaign_performance"));
    expect(outcome.content).toContain("no Placed Order metric");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a top-level name for older campaign shapes", () => {
    const rows = summarizeCampaignReport(
      { data: { attributes: { results: [{ groupings: { campaign_id: "C9" } }] } } },
      { data: [{ id: "C9", attributes: { name: "Legacy" } }] },
    );
    expect(rows[0].name).toBe("Legacy");
  });
});

describe("Plausible", () => {
  it("queries Plausible Cloud for the saved site and names positional results", async () => {
    mocks.load.mockResolvedValue('{"apiKey":"pk","siteId":"acme.com"}');
    fetchMock.mockResolvedValue(json({ results: [{ dimensions: ["Google"], metrics: [120, 140, 300, 41, 63] }] }));
    const outcome = await runToolCall(allTools, ctx, call("plausible_traffic", { breakdown: "sources", dateRange: "7d" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://plausible.io/api/v2/query");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      site_id: "acme.com", date_range: "7d", dimensions: ["visit:source"], order_by: [["visitors", "desc"]],
    });
    expect(JSON.parse(outcome.content).rows[0]).toEqual({
      "visit:source": "Google", visitors: 120, visits: 140, pageviews: 300, bounce_rate: 41, visit_duration: 63,
    });
  });

  it("handles rows with missing values", () => {
    expect(namedRows({ results: [{ metrics: [5] }] }, ["visitors", "visits"], [])).toEqual([{ visitors: 5, visits: null }]);
  });
});

describe("DataForSEO", () => {
  it("uses basic auth and reports task-level failures inside HTTP 200", async () => {
    mocks.load.mockResolvedValue('{"login":"me@acme.test","password":"secret"}');
    fetchMock.mockResolvedValueOnce(json({ status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field: 'keywords'.", result: null }] }));
    const outcome = await runToolCall(allTools, ctx, call("seo_keyword_volume", { keywords: ["Running Shoes"] }));
    expect(outcome.step.status).toBe("error");
    expect(outcome.content).toContain("Invalid Field");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live");
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("me@acme.test:secret").toString("base64")}`,
    });
    expect(JSON.parse(String(init?.body))[0].keywords).toEqual(["running shoes"]);
  });

  it("summarizes volumes with a 12-month trend", () => {
    expect(summarizeVolumes([{
      keyword: "running shoes", search_volume: 90500, cpc: 1.2, competition: "HIGH",
      monthly_searches: [{ year: 2026, month: 9, search_volume: 88000 }],
    }])).toEqual([{
      keyword: "running shoes", monthlySearches: 90500, competition: "HIGH", competitionIndex: null, cpc: 1.2,
      trend: [{ month: "2026-09", searches: 88000 }],
    }]);
  });

  it("keeps only organic results and truncates snippets", async () => {
    mocks.load.mockResolvedValue('{"login":"a","password":"b"}');
    fetchMock.mockResolvedValueOnce(json({
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ items: [
        { type: "paid", title: "Ad" },
        { type: "organic", rank_group: 1, title: "Best shoes", url: "https://x.test", domain: "x.test", description: "y".repeat(500) },
      ] }] }],
    }));
    const outcome = await runToolCall(allTools, ctx, call("seo_google_results", { keyword: "shoes" }));
    expect(outcome.content.startsWith(UNTRUSTED_PREFIX)).toBe(true);
    const results = JSON.parse(outcome.content.slice(UNTRUSTED_PREFIX.length)).results;
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toHaveLength(300);
  });
});
