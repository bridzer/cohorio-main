import { AD_PROVIDERS, parseAdCredential, PublishConfigError, publishCampaign } from "./publish";
import { loadIntegration } from "@/lib/integrations/store";
import {
  getAdCampaign,
  markAdCampaignPublished,
} from "@/lib/shopify/campaign-repository";

export class CampaignNotFoundError extends Error {
  constructor() {
    super("Campaign not found.");
  }
}

/** Loads the workspace's campaign and ad credential, publishes, and records the network reference. */
export async function publishWorkspaceCampaign(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
) {
  const campaign = await getAdCampaign(connectionId, workspaceId, campaignId);
  if (!campaign) throw new CampaignNotFoundError();

  const provider = AD_PROVIDERS[campaign.platform];
  const plaintext = await loadIntegration(workspaceId, provider);
  if (!plaintext) throw new PublishConfigError(`${provider} is not connected.`);

  const reference = await publishCampaign(campaign, parseAdCredential(plaintext));
  return markAdCampaignPublished(connectionId, workspaceId, campaignId, reference);
}
