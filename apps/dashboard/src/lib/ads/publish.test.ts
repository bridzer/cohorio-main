import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdNetworkError,
  parseAdCredential,
  publishCampaign,
  type PublishableCampaign,
} from "./publish";

const campaign: PublishableCampaign = {
  name: "Fall prospecting",
  platform: "meta",
  objective: "Sales",
  dailyBudget: 50,
  creatives: [
    {
      headline: "Canvas tote",
      primaryText: "Heavy cotton.",
      description: "Built to carry.",
      cta: "Shop now",
      landingPageUrl: "https://store.example.com/tote",
      imageUrl: null,
    },
  ],
};

describe("publishCampaign", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails closed without a Meta accountId and keeps the token out of the error", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const secret = "EAAB-super-secret-token";
    const error = await publishCampaign(campaign, { accessToken: secret }).catch(
      (reason: unknown) => reason as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Missing accountId for meta.");
    expect(String(error)).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses Google Ads without a developer token", async () => {
    await expect(
      publishCampaign(
        { ...campaign, platform: "google" },
        { accessToken: "token", customerId: "123-456-7890" },
      ),
    ).rejects.toThrow("Google Ads publish is not configured.");
  });

  it("reports a rejected network response without echoing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "token abc" } }, { status: 400 })),
    );
    await expect(
      publishCampaign(campaign, { accessToken: "abc", accountId: "act_123" }),
    ).rejects.toBeInstanceOf(AdNetworkError);
  });

  it("treats a TikTok non-zero code as a rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 40001 })));
    await expect(
      publishCampaign(
        { ...campaign, platform: "tiktok" },
        { accessToken: "abc", advertiserId: "1", adgroupId: "2" },
      ),
    ).rejects.toThrow("The ad network rejected the campaign.");
  });
});

describe("parseAdCredential", () => {
  it("reads JSON credentials and bare tokens", () => {
    expect(parseAdCredential('{"accessToken":"a","accountId":123}')).toEqual({
      accessToken: "a",
      accountId: "123",
    });
    expect(parseAdCredential("plain-token")).toEqual({ accessToken: "plain-token" });
  });
});
