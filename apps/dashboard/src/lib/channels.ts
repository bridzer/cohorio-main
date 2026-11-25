/**
 * Marketing channel directory + explainable recommendations (Milestone 4).
 * Client-safe: pure data and deterministic rules, no server imports.
 *
 * Channels are things businesses DO (Facebook, SEO, newsletters); providers
 * are Cohorio connectors (meta-ads, klaviyo, …). Each channel maps to the
 * provider ids that serve it — empty means no connector yet, which the UI
 * reports as a future opportunity rather than faking a connection.
 */

export const CHANNEL_GROUPS = [
  { id: "social", label: "Social media" },
  { id: "search", label: "Search & SEO" },
  { id: "content", label: "Content marketing" },
  { id: "email", label: "Email & messaging" },
  { id: "ecommerce", label: "E-commerce & marketplaces" },
  { id: "paid", label: "Paid advertising" },
  { id: "analytics", label: "Analytics & conversion" },
] as const;

export type ChannelGroupId = (typeof CHANNEL_GROUPS)[number]["id"];

export type MarketingChannel = {
  id: string;
  label: string;
  blurb: string;
  group: ChannelGroupId;
  /** Connector provider ids; [] = no Cohorio connector yet. */
  providers: string[];
  /** Where the connect action goes when it is not /connections. */
  connectHref?: string;
};

export const MARKETING_CHANNELS: MarketingChannel[] = [
  // Social
  { id: "facebook", label: "Facebook", blurb: "Organic page posts and community.", group: "social", providers: ["meta-ads"] },
  { id: "instagram", label: "Instagram", blurb: "Feed, stories, and reels.", group: "social", providers: ["meta-ads"] },
  { id: "tiktok", label: "TikTok", blurb: "Short-form video and trends.", group: "social", providers: ["tiktok-ads"] },
  { id: "linkedin", label: "LinkedIn", blurb: "B2B presence and thought leadership.", group: "social", providers: ["linkedin-ads"] },
  { id: "x", label: "X", blurb: "Real-time posts and conversation.", group: "social", providers: [] },
  { id: "pinterest", label: "Pinterest", blurb: "Visual discovery and shopping ideas.", group: "social", providers: [] },
  { id: "youtube", label: "YouTube", blurb: "Long-form video and search presence.", group: "social", providers: [] },
  { id: "snapchat", label: "Snapchat", blurb: "Ephemeral stories and young audiences.", group: "social", providers: [] },
  // Search & SEO
  { id: "google-search", label: "Google Search", blurb: "Rank for what buyers search.", group: "search", providers: ["dataforseo"] },
  { id: "google-business", label: "Google Business Profile", blurb: "Local listings, reviews, and maps.", group: "search", providers: [] },
  { id: "search-console", label: "Search Console", blurb: "Queries, clicks, and indexing health.", group: "search", providers: [] },
  { id: "google-ads-search", label: "Google Ads", blurb: "Paid search and shopping.", group: "search", providers: ["google-ads"] },
  { id: "bing", label: "Bing / Microsoft", blurb: "Secondary search engine coverage.", group: "search", providers: ["dataforseo"] },
  // Content
  { id: "blog", label: "Website / blog", blurb: "Owned articles and landing pages.", group: "content", providers: [] },
  { id: "newsletter", label: "Email newsletter", blurb: "Recurring owned-audience content.", group: "content", providers: ["mailchimp", "klaviyo", "brevo"] },
  { id: "video", label: "Video marketing", blurb: "Demos, explainers, and testimonials.", group: "content", providers: [] },
  { id: "podcast", label: "Podcasts", blurb: "Audio shows and guest spots.", group: "content", providers: [] },
  // Email & messaging
  { id: "mailchimp", label: "Mailchimp", blurb: "Email campaigns and automations.", group: "email", providers: ["mailchimp"] },
  { id: "klaviyo", label: "Klaviyo", blurb: "E-commerce email and SMS flows.", group: "email", providers: ["klaviyo"] },
  { id: "brevo", label: "Brevo", blurb: "Email, SMS, and automation.", group: "email", providers: ["brevo"] },
  { id: "whatsapp", label: "WhatsApp Business", blurb: "Chat commerce and support.", group: "email", providers: [] },
  { id: "sms", label: "SMS marketing", blurb: "Text campaigns and alerts.", group: "email", providers: [] },
  // E-commerce & marketplaces
  { id: "shopify", label: "Shopify", blurb: "Your storefront, products, and orders.", group: "ecommerce", providers: ["shopify"], connectHref: "/commerce" },
  { id: "woocommerce", label: "WooCommerce", blurb: "WordPress-based storefront.", group: "ecommerce", providers: [] },
  { id: "amazon", label: "Amazon", blurb: "Marketplace listings and ads.", group: "ecommerce", providers: [] },
  // Paid
  { id: "meta-ads", label: "Meta Ads", blurb: "Paid across Facebook and Instagram.", group: "paid", providers: ["meta-ads"] },
  { id: "google-ads", label: "Google Ads", blurb: "Search, shopping, and YouTube ads.", group: "paid", providers: ["google-ads"] },
  { id: "tiktok-ads", label: "TikTok Ads", blurb: "Paid short-form video.", group: "paid", providers: ["tiktok-ads"] },
  { id: "linkedin-ads", label: "LinkedIn Ads", blurb: "B2B paid targeting.", group: "paid", providers: ["linkedin-ads"] },
  { id: "pinterest-ads", label: "Pinterest Ads", blurb: "Paid visual discovery.", group: "paid", providers: [] },
  // Analytics
  { id: "ga4", label: "Google Analytics", blurb: "Traffic, behavior, and conversions.", group: "analytics", providers: ["ga4"] },
  { id: "tag-manager", label: "Tag Manager", blurb: "Tracking deployment without code.", group: "analytics", providers: [] },
  { id: "clarity", label: "Microsoft Clarity", blurb: "Heatmaps and session replay.", group: "analytics", providers: [] },
  { id: "plausible", label: "Plausible", blurb: "Privacy-friendly analytics.", group: "analytics", providers: ["plausible"] },
  { id: "mixpanel", label: "Mixpanel", blurb: "Product funnels and retention.", group: "analytics", providers: ["mixpanel"] },
];

