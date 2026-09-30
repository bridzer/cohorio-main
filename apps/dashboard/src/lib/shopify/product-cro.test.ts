import { describe, expect, it } from "vitest";
import { contextToMarkdown } from "../marketing-context";
import { analyzeProductCro, type ProductCroInput } from "./product-cro";

function product(overrides: Partial<ProductCroInput> = {}): ProductCroInput {
  return {
    title: "Everyday ceramic mug 12oz",
    descriptionText: "A".repeat(320),
    vendor: "Acme",
    productType: "Drinkware",
    tags: ["mug", "ceramic", "gift"],
    mediaCount: 5,
    variantsCount: 2,
    seoTitle: "Everyday ceramic mug for daily coffee",
    seoDescription: "A".repeat(140),
    onlineStoreUrl: "https://store.example.com/mug",
    status: "ACTIVE",
    totalInventory: 12,
    minimumPrice: 18,
    ...overrides,
  };
}

const brandMarkdown = contextToMarkdown(
  {
    productOverview: {
      oneLiner: "Acme widgets cut warehouse picking time in half",
    },
    brandVoice: {
      tone: "Direct and practical",
    },
  },
  "2026-09-29T12:00:00.000Z",
);

describe("analyzeProductCro brand context", () => {
  it("keeps the numeric score when Brand Brain is present", () => {
    const input = product({
      descriptionText: "A ceramic mug with a comfortable handle.",
    });
    const withoutBrand = analyzeProductCro(input);
    const withBrand = analyzeProductCro(input, brandMarkdown);
    expect(withBrand.score).toBe(withoutBrand.score);
  });

  it("appends a value-proposition recommendation when copy misses the one-liner", () => {
    const analysis = analyzeProductCro(
      product({ descriptionText: "A ceramic mug with a comfortable handle." }),
      brandMarkdown,
    );
    const brandRec = analysis.recommendations.find(
      (item) => item.title === "Reflect Brand Brain on the product page",
    );
    expect(brandRec?.area).toBe("Value proposition");
    expect(brandRec?.detail).toContain(
      "Acme widgets cut warehouse picking time in half",
    );
  });

  it("skips the brand recommendation when the description shares a 12-character window", () => {
    const analysis = analyzeProductCro(
      product({
        descriptionText:
          "Warehouse teams use Acme widgets cut warehouse picking every shift.",
      }),
      brandMarkdown,
    );
    expect(
      analysis.recommendations.some(
        (item) => item.title === "Reflect Brand Brain on the product page",
      ),
    ).toBe(false);
  });

  it("does not add a brand recommendation when Brand Brain is empty", () => {
    const analysis = analyzeProductCro(product(), "No Brand Brain context saved.");
    expect(
      analysis.recommendations.some(
        (item) => item.title === "Reflect Brand Brain on the product page",
      ),
    ).toBe(false);
  });
});
