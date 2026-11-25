import { fetchPublicHtml, htmlToText, PublicUrlError } from "@/lib/http/public-url";
import { classifyWebsite, type Classification } from "./classify";
import {
  detectMarketingChannels,
  extractInternalLinks,
  extractSeoSignals,
  extractWebsiteFacts,
  type SeoSignalReport,
  type WebsiteFacts,
} from "./extract";

/**
 * Bounded, SSRF-protected website discovery crawler (Milestone 1).
 * Crawls the landing URL plus up to 3 high-signal same-origin pages with
 * retry + exponential backoff on transient failures. All returned text is
 * untrusted data and never executed as instructions.
 */

export type CrawledPage = {
  url: string;
  role: "homepage" | "subpage";
  title: string | null;
  headings: string[];
  excerpt: string;
};

export type CrawlResult = {
  rootUrl: string;
  finalUrl: string;
  html: string;
  classification: Classification;
  facts: WebsiteFacts;
  seo: SeoSignalReport;
  detectedChannels: string[];
  pages: CrawledPage[];
  crawlNotes: string[];
};

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 250;
const MAX_PAGE_EXCERPT_CHARS = 3_500;
const MAX_SUBPAGES = 3;

export type CrawlOptions = {
  fetchHtml?: typeof fetchPublicHtml;
  maxSubpages?: number;
  backoffMs?: number;
};

function isRetryableError(error: unknown) {
  if (error instanceof PublicUrlError) return false;
  const message = error instanceof Error ? error.message : "";
  if (/HTTP (400|401|403|404|410)\b/.test(message)) return false;
  return true;
}

async function fetchWithRetry(
  url: string,
  fetchHtml: typeof fetchPublicHtml,
  backoffMs: number,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fetchHtml(url);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }
      const delay = backoffMs * 2 ** attempt;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function crawlWebsiteForBrand(
  url: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const fetchHtml = options.fetchHtml ?? fetchPublicHtml;
  const maxSubpages = Math.min(Math.max(0, options.maxSubpages ?? MAX_SUBPAGES), 5);
  const backoffMs = options.backoffMs ?? BASE_BACKOFF_MS;

  const root = await fetchWithRetry(url, fetchHtml, backoffMs);
  if (!root.html.trim()) {
    throw new Error("The website returned an empty page.");
  }

  const classification = classifyWebsite({ url: root.finalUrl, html: root.html });
  const facts = extractWebsiteFacts(root.html);
  const seo = extractSeoSignals(root.html);
  const detectedChannels = detectMarketingChannels(root.html, facts);

  const pages: CrawledPage[] = [
    {
      url: root.finalUrl,
      role: "homepage",
      title: facts.title,
      headings: facts.headings,
      excerpt: htmlToText(root.html).slice(0, MAX_PAGE_EXCERPT_CHARS),
    },
  ];
  const crawlNotes: string[] = [];

  if (maxSubpages > 0) {
    const links = extractInternalLinks(root.html, root.finalUrl, maxSubpages);
    if (!links.length) {
      crawlNotes.push("No secondary about, product, or pricing pages were linked from the homepage.");
    }
    for (const subUrl of links) {
      try {
        const sub = await fetchWithRetry(subUrl, fetchHtml, backoffMs);
        if (!sub.html.trim()) continue;
        const subFacts = extractWebsiteFacts(sub.html);
        pages.push({
          url: sub.finalUrl,
          role: "subpage",
          title: subFacts.title,
          headings: subFacts.headings,
          excerpt: htmlToText(sub.html).slice(0, MAX_PAGE_EXCERPT_CHARS),
        });
        for (const social of subFacts.socials) {
          if (!facts.socials.some((entry) => entry.url === social.url)) {
            facts.socials.push(social);
          }
        }
        for (const ch of detectMarketingChannels(sub.html, subFacts)) {
          if (!detectedChannels.includes(ch)) detectedChannels.push(ch);
        }
      } catch (subError) {
        if (subError instanceof PublicUrlError) continue;
        crawlNotes.push(`Could not inspect ${subUrl}: page unavailable or blocked.`);
      }
    }
  }

  return {
    rootUrl: url,
    finalUrl: root.finalUrl,
    html: root.html,
    classification,
    facts,
    seo,
    detectedChannels,
    pages,
    crawlNotes,
  };
}
