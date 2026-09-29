export async function startShopifyOAuth(shop: string) {
  const response = await fetch("/api/shopify/oauth/start", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shop }),
  });
  const payload = (await response.json()) as {
    authorizeUrl?: string;
    error?: string;
  };
  if (!response.ok || !payload.authorizeUrl) {
    throw new Error(payload.error || "Unable to start Shopify connection.");
  }
  window.location.assign(payload.authorizeUrl);
}
