import { ProviderError } from "./http";
import { connectorFor } from "./connectors";

export type ProviderCheck = {
  ok: boolean;
  /** True only when the provider accepted the credential in a live call. */
  verified: boolean;
  error?: string;
};

/** Checks a credential before it is saved. Never logs or returns the key. */
export async function testProvider(provider: string, apiKey: string): Promise<ProviderCheck> {
  const connector = connectorFor(provider);
  if (connector) {
    try {
      await connector.verify(connector.parse(apiKey), AbortSignal.timeout(20_000));
      return { ok: true, verified: true };
    } catch (error) {
      if (error instanceof RangeError || error instanceof ProviderError) {
        return { ok: false, verified: false, error: error.message };
      }
      return { ok: false, verified: false, error: `${connector.label} could not be checked. Try again.` };
    }
  }
  if (provider === "resend") {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { ok: false, verified: false, error: "Resend rejected that key." };
    return { ok: true, verified: true };
  }
  if (provider === "ga4") {
    if (!apiKey.trim()) return { ok: false, verified: false, error: "API key is too short." };
    return { ok: true, verified: false };
  }
  if (apiKey.length < 8) {
    return { ok: false, verified: false, error: "API key is too short." };
  }
  // Stored for future use; nothing in Cohorio calls this provider yet.
  return { ok: true, verified: false };
}
