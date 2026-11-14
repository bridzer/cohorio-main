import {
  markdownFieldValue,
  markdownSectionHasProvidedValues,
} from "../marketing-context";

export type ProductCroInput = {
  title: string;
  descriptionText: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  mediaCount: number;
  variantsCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  onlineStoreUrl: string | null;
  status: string;
  totalInventory: number;
  minimumPrice: number;
};

export type ProductCroRecommendation = {
  area:
    | "Value proposition"
    | "Headline"
    | "Visual proof"
    | "SEO"
    | "Merchandising"
    | "Purchase readiness";
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  pointsAvailable: number;
};

export type ProductCroAnalysis = {
  score: number;
  grade: "strong" | "fair" | "needs-work";
  recommendations: ProductCroRecommendation[];
  suggestions: ProductFixSuggestions;
};

/**
 * Concrete ready-to-adopt values for the fixable fields, generated
 * deterministically from product facts plus Brand Brain. Every suggestion is
 * something the merchant can accept as-is or edit: nothing is invented
 * (no prices, claims, or perks), and fields that cannot be derived honestly
 * (vendor, imagery) get no suggestion. Null means "no suggestion needed".
 */
export type ProductFixSuggestions = {
  seoTitle: string | null;
  seoDescription: string | null;
  /** A stronger product title, only when the current one is outside 20–70 chars. */
  title: string | null;
  /** A starter description, only when the current one is under 300 chars. */
  descriptionStarter: string | null;
  /** Tags to add (existing tags untouched), only when fewer than 3 are set. */
  tags: string[];
};

function priority(pointsAvailable: number) {
  if (pointsAvailable >= 7) return "high";
  if (pointsAvailable >= 4) return "medium";
  return "low";
}

const SUGGESTION_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "you",
  "our", "are", "was", "were", "has", "have", "will", "per", "new",
  "all", "any", "each", "more", "most", "only", "very", "can",
]);

function trimToWordBoundary(text: string, maxLength: number) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.lastIndexOf(" ", maxLength);
  return (cut > 0 ? trimmed.slice(0, cut) : trimmed.slice(0, maxLength)).trim();
}

function firstSentence(text: string) {
  const match = text.trim().match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : text).trim().replace(/\s+/g, " ");
}

function ensurePeriod(sentence: string) {
  const trimmed = sentence.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Distinctive lowercase keywords for tag and title building. */
function contentWords(text: string, minLength = 4): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < minLength || SUGGESTION_STOPWORDS.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    result.push(token);
  }
  return result;
}

type BrandFacts = { oneLiner: string; whatItDoes: string; category: string };

function brandFacts(brandContextMarkdown: string): BrandFacts {
  return {
    oneLiner: markdownFieldValue(brandContextMarkdown, "Product overview", "One-line description"),
    whatItDoes: markdownFieldValue(brandContextMarkdown, "Product overview", "What it does"),
    category: markdownFieldValue(brandContextMarkdown, "Product overview", "Product category"),
  };
}

function suggestSeoTitle(product: ProductCroInput, brand: BrandFacts): string | null {
  const current = product.seoTitle?.trim() ?? "";
  if (current.length >= 30 && current.length <= 60) return null;
  const title = product.title.trim();
  if (!title) return null;
  const qualifier = [product.vendor, product.productType].filter(Boolean).join(" ");
  const detail = qualifier || brand.category;
  if (detail) {
    const fitted = trimToWordBoundary(`${title} – ${detail}`, 60);
    if (fitted.length >= 30) return fitted;
  }
  const trimmed = trimToWordBoundary(title, 60);
  return trimmed.length >= 30 ? trimmed : null;
}

function suggestSeoDescription(product: ProductCroInput, brand: BrandFacts): string | null {
  const current = product.seoDescription?.trim() ?? "";
  if (current.length >= 120 && current.length <= 160) return null;
  const title = product.title.trim();
  if (!title) return null;
  const descriptionLead = firstSentence(product.descriptionText);
  const lead =
    descriptionLead.length >= 40
      ? descriptionLead
      : brand.oneLiner || `${title}${product.vendor ? ` by ${product.vendor}` : ""}.`;
  const tails: string[] = [];
  if (brand.oneLiner && lead !== brand.oneLiner) tails.push(ensurePeriod(brand.oneLiner));
  if (brand.whatItDoes) {
    const sentence = ensurePeriod(firstSentence(brand.whatItDoes));
    if (!lead.includes(sentence.slice(0, 24)) && !tails.includes(sentence)) tails.push(sentence);
  }
  if (brand.category) tails.push(`Shop ${brand.category}.`);
  tails.push("Shop now.");
  let composed = lead;
  for (const tail of tails) {
    if (`${composed} ${tail}`.length <= 160) {
      composed = `${composed} ${tail}`;
    }
  }
  composed = trimToWordBoundary(composed, 160);
  return composed.length >= 100 ? composed : null;
}

