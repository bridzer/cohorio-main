import { describe, expect, it } from "vitest";
import { resolvePublishCreatives } from "./publish-campaign";
import type { CampaignCreative } from "@/lib/shopify/ad-campaign";

function creative(id: string): CampaignCreative {
  return {
    id,
    productId: "gid://shopify/Product/1",
    productTitle: "Canvas tote",
    angle: "product",
    headline: `Headline ${id}`,
    primaryText: "Heavy cotton.",
    description: "Built to carry.",
    cta: "Shop now",
    landingPageUrl: null,
    imageUrl: null,
    visualBrief: "Square feed layout.",
    limits: { headline: 40, primaryText: 125, description: 30 },
    grounding: [],
  };
}

const creatives = [creative("a"), creative("b"), creative("c")];

describe("resolvePublishCreatives", () => {
  it("publishes everything when no selection is given (legacy behavior)", () => {
    expect(resolvePublishCreatives(creatives)).toEqual(creatives);
    expect(resolvePublishCreatives(creatives, undefined)).toEqual(creatives);
  });

  it("publishes only the selected creatives in campaign order", () => {
    expect(resolvePublishCreatives(creatives, ["c", "a"]).map((item) => item.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("rejects an empty selection", () => {
    expect(() => resolvePublishCreatives(creatives, [])).toThrow(RangeError);
    expect(() => resolvePublishCreatives(creatives, [])).toThrow(/at least one/);
  });

  it("rejects unknown creative ids", () => {
    expect(() => resolvePublishCreatives(creatives, ["a", "zzz"])).toThrow(RangeError);
    expect(() => resolvePublishCreatives(creatives, ["a", "zzz"])).toThrow(/not found/);
  });

  it("tolerates duplicate ids in the selection", () => {
    expect(
      resolvePublishCreatives(creatives, ["b", "b"]).map((item) => item.id),
    ).toEqual(["b"]);
  });
});
