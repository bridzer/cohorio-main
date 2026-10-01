export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export async function completeChat(messages: ChatMessage[]) {
  const apiKey = process.env.COHORIO_LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("COHORIO_LLM_API_KEY is not configured.");
  }
  const baseUrl = (
    process.env.COHORIO_LLM_BASE_URL || "https://api.openai.com/v1"
  )
    .trim()
    .replace(/\/$/, "");
  const model = (process.env.COHORIO_LLM_MODEL || "gpt-4.1-mini").trim();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    let providerMessage = "";
    try {
      const parsed = JSON.parse(detail) as {
        error?: { message?: string } | string;
      };
      providerMessage =
        typeof parsed.error === "string"
          ? parsed.error
          : (parsed.error?.message ?? "");
    } catch {
      providerMessage = detail.slice(0, 240);
    }
    throw new Error(
      providerMessage
        ? `The language model request failed: ${providerMessage}`
        : "The language model request failed.",
    );
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The language model returned an empty response.");
  }
  return content;
}
