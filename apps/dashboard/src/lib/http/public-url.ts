import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type LookupAll = (
  hostname: string,
) => Promise<{ address: string; family: number }[]>;

const defaultLookup: LookupAll = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 100_000;
const MAX_TEXT = 8_000;

export class PublicUrlError extends Error {
  constructor() {
    super("That URL is not allowed.");
    this.name = "PUBLIC_URL_REJECTED";
  }
}

function ipv4Parts(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return null;
  }
  return parts;
}

function isBlockedIpv4(address: string) {
  const parts = ipv4Parts(address);
  if (!parts) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  if (normalized === "::" || normalized === "::1") return true;
  const first = parseInt(normalized.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    normalized.startsWith("64:ff9b:") || // NAT64 can reach IPv4 space
    normalized.startsWith("::ffff:") // mapped forms not caught above
  );
}

export function isBlockedAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

export async function assertPublicHttpUrl(
  url: string,
  lookup: LookupAll = defaultLookup,
) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PublicUrlError();
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PublicUrlError();
  }
  if (parsed.username || parsed.password) throw new PublicUrlError();
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new PublicUrlError();
  }
  let addresses: string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = (await lookup(hostname)).map((entry) => entry.address);
    } catch {
      throw new PublicUrlError();
    }
  }
  if (!addresses.length || addresses.some(isBlockedAddress)) {
    throw new PublicUrlError();
  }
  return parsed;
}

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readCapped(response: Response, maximum: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maximum) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const remaining = maximum - total;
    chunks.push(value.length > remaining ? value.subarray(0, remaining) : value);
    total += Math.min(value.length, remaining);
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchPublicText(
  url: string,
  options: { lookup?: LookupAll; fetchImpl?: typeof fetch } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let target = await assertPublicHttpUrl(url, options.lookup);
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(target, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects >= MAX_REDIRECTS) {
        throw new PublicUrlError();
      }
      target = await assertPublicHttpUrl(
        new URL(location, target).toString(),
        options.lookup,
      );
      continue;
    }
    if (!response.ok) {
      throw new Error(`That page returned HTTP ${response.status}.`);
    }
    const raw = await readCapped(response, MAX_BYTES);
    const type = response.headers.get("content-type") ?? "";
    const text = type.includes("html") ? htmlToText(raw) : raw.trim();
    return text.slice(0, MAX_TEXT);
  }
}
