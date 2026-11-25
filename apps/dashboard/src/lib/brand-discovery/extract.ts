/**
 * Dependency-free extraction of brand, SEO, channel, and link facts from
 * fetched HTML (Milestone 1). Everything returned is quoted page content or
 * deterministic structural signals — the pipeline never invents facts.
 */

export type WebsiteFacts = {
  title: string | null;
  description: string | null;
  generator: string | null;
  headings: string[];
  emails: string[];
  phones: string[];
  socials: { network: string; url: string }[];
};

export type SeoSignalReport = {
  hasTitle: boolean;
  titleLength: number;
  hasDescription: boolean;
  descriptionLength: number;
  hasCanonical: boolean;
  hasOgTags: boolean;
  hasStructuredData: boolean;
  h1Count: number;
  wordCount: number;
  opportunities: string[];
};

const SOCIAL_HOSTS: Record<string, string> = {
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "twitter.com": "X",
  "x.com": "X",
  "linkedin.com": "LinkedIn",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "tiktok.com": "TikTok",
  "pinterest.com": "Pinterest",
};

const PRIORITY_PATH_KEYWORDS = [
  "about",
  "story",
  "company",
  "product",
  "products",
  "shop",
  "collections",
  "service",
  "services",
  "solution",
  "solutions",
  "pricing",
  "features",
  "faq",
  "contact",
];

const SKIP_PATH_PATTERN =
  /\/(cart|checkout|account|login|signin|sign-in|register|admin|wp-admin|api|cdn-cgi)\b|\.(pdf|png|jpe?g|gif|webp|svg|css|js|xml|json|zip)$/i;

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " "));
}

function metaContent(html: string, attribute: string, name: string) {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${name}["'][^>]*>`,
    "i",
  );
  const tag = html.match(pattern)?.[0] ?? "";
  return decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
}

