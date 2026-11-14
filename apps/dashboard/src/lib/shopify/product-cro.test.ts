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

describe("suggestProductFixes", () => {
  it("suggests an SEO title in the 30–60 character window when it is missing", () => {
    const analysis = analyzeProductCro(product({ seoTitle: null }));
    const suggestion = analysis.suggestions.seoTitle;
    expect(suggestion).toContain("Everyday ceramic mug 12oz");
    expect(suggestion?.length).toBeGreaterThanOrEqual(30);
    expect(suggestion?.length).toBeLessThanOrEqual(60);
  });

  it("suggests no SEO title when the current one already fits", () => {
    expect(analyzeProductCro(product()).suggestions.seoTitle).toBeNull();
  });

  it("suggests an SEO description in the 100–160 character window when it is missing", () => {
    const analysis = analyzeProductCro(
      product({
        seoDescription: null,
        descriptionText:
          "Hand-thrown ceramic mug with a comfortable handle, glazed in speckled white. Holds 12oz and survives the dishwasher.",
      }),
      brandMarkdown,
    );
    const suggestion = analysis.suggestions.seoDescription;
    expect(suggestion).toContain("mug");
    expect(suggestion?.length).toBeGreaterThanOrEqual(100);
    expect(suggestion?.length).toBeLessThanOrEqual(160);
  });

  it("suggests no SEO description when the current one already fits", () => {
    expect(analyzeProductCro(product()).suggestions.seoDescription).toBeNull();
  });

  it("suggests an enriched title when the current one is too short", () => {
    const analysis = analyzeProductCro(product({ title: "Mug" }));
    expect(analysis.suggestions.title).toBe("Mug – Drinkware");
  });

  it("trims an overlong title at a word boundary", () => {
    const analysis = analyzeProductCro(product({ title: "Ceramic mug ".repeat(10).trim() }));
    expect(analysis.suggestions.title?.length).toBeLessThanOrEqual(70);
    expect(analysis.suggestions.title).not.toMatch(/ $/);
  });

  it("suggests no title when the current one already fits", () => {
    expect(analyzeProductCro(product()).suggestions.title).toBeNull();
  });

  it("starts an empty description from the Brand Brain one-liner", () => {
    const analysis = analyzeProductCro(
      product({ descriptionText: "" }),
      brandMarkdown,
    );
    expect(analysis.suggestions.descriptionStarter).toContain(
      "Acme widgets cut warehouse picking time in half",
    );
  });

  it("falls back to product facts when Brand Brain is empty", () => {
    const analysis = analyzeProductCro(
      product({ descriptionText: "" }),
      "No Brand Brain context saved.",
    );
    expect(analysis.suggestions.descriptionStarter).toContain(
      "Everyday ceramic mug 12oz",
    );
  });

  it("suggests no description starter when the description is complete", () => {
    expect(
      analyzeProductCro(product()).suggestions.descriptionStarter,
    ).toBeNull();
  });

  it("suggests lowercase tag additions without duplicating existing tags", () => {
    const analysis = analyzeProductCro(product({ tags: ["mug"] }));
    const tags = analysis.suggestions.tags;
    expect(tags.length).toBeGreaterThan(0);
    expect(tags).toEqual([...new Set(tags.map((tag) => tag.toLowerCase()))]);
    expect(tags).not.toContain("mug");
  });

  it("suggests no tags when three or more are set", () => {
    expect(analyzeProductCro(product()).suggestions.tags).toEqual([]);
  });

  it("exposes suggestions alongside the score without mutating the input", () => {
    const input = product({ seoTitle: null, tags: ["mug"] });
    const analysis = analyzeProductCro(input, brandMarkdown);
    expect(analysis.suggestions.seoTitle?.length).toBeGreaterThanOrEqual(30);
    expect(analysis.suggestions.tags.length).toBeGreaterThan(0);
    expect(analysis.score).toBeGreaterThanOrEqual(0);
    expect(input.seoTitle).toBeNull();
    expect(input.tags).toEqual(["mug"]);
  });
});
