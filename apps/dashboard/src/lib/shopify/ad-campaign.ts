export type AdPlatform = "meta" | "google" | "tiktok";

export type CampaignProduct = {
  id: string;
  title: string;
  productType: string | null;
  minimumPrice: number;
  currencyCode: string | null;
  onlineStoreUrl: string | null;
  imageUrl: string | null;
  descriptionText: string;
};

export type CampaignBrief = {
  name: string;
  platform: AdPlatform;
  objective: string;
  dailyBudget: number;
  currencyCode: string;
  audience: string;
  valueProposition: string;
  offer: string | null;
  landingPageUrl: string | null;
};

export type CampaignCreative = {
  id: string;
  productId: string;
  productTitle: string;
  angle: "product" | "audience" | "offer";
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  landingPageUrl: string | null;
  imageUrl: string | null;
  visualBrief: string;
  limits: {
    headline: number;
    primaryText: number;
    description: number;
  };
  grounding: string[];
};

export type CampaignStrategy = {
  summary: string;
  structure: string[];
  budgetPlan: {
    testing: number;
    scaling: number;
    note: string;
  };
  testingPlan: string[];
  launchChecklist: string[];
};

export type GeneratedCampaign = {
  strategy: CampaignStrategy;
  creatives: CampaignCreative[];
};

const LIMITS: Record<
  AdPlatform,
  CampaignCreative["limits"] & { cta: string }
> = {
  meta: {
    headline: 40,
    primaryText: 125,
    description: 30,
    cta: "Shop Now",
  },
  google: {
    headline: 30,
    primaryText: 90,
    description: 90,
    cta: "Shop Now",
  },
  tiktok: {
    headline: 40,
    primaryText: 80,
    description: 100,
    cta: "Shop Now",
  },
};

function fit(value: string, maximum: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  const clipped = normalized.slice(0, Math.max(0, maximum - 1));
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > maximum * 0.55 ? lastSpace : undefined).trim()}…`;
}

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function landingPage(product: CampaignProduct, brief: CampaignBrief) {
  return brief.landingPageUrl || product.onlineStoreUrl;
}

function creativeFor(
  product: CampaignProduct,
  brief: CampaignBrief,
  angle: CampaignCreative["angle"],
  index: number,
): CampaignCreative {
  const limits = LIMITS[brief.platform];
  const offer = brief.offer?.trim() || null;
  const price =
    product.minimumPrice > 0
      ? `From ${money(product.minimumPrice, product.currencyCode || brief.currencyCode)}.`
      : "";
  const angleCopy = {
    product: {
      headline: product.title,
      primary: `${product.title}: ${brief.valueProposition}. ${price}`,
      description: offer || `Explore ${product.title}`,
    },
    audience: {
      headline: `${product.title} for ${brief.audience}`,
      primary: `For ${brief.audience}: ${brief.valueProposition}. Meet ${product.title}.`,
      description: offer || "See what makes it different",
    },
    offer: {
      headline: offer || `Shop ${product.title}`,
      primary: offer
        ? `${offer}. ${brief.valueProposition}. Shop ${product.title}.`
        : `${brief.valueProposition}. Shop ${product.title} today.`,
      description: offer || price || "Shop the collection",
    },
  }[angle];
  const platformDirection = {
    meta:
      "Use the Shopify product image in a native square feed layout with one clear benefit overlay.",
    google:
      "Use a clean product-first asset on a neutral background, preserving accurate product details.",
    tiktok:
      "Open with the product in use during the first three seconds, then demonstrate the core benefit with captions.",
  }[brief.platform];

  return {
    id: `${brief.platform}-${index + 1}-${angle}`,
    productId: product.id,
    productTitle: product.title,
    angle,
    headline: fit(angleCopy.headline, limits.headline),
    primaryText: fit(angleCopy.primary, limits.primaryText),
    description: fit(angleCopy.description, limits.description),
    cta: limits.cta,
    landingPageUrl: landingPage(product, brief),
    imageUrl: product.imageUrl,
    visualBrief: `${platformDirection} Keep all claims grounded in the product page and campaign brief.`,
    limits: {
      headline: limits.headline,
      primaryText: limits.primaryText,
      description: limits.description,
    },
    grounding: [
      `Shopify product: ${product.title}`,
      `Merchant value proposition: ${brief.valueProposition}`,
      ...(offer ? [`Merchant offer: ${offer}`] : []),
      `Merchant audience: ${brief.audience}`,
    ],
  };
}

export function generateAdCampaign(
  brief: CampaignBrief,
  products: CampaignProduct[],
): GeneratedCampaign {
  const creatives = products.flatMap((product, productIndex) =>
    (["product", "audience", "offer"] as const).map((angle, angleIndex) =>
      creativeFor(product, brief, angle, productIndex * 3 + angleIndex),
    ),
  );
  const testingBudget = Math.round(brief.dailyBudget * 0.3 * 100) / 100;
  const scalingBudget =
    Math.round((brief.dailyBudget - testingBudget) * 100) / 100;
  const platformName = {
    meta: "Meta",
    google: "Google Ads",
    tiktok: "TikTok",
  }[brief.platform];

  return {
    strategy: {
      summary: `${platformName} ${brief.objective.toLowerCase()} campaign for ${brief.audience}, grounded in ${products.length} selected Shopify product${products.length === 1 ? "" : "s"}.`,
      structure: [
        `One ${brief.objective.toLowerCase()} campaign`,
        `${products.length} product-led ad group${products.length === 1 ? "" : "s"}`,
        "Three distinct creative angles per product",
        "Exclude recent purchasers where platform data allows",
      ],
      budgetPlan: {
        testing: testingBudget,
        scaling: scalingBudget,
        note:
          "Reserve 30% for creative tests and 70% for the strongest product/angle combinations. Reallocate only after meaningful conversion volume.",
      },
      testingPlan: [
        "Test product, audience, and offer angles without changing targeting at the same time.",
        "Allow enough impressions before judging click-through performance.",
        "Evaluate downstream purchase conversion and contribution margin, not clicks alone.",
      ],
      launchChecklist: [
        "Conversion tracking tested with a real purchase event",
        "Landing pages load quickly on mobile",
        "UTM parameters added to every destination URL",
        "Offer and product availability verified",
        "Creative claims reviewed against source product data",
      ],
    },
    creatives,
  };
}
