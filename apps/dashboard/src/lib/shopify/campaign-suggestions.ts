import {
  markdownFieldValue,
  markdownSectionHasProvidedValues,
} from "@/lib/marketing-context";
import { MISSING_BRAND_BRAIN_CONTEXT } from "@/lib/marketing-context-prompt";
import type { AdPlatform, CampaignProduct } from "./ad-campaign";

/**
 * Deterministic Brand Brain suggestions for campaign brief fields.
 *
 * Deliberately not an LLM call: suggestions must never invent claims, so every
 * value is composed verbatim from saved Brand Brain answers and the selected
 * Shopify products. Anything the engine cannot ground returns null and the UI
 * says so instead of guessing.
 */

export const SUGGESTIBLE_CAMPAIGN_FIELDS = [
  "name",
  "objective",
  "audience",
  "valueProposition",
  "landingPageUrl",
] as const;

export type SuggestibleCampaignField =
  (typeof SUGGESTIBLE_CAMPAIGN_FIELDS)[number];

export type CampaignSuggestion = {
  field: SuggestibleCampaignField;
  value: string;
  reason: string;
  sources: string[];
};

export function isSuggestibleCampaignField(
  value: unknown,
): value is SuggestibleCampaignField {
  return (
    typeof value === "string" &&
    (SUGGESTIBLE_CAMPAIGN_FIELDS as readonly string[]).includes(value)
  );
}

export function isBrandBrainEmpty(brandMarkdown: string) {
  return brandMarkdown === MISSING_BRAND_BRAIN_CONTEXT;
}

function clip(value: string, maximum: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  const clipped = normalized.slice(0, Math.max(0, maximum - 1));
  const lastSpace = clipped.lastIndexOf(" ");
  const cut =
    lastSpace > maximum * 0.5 ? clipped.slice(0, lastSpace) : clipped;
  return `${cut.trim()}…`;
}

function firstSentence(value: string) {
  const line =
    value
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean)[0] ?? "";
  const match = line.match(/^(.+?[.!?…])(\s|$)/);
  return (match?.[1] ?? line).trim();
}

function field(
  brandMarkdown: string,
  heading: string,
  label: string,
) {
  return markdownFieldValue(brandMarkdown, heading, label);
}

const PLATFORM_NAMES: Record<AdPlatform, string> = {
  meta: "Meta",
  google: "Google Ads",
  tiktok: "TikTok",
};

function suggestName(
  products: CampaignProduct[],
  platform: AdPlatform,
  objective: string,
): CampaignSuggestion | null {
  const titles = products
    .map((product) => product.title.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!titles.length) return null;
  const headliner = titles.join(" + ");
  const tail = [PLATFORM_NAMES[platform], objective.trim()]
    .filter(Boolean)
    .join(" ");
  const value = clip(tail ? `${headliner} · ${tail}` : headliner, 120);
  return {
    field: "name",
    value,
    reason: `Built from your ${products.length} selected product${products.length === 1 ? "" : "s"} and ${PLATFORM_NAMES[platform]} settings.`,
    sources: ["Shopify catalog"],
  };
}

const OBJECTIVE_RULES: { objective: "Sales" | "Awareness" | "Traffic"; pattern: RegExp }[] = [
  { objective: "Sales", pattern: /\b(buy|buys|purchase|purchases|order|orders|checkout|revenue|sales?)\b/i },
  { objective: "Awareness", pattern: /(awar|brand|reach|follow|launch|impression)/i },
  { objective: "Traffic", pattern: /(sign\s?up|trial|demo|download|lead|traffic|visit|book|subscri|register)/i },
];

