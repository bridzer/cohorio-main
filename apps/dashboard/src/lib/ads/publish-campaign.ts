import { AD_PROVIDERS, PublishConfigError, parseAdCredential, publishCampaign } from "./publish";
import { loadIntegration } from "@/lib/integrations/store";
import type { CampaignCreative } from "@/lib/shopify/ad-campaign";
import {
  getAdCampaign,
  markAdCampaignPublished,
} from "@/lib/shopify/campaign-repository";

export class CampaignNotFoundError extends Error {
  constructor() {
    super("Campaign not found.");
  }
}

/**
 * Resolves which creatives a publish sends. Omitting the list keeps the
 * legacy behavior (everything); an explicit list must be non-empty and match
 * real creative ids. Pure and unit-tested.
 */
export function resolvePublishCreatives(
  creatives: CampaignCreative[],
  creativeIds?: string[],
) {
  if (creativeIds === undefined) return creatives;
  if (!creativeIds.length) {
    throw new RangeError("Select at least one creative to publish.");
  }
  const wanted = new Set(creativeIds);
  const selected = creatives.filter((creative) => wanted.has(creative.id));
  if (selected.length !== wanted.size) {
    throw new RangeError("One or more selected creatives were not found.");
  }
  return selected;
}

/** Loads the workspace's campaign and ad credential, publishes the selected creatives, and records the network reference. */
export async function publishWorkspaceCampaign(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
  creativeIds?: string[],
) {
  const campaign = await getAdCampaign(connectionId, workspaceId, campaignId);
  if (!campaign) throw new CampaignNotFoundError();
  const selected = resolvePublishCreatives(campaign.creatives, creativeIds);

  const provider = AD_PROVIDERS[campaign.platform];
  const plaintext = await loadIntegration(workspaceId, provider);
  if (!plaintext) throw new PublishConfigError(`${provider} is not connected.`);

  const reference = await publishCampaign(
    { ...campaign, creatives: selected },
    parseAdCredential(plaintext),
  );
  return markAdCampaignPublished(
    connectionId,
    workspaceId,
    campaignId,
    reference,
    selected.map((creative) => creative.id),
  );
}
