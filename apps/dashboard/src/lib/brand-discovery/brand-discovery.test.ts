import { describe, expect, it, vi } from "vitest";
import { classifyWebsite } from "./classify";
import {
  detectMarketingChannels,
  extractInternalLinks,
  extractSeoSignals,
  extractWebsiteFacts,
} from "./extract";
import { ASSET_MAX_BYTES, csvToText, sniffMime } from "./assets";
import { crawlWebsiteForBrand } from "./crawl";
import { synthesizeWebsiteBrandIntelligence } from "./intelligence";
import { PublicUrlError } from "@/lib/http/public-url";

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

describe("SEO, internal links, and channel extraction", () => {
  it("flags concrete on-page SEO opportunities and detects marketing channels", () => {
    const html = `
      <html><head><title>Hi</title></head><body>
      <p>Short copy.</p>
      <a href="/about">About</a>
      <a href="/pricing">Pricing</a>
      <a href="/cart">Cart</a>
      <a href="https://evil.example/about">External</a>
      <script src="https://www.googletagmanager.com/gtag/js"></script>
      <script>fbq('init', '123');</script>
      </body></html>
    `;
    const facts = extractWebsiteFacts(html);
    const seo = extractSeoSignals(html);
    expect(seo.hasDescription).toBe(false);
    expect(seo.h1Count).toBe(0);
    expect(seo.hasCanonical).toBe(false);
    expect(seo.hasStructuredData).toBe(false);
    expect(seo.opportunities.length).toBeGreaterThanOrEqual(5);
    expect(extractInternalLinks(html, "https://acme.com")).toEqual([
      "https://acme.com/about",
      "https://acme.com/pricing",
    ]);
    expect(detectMarketingChannels(html, facts)).toEqual(
      expect.arrayContaining(["Google Analytics / Tag Manager", "Meta Pixel"]),
    );
  });
});

describe("crawlWebsiteForBrand and intelligence synthesis", () => {
  it("retries transient fetch errors, crawls internal pages, and never follows SSRF URLs", async () => {
    let homeAttempts = 0;
    const fetchHtml = vi.fn(async (target: string) => {
      if (target === "https://acme.com") {
        homeAttempts += 1;
        if (homeAttempts === 1) throw new Error("That page returned HTTP 503.");
        return {
          finalUrl: "https://acme.com",
          html: `<html><head><title>Acme Coffee Roasters</title>
            <meta name="description" content="Small-batch specialty coffee delivered fresh to your door every week.">
            </head><body><h1>Fresh coffee roasted daily</h1>
            <a href="/about">About us</a><a href="/products">Products</a>
            <script src="https://cdn.shopify.com/shop.js"></script></body></html>`,
        };
      }
      if (target.endsWith("/about")) {
        return {
          finalUrl: "https://acme.com/about",
          html: "<html><head><title>About Acme</title></head><body><h1>Our Story</h1><p>Direct trade beans.</p></body></html>",
        };
      }
      throw new Error("That page returned HTTP 404.");
    });

    const crawl = await crawlWebsiteForBrand("https://acme.com", {
      fetchHtml,
      backoffMs: 0,
    });
    expect(homeAttempts).toBe(2);
    expect(crawl.classification.platform).toBe("shopify");
    expect(crawl.pages.length).toBe(2);
    expect(crawl.crawlNotes.some((note) => note.includes("/products"))).toBe(true);

    await expect(
      crawlWebsiteForBrand("http://127.0.0.1", {
        fetchHtml: async () => {
          throw new PublicUrlError();
        },
        backoffMs: 0,
      }),
    ).rejects.toBeInstanceOf(PublicUrlError);
  });

  it("synthesizes structured intelligence and falls back safely on bad LLM output", async () => {
    const crawl = await crawlWebsiteForBrand("https://acme.com", {
      fetchHtml: async () => ({
        finalUrl: "https://acme.com",
        html: `<html><head><title>Acme</title><meta name="description" content="Handmade ceramic mugs."></head>
          <body><h1>Acme Mugs</h1><script src="https://cdn.shopify.com/s.js"></script></body></html>`,
      }),
      backoffMs: 0,
    });

    const fallback = await synthesizeWebsiteBrandIntelligence({
      businessName: "Acme",
      crawl,
      chatImpl: async () => "not-json",
    });
    expect(fallback.usedLlm).toBe(false);
    expect(fallback.inferredBusinessModel).toContain("Shopify");
    expect(fallback.competitors).toEqual([]);

    const llmChat = vi.fn<
      (messages: { role: string; content: string }[]) => Promise<string>
    >(async () =>
      JSON.stringify({
        industry: "Home & Kitchen",
        inferredBusinessModel: "DTC e-commerce",
        productsServices: ["Ceramic mugs"],
        messaging: ["Handmade ceramic mugs."],
        targetAudiences: ["Specialty coffee drinkers"],
        positioning: "Artisanal everyday drinkware",
        voiceCharacteristics: ["Warm", "Craft-focused"],
        competitors: [],
        missingInfo: ["Pricing tiers not listed"],
        intelligenceSummary: "Acme sells handmade ceramic mugs via Shopify.",
      }),
    );
    const enriched = await synthesizeWebsiteBrandIntelligence({
      businessName: "Acme",
      crawl,
      chatImpl: llmChat,
    });
    expect(enriched.usedLlm).toBe(true);
    expect(enriched.industry).toBe("Home & Kitchen");
    expect(enriched.productsServices).toEqual(["Ceramic mugs"]);
    // Ensure website text is always placed in user role data, never system prompt.
    const sentMessages = llmChat.mock.calls[0]?.[0] ?? [];
    expect(sentMessages[0]?.role).toBe("system");
    expect(sentMessages[0]?.content).not.toContain("Handmade ceramic mugs.");
    expect(sentMessages[1]?.role).toBe("user");
  });
});
