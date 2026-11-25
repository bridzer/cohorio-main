import { describe, expect, it } from "vitest";
import {
  CHANNEL_GROUPS,
  MARKETING_CHANNELS,
  channelById,
  recommendChannels,
} from "./channels";

describe("channel directory", () => {
  it("uses known groups, unique ids, and honest provider mappings", () => {
    const groups = new Set(CHANNEL_GROUPS.map((group) => group.id));
    const ids = new Set<string>();
    for (const channel of MARKETING_CHANNELS) {
      expect(groups.has(channel.group)).toBe(true);
      expect(ids.has(channel.id)).toBe(false);
      ids.add(channel.id);
      expect(channel.label).toBeTruthy();
      for (const provider of channel.providers) {
        expect(typeof provider).toBe("string");
      }
    }
    expect(channelById("meta-ads")?.providers).toContain("meta-ads");
    expect(channelById("x")?.providers).toEqual([]);
    expect(channelById("nope")).toBeNull();
  });
});

describe("recommendChannels", () => {
  it("recommends the revenue loop for e-commerce", () => {
    const ids = recommendChannels({ organizationCategory: "ecommerce" }).map(
      (entry) => entry.channelId,
    );
    for (const expected of ["shopify", "meta-ads", "google-ads", "ga4"]) {
      expect(ids).toContain(expected);
    }
  });

  it("reads goals and audience with reasons attached", () => {
    const recommendations = recommendChannels({
      organizationCategory: "professional-services",
      goalsText: "Book more demos with enterprise buyers",
      audienceText: "B2B companies",
    });
    const linkedin = recommendations.find((entry) => entry.channelId === "linkedin");
    expect(linkedin).toBeDefined();
    expect(linkedin?.reasons.length).toBeGreaterThan(0);
  });

  it("boosts already-connected channels and caps output", () => {
    const recommendations = recommendChannels({
      organizationCategory: null,
      goalsText: null,
      audienceText: null,
      connectedProviders: ["ga4"],
    });
    expect(recommendations.map((entry) => entry.channelId)).toContain("ga4");
    expect(recommendations.length).toBeLessThanOrEqual(8);
  });

  it("returns nothing without evidence", () => {
    expect(
      recommendChannels({ organizationCategory: "unknown-category" }),
    ).toEqual([]);
  });
});
