import { describe, expect, it } from "vitest";
import { objectiveById, rankObjectives } from "./objectives";

describe("rankObjectives", () => {
  it("ranks e-commerce toward product campaigns with reasons", () => {
    const ranked = rankObjectives({
      organizationCategory: "ecommerce",
      selectedChannelIds: ["meta-ads", "shopify"],
      connectedProviders: ["meta-ads"],
      goalsText: "Grow online revenue",
    });
    expect(ranked[0]?.id).toBe("product-campaign");
    expect(ranked[0]?.priority).toBe("high");
    expect(ranked[0]?.reasons.length).toBeGreaterThan(0);
    expect(ranked[0]?.href).toBe("/commerce");
  });

  it("surfaces completing the Brain when context is thin", () => {
    const ranked = rankObjectives({ brainCompleteness: 20 });
    expect(ranked[0]?.id).toBe("complete-brain");
  });

  it("marks unmet integration needs without hiding the option", () => {
    const ranked = rankObjectives({
      organizationCategory: "ecommerce",
      connectedProviders: [],
    });
    const campaign = ranked.find((entry) => entry.id === "product-campaign");
    expect(campaign).toBeDefined();
    expect(campaign?.requiredIntegrations).toContain("meta-ads");
    expect(
      campaign?.reasons.some((reason) => reason.includes("connected")),
    ).toBe(false);
  });

  it("keeps every href on a real route", () => {
    for (const entry of rankObjectives({})) {
      expect(["/", "/agent", "/social", "/commerce", "/onboarding/brain"]).toContain(
        entry.href,
      );
      expect(entry.priority).toMatch(/^(high|medium|low)$/);
    }
  });

  it("resolves catalog entries by id", () => {
    expect(objectiveById("seo")?.name).toBe("Improve website SEO");
    expect(objectiveById("nope")).toBeNull();
  });
});
