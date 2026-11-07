import { llmProvider } from "./client";

// USD list-price estimates per 1M tokens, matched by longest model-id prefix.
// They exist so agent spend can be budgeted and reported; they are not a bill.
// Override or extend them with COHORIO_LLM_PRICING_JSON, e.g.
//   {"muse-wonder-1.0":{"input":1.5,"output":6}}
// Models with no known rate cost null (unknown), never a guessed number.
type Rate = { input: number; output: number };

const DEFAULT_RATES: Record<string, Rate> = {
  "claude-opus": { input: 15, output: 75 },
  "claude-sonnet": { input: 3, output: 15 },
  "claude-haiku": { input: 1, output: 5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

function configuredRates(): Record<string, Rate> {
  const raw = process.env.COHORIO_LLM_PRICING_JSON?.trim();
  if (!raw) return DEFAULT_RATES;
  try {
    const parsed = JSON.parse(raw) as Record<string, Rate>;
    const valid = Object.fromEntries(
      Object.entries(parsed).filter(
        ([, rate]) =>
          rate && Number.isFinite(rate.input) && Number.isFinite(rate.output),
      ),
    );
    return { ...DEFAULT_RATES, ...valid };
  } catch {
    // A malformed override must not break generation; defaults still apply.
    return DEFAULT_RATES;
  }
}

/** USD cost of one run, or null when the model has no known rate. */
export function modelCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const rates = configuredRates();
  const match = Object.keys(rates)
    .filter((prefix) => model.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  if (!match) return null;
  const rate = rates[match];
  const cost =
    (promptTokens * rate.input + completionTokens * rate.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** The model id the active provider will call, for cost attribution. */
export function activeModelId(): string {
  const configured = process.env.COHORIO_LLM_MODEL?.trim();
  const provider = llmProvider();
  if (provider === "anthropic") return configured || "claude-opus-5-5";
  if (provider === "meta-muse") return configured || "muse-wonder-1.0";
  return configured || "gpt-4.1-mini";
}
