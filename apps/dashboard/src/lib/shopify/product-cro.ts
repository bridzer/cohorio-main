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
};

function priority(pointsAvailable: number) {
  if (pointsAvailable >= 7) return "high";
  if (pointsAvailable >= 4) return "medium";
  return "low";
}

export function analyzeProductCro(
  product: ProductCroInput,
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
  return {
    score: normalizedScore,
    grade:
      normalizedScore >= 80
        ? "strong"
        : normalizedScore >= 60
          ? "fair"
          : "needs-work",
    recommendations: recommendations
      .sort((left, right) => right.pointsAvailable - left.pointsAvailable)
      .slice(0, 6),
  };
}
