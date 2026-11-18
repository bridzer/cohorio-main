import { describe, expect, it } from "vitest";
import {
  contextToMarkdown,
  type MarketingContext,
} from "@/lib/marketing-context";
import { suggestCampaignField } from "./campaign-suggestions";
import type { CampaignProduct } from "./ad-campaign";

const context: MarketingContext = {
  productOverview: {
    oneLiner: "Acme sells durable ceramic drinkware.",
    whatItDoes: "Hand-finished mugs that keep drinks warm longer.",
    category: "Drinkware",
    productType: "E-commerce",
    businessModel: "Direct to consumer, $18 to $42 per piece.",
  },
  targetAudience: {
    targetCompanies: "Independent coffee shops in the US with 5 to 20 staff.",
    decisionMakers: "Café owners and managers who buy serveware.",
    primaryUseCase: "Serve signature drinks in memorable house mugs.",
    jobsToBeDone: "",
    useCases: "",
  },
  differentiation: {
    differentiators: "Double-wall ceramic keeps drinks warm twice as long.",
    approach: "Small-batch kiln firing with a chip-resistant glaze.",
    benefits: "Fewer refills and fewer replacements each year.",
    whyChoose: "The only house mug guaranteed chip-free for two years.",
  },
  goals: {
    businessGoal: "Grow online revenue from serveware.",
    conversionAction: "Buy online",
    currentMetrics: "",
  },
};

const brandMarkdown = contextToMarkdown(context, "2026-11-18T00:00:00.000Z");

const products: CampaignProduct[] = [
  {
    id: "gid://shopify/Product/1",
    title: "Everyday Tote",
    productType: "Bags",
    minimumPrice: 48,
    currencyCode: "USD",
    onlineStoreUrl: "https://store.example.com/products/everyday-tote",
    imageUrl: null,
    descriptionText: "A sturdy everyday tote.",
  },
  {
    id: "gid://shopify/Product/2",
    title: "Studio Pouch",
    productType: "Bags",
    minimumPrice: 24,
    currencyCode: "USD",
    onlineStoreUrl: null,
    imageUrl: null,
    descriptionText: "A compact pouch.",
  },
];

const base = {
  brandMarkdown,
  platform: "meta" as const,
  objective: "Sales",
  products,
};

describe("campaign brief suggestions", () => {
  it("builds a campaign name from selected products and settings", () => {
    const suggestion = suggestCampaignField({ ...base, field: "name" });
    expect(suggestion?.value).toBe("Everyday Tote + Studio Pouch · Meta Sales");
    expect(suggestion?.sources).toEqual(["Shopify catalog"]);
  });

  it("needs selected products for a name", () => {
    expect(
      suggestCampaignField({ ...base, field: "name", products: [] }),
    ).toBeNull();
  });

  it("infers Sales from a buy-oriented conversion action", () => {
    const suggestion = suggestCampaignField({ ...base, field: "objective" });
    expect(suggestion?.value).toBe("Sales");
    expect(suggestion?.sources).toContain("Key conversion action");
  });

  it("infers Traffic from a demo-oriented conversion action", () => {
    const demo = contextToMarkdown(
      { goals: { conversionAction: "Book a demo" } },
      "2026-11-18T00:00:00.000Z",
    );
    expect(
      suggestCampaignField({ ...base, field: "objective", brandMarkdown: demo })?.value,
    ).toBe("Traffic");
  });

  it("infers Awareness from brand language", () => {
    const aware = contextToMarkdown(
      { goals: { businessGoal: "Grow brand awareness for the launch" } },
      "2026-11-18T00:00:00.000Z",
    );
    expect(
      suggestCampaignField({ ...base, field: "objective", brandMarkdown: aware })?.value,
    ).toBe("Awareness");
  });

  it("composes an audience from Brand Brain without inventing", () => {
    const suggestion = suggestCampaignField({ ...base, field: "audience" });
    expect(suggestion?.value).toContain("Café owners and managers");
    expect(suggestion?.value).toContain("Independent coffee shops");
    expect(suggestion?.value).toContain("memorable house mugs");
    expect(suggestion?.value.length).toBeLessThanOrEqual(500);
  });

  it("grounds the value proposition in differentiation", () => {
    const suggestion = suggestCampaignField({
      ...base,
      field: "valueProposition",
    });
    expect(suggestion?.value).toContain("chip-free for two years");
    expect(suggestion?.sources).toContain("Why customers choose you");
  });

  it("suggests the first selected product page as landing page", () => {
    const suggestion = suggestCampaignField({
      ...base,
      field: "landingPageUrl",
    });
    expect(suggestion?.value).toBe(
      "https://store.example.com/products/everyday-tote",
    );
  });

  it("skips non-HTTPS product URLs", () => {
    const insecure = products.map((product) => ({
      ...product,
      onlineStoreUrl: "http://store.example.com/insecure",
    }));
    expect(
      suggestCampaignField({ ...base, field: "landingPageUrl", products: insecure }),
    ).toBeNull();
  });

  it("returns null when Brand Brain is empty", () => {
    const empty = contextToMarkdown({}, "2026-11-18T00:00:00.000Z");
    expect(
      suggestCampaignField({ ...base, field: "audience", brandMarkdown: empty }),
    ).toBeNull();
    expect(
      suggestCampaignField({ ...base, field: "valueProposition", brandMarkdown: empty }),
    ).toBeNull();
  });
});
