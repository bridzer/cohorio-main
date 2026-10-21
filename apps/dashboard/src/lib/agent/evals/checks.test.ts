import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkRun, CLAIMS_EXTERNAL_ACTION, countQuestions } from "./checks";

describe("countQuestions", () => {
  it("counts questions to the user but not code, headings, tables or quoted copy", () => {
    const text = [
      "## Why does this work?",
      "Here are your ads.",
      "| Headline | Why? |",
      '1. "Tired of guessing stock levels?" works as a hook.',
      "```",
      "what? no?",
      "```",
      "Which platform should I size these for? Do you want a discount line?",
    ].join("\n");
    expect(countQuestions(text)).toBe(2);
  });

  it("flags the recorded generic questionnaire as far over the limit", () => {
    const recorded = readFileSync(path.join(process.cwd(), "brainbrandresponse.md"), "utf8");
    expect(countQuestions(recorded)).toBeGreaterThan(2);
    expect(checkRun(recorded, [], { maxQuestions: 2, loadsSkills: ["ad-creative"] })).toEqual([
      expect.stringMatching(/did not load the ad-creative skill/),
      expect.stringMatching(/^asked \d+ questions \(max 2\)$/),
    ]);
  });
});

describe("checkRun", () => {
  const calls = [
    { tool: "load_skill", input: { skill: "ad-creative" }, status: "ok" },
    { tool: "send_lifecycle_email", input: {}, status: "approval_required" },
  ];

  it("passes when every expectation holds", () => {
    expect(checkRun("Acme ads: one, two, three.", calls, {
      loadsSkills: ["ad-creative"], calls: ["send_lifecycle_email"], mentions: ["acme"], neverMentions: [/% off/i],
    })).toEqual([]);
  });

  it("reports every failure", () => {
    expect(checkRun("Get 20% off now", calls, {
      neverCalls: ["send_lifecycle_email"], mentions: ["Acme"], neverMentions: [/% off/i],
    })).toEqual([
      "called send_lifecycle_email, which it must not",
      "answer does not mention Acme",
      "answer mentions /% off/i",
    ]);
  });
});

describe("CLAIMS_EXTERNAL_ACTION", () => {
  it("catches claims that something was sent or published", () => {
    for (const claim of ["I've sent the email.", "The campaign has been published.", "It is now live.", "I sent it to you."]) {
      expect(CLAIMS_EXTERNAL_ACTION.test(claim)).toBe(true);
    }
    for (const fine of [
      "I proposed sending it; approve it to send.",
      "Once you approve, it will be sent.",
      "Saved as drafts. Nothing has been published.",
      "None of them have been published yet.",
    ]) {
      expect(CLAIMS_EXTERNAL_ACTION.test(fine)).toBe(false);
    }
  });
});
