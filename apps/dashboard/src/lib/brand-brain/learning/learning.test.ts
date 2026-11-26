import { describe, it, expect } from "vitest";
import {
  LEARNING_EVENT_TYPES,
  isLearningEventType,
  confidenceLevelFromScore,
} from "./types";
import {
  classifyCategory,
  detectChangeNature,
  scoreConfidence,
} from "./interpreter";
import { isMeaningfulEdit } from "./evaluation";

describe("Brand Brain Learning Loop — types & guards", () => {
  it("recognizes all learning event types from prompt §3.A", () => {
    expect(isLearningEventType("edited")).toBe(true);
    expect(isLearningEventType("brand_knowledge_corrected")).toBe(true);
    expect(isLearningEventType("performance_signal")).toBe(true);
    expect(isLearningEventType("nonsense")).toBe(false);
    expect(LEARNING_EVENT_TYPES.length).toBeGreaterThanOrEqual(17);
  });

  it("maps confidence score to level per prompt §6.C", () => {
    expect(confidenceLevelFromScore(0.85)).toBe("high");
    expect(confidenceLevelFromScore(0.55)).toBe("medium");
    expect(confidenceLevelFromScore(0.2)).toBe("low");
  });
});

describe("Feedback interpretation — does not over-learn from isolated edits (§6.B, §4)", () => {
  it("isolated stylistic edit stays low confidence and non-persistent", () => {
    const { score, isPersistent } = scoreConfidence({
      isExplicit: false,
      evidenceCount: 1,
      consistency: 0.5,
      recencyScore: 0.8,
      conflictingCount: 0,
    });
    expect(score).toBeLessThan(0.45);
    expect(isPersistent).toBe(false);
  });

  it("repeated consistent implicit feedback becomes medium/persistent candidate", () => {
    const { score, isPersistent } = scoreConfidence({
      isExplicit: false,
      evidenceCount: 4,
      consistency: 0.8,
      recencyScore: 0.9,
      conflictingCount: 0,
    });
    // 4 consistent repetitions => medium-high but not explicit high
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(isPersistent).toBe(true);
  });

  it("explicit instruction gets high confidence immediately (§6.A)", () => {
    const { score, isPersistent } = scoreConfidence({
      isExplicit: true,
      evidenceCount: 1,
      consistency: 0.5,
      recencyScore: 0.8,
      conflictingCount: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0.75);
    expect(isPersistent).toBe(true);
  });

  it("classifies voice_changed as BRAND_VOICE_PREFERENCE", () => {
    const cat = classifyCategory({
      id: "evt1",
      organizationId: "org1",
      workspaceId: "ws1",
      eventType: "voice_changed",
      sourceModule: "marketing-context",
      context: {},
      createdAt: new Date().toISOString(),
    } as never);
    expect(cat).toBe("BRAND_VOICE_PREFERENCE");
  });

  it("distinguishes change nature (§4: factual vs stylistic vs strategic)", () => {
    expect(
      detectChangeNature("BRAND_FACT_CORRECTION", { feedback: {} } as never),
    ).toBe("factual");
    expect(
      detectChangeNature("BRAND_VOICE_PREFERENCE", { feedback: {} } as never),
    ).toBe("stylistic");
    expect(
      detectChangeNature("STRATEGIC_DECISION", { feedback: {} } as never),
    ).toBe("strategic");
  });
});

describe("Output evaluation — meaningful diff gating (§8)", () => {
  it("ignores trivial formatting changes", () => {
    expect(
      isMeaningfulEdit({
        originalText: "Hello, world!",
        finalText: "Hello world",
      }),
    ).toBe(false);
  });

  it("treats substantial rewrites as meaningful", () => {
    expect(
      isMeaningfulEdit({
        originalText: "Our revolutionary world-class unparalleled solution transforms your workflow!",
        finalText: "We help small shops cut picking time in half.",
      }),
    ).toBe(true);
  });

  it("treats identical texts as not meaningful", () => {
    expect(isMeaningfulEdit({ originalText: "Same", finalText: "Same" })).toBe(false);
  });
});
