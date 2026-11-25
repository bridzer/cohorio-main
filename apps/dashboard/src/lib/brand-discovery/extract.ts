/**
 * Dependency-free extraction of brand facts from fetched HTML (Milestone 2).
 * Everything returned is quoted page content or an explicit null — the
 * pipeline never invents titles, contacts, or descriptions.
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

const SOCIAL_HOSTS: Record<string, string> = {
  "facebook.com": "Facebook",
  fb: "Facebook",
  "instagram.com": "Instagram",
  "twitter.com": "X",
  "x.com": "X",
  "linkedin.com": "LinkedIn",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "tiktok.com": "TikTok",
  "pinterest.com": "Pinterest",
};

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