export function extractWebsiteFacts(html: string): WebsiteFacts {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description =
    metaContent(html, "name", "description") ||
    metaContent(html, "property", "og:description") ||
    "";
  const generator = metaContent(html, "name", "generator");

  const headings: string[] = [];
  for (const match of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const text = stripTags(match[1] ?? "");
    if (text && text.length <= 200 && !headings.includes(text)) {
      headings.push(text);
    }
    if (headings.length >= 8) break;
  }

  const emails = [
    ...new Set(
      [...html.matchAll(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)]
        .map((match) => (match[1] ?? "").toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 5);

  const phones = [
    ...new Set(
      [...html.matchAll(/tel:(\+?[0-9][0-9\s().-]{6,18})/gi)]
        .map((match) => (match[1] ?? "").replace(/[\s().-]/g, ""))
        .filter((digits) => digits.replace(/\D/g, "").length >= 7),
    ),
  ].slice(0, 3);

  const socials: { network: string; url: string }[] = [];
  for (const match of html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) {
    const url = match[1] ?? "";
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    const network =
      SOCIAL_HOSTS[host] ??
      Object.entries(SOCIAL_HOSTS).find(([key]) => host.endsWith(`.${key}`) || host === key)?.[1];
    if (network && !socials.some((entry) => entry.url === url)) {
      socials.push({ network, url });
    }
    if (socials.length >= 8) break;
  }

  return {
    title: title || null,
    description: description || null,
    generator: generator || null,
    headings,
    emails,
    phones,
    socials,
  };
}

export function extractSeoSignals(html: string): SeoSignalReport {
  const facts = extractWebsiteFacts(html);
  const titleLength = facts.title?.length ?? 0;
  const descriptionLength = facts.description?.length ?? 0;
  const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html);
  const hasOgTags =
    Boolean(metaContent(html, "property", "og:title")) ||
    Boolean(metaContent(html, "property", "og:description"));
  const hasStructuredData = /type=["']application\/ld\+json["']/i.test(html);
  const h1Count = [...html.matchAll(/<h1\b[^>]*>/gi)].length;
  const bodyText = stripTags(
    html
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " "),
  );
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

  const opportunities: string[] = [];
  if (!facts.title) {
    opportunities.push("Add a descriptive <title> tag on the homepage.");
  } else if (titleLength < 25 || titleLength > 65) {
    opportunities.push(
      `Tune homepage title length (${titleLength} chars; target 30-60 chars for search snippets).`,
    );
  }
  if (!facts.description) {
    opportunities.push("Add a meta description summarizing your offer and target customer.");
  } else if (descriptionLength < 70 || descriptionLength > 165) {
    opportunities.push(
      `Refine meta description length (${descriptionLength} chars; target 110-155 chars).`,
    );
  }
  if (h1Count === 0) {
    opportunities.push("Add a clear primary <h1> heading stating what the business offers.");
  } else if (h1Count > 1) {
    opportunities.push(`Consolidate ${h1Count} <h1> headings into a single primary page heading.`);
  }
  if (!hasCanonical) {
    opportunities.push("Add a canonical link tag to prevent duplicate URL indexing.");
  }
  if (!hasOgTags) {
    opportunities.push("Add Open Graph tags (og:title, og:description) for social link previews.");
  }
  if (!hasStructuredData) {
    opportunities.push("Add JSON-LD structured data (Organization, Product, or FAQ schema).");
  }
  if (wordCount > 0 && wordCount < 150) {
    opportunities.push(
      `Homepage copy is thin (${wordCount} visible words extracted); expand product and value detail.`,
    );
  }

  return {
    hasTitle: Boolean(facts.title),
    titleLength,
    hasDescription: Boolean(facts.description),
    descriptionLength,
    hasCanonical,
    hasOgTags,
    hasStructuredData,
    h1Count,
    wordCount,
    opportunities,
  };
}

export function detectMarketingChannels(html: string, facts: WebsiteFacts): string[] {
  const lower = html.toLowerCase();
  const channels = new Set<string>(facts.socials.map((item) => item.network));
  if (lower.includes("gtag(") || lower.includes("googletagmanager.com") || lower.includes("google-analytics")) {
    channels.add("Google Analytics / Tag Manager");
  }
  if (lower.includes("fbevents.js") || lower.includes("fbq(")) {
    channels.add("Meta Pixel");
  }
  if (lower.includes("klaviyo")) channels.add("Klaviyo Email");
  if (lower.includes("mailchimp") || lower.includes("list-manage.com")) channels.add("Mailchimp");
  if (lower.includes("hubspot") || lower.includes("hs-scripts.com")) channels.add("HubSpot");
  if (lower.includes("analytics.tiktok.com") || lower.includes("ttq.")) channels.add("TikTok Pixel");
  if (/\/blog\b|\/journal\b|\/articles\b|\/news\b/i.test(lower)) channels.add("Blog / Content");
  if (/newsletter|subscribe/i.test(lower)) channels.add("Email Newsletter");
  return [...channels];
}

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function extractInternalLinks(
  html: string,
  baseUrl: string,
  limit = 3,
): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const baseHost = normalizeHost(base.hostname);
  const candidates: { url: string; score: number }[] = [];
  const seen = new Set<string>([`${base.origin}${base.pathname.replace(/\/$/, "")}`]);

  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const raw = (match[1] ?? "").trim();
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) {
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(raw, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (normalizeHost(resolved.hostname) !== baseHost) continue;
    if (SKIP_PATH_PATTERN.test(resolved.pathname)) continue;
    resolved.hash = "";
    const key = `${resolved.origin}${resolved.pathname.replace(/\/$/, "")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pathLower = resolved.pathname.toLowerCase();
    const keywordIndex = PRIORITY_PATH_KEYWORDS.findIndex((kw) => pathLower.includes(kw));
    if (keywordIndex < 0) continue;
    candidates.push({
      url: resolved.toString(),
      score: PRIORITY_PATH_KEYWORDS.length - keywordIndex,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.url);
}
