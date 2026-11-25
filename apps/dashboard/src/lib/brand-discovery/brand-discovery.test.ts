import { describe, expect, it } from "vitest";
import { classifyWebsite } from "./classify";
import { extractWebsiteFacts } from "./extract";
import { ASSET_MAX_BYTES, csvToText, sniffMime } from "./assets";

describe("classifyWebsite", () => {
  it("recognizes a Shopify storefront with high confidence", () => {
    const result = classifyWebsite({
      url: "https://acme.myshopify.com",
      html: "<html><head></head><body>shop</body></html>",
    });
    expect(result).toEqual({
      platform: "shopify",
      businessModel: "shopify-store",
      confidence: "high",
      signals: ["myshopify.com domain"],
    });
  });

  it("detects Shopify and commerce signals in custom-domain HTML", () => {
    const result = classifyWebsite({
      url: "https://acme.com",
      html: '<script src="https://cdn.shopify.com/x.js"></script><a href="/cart">Cart</a><button>add-to-cart</button>',
    });
    expect(result.platform).toBe("shopify");
    expect(result.businessModel).toBe("shopify-store");
    expect(result.confidence).toBe("high");
  });

  it("detects WooCommerce with cart signals", () => {
    const result = classifyWebsite({
      url: "https://shop.example.com",
      html: '<link href="/wp-content/uploads/a.css"><div class="add-to-cart">Buy</div>',
    });
    expect(result.platform).toBe("woocommerce");
    expect(result.businessModel).toBe("ecommerce");
  });

  it("labels cart-only sites custom and quiet sites unknown", () => {
    expect(
      classifyWebsite({ url: "https://x.com", html: '<a href="/cart">c</a>' }),
    ).toMatchObject({ platform: "custom", businessModel: "ecommerce" });
    expect(
      classifyWebsite({ url: "https://blog.example.com", html: "<p>Hello world</p>" }),
    ).toMatchObject({ platform: "unknown", businessModel: "unknown", confidence: "low" });
  });

  it("rejects invalid URLs without throwing", () => {
    expect(classifyWebsite({ url: "not a url", html: "" }).platform).toBe("unknown");
  });
});

describe("extractWebsiteFacts", () => {
  const html = `
    <html><head><title>Acme &amp; Co</title>
    <meta name="description" content="Handmade goods.">
    <meta name="generator" content="Shopify">
    </head><body>
    <h1>Welcome to Acme</h1><h2>Our story</h2>
    <a href="mailto:hello@acme.com">mail</a>
    <a href="tel:+14155552671">call</a>
    <a href="https://www.instagram.com/acme">ig</a>
    <a href="https://facebook.com/acme">fb</a>
    </body></html>`;

  it("quotes page content without inventing any", () => {
    const facts = extractWebsiteFacts(html);
    expect(facts.title).toBe("Acme & Co");
    expect(facts.description).toBe("Handmade goods.");
    expect(facts.generator).toBe("Shopify");
    expect(facts.headings).toEqual(["Welcome to Acme", "Our story"]);
    expect(facts.emails).toEqual(["hello@acme.com"]);
    expect(facts.phones).toEqual(["+14155552671"]);
    expect(facts.socials).toEqual([
      { network: "Instagram", url: "https://www.instagram.com/acme" },
      { network: "Facebook", url: "https://facebook.com/acme" },
    ]);
  });

  it("returns nulls and empty lists for bare pages", () => {
    expect(extractWebsiteFacts("<html></html>")).toEqual({
      title: null,
      description: null,
      generator: null,
      headings: [],
      emails: [],
      phones: [],
      socials: [],
    });
  });
});

describe("asset validation and extraction", () => {
  it("sniffs magic bytes against the claimed extension", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(sniffMime(pdf, "brand.pdf")).toBe("application/pdf");
    expect(sniffMime(pdf, "brand.png")).toBeNull();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffMime(png, "logo.png")).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("a,b\n1,2"), "data.csv")).toBe("text/csv");
    expect(sniffMime(new Uint8Array([0x41, 0x00, 0x42]), "evil.txt")).toBeNull();
    expect(sniffMime(new Uint8Array([0x41]), "evil.exe")).toBeNull();
  });

  it("flattens quoted CSV into readable lines with a row count", () => {
    const { text, rowCount } = csvToText(
      'name,price,desc\n"Everyday, Tote",48,"sturdy, roomy"\nPouch,24,compact',
    );
    expect(rowCount).toBe(2);
    expect(text).toContain("name: Everyday, Tote | price: 48");
    expect(text).toContain("name: Pouch");
  });

  it("caps uploads at eight megabytes", () => {
    expect(ASSET_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
});
