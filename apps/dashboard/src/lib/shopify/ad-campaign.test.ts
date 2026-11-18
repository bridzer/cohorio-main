import { describe, expect, it } from "vitest";
import {
  generateAdCampaign,
  type CampaignBrief,
  type CampaignProduct,
} from "./ad-campaign";

const brief: CampaignBrief = {
  name: "Spring mugs",
  platform: "meta",
  objective: "Sales",
  dailyBudget: 40,
  currencyCode: "USD",
  audience: "Home cooks",
  valueProposition: "A mug that stays warm longer",
  offer: null,
  landingPageUrl: null,
};

const products: CampaignProduct[] = [
  {
    id: "gid://shopify/Product/1",
    title: "Ceramic mug",
    productType: "Drinkware",
    minimumPrice: 18,
    currencyCode: "USD",
    onlineStoreUrl: "https://store.example.com/mug",
    imageUrl: null,
    descriptionText: "A ceramic mug with a comfortable handle.",
  },
];

describe("generateAdCampaign brand grounding", () => {
  it("prepends the first 500 characters of Brand Brain markdown", () => {
    const markdown = `${"Brand voice: warm and specific. ".repeat(20)}END`;
    const campaign = generateAdCampaign(brief, products, markdown);
    expect(campaign.creatives.length).toBeGreaterThan(0);
    for (const creative of campaign.creatives) {
      expect(creative.grounding[0]).toBe(markdown.slice(0, 500));
      expect(creative.grounding[1]).toContain("Ceramic mug");
    }
  });
});

describe("generateAdCampaign angles", () => {
  it("generates all three angles per product by default", () => {
    const campaign = generateAdCampaign(brief, products, "");
    expect(campaign.creatives.map((creative) => creative.angle)).toEqual([
      "product",
      "audience",
      "offer",
    ]);
    expect(campaign.strategy.structure).toContain(
      "Three distinct creative angles per product",
    );
  });

  it("generates only the requested angles with unique ids", () => {
    const campaign = generateAdCampaign(brief, products, "", ["offer"]);
    expect(campaign.creatives).toHaveLength(1);
    expect(campaign.creatives[0]?.angle).toBe("offer");
    expect(campaign.strategy.structure).toContain("Offer angle per product");
  });

  it("numbers creative ids across products without collisions", () => {
    const two = [
      ...products,
      { ...products[0]!, id: "gid://shopify/Product/2", title: "Steel bottle" },
    ];
    const campaign = generateAdCampaign(brief, two, "", ["product", "offer"]);
    expect(campaign.creatives).toHaveLength(4);
    const ids = campaign.creatives.map((creative) => creative.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
