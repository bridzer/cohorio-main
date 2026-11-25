/**
 * Deterministic website classification (Milestone 2, Path A import).
 *
 * Heuristic only: platform fingerprints and commerce signals matched against
 * fetched HTML. No LLM, no fabrication — anything unmatched reports
 * "unknown" with low confidence, and every claim carries its signals.
 */

export type StorePlatform =
  | "shopify"
  | "woocommerce"
  | "wix"
  | "squarespace"
  | "webflow"
  | "bigcommerce"
  | "magento"
  | "custom"
  | "unknown";

export type BusinessModel =
  | "shopify-store"
  | "ecommerce"
  | "standalone"
  | "unknown";

export type Classification = {
  platform: StorePlatform;
  businessModel: BusinessModel;
  confidence: "high" | "medium" | "low";
  signals: string[];
};

const PLATFORM_MARKERS: { platform: StorePlatform; markers: string[] }[] = [
  {
    platform: "shopify",
    markers: ["cdn.shopify.com", "myshopify.com", "shopify.shop", "__shopify", "shopify-section"],
  },
  {
    platform: "woocommerce",
    markers: ["woocommerce", "wp-content/uploads", "/wp-json/wc/", "wc-blocks"],
  },
  { platform: "wix", markers: ["wix.com", "wixstatic.com", "wix-code", "wixapps"] },
  {
    platform: "squarespace",
    markers: ["squarespace", "static1.squarespace", "squarespace-cdn"],
  },
  { platform: "webflow", markers: ["webflow", "w-webflow", "webflow.io"] },
  {
    platform: "bigcommerce",
    markers: ["bigcommerce", "cdn11.bigcommerce", "bigcommerce.com"],
  },
  { platform: "magento", markers: ["magento", "static/version", "mage/cookies"] },
];

const CART_MARKERS = [
  "add-to-cart",
  "add_to_bag",
  "/cart",
  "checkout",
  "products.json",
  "mini-cart",
];

export function classifyWebsite(input: { url: string; html: string }): Classification {
  const signals: string[] = [];
  let hostname = "";
  try {
    hostname = new URL(input.url).hostname.toLowerCase();
  } catch {
    return { platform: "unknown", businessModel: "unknown", confidence: "low", signals: [] };
  }
  const html = input.html.toLowerCase();

  if (hostname.endsWith(".myshopify.com") || hostname === "myshopify.com") {
    signals.push("myshopify.com domain");
    return { platform: "shopify", businessModel: "shopify-store", confidence: "high", signals };
  }

  let platform: StorePlatform = "unknown";
  let platformHits = 0;
  for (const entry of PLATFORM_MARKERS) {
    const hits = entry.markers.filter((marker) => html.includes(marker));
    if (hits.length > platformHits) {
      platform = entry.platform;
      platformHits = hits.length;
      signals.push(`${entry.platform} markers: ${hits.slice(0, 3).join(", ")}`);
    }
  }

  const cartHits = CART_MARKERS.filter((marker) => html.includes(marker));
  if (cartHits.length) signals.push(`commerce signals: ${cartHits.slice(0, 3).join(", ")}`);

  if (platform === "shopify") {
    return { platform, businessModel: "shopify-store", confidence: "high", signals };
  }
  if (platform !== "unknown" && cartHits.length) {
    return {
      platform,
      businessModel: "ecommerce",
      confidence: platformHits >= 2 ? "high" : "medium",
      signals,
    };
  }
  if (platform !== "unknown") {
    return { platform, businessModel: "standalone", confidence: "medium", signals };
  }
  if (cartHits.length) {
    return { platform: "custom", businessModel: "ecommerce", confidence: "medium", signals };
  }
  return { platform: "unknown", businessModel: "unknown", confidence: "low", signals };
}