function suggestTitle(product: ProductCroInput, brand: BrandFacts): string | null {
  const title = product.title.trim();
  const titleLength = title.length;
  if (!title || (titleLength >= 20 && titleLength <= 70)) return null;
  if (titleLength > 70) return trimToWordBoundary(title, 70);
  const qualifier = product.productType || brand.category || product.vendor;
  if (!qualifier) return null;
  return trimToWordBoundary(`${title} – ${qualifier}`, 70);
}

function suggestDescriptionStarter(product: ProductCroInput, brand: BrandFacts): string | null {
  if (product.descriptionText.trim().length >= 300) return null;
  const title = product.title.trim();
  if (!title) return null;
  const sentences: string[] = [];
  if (brand.oneLiner) sentences.push(ensurePeriod(brand.oneLiner));
  const existingLead = firstSentence(product.descriptionText);
  if (existingLead && !sentences.includes(ensurePeriod(existingLead))) {
    sentences.push(ensurePeriod(existingLead));
  }
  if (!existingLead && brand.whatItDoes) {
    sentences.push(ensurePeriod(firstSentence(brand.whatItDoes)));
  }
  if (!sentences.length) {
    const qualifier = [product.vendor, product.productType].filter(Boolean).join(" ");
    sentences.push(`${title}${qualifier ? ` – ${qualifier}` : ""}.`);
  }
  return trimToWordBoundary(sentences.join(" "), 600);
}

function suggestTags(product: ProductCroInput, brand: BrandFacts): string[] {
  if (product.tags.length >= 3) return [];
  const existing = new Set(product.tags.map((tag) => tag.toLowerCase()));
  const candidates = [
    product.productType ?? "",
    product.vendor ?? "",
    ...brand.category.split(/[^A-Za-z0-9]+/),
    ...contentWords(product.title),
  ];
  const picks: string[] = [];
  for (const raw of candidates) {
    const tag = raw.toLowerCase().trim();
    if (!tag || tag.length < 2 || tag.length > 30 || /^\d+$/.test(tag)) continue;
    if (existing.has(tag)) continue;
    existing.add(tag);
    picks.push(tag);
    if (product.tags.length + picks.length >= 3) break;
  }
  return picks;
}

export function suggestProductFixes(
  product: ProductCroInput,
  brandContextMarkdown = "",
): ProductFixSuggestions {
  const brand = brandFacts(brandContextMarkdown);
  return {
    seoTitle: suggestSeoTitle(product, brand),
    seoDescription: suggestSeoDescription(product, brand),
    title: suggestTitle(product, brand),
    descriptionStarter: suggestDescriptionStarter(product, brand),
    tags: suggestTags(product, brand),
  };
}

function sharesTwelveCharacterWindow(description: string, oneLiner: string) {
  const haystack = description.toLowerCase();
  const needle = oneLiner.toLowerCase();
  if (needle.length < 12) return false;
  for (let index = 0; index <= needle.length - 12; index += 1) {
    if (haystack.includes(needle.slice(index, index + 12))) return true;
  }
  return false;
}

