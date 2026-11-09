import { freshGoogleAccessToken } from "./google";

const PROPERTY_ID = /^[0-9]{6,12}$/;

export function isGa4PropertyId(value: string) {
  return PROPERTY_ID.test(value);
}

export type Ga4Credential = {
  accessToken: string;
  refreshToken: string | null;
  propertyId: string | null;
};

/**
 * The saved credential is either the legacy bare access token or JSON:
 * {"accessToken":"…","refreshToken":"…","propertyId":"…"}. A refresh token
 * (from Connect-with-Google or pasted) keeps the connection working past the
 * access token's one-hour life.
 */
export function parseGa4Credential(plaintext: string): Ga4Credential {
  const trimmed = plaintext.trim();
  try {
    const value = JSON.parse(trimmed) as Record<string, unknown>;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const text = (field: unknown) => (typeof field === "string" && field.trim() ? field.trim() : null);
      return {
        accessToken: text(value.accessToken) ?? "",
        refreshToken: text(value.refreshToken),
        propertyId: text(value.propertyId),
      };
    }
  } catch {
    // Not JSON: the legacy bare-token format.
  }
  return { accessToken: trimmed, refreshToken: null, propertyId: null };
}

/** A usable access token: refreshed when a refresh token is saved. */
export async function resolveGa4AccessToken(credential: Ga4Credential, signal?: AbortSignal) {
  if (credential.refreshToken) {
    try {
      return await freshGoogleAccessToken(credential.refreshToken, signal);
    } catch (error) {
      // A stored access token may still be within its hour; try it before failing.
      if (credential.accessToken) return credential.accessToken;
      throw error;
    }
  }
  return credential.accessToken;
}

export async function fetchSessions(propertyId: string, accessToken: string) {
  if (!isGa4PropertyId(propertyId)) {
    throw new RangeError("GA4 property id must be 6 to 12 digits.");
  }
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
        metrics: [{ name: "sessions" }],
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`GA4 rejected the report request (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as {
    rows?: { metricValues?: { value?: string }[] }[];
  };
  const value = payload.rows?.[0]?.metricValues?.[0]?.value;
  const sessions = Number(value ?? 0);
  if (!Number.isFinite(sessions)) {
    throw new Error("GA4 returned an unreadable session count.");
  }
  return sessions;
}