function suggestObjective(
  brandMarkdown: string,
): CampaignSuggestion | null {
  const goal = field(brandMarkdown, "Goals", "Primary business goal");
  const action = field(brandMarkdown, "Goals", "Key conversion action");
  const useCase = field(brandMarkdown, "Target audience", "Primary use case");
  const haystack = [goal, action, useCase].filter(Boolean).join("\n");
  if (!haystack) return null;
  const rule = OBJECTIVE_RULES.find((entry) => entry.pattern.test(haystack));
  if (!rule) return null;
  const sources = [
    goal ? "Primary business goal" : null,
    action ? "Key conversion action" : null,
    useCase ? "Primary use case" : null,
  ].filter((source): source is string => Boolean(source));
  return {
    field: "objective",
    value: rule.objective,
    reason: `Your Brand Brain goal language points to a ${rule.objective} objective.`,
    sources,
  };
}

function suggestAudience(
  brandMarkdown: string,
): CampaignSuggestion | null {
  const parts: { label: string; value: string }[] = [
    { label: "Decision-makers", value: field(brandMarkdown, "Target audience", "Decision-makers") },
    { label: "Target companies", value: field(brandMarkdown, "Target audience", "Target companies") },
    { label: "Primary use case", value: field(brandMarkdown, "Target audience", "Primary use case") },
  ]
    .map((part) => ({ label: part.label, value: firstSentence(part.value) }))
    .filter((part) => part.value);
  if (!parts.length) return null;
  return {
    field: "audience",
    value: clip(parts.map((part) => part.value).join(". "), 500),
    reason: "Composed from your Brand Brain audience profile.",
    sources: parts.map((part) => part.label),
  };
}

function suggestValueProposition(
  brandMarkdown: string,
): CampaignSuggestion | null {
  const whyChoose = firstSentence(
    field(brandMarkdown, "Differentiation", "Why customers choose you"),
  );
  const benefits = firstSentence(
    field(brandMarkdown, "Differentiation", "Why that is better"),
  );
  const differentiator = firstSentence(
    field(brandMarkdown, "Differentiation", "Key differentiators"),
  );
  const primary = whyChoose || benefits || differentiator;
  if (!primary) return null;
  const sources = [
    whyChoose ? "Why customers choose you" : null,
    !whyChoose && benefits ? "Why that is better" : null,
    !whyChoose && !benefits && differentiator ? "Key differentiators" : null,
  ].filter((source): source is string => Boolean(source));
  let value = primary;
  if ((whyChoose || benefits) && differentiator && differentiator !== primary) {
    value = `${primary} — ${differentiator}`;
    sources.push("Key differentiators");
  }
  return {
    field: "valueProposition",
    value: clip(value, 1000),
    reason: "Built from your Brand Brain differentiation.",
    sources,
  };
}

function httpsUrl(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function suggestLandingPageUrl(
  products: CampaignProduct[],
): CampaignSuggestion | null {
  for (const product of products) {
    const url = httpsUrl(product.onlineStoreUrl);
    if (url) {
      return {
        field: "landingPageUrl",
        value: clip(url, 2000),
        reason: `Store page of “${product.title}”, your first selected product.`,
        sources: ["Shopify catalog"],
      };
    }
  }
  return null;
}

export function suggestCampaignField(input: {
  field: SuggestibleCampaignField;
  brandMarkdown: string;
  platform: AdPlatform;
  objective: string;
  products: CampaignProduct[];
}): CampaignSuggestion | null {
  if (
    !markdownSectionHasProvidedValues(input.brandMarkdown, "Target audience") &&
    !markdownSectionHasProvidedValues(input.brandMarkdown, "Differentiation") &&
    !markdownSectionHasProvidedValues(input.brandMarkdown, "Goals") &&
    (input.field === "audience" ||
      input.field === "objective" ||
      input.field === "valueProposition")
  ) {
    return null;
  }
  switch (input.field) {
    case "name":
      return suggestName(input.products, input.platform, input.objective);
    case "objective":
      return suggestObjective(input.brandMarkdown);
    case "audience":
      return suggestAudience(input.brandMarkdown);
    case "valueProposition":
      return suggestValueProposition(input.brandMarkdown);
    case "landingPageUrl":
      return suggestLandingPageUrl(input.products);
  }
}
