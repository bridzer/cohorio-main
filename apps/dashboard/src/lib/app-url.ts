/**
 * Canonical public base URL for absolute redirects and links.
 *
 * Request-derived hosts cannot be trusted: behind some proxies the container
 * receives `Host: localhost:8080` while publicly serving www.cohorio.site,
 * which turned post-login redirects into dead localhost URLs. Auth-critical
 * redirects must use this helper instead of `request.nextUrl.origin`.
 *
 * Precedence: APP_URL, then AUTH_URL, then the request origin (correct on
 * localhost and behind well-behaved proxies), then http://localhost:3000.
 * Only absolute http(s) values are accepted; anything else falls through.
 */
export function appBaseUrl(fallbackOrigin?: string) {
  for (const value of [process.env.APP_URL, process.env.AUTH_URL, fallbackOrigin]) {
    const trimmed = value?.trim().replace(/\/$/, "");
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Ignore and try the next source.
    }
  }
  return "http://localhost:3000";
}
