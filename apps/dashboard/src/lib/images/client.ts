export async function createMarketingImage(prompt: string) {
  const apiKey = process.env.COHORIO_IMAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("COHORIO_IMAGE_API_KEY is not configured.");
  }
  const baseUrl = (
    process.env.COHORIO_IMAGE_BASE_URL || "https://api.openai.com/v1"
  )
    .trim()
    .replace(/\/$/, "");
  const model = (process.env.COHORIO_IMAGE_MODEL || "dall-e-3").trim();
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt, size: "1024x1024" }),
  });
  if (!response.ok) {
    throw new Error(
      `The image provider rejected the request (HTTP ${response.status}).`,
    );
  }
  const payload = (await response.json()) as {
    data?: { url?: unknown }[];
  };
  const url = payload.data?.[0]?.url;
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) {
    throw new Error("The image provider did not return an image URL.");
  }
  return url;
}
