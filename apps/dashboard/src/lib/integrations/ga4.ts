const PROPERTY_ID = /^[0-9]{6,12}$/;

export function isGa4PropertyId(value: string) {
  return PROPERTY_ID.test(value);
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