export type ChannelIntent = "using" | "planning";

export type ChannelSelection = {
  id: string;
  intent: ChannelIntent;
};

/** Category → channel boosts with human-readable reasons. */
const CATEGORY_RULES: Record<string, { channels: string[]; reason: string }[]> = {
  ecommerce: [
    { channels: ["shopify", "meta-ads", "google-ads", "google-ads-search"], reason: "Core revenue loop for online stores" },
    { channels: ["ga4", "klaviyo", "instagram", "tiktok"], reason: "Measurement, retention, and discovery" },
    { channels: ["google-search", "newsletter"], reason: "Compounding organic demand" },
  ],
  "physical-retail": [
    { channels: ["google-business", "facebook", "instagram"], reason: "Local discovery and foot traffic" },
    { channels: ["ga4", "newsletter"], reason: "Keep regulars returning" },
  ],
  "professional-services": [
    { channels: ["linkedin", "google-search", "blog"], reason: "Authority and inbound for expertise businesses" },
    { channels: ["newsletter", "ga4"], reason: "Nurture long sales cycles" },
  ],
  "consumer-services": [
    { channels: ["facebook", "instagram", "google-business"], reason: "Local reach and social proof" },
    { channels: ["tiktok", "newsletter"], reason: "Discovery plus repeat bookings" },
  ],
  "media-content": [
    { channels: ["youtube", "newsletter", "blog"], reason: "Owned audience and catalog depth" },
    { channels: ["x", "instagram"], reason: "Distribution for every piece" },
  ],
  "software-technology": [
    { channels: ["linkedin", "google-search", "blog"], reason: "B2B discovery and education" },
    { channels: ["youtube", "x"], reason: "Demos and developer mindshare" },
  ],
  "civic-social": [
    { channels: ["facebook", "newsletter", "blog"], reason: "Community reach on a budget" },
    { channels: ["youtube"], reason: "Stories that earn support" },
  ],
};

