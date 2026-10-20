export async function testProvider(provider: string, apiKey: string) {
  if (provider === "resend") {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return { ok: false, error: "Resend rejected that key." };
    return { ok: true };
  }
  if (provider === "ga4") {
    if (!apiKey.trim()) return { ok: false, error: "API key is too short." };
    return { ok: true };
  }
  if (apiKey.length < 8) {
    return { ok: false, error: "API key is too short." };
  }
  return { ok: true };
}
