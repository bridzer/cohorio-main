import { describe, expect, it } from "vitest";
import { contextToMarkdown } from "../marketing-context";
import {
  clipSocialPost,
  generateSocialPosts,
  socialGenerationPrompt,
} from "./generate";

const brandMarkdown = contextToMarkdown(
  {
    productOverview: {
      oneLiner: "Acme widgets cut warehouse picking time in half",
    },
    brandVoice: {
      tone: "Direct and practical",
    },
  },
  "2026-09-29T12:00:00.000Z",
);

describe("social generation prompts", () => {
  it("prepends Brand Brain markdown to the template prompt", () => {
    const prompt = socialGenerationPrompt({
      source: "Ship the one-liner in every post.",
      platform: "LinkedIn",
      brandContextMarkdown: brandMarkdown,
      tone: "Clear & insightful",
    });
    expect(prompt.startsWith(brandMarkdown)).toBe(true);
    expect(prompt).toContain("Platform: LinkedIn");
    expect(prompt).toContain("Source:\nShip the one-liner in every post.");
  });

  it("grounds generated posts in the Brand Brain one-liner", () => {
    const posts = generateSocialPosts({
      source: "Ship the one-liner in every post.",
      platforms: ["LinkedIn", "X"],
      brandContextMarkdown: brandMarkdown,
      tone: "Clear & insightful",
    });
    expect(posts.LinkedIn).toContain(
      "Acme widgets cut warehouse picking time in half",
    );
    expect(posts.X).toContain("Acme widgets cut warehouse picking time in half");
    expect(posts.Instagram).toBeUndefined();
  });
});

describe("clipSocialPost", () => {
  it("applies TikTok and Facebook limits", () => {
    const long = "word ".repeat(2_000);
    expect(clipSocialPost(long, "TikTok").length).toBeLessThanOrEqual(2_200);
    expect(clipSocialPost(long, "Facebook").length).toBeLessThanOrEqual(4_000);
    expect(clipSocialPost(long, "Facebook").length).toBeGreaterThan(2_200);
  });
});
