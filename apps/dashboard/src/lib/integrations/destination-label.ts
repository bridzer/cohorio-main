/**
 * Human-readable account labels for publish-capable ad providers, derived
 * server-side from stored credentials. Only identifiers are exposed (account
 * ids, Page names) — never tokens or secrets. Best-effort: unparsable
 * credentials yield null instead of throwing.
 */
export function publishAccountLabel(
  provider: string,
  plaintext: string,
): string | null {
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(plaintext);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    parsed = value as Record<string, unknown>;
  } catch {
    return null;
  }
  const text = (input: unknown) =>
    typeof input === "string"
      ? input.trim()
      : typeof input === "number"
        ? String(input)
        : "";
  switch (provider) {
    case "meta-ads": {
      const account = text(parsed.accountId);
      const page =
        parsed.page && typeof parsed.page === "object" && !Array.isArray(parsed.page)
          ? text((parsed.page as Record<string, unknown>).name)
          : "";
      const parts = [
        account ? `Ad account ${account}` : null,
        page ? `Page ${page}` : null,
      ].filter((part): part is string => Boolean(part));
      return parts.length ? parts.join(" · ") : null;
    }
    case "google-ads": {
      const customer = text(parsed.customerId);
      return customer ? `Customer ${customer}` : null;
    }
    case "tiktok-ads": {
      const advertiser = text(parsed.advertiserId);
      return advertiser ? `Advertiser ${advertiser}` : null;
    }
    default:
      return null;
  }
}