export function analyzeProductCro(
  product: ProductCroInput,
  brandContextMarkdown = "",
): ProductCroAnalysis {
  let score = 0;
  const recommendations: ProductCroRecommendation[] = [];
  const addRecommendation = (
    recommendation: Omit<ProductCroRecommendation, "priority">,
  ) => {
    recommendations.push({
      ...recommendation,
      priority: priority(recommendation.pointsAvailable),
    });
  };

  const descriptionLength = product.descriptionText.trim().length;
  if (descriptionLength >= 300) {
    score += 25;
  } else if (descriptionLength >= 150) {
    score += 18;
    addRecommendation({
      area: "Value proposition",
      title: "Add proof and objection handling",
      detail:
        "Expand the description with concrete outcomes, use cases, proof, and answers to likely purchase objections.",
      pointsAvailable: 7,
    });
  } else if (descriptionLength >= 60) {
    score += 10;
    addRecommendation({
      area: "Value proposition",
      title: "Strengthen the product story",
      detail:
        "Lead with the customer outcome, then explain differentiators, specifications, and who the product is for.",
      pointsAvailable: 15,
    });
  } else {
    score += descriptionLength > 0 ? 5 : 0;
    addRecommendation({
      area: "Value proposition",
      title: "Write a benefit-led product description",
      detail:
        "The page needs enough specific copy for shoppers to understand the outcome, differentiators, and buying fit.",
      pointsAvailable: descriptionLength > 0 ? 20 : 25,
    });
  }

  const titleLength = product.title.trim().length;
  if (titleLength >= 20 && titleLength <= 70) {
    score += 15;
  } else if (titleLength >= 10 && titleLength <= 90) {
    score += 10;
    addRecommendation({
      area: "Headline",
      title: "Make the product title more specific",
      detail:
        "Use a clear product type plus the most meaningful differentiator while keeping the title easy to scan.",
      pointsAvailable: 5,
    });
  } else {
    score += 5;
    addRecommendation({
      area: "Headline",
      title: "Rewrite the product title",
      detail:
        "Keep the title concise and descriptive so shoppers immediately know what the product is.",
      pointsAvailable: 10,
    });
  }

  if (product.mediaCount >= 5) {
    score += 15;
  } else if (product.mediaCount >= 3) {
    score += 11;
    addRecommendation({
      area: "Visual proof",
      title: "Add more product-in-context media",
      detail:
        "Add close-ups, scale references, and an in-use image or video to reduce uncertainty.",
      pointsAvailable: 4,
    });
  } else if (product.mediaCount >= 1) {
    score += 6;
    addRecommendation({
      area: "Visual proof",
      title: "Build a complete product gallery",
      detail:
        "Use at least five useful assets covering multiple angles, details, scale, and real-world use.",
      pointsAvailable: 9,
    });
  } else {
    addRecommendation({
      area: "Visual proof",
      title: "Add product imagery",
      detail:
        "A product page without media cannot establish quality, context, or purchase confidence.",
      pointsAvailable: 15,
    });
  }

  const seoTitleLength = product.seoTitle?.trim().length ?? 0;
  const seoDescriptionLength = product.seoDescription?.trim().length ?? 0;
  score +=
    seoTitleLength >= 30 && seoTitleLength <= 60
      ? 7
      : seoTitleLength > 0
        ? 3
        : 0;
  score +=
    seoDescriptionLength >= 120 && seoDescriptionLength <= 160
      ? 8
      : seoDescriptionLength > 0
        ? 4
        : 0;
  if (
    !(seoTitleLength >= 30 && seoTitleLength <= 60) ||
    !(seoDescriptionLength >= 120 && seoDescriptionLength <= 160)
  ) {
    addRecommendation({
      area: "SEO",
      title: "Complete the search preview",
      detail:
        "Use a 30–60 character SEO title and a 120–160 character description focused on search intent and value.",
      pointsAvailable:
        (seoTitleLength >= 30 && seoTitleLength <= 60 ? 0 : 7) +
        (seoDescriptionLength >= 120 && seoDescriptionLength <= 160 ? 0 : 8),
    });
  }

  if (product.vendor) score += 3;
  if (product.productType) score += 3;
  if (product.tags.length >= 3) score += 4;
  if (product.variantsCount > 0) score += 3;
  if (product.onlineStoreUrl) score += 2;
  const merchandisingGap =
    (product.vendor ? 0 : 3) +
    (product.productType ? 0 : 3) +
    (product.tags.length >= 3 ? 0 : 4) +
    (product.variantsCount > 0 ? 0 : 3) +
    (product.onlineStoreUrl ? 0 : 2);
  if (merchandisingGap > 0) {
    addRecommendation({
      area: "Merchandising",
      title: "Complete product organization",
      detail:
        "Add the missing vendor, product type, useful tags, variants, and online-store publication details.",
      pointsAvailable: merchandisingGap,
    });
  }

  if (product.status === "ACTIVE") score += 5;
  if (product.minimumPrice > 0) score += 5;
  if (product.totalInventory > 0) score += 5;
  const readinessGap =
    (product.status === "ACTIVE" ? 0 : 5) +
    (product.minimumPrice > 0 ? 0 : 5) +
    (product.totalInventory > 0 ? 0 : 5);
  if (readinessGap > 0) {
    addRecommendation({
      area: "Purchase readiness",
      title: "Resolve purchase blockers",
      detail:
        "Verify publication status, a valid selling price, and inventory availability before sending traffic.",
      pointsAvailable: readinessGap,
    });
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  const rankedRecommendations = recommendations
    .sort((left, right) => right.pointsAvailable - left.pointsAvailable)
    .slice(0, 6);

  const oneLiner = markdownFieldValue(
    brandContextMarkdown,
    "Product overview",
    "One-line description",
  );
  const hasVoice = markdownSectionHasProvidedValues(
    brandContextMarkdown,
    "Brand voice",
  );
  if (
    (oneLiner || hasVoice) &&
    !sharesTwelveCharacterWindow(product.descriptionText, oneLiner)
  ) {
    rankedRecommendations.push({
      area: "Value proposition",
      title: "Reflect Brand Brain on the product page",
      detail: oneLiner
        ? `The live description does not share the Brand Brain one-liner. Lead with "${oneLiner}" so shoppers and generated campaigns hear the same offer.`
        : "The product page does not yet reflect the Brand Brain voice. Rewrite the description so it matches how the brand should sound.",
      pointsAvailable: 8,
      priority: "high",
    });
  }

  return {
    score: normalizedScore,
    grade:
      normalizedScore >= 80
        ? "strong"
        : normalizedScore >= 60
          ? "fair"
          : "needs-work",
    recommendations: rankedRecommendations,
    suggestions: suggestProductFixes(product, brandContextMarkdown),
  };
}
