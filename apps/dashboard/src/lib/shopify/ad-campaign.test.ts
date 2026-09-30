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
