import { describe, expect, it, vi } from "vitest";

const getMarketingContext = vi.fn();
const listConnections = vi.fn();
const listConfiguredProviders = vi.fn();
const loadGa4Settings = vi.fn();

vi.mock("@/lib/marketing-context-repository", () => ({
  getMarketingContext: (...args: unknown[]) => getMarketingContext(...args),
}));

vi.mock("@/lib/shopify/repository", () => ({
  listConnections: (...args: unknown[]) => listConnections(...args),
}));

vi.mock("@/lib/integrations/store", () => ({
  listConfiguredProviders: (...args: unknown[]) => listConfiguredProviders(...args),
  loadGa4Settings: (...args: unknown[]) => loadGa4Settings(...args),
}));

import type { AgentContext, ExecutableTool } from "../types";
import { storeAuditBrief } from "./audit";

const ctx: AgentContext = { workspaceId: "ws-1", userId: "u-1", role: "owner" };
// defineTool widens tool definitions to AgentTool; the brief is read-tier, so
// the cast below only recovers its execute function for direct testing.
const brief = storeAuditBrief as ExecutableTool<Record<string, never>>;

type BriefResult = {
  brandBrain: {
    present: boolean;
    completedSections: number;
    totalSections: number;
    missingEssentials: { label: string; suggestion: string }[];
  };
  stores: { id: string; name: string }[];
  dataSources: {
    providers: string[];
    ga4Configured: boolean;
    seoData: boolean;
    adsData: boolean;
    emailData: boolean;
  };
  needsFromUser: { topic: string; question: string; suggestion: string }[];
  plan: { dimension: string; tools: string[]; skills: string[] }[];
};

function setup(input: {
  sections?: Record<string, Record<string, string>>;
  connections?: { id: string; displayName: string }[];
  providers?: string[];
  ga4?: { propertyId: string } | null;
}) {
  getMarketingContext.mockResolvedValue(
    input.sections
      ? { workspaceId: "ws-1", sections: input.sections, createdAt: "", updatedAt: "" }
      : null,
  );
  listConnections.mockResolvedValue(input.connections ?? []);
  listConfiguredProviders.mockResolvedValue(input.providers ?? []);
  loadGa4Settings.mockResolvedValue(input.ga4 ?? null);
}

describe("store_audit_brief", () => {
  it("scopes every lookup to the caller's workspace", async () => {
    setup({});
    await brief.execute(ctx, {});
    for (const mock of [getMarketingContext, listConnections, listConfiguredProviders]) {
      expect(mock).toHaveBeenCalledWith("ws-1");
    }
    expect(loadGa4Settings).toHaveBeenCalledWith("ws-1");
  });

  it("reports a configured workspace with no intake questions", async () => {
    setup({
      sections: {
        productOverview: {
          oneLiner: "Tea for developers",
          whatItDoes: "Sells tea",
          category: "Beverages",
          productType: "E-commerce",
          businessModel: "One-time",
        },
        targetAudience: { targetCompanies: "Devs" },
      },
      connections: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          displayName: "Tea Store",
        },
      ],
      providers: ["plausible"],
      ga4: { propertyId: "123" },
    });
    const result = (await brief.execute(ctx, {})) as unknown as BriefResult;
    expect(result.stores.map((store) => store.name)).toEqual(["Tea Store"]);
    expect(result.dataSources.ga4Configured).toBe(true);
    expect(result.plan.map((item) => item.dimension)).toContain("SEO and discoverability");
    expect(result.plan.every((item) => item.tools.length > 0 && item.skills.length > 0)).toBe(
      true,
    );
  });

  it("asks for brand essentials with suggestions and a store when nothing is configured", async () => {
    setup({});
    const result = (await brief.execute(ctx, {})) as unknown as BriefResult;
    expect(result.brandBrain.present).toBe(false);
    expect(result.brandBrain.missingEssentials.length).toBeGreaterThan(0);
    expect(result.brandBrain.missingEssentials.length).toBeLessThanOrEqual(8);
    for (const item of result.brandBrain.missingEssentials) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.suggestion.length).toBeGreaterThan(0);
    }
    const topics = result.needsFromUser.map((need) => need.topic);
    expect(topics).toContain("Brand Brain");
    expect(topics).toContain("Store");
  });
});
