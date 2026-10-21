import { z } from "zod";
import { buildLifecycleDrafts } from "@/lib/lifecycle-drafts";
import { insertLifecycleDrafts } from "@/lib/lifecycle-repository";
import { workspaceContextMarkdown } from "@/lib/marketing-context-prompt";
import { generateAdCampaign } from "@/lib/shopify/ad-campaign";
import {
  createAdCampaign,
  getCampaignProducts,
} from "@/lib/shopify/campaign-repository";
import { getConnectionForWorkspace } from "@/lib/shopify/repository";
import { clipSocialPost, SOCIAL_PLATFORMS } from "@/lib/social/generate";
import { insertSocialPost } from "@/lib/social/repository";
import {
  assetExists,
  attachLaunchAsset,
  createLaunch,
  LAUNCH_ASSET_TYPES,
  launchBelongsToWorkspace,
} from "@/lib/workspace-records/launches";
import { LEAD_STAGES, listLeads, upsertLead } from "@/lib/workspace-records/revops";
import { defineTool, ToolInputError } from "../registry";

export const saveSocialPosts = defineTool({
  name: "save_social_posts",
  tier: "draft",
  description:
    "Save social posts you have written as drafts in Social Studio. Nothing is published. Posts are clipped to each platform's length limit.",
  input: z.object({
    source: z.string().max(4_000).describe("The idea or source material the posts are based on"),
    posts: z
      .array(
        z.object({
          platform: z.enum(SOCIAL_PLATFORMS),
          body: z.string().min(1).max(5_000),
        }),
      )
      .min(1)
      .max(10),
  }),
  async execute(ctx, { source, posts }) {
    const saved = [];
    for (const post of posts) {
      const row = await insertSocialPost({
        workspaceId: ctx.workspaceId,
        platform: post.platform,
        body: clipSocialPost(post.body, post.platform),
        sourcePrompt: source || null,
      });
      saved.push({ id: row.id, platform: row.platform, status: row.status });
    }
    return { saved, location: "/social" };
  },
});

export const draftLifecycleEmails = defineTool({
  name: "draft_lifecycle_emails",
  tier: "draft",
  description:
    "Create the four standard ecommerce lifecycle email drafts (Abandoned checkout, Post-purchase, Win-back, Review request) grounded in Brand Brain. Nothing is sent.",
  input: z.object({}),
  async execute(ctx) {
    const drafts = await insertLifecycleDrafts(
      ctx.workspaceId,
      await buildLifecycleDrafts(await workspaceContextMarkdown(ctx.workspaceId)),
    );
    return {
      drafts: drafts.map((draft) => ({ id: draft.id, name: draft.name, trigger: draft.trigger })),
      location: "/commerce",
    };
  },
});

export const draftAdCampaign = defineTool({
  name: "draft_ad_campaign",
  tier: "draft",
  description:
    "Build a draft ad campaign (strategy plus three creatives per product) for Shopify products. Saved as a draft for review; nothing is published.",
  input: z.object({
    connectionId: z.string().uuid(),
    name: z.string().min(1).max(120),
    platform: z.enum(["meta", "google", "tiktok"]),
    objective: z.string().min(1).max(80),
    dailyBudget: z.number().positive().max(1_000_000),
    audience: z.string().min(1).max(500),
    valueProposition: z.string().min(1).max(1_000),
    offer: z.string().max(500).optional().describe("Only an offer the user or Brand Brain actually states"),
    landingPageUrl: z.string().url().startsWith("https://").max(2_000).optional(),
    productIds: z
      .array(z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/))
      .min(1)
      .max(10),
  }),
  async execute(ctx, input) {
    const connection = await getConnectionForWorkspace(input.connectionId, ctx.workspaceId);
    if (!connection) throw new ToolInputError("Shopify store not found.");
    const productIds = [...new Set(input.productIds)];
    const products = await getCampaignProducts(input.connectionId, ctx.workspaceId, productIds);
    if (products.length !== productIds.length) {
      throw new ToolInputError("One or more products were not found. Use ids from shopify_products.");
    }
    const brief = {
      name: input.name,
      platform: input.platform,
      objective: input.objective,
      dailyBudget: input.dailyBudget,
      currencyCode: connection.currencyCode ?? "USD",
      audience: input.audience,
      valueProposition: input.valueProposition,
      offer: input.offer?.trim() || null,
      landingPageUrl: input.landingPageUrl ?? null,
    };
    const generated = generateAdCampaign(
      brief,
      products,
      await workspaceContextMarkdown(ctx.workspaceId),
    );
    const campaign = await createAdCampaign({
      connectionId: input.connectionId,
      workspaceId: ctx.workspaceId,
      ...brief,
      selectedProductIds: productIds,
      strategy: generated.strategy,
      creatives: generated.creatives,
    });
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      strategy: generated.strategy,
      creatives: generated.creatives.map(({ productTitle, angle, headline, primaryText, cta }) => ({
        productTitle,
        angle,
        headline,
        primaryText,
        cta,
      })),
      location: "/commerce",
    };
  },
});

export const listRevopsLeads = defineTool({
  name: "list_leads",
  tier: "read",
  description: "List RevOps leads in this workspace with stage and score (0-100), highest score first.",
  input: z.object({ limit: z.number().int().min(1).max(100).default(25) }),
  async execute(ctx, { limit }) {
    return (await listLeads(ctx.workspaceId)).slice(0, limit);
  },
});

export const saveLead = defineTool({
  name: "save_lead",
  tier: "draft",
  description:
    "Create or update a RevOps lead by email with a lifecycle stage and score. Only for people the user named; never invent leads.",
  input: z.object({
    email: z.string().email().max(320),
    stage: z.enum(LEAD_STAGES),
    score: z.number().int().min(0).max(100),
  }),
  async execute(ctx, input) {
    return upsertLead(ctx.workspaceId, { ...input, email: input.email.toLowerCase() });
  },
});

export const createLaunchRecord = defineTool({
  name: "create_launch",
  tier: "draft",
  description: "Create a launch record that groups related assets (copilot answers, social posts, lifecycle emails).",
  input: z.object({ name: z.string().min(1).max(120) }),
  async execute(ctx, { name }) {
    const launch = await createLaunch(ctx.workspaceId, name);
    return { id: launch.id, name: launch.name, location: "/launch" };
  },
});

export const attachToLaunch = defineTool({
  name: "attach_to_launch",
  tier: "draft",
  description: "Attach an existing asset to a launch. Use ids returned by other tools or list_assets.",
  input: z.object({
    launchId: z.string().uuid(),
    assetType: z.enum(LAUNCH_ASSET_TYPES),
    assetId: z.string().uuid(),
  }),
  async execute(ctx, input) {
    if (!(await launchBelongsToWorkspace(ctx.workspaceId, input.launchId))) {
      throw new ToolInputError("Launch not found.");
    }
    if (!(await assetExists(ctx.workspaceId, input.assetType, input.assetId))) {
      throw new ToolInputError("Asset not found.");
    }
    await attachLaunchAsset(input.launchId, input.assetType, input.assetId);
    return { attached: true };
  },
});
