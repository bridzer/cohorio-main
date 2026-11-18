import { describe, expect, it } from "vitest";
import { publishAccountLabel } from "./destination-label";

describe("publishAccountLabel", () => {
  it("labels a Meta connection with ad account and Page", () => {
    expect(
      publishAccountLabel(
        "meta-ads",
        JSON.stringify({
          accessToken: "secret",
          accountId: "act_123",
          page: { id: "999", name: "Acme Shop" },
        }),
      ),
    ).toBe("Ad account act_123 · Page Acme Shop");
  });

  it("labels a Meta connection with only an ad account", () => {
    expect(
      publishAccountLabel("meta-ads", JSON.stringify({ accessToken: "s", accountId: "123" })),
    ).toBe("Ad account 123");
  });

  it("labels Google and TikTok connections", () => {
    expect(
      publishAccountLabel("google-ads", JSON.stringify({ customerId: "111-222-3333" })),
    ).toBe("Customer 111-222-3333");
    expect(
      publishAccountLabel("tiktok-ads", JSON.stringify({ advertiserId: "7001" })),
    ).toBe("Advertiser 7001");
  });

  it("returns null for anything unusable and never leaks the token", () => {
    expect(publishAccountLabel("meta-ads", "not json")).toBeNull();
    expect(publishAccountLabel("meta-ads", JSON.stringify({ accessToken: "s" }))).toBeNull();
    expect(publishAccountLabel("ga4", JSON.stringify({ refreshToken: "s" }))).toBeNull();
    const label = publishAccountLabel(
      "meta-ads",
      JSON.stringify({ accessToken: "super-secret", accountId: "1" }),
    );
    expect(label).not.toContain("super-secret");
  });
});
