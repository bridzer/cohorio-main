import { ProviderError } from "./http";
import { connectorFor } from "./connectors";
import {
  fetchSessions,
  isGa4PropertyId,
  parseGa4Credential,
  resolveGa4AccessToken,
} from "./ga4";

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
    const credential = parseGa4Credential(apiKey);
    // A JSON credential with a property id can be checked with a real report;
    // a bare access token cannot (no property), so it stays unverified.
    if (credential.propertyId && isGa4PropertyId(credential.propertyId)) {
      try {
        const accessToken = await resolveGa4AccessToken(credential, AbortSignal.timeout(20_000));
        if (!accessToken) throw new Error("empty token");
        await fetchSessions(credential.propertyId, accessToken);
        return { ok: true, verified: true };
      } catch (error) {
        return {
          ok: false,
          verified: false,
          error:
            error instanceof ProviderError
              ? error.message
              : "GA4 rejected that credential. Check the property id and token.",
        };
      }
    }
    return { ok: true, verified: false };
  }
  if (apiKey.length < 8) {
    return { ok: false, verified: false, error: "API key is too short." };
  }
  // Stored for future use; nothing in Cohorio calls this provider yet.
  return { ok: true, verified: false };
}
