/**
 * Presentation catalog for the integrations directory. Capability (whether
 * Cohorio verifies a key or the agent can use the provider) comes from the
 * API; this file only supplies names, blurbs and grouping so new providers
 * from tools/clis still render sensibly via the fallback in providerMeta().
 */

export type IntegrationCategory = {
  id: string;
  label: string;
  blurb: string;
};

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  { id: "advertising", label: "Advertising", blurb: "Paid campaign performance across ad networks." },
  { id: "analytics", label: "Analytics & data", blurb: "Traffic, product usage and reporting data." },
  { id: "email", label: "Email & lifecycle", blurb: "Campaigns, flows and message delivery." },
  { id: "seo", label: "SEO & research", blurb: "Keywords, rankings and search visibility." },
  { id: "sales", label: "Sales & RevOps", blurb: "Prospecting, outreach and pipeline data." },
  { id: "content", label: "Social, video & events", blurb: "Scheduling, video, webinars and forms." },
  { id: "commerce", label: "Commerce & partners", blurb: "Payments, affiliates, referrals and reviews." },
  { id: "automation", label: "Support & automation", blurb: "Customer messaging and workflow automation." },
];

type ProviderMeta = { name: string; category: string; blurb: string };

const PROVIDER_META: Record<string, ProviderMeta> = {
  // Advertising
  "meta-ads": { name: "Meta Ads", category: "advertising", blurb: "Campaign, ad set and ad results from Facebook and Instagram advertising." },
  "google-ads": { name: "Google Ads", category: "advertising", blurb: "Search and display campaign spend, clicks and conversions." },
  "tiktok-ads": { name: "TikTok Ads", category: "advertising", blurb: "TikTok campaign performance and spend." },
  "linkedin-ads": { name: "LinkedIn Ads", category: "advertising", blurb: "B2B campaign results from LinkedIn." },
  // Analytics & data
  ga4: { name: "Google Analytics 4", category: "analytics", blurb: "Website sessions and traffic for the last 28 days." },
  plausible: { name: "Plausible", category: "analytics", blurb: "Privacy-friendly website visitors, pageviews and sources." },
  "adobe-analytics": { name: "Adobe Analytics", category: "analytics", blurb: "Enterprise web analytics reporting." },
  amplitude: { name: "Amplitude", category: "analytics", blurb: "Product analytics, funnels and retention." },
  mixpanel: { name: "Mixpanel", category: "analytics", blurb: "Product events, funnels and user analytics." },
  segment: { name: "Segment", category: "analytics", blurb: "Customer data pipelines and event tracking." },
  hotjar: { name: "Hotjar", category: "analytics", blurb: "Heatmaps, recordings and visitor feedback." },
  pendo: { name: "Pendo", category: "analytics", blurb: "Product usage and in-app engagement analytics." },
  coupler: { name: "Coupler.io", category: "analytics", blurb: "Marketing data exports into sheets and warehouses." },
  supermetrics: { name: "Supermetrics", category: "analytics", blurb: "Cross-channel marketing reporting connectors." },
  similarweb: { name: "Similarweb", category: "analytics", blurb: "Competitor and market traffic intelligence." },
  optimizely: { name: "Optimizely", category: "analytics", blurb: "Experimentation and A/B test results." },
  // Email & lifecycle
  klaviyo: { name: "Klaviyo", category: "email", blurb: "Campaign revenue and flow performance for ecommerce email and SMS." },
  mailchimp: { name: "Mailchimp", category: "email", blurb: "Sent campaigns, open and click performance." },
  resend: { name: "Resend", category: "email", blurb: "Transactional sending for lifecycle email drafts." },
  sendgrid: { name: "SendGrid", category: "email", blurb: "Email delivery and campaign engagement." },
  postmark: { name: "Postmark", category: "email", blurb: "Transactional email delivery and bounces." },
  brevo: { name: "Brevo", category: "email", blurb: "Email, SMS and marketing automation campaigns." },
  activecampaign: { name: "ActiveCampaign", category: "email", blurb: "Email automation and CRM campaign results." },
  "customer-io": { name: "Customer.io", category: "email", blurb: "Behaviour-triggered messaging campaigns." },
  kit: { name: "Kit", category: "email", blurb: "Creator email campaigns and subscriber growth." },
  beehiiv: { name: "beehiiv", category: "email", blurb: "Newsletter publishing and audience growth." },
  onesignal: { name: "OneSignal", category: "email", blurb: "Push notifications and in-app messaging." },
  // SEO & research
  dataforseo: { name: "DataForSEO", category: "seo", blurb: "Keyword volume, CPC, trends and live Google results. Each lookup is billed to the account." },
  ahrefs: { name: "Ahrefs", category: "seo", blurb: "Backlinks, keywords and site audits." },
  semrush: { name: "Semrush", category: "seo", blurb: "Keyword, domain and competitive research." },
  "keywords-everywhere": { name: "Keywords Everywhere", category: "seo", blurb: "Keyword volume and CPC data." },
  "google-search-console": { name: "Google Search Console", category: "seo", blurb: "Search queries, clicks and page rankings from Google." },
  // Sales & RevOps
  apollo: { name: "Apollo", category: "sales", blurb: "B2B contacts, enrichment and outreach data." },
  hunter: { name: "Hunter", category: "sales", blurb: "Email finding and verification for outreach." },
  snov: { name: "Snov.io", category: "sales", blurb: "Prospecting and email outreach tools." },
  instantly: { name: "Instantly", category: "sales", blurb: "Cold email sending and campaign results." },
  lemlist: { name: "Lemlist", category: "sales", blurb: "Personalised cold outreach campaigns." },
  outreach: { name: "Outreach", category: "sales", blurb: "Sales engagement sequences and results." },
  clay: { name: "Clay", category: "sales", blurb: "Data enrichment and go-to-market workflows." },
  clearbit: { name: "Clearbit", category: "sales", blurb: "Company and contact enrichment." },
  zoominfo: { name: "ZoomInfo", category: "sales", blurb: "B2B company and contact intelligence." },
  close: { name: "Close", category: "sales", blurb: "CRM pipelines and sales activity." },
  crossbeam: { name: "Crossbeam", category: "sales", blurb: "Partner overlap and co-selling data." },
  g2: { name: "G2", category: "sales", blurb: "Software reviews and buyer intent signals." },
  // Social, video & events
  buffer: { name: "Buffer", category: "content", blurb: "Social post scheduling across networks." },
  wistia: { name: "Wistia", category: "content", blurb: "Video hosting and viewing analytics." },
  demio: { name: "Demio", category: "content", blurb: "Webinar hosting and attendance." },
  livestorm: { name: "Livestorm", category: "content", blurb: "Live events and webinar engagement." },
  calendly: { name: "Calendly", category: "content", blurb: "Meeting scheduling and booking activity." },
  savvycal: { name: "SavvyCal", category: "content", blurb: "Scheduling links and meeting activity." },
  typeform: { name: "Typeform", category: "content", blurb: "Forms, surveys and response data." },
  // Commerce & partners
  paddle: { name: "Paddle", category: "commerce", blurb: "Payments, subscriptions and revenue." },
  partnerstack: { name: "PartnerStack", category: "commerce", blurb: "Partner and affiliate programme management." },
  rewardful: { name: "Rewardful", category: "commerce", blurb: "Affiliate and referral programmes for Stripe." },
  tolt: { name: "Tolt", category: "commerce", blurb: "Affiliate tracking and payouts." },
  "mention-me": { name: "Mention Me", category: "commerce", blurb: "Referral marketing programmes." },
  trustpilot: { name: "Trustpilot", category: "commerce", blurb: "Customer reviews and ratings." },
  dub: { name: "Dub", category: "commerce", blurb: "Short links and click attribution." },
  // Support & automation
  intercom: { name: "Intercom", category: "automation", blurb: "Customer messaging, support and engagement." },
  zapier: { name: "Zapier", category: "automation", blurb: "Workflow automation between apps." },
  airops: { name: "AirOps", category: "automation", blurb: "AI workflows for content and data operations." },
};

/** Soft tile colours per category for the monogram avatar. */
export const CATEGORY_TILES: Record<string, { background: string; color: string }> = {
  advertising: { background: "#e8eefc", color: "#2b4acb" },
  analytics: { background: "#e6f4ea", color: "#1e6b3a" },
  email: { background: "#fdf0e4", color: "#9a5b12" },
  seo: { background: "#f0e9fb", color: "#5b3ea8" },
  sales: { background: "#e4f3f7", color: "#17607a" },
  content: { background: "#fbe9f1", color: "#9c2b5c" },
  commerce: { background: "#eef6d6", color: "#47650f" },
  automation: { background: "#eceff1", color: "#45565e" },
  other: { background: "#eceff1", color: "#45565e" },
};

function prettify(provider: string) {
  return provider
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function providerMeta(provider: string): ProviderMeta {
  return (
    PROVIDER_META[provider] ?? {
      name: prettify(provider),
      category: "other",
      blurb: "Store an API key for this provider.",
    }
  );
}

export function categoryLabel(categoryId: string) {
  if (categoryId === "other") return "More tools";
  return INTEGRATION_CATEGORIES.find((category) => category.id === categoryId)?.label ?? "More tools";
}

export function monogram(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(" ").filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