const GOAL_RULES: { pattern: RegExp; channels: string[]; reason: string }[] = [
  { pattern: /\b(buy|purchase|order|checkout|revenue|sales?)\b/i, channels: ["google-ads", "meta-ads"], reason: "Matches a purchase-driven goal" },
  { pattern: /(awar|brand|reach|follow|launch)/i, channels: ["facebook", "instagram", "youtube"], reason: "Matches an awareness goal" },
  { pattern: /(lead|demo|trial|signup|sign up|book|download)/i, channels: ["linkedin", "google-ads"], reason: "Matches a lead-generation goal" },
  { pattern: /(subscri|newsletter|retention|repeat)/i, channels: ["newsletter", "klaviyo"], reason: "Matches a retention goal" },
];

const AUDIENCE_RULES: { pattern: RegExp; channels: string[]; reason: string }[] = [
  { pattern: /\b(b2b|enterprise|companies|businesses|founders|executives)\b/i, channels: ["linkedin", "linkedin-ads"], reason: "Matches a business audience" },
  { pattern: /(gen ?z|young|teen|student)/i, channels: ["tiktok", "instagram"], reason: "Matches a young audience" },
  { pattern: /(local|neighborhood|city|nearby)/i, channels: ["google-business", "facebook"], reason: "Matches a local audience" },
];

export type ChannelRecommendation = {
  channelId: string;
  score: number;
  reasons: string[];
};

const MAX_RECOMMENDATIONS = 8;

export function recommendChannels(input: {
  organizationCategory?: string | null;
  goalsText?: string | null;
  audienceText?: string | null;
  connectedProviders?: string[] | null;
}): ChannelRecommendation[] {
  const scores = new Map<string, { score: number; reasons: string[] }>();
  const add = (channelId: string, points: number, reason: string) => {
    const entry = scores.get(channelId) ?? { score: 0, reasons: [] };
    entry.score += points;
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    scores.set(channelId, entry);
  };

  for (const rule of CATEGORY_RULES[input.organizationCategory ?? ""] ?? []) {
    for (const channelId of rule.channels) add(channelId, 2, rule.reason);
  }
  const goals = input.goalsText ?? "";
  if (goals.trim()) {
    for (const rule of GOAL_RULES) {
      if (rule.pattern.test(goals)) {
        for (const channelId of rule.channels) add(channelId, 2, rule.reason);
      }
    }
  }
  const audience = input.audienceText ?? "";
  if (audience.trim()) {
    for (const rule of AUDIENCE_RULES) {
      if (rule.pattern.test(audience)) {
        for (const channelId of rule.channels) add(channelId, 1, rule.reason);
      }
    }
  }
  const connected = new Set(input.connectedProviders ?? []);
  if (connected.size) {
    for (const channel of MARKETING_CHANNELS) {
      if (channel.providers.some((provider) => connected.has(provider))) {
        // A linked connector is actionable today, so it clears the bar alone.
        add(channel.id, 2, "Already connected, ready to use");
      }
    }
  }

  return [...scores.entries()]
    .filter(([, entry]) => entry.score >= 2)
    .sort((left, right) => right[1].score - left[1].score)
    .slice(0, MAX_RECOMMENDATIONS)
    .map(([channelId, entry]) => ({ channelId, score: entry.score, reasons: entry.reasons }));
}

export function channelById(id: string) {
  return MARKETING_CHANNELS.find((channel) => channel.id === id) ?? null;
}
