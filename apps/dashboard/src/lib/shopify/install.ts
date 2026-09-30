import { missingShopifyScopes } from "./scopes";

export const REQUIRED_SHOPIFY_SCOPES = ["read_products"];

export function assertRequiredShopifyScopes(granted: string[]) {
  const missing = missingShopifyScopes(REQUIRED_SHOPIFY_SCOPES, granted);
  if (missing.length) {
    throw new Error(
      `Required Shopify permissions were not granted: ${missing.join(", ")}. Enable them in the Shopify app API access settings, then reconnect.`,
    );
  }
}

export function assertShopifyClientSecret(clientSecret: string) {
  if (/^shp(at|ua|ca|pa)_/i.test(clientSecret.trim())) {
    throw new Error(
      "SHOPIFY_CLIENT_SECRET must be the Client secret from the Shopify Dev Dashboard, not an Admin API access token.",
    );
  }
}

export function assertShopifyAppUrl(appUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    throw new Error("APP_URL must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      "APP_URL must be HTTPS so Shopify can redirect after install. Use an HTTPS tunnel for local development.",
    );
  }
}
