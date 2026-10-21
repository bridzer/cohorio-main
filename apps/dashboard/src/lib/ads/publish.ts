import type { AdPlatform, CampaignCreative } from "@/lib/shopify/ad-campaign";

export const AD_PROVIDERS: Record<AdPlatform, string> = {
  meta: "meta-ads",
  google: "google-ads",
  tiktok: "tiktok-ads",
};

export type AdCredential = {
  accessToken?: string;
  accountId?: string;
  developerToken?: string;
  customerId?: string;
  loginCustomerId?: string;
  advertiserId?: string;
  adgroupId?: string;
};

export type PublishableCampaign = {
  name: string;
  platform: AdPlatform;
  objective: string;
  dailyBudget: number;
  creatives: Pick<
    CampaignCreative,
    "headline" | "primaryText" | "description" | "cta" | "landingPageUrl" | "imageUrl"
  >[];
};

/** Configuration problems the user can fix in Settings. Never carries credential values. */
export class PublishConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PUBLISH_CONFIG";
  }
}

/** The network answered with a non-success response. */
export class AdNetworkError extends Error {
  constructor() {
    super("The ad network rejected the campaign.");
    this.name = "AD_NETWORK_REJECTED";
  }
}

/**
 * Accepts the vault plaintext: a JSON object with the fields for that network,
 * or a bare access token string.
 */
export function parseAdCredential(plaintext: string): AdCredential {
  const trimmed = plaintext.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const credential: AdCredential = {};
      for (const key of [
        "accessToken",
        "accountId",
        "developerToken",
        "customerId",
        "loginCustomerId",
        "advertiserId",
        "adgroupId",
      ] as const) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim()) {
          credential[key] = value.trim();
        } else if (typeof value === "number") {
          credential[key] = String(value);
        }
      }
      return credential;
    } catch {
      throw new PublishConfigError("The saved ad credential is not valid JSON.");
    }
  }
  return trimmed ? { accessToken: trimmed } : {};
}

function required(
  credential: AdCredential,
  field: keyof AdCredential,
  platform: AdPlatform,
) {
  const value = credential[field];
  if (!value) throw new PublishConfigError(`Missing ${field} for ${platform}.`);
  return value;
}

function digits(value: string, field: string, platform: AdPlatform) {
  const normalized = value.replace(/^act_/, "").replaceAll("-", "");
  if (!/^\d{1,20}$/.test(normalized)) {
    throw new PublishConfigError(`Invalid ${field} for ${platform}.`);
  }
  return normalized;
}

async function publishMeta(campaign: PublishableCampaign, credential: AdCredential) {
  const accountId = digits(required(credential, "accountId", "meta"), "accountId", "meta");
  const accessToken = required(credential, "accessToken", "meta");
  const ids: string[] = [];
  for (const [index, creative] of campaign.creatives.entries()) {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/act_${accountId}/adcreatives`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${campaign.name} #${index + 1}`,
          title: creative.headline,
          body: creative.primaryText,
          link_url: creative.landingPageUrl ?? undefined,
          image_url: creative.imageUrl ?? undefined,
        }),
      },
    );
    if (!response.ok) throw new AdNetworkError();
    const payload = (await response.json()) as { id?: unknown };
    if (typeof payload.id === "string") ids.push(payload.id);
  }
  return ids.join(",");
}

async function publishGoogle(campaign: PublishableCampaign, credential: AdCredential) {
  if (!credential.developerToken) {
    throw new PublishConfigError("Google Ads publish is not configured.");
  }
  const customerId = digits(
    required(credential, "customerId", "google"),
    "customerId",
    "google",
  );
  const accessToken = required(credential, "accessToken", "google");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": credential.developerToken,
    "Content-Type": "application/json",
  };
  if (credential.loginCustomerId) {
    headers["login-customer-id"] = digits(
      credential.loginCustomerId,
      "loginCustomerId",
      "google",
    );
  }
  const budgetResource = `customers/${customerId}/campaignBudgets/-1`;
  const response = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:mutate`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        mutateOperations: [
          {
            campaignBudgetOperation: {
              create: {
                resourceName: budgetResource,
                name: `${campaign.name} budget`,
                amountMicros: String(Math.round(campaign.dailyBudget * 1_000_000)),
                deliveryMethod: "STANDARD",
              },
            },
          },
          {
            campaignOperation: {
              create: {
                name: campaign.name,
                status: "PAUSED",
                advertisingChannelType: "SEARCH",
                campaignBudget: budgetResource,
                manualCpc: {},
              },
            },
          },
        ],
      }),
    },
  );
  if (!response.ok) throw new AdNetworkError();
  const payload = (await response.json()) as {
    mutateOperationResponses?: { campaignResult?: { resourceName?: unknown } }[];
  };
  const resourceName = payload.mutateOperationResponses
    ?.map((item) => item.campaignResult?.resourceName)
    .find((value): value is string => typeof value === "string");
  return resourceName ?? "";
}

async function publishTikTok(campaign: PublishableCampaign, credential: AdCredential) {
  const advertiserId = required(credential, "advertiserId", "tiktok");
  const adgroupId = required(credential, "adgroupId", "tiktok");
  const accessToken = required(credential, "accessToken", "tiktok");
  const response = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/ad/create/",
    {
      method: "POST",
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        advertiser_id: advertiserId,
        adgroup_id: adgroupId,
        creatives: campaign.creatives.map((creative, index) => ({
          ad_name: `${campaign.name} #${index + 1}`,
          ad_text: creative.primaryText,
          landing_page_url: creative.landingPageUrl ?? undefined,
          call_to_action: creative.cta,
        })),
      }),
    },
  );
  if (!response.ok) throw new AdNetworkError();
  const payload = (await response.json()) as {
    code?: unknown;
    data?: { ad_ids?: unknown };
  };
  if (payload.code !== 0) throw new AdNetworkError();
  return Array.isArray(payload.data?.ad_ids) ? payload.data.ad_ids.join(",") : "";
}

export async function publishCampaign(
  campaign: PublishableCampaign,
  credential: AdCredential,
) {
  switch (campaign.platform) {
    case "meta":
      return publishMeta(campaign, credential);
    case "google":
      return publishGoogle(campaign, credential);
    case "tiktok":
      return publishTikTok(campaign, credential);
    default:
      throw new PublishConfigError("Unsupported ad platform.");
  }
}
