import {
  markdownFieldValue,
  markdownSectionHasProvidedValues,
} from "../marketing-context";

export const SOCIAL_PLATFORMS = ["LinkedIn", "X", "Instagram"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  LinkedIn: 3000,
  X: 280,
  Instagram: 2200,
};

export function isSocialPlatform(value: string): value is SocialPlatform {
  return SOCIAL_PLATFORMS.includes(value as SocialPlatform);
}

export function socialGenerationPrompt(input: {
  source: string;
  platform: SocialPlatform;
  brandContextMarkdown: string;
  tone?: string;
}) {
  const voice = input.tone?.trim();
  return [
    input.brandContextMarkdown,
    "",
    `Platform: ${input.platform}`,
    voice ? `Voice: ${voice}` : null,
    "",
    "Source:",
    input.source.trim(),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function fit(value: string, maximum: number) {
  const normalized = value.replace(/\s+\n/g, "\n").trim();
  if (normalized.length <= maximum) return normalized;
  const clipped = normalized.slice(0, Math.max(0, maximum - 1));
  const lastBreak = Math.max(clipped.lastIndexOf("\n"), clipped.lastIndexOf(" "));
  return `${clipped.slice(0, lastBreak > maximum * 0.55 ? lastBreak : undefined).trim()}…`;
}

function brandCue(markdown: string) {
  return markdownFieldValue(markdown, "Product overview", "One-line description");
}

function renderTemplate(
  platform: SocialPlatform,
  source: string,
  brandContextMarkdown: string,
  tone?: string,
) {
  const idea = source.trim().replace(/[.!?]+$/, "");
  const oneLiner = brandCue(brandContextMarkdown);
  const hasVoice = markdownSectionHasProvidedValues(
    brandContextMarkdown,
    "Brand voice",
  );
  const groundingLine = oneLiner
    ? `This stays true to the Brand Brain one-liner: ${oneLiner}`
    : hasVoice
      ? "Keep the Brand Brain voice intact while adapting the format."
      : "";
  const voiceLine = tone?.trim() ? `Voice: ${tone.trim()}.` : "";

  if (platform === "LinkedIn") {
    return [
      `${idea}.`,
      "",
      groundingLine,
      groundingLine ? "" : null,
      "A strong content system does not ask you to create more. It helps you extract more value from what you already know.",
      "",
      "Start with one clear idea. Adapt the format—not the truth behind it.",
      "",
      voiceLine,
      "What’s one idea your team should be known for?",
    ]
      .filter((line) => line !== null)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  if (platform === "X") {
    return [
      `${idea}.`,
      groundingLine,
      "1. Start with one clear idea",
      "2. Adapt it to the platform",
      "3. Keep the insight intact",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `${idea}. ✦`,
    "",
    groundingLine,
    groundingLine ? "" : null,
    "One idea can become a full week of content when you adapt the format without watering down the insight.",
    "",
    voiceLine,
    "Save this for your next content batch.",
    "",
    "#contentstrategy #marketingtips #brandbuilding",
  ]
    .filter((line) => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function generateSocialPosts(input: {
  source: string;
  platforms: SocialPlatform[];
  brandContextMarkdown: string;
  tone?: string;
}) {
  const posts: Partial<Record<SocialPlatform, string>> = {};
  for (const platform of [...new Set(input.platforms)]) {
    const prompt = socialGenerationPrompt({
      source: input.source,
      platform,
      brandContextMarkdown: input.brandContextMarkdown,
      tone: input.tone,
    });
    const source = prompt.split("\nSource:\n").at(-1) ?? input.source;
    posts[platform] = fit(
      renderTemplate(platform, source, input.brandContextMarkdown, input.tone),
      PLATFORM_LIMITS[platform],
    );
  }
  return posts;
}
