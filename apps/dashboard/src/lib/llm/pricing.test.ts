import { afterEach, describe, expect, it, vi } from "vitest";
import { activeModelId, modelCostUsd } from "./pricing";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("modelCostUsd", () => {
  it("prices known model families per 1M tokens", () => {
    // Opus estimate: 15 in / 75 out → 1M in + 1M out = $90.
    expect(modelCostUsd("claude-opus-5-5", 1_000_000, 1_000_000)).toBe(90);
    expect(modelCostUsd("claude-sonnet-test", 1_000_000, 0)).toBe(3);
    expect(modelCostUsd("gpt-4.1-mini", 1_000_000, 1_000_000)).toBe(2);
  });

  it("matches the longest prefix so mini models are not priced as full ones", () => {
    expect(modelCostUsd("gpt-4.1-mini", 1_000_000, 0)).toBe(0.4);
    expect(modelCostUsd("gpt-4.1", 1_000_000, 0)).toBe(2);
  });

  it("returns null for models with no known rate instead of guessing", () => {
    expect(modelCostUsd("muse-wonder-1.0", 10_000, 5_000)).toBeNull();
  });

  it("honours COHORIO_LLM_PRICING_JSON overrides", () => {
    vi.stubEnv(
      "COHORIO_LLM_PRICING_JSON",
      JSON.stringify({ "muse-wonder-1.0": { input: 1, output: 2 } }),
    );
    expect(modelCostUsd("muse-wonder-1.0", 1_000_000, 1_000_000)).toBe(3);
  });

  it("ignores a malformed pricing override", () => {
    vi.stubEnv("COHORIO_LLM_PRICING_JSON", "{not json");
    expect(modelCostUsd("claude-opus-5-5", 1_000_000, 0)).toBe(15);
  });
});

describe("activeModelId", () => {
  it("defaults per provider and honours the configured model", () => {
    vi.stubEnv("COHORIO_LLM_PROVIDER", "meta");
    vi.stubEnv("COHORIO_LLM_MODEL", "");
    expect(activeModelId()).toBe("muse-wonder-1.0");
    vi.stubEnv("COHORIO_LLM_MODEL", "muse-spark-test");
    expect(activeModelId()).toBe("muse-spark-test");
    vi.stubEnv("COHORIO_LLM_PROVIDER", "anthropic");
    vi.stubEnv("COHORIO_LLM_MODEL", "");
    expect(activeModelId()).toBe("claude-opus-5-5");
  });
});
