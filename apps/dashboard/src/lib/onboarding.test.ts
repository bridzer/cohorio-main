import { describe, expect, it } from "vitest";
import {
  channelSelections,
  isOnboardingStage,
  isOrganizationCategory,
  ONBOARDING_STAGES,
  profileSchema,
  sessionPatchSchema,
} from "./onboarding";

describe("onboarding stages", () => {
  it("defines six sequential stages starting with profile", () => {
    expect(ONBOARDING_STAGES).toEqual([
      "profile",
      "objective",
      "brand",
      "channels",
      "integrations",
      "activation",
    ]);
    expect(isOnboardingStage("brand")).toBe(true);
    expect(isOnboardingStage("unknown")).toBe(false);
  });

  it("recognizes the seven organization categories", () => {
    for (const id of [
      "ecommerce",
      "physical-retail",
      "professional-services",
      "consumer-services",
      "media-content",
      "software-technology",
      "civic-social",
    ]) {
      expect(isOrganizationCategory(id)).toBe(true);
    }
    expect(isOrganizationCategory("nope")).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts a complete profile", () => {
    expect(
      profileSchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        phone: "+14155552671",
        city: "Austin",
        country: "USA",
      }).success,
    ).toBe(true);
  });

  it("requires names and validates international phone format", () => {
    expect(profileSchema.safeParse({ firstName: "", lastName: "L" }).success).toBe(false);
    expect(
      profileSchema.safeParse({ firstName: "A", lastName: "L", phone: "415-555-2671" })
        .success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ firstName: "A", lastName: "L", phone: "" }).success,
    ).toBe(true);
  });
});

describe("sessionPatchSchema", () => {
  it("accepts partial updates", () => {
    expect(sessionPatchSchema.safeParse({ objective: "business" }).success).toBe(true);
    expect(sessionPatchSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown stages, categories, urls, and stray keys", () => {
    expect(sessionPatchSchema.safeParse({ currentStage: "nope" }).success).toBe(false);
    expect(
      sessionPatchSchema.safeParse({ organizationCategory: "nope" }).success,
    ).toBe(false);
    expect(sessionPatchSchema.safeParse({ websiteUrl: "example.com" }).success).toBe(
      false,
    );
    expect(sessionPatchSchema.safeParse({ hacked: true }).success).toBe(false);
  });
});

describe("channelSelections", () => {
  it("parses id/intent objects and drops garbage", () => {
    expect(
      channelSelections([
        { id: "tiktok", intent: "using" },
        { id: "blog", intent: "planning" },
        { id: "x", intent: "someday" },
        { id: "", intent: "using" },
        null,
      ]),
    ).toEqual([
      { id: "tiktok", intent: "using" },
      { id: "blog", intent: "planning" },
    ]);
  });

  it("tolerates legacy id-only rows and non-arrays", () => {
    expect(channelSelections(["ga4", ""])).toEqual([{ id: "ga4", intent: "planning" }]);
    expect(channelSelections(null)).toEqual([]);
    expect(channelSelections({})).toEqual([]);
  });
});
