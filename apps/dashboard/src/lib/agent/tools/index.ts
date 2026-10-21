import type { AgentTool } from "../types";
import {
  attachToLaunch,
  createLaunchRecord,
  draftAdCampaign,
  draftLifecycleEmails,
  listRevopsLeads,
  saveLead,
  saveSocialPosts,
} from "./drafts";
import { proposeBrandBrainUpdate, publishAdCampaign, sendLifecycleEmail } from "./external";
import { remember } from "./memory";
import { loadSkill, readSkillReference } from "./skills";
import {
  fetchUrl,
  ga4Sessions,
  listAssets,
  listShopifyStores,
  shopifyOverview,
  shopifyProducts,
} from "./workspace";

export const AGENT_TOOLS: AgentTool[] = [
  loadSkill,
  readSkillReference,
  listAssets,
  fetchUrl,
  listShopifyStores,
  shopifyOverview,
  shopifyProducts,
  ga4Sessions,
  listRevopsLeads,
  saveSocialPosts,
  draftLifecycleEmails,
  draftAdCampaign,
  saveLead,
  createLaunchRecord,
  attachToLaunch,
  remember,
  sendLifecycleEmail,
  publishAdCampaign,
  proposeBrandBrainUpdate,
];
