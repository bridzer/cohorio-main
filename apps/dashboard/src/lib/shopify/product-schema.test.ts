import { describe, expect, it } from "vitest";
import { productJsonLd } from "./product-schema";

describe("productJsonLd", () => {
  it("omits an empty description and missing fields", () => {
    const jsonLd = productJsonLd({
      title: "Canvas tote",
      descriptionText: "   ",
      imageUrl: null,
      minimumPrice: 0,
      currencyCode: "USD",
    });
    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Canvas tote",
    });
    expect("description" in jsonLd).toBe(false);
    expect("offers" in jsonLd).toBe(false);
  });

  it("includes stored price, image, and sku", () => {
    expect(
      productJsonLd({
        title: "Canvas tote",
        descriptionText: "Heavy cotton tote.",
        sku: "TOTE-1",
        imageUrl: "https://cdn.shopify.com/tote.jpg",
        minimumPrice: 24,
        currencyCode: "USD",
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Canvas tote",
      description: "Heavy cotton tote.",
      sku: "TOTE-1",
      image: "https://cdn.shopify.com/tote.jpg",
      offers: { "@type": "Offer", price: "24.00", priceCurrency: "USD" },
    });
  });
});
