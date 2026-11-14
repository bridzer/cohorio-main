import { z } from "zod";
import { connectedLabels, connectedTools } from "@/lib/integrations/connectors";
import { listConfiguredProviders, loadGa4Settings } from "@/lib/integrations/store";
import {
  CONTEXT_SECTIONS,
  contextProgress,
  isContextSectionId,
  isSectionComplete,
  type MarketingContext,
} from "@/lib/marketing-context";
import { getMarketingContext } from "@/lib/marketing-context-repository";
import { listConnections } from "@/lib/shopify/repository";
import { defineTool } from "../registry";

/**
 * Auto-audit mode starts here. The model cannot know what it does not know:
 * whether Brand Brain exists, which stores and data sources are connected,
 * and what it must ask the user for. This read-only tool assembles that
 * starting state in one call so the audit does not burn steps discovering it.
 */

const ESSENTIAL_QUESTION_LIMIT = 8;

type EssentialQuestion = {
  section: string;
  sectionTitle: string;
  field: string;
  label: string;
  /** Placeholder text from Brand Brain setup: a suggested answer, not a fact. */
  suggestion: string;
};

/** Required Brand Brain fields that are still empty: the intake questions. */
function missingEssentials(sections: MarketingContext): EssentialQuestion[] {
  const questions: EssentialQuestion[] = [];
  for (const section of CONTEXT_SECTIONS) {
    const sectionId = section.id;
    if (!isContextSectionId(sectionId)) continue;
    if (isSectionComplete(sectionId, sections[sectionId])) continue;
    const values = sections[sectionId] ?? {};
    for (const field of section.fields) {
      if (!field.required || values[field.id]?.trim()) continue;
      questions.push({
        section: sectionId,
        sectionTitle: section.title,
        field: field.id,
        label: field.label,
        suggestion: field.placeholder,
      });
      if (questions.length >= ESSENTIAL_QUESTION_LIMIT) return questions;
    }
  }
  return questions;
}

export const storeAuditBrief = defineTool({
  name: "store_audit_brief",
  tier: "read",
  description:
    "Start here when the user asks for a full or auto audit of their store. Returns Brand Brain completeness with the exact missing essentials to ask the user for (with suggested answers), connected Shopify stores, connected marketing and SEO data sources, GA4 status, and the recommended audit plan per dimension. Call this before gathering any audit data.",
  input: z.object({}),
  async execute(ctx) {
    const [stored, connections, providers, ga4] = await Promise.all([
      getMarketingContext(ctx.workspaceId),
      listConnections(ctx.workspaceId),
      listConfiguredProviders(ctx.workspaceId),
      loadGa4Settings(ctx.workspaceId),
    ]);
    const sections = stored?.sections ?? {};
    const progress = contextProgress(sections);
    const essentials = missingEssentials(sections);
    const toolNames = new Set(connectedTools(providers).map((tool) => tool.name));
    const stores = connections.map((connection) => ({
      id: connection.id,
      name: connection.displayName,
      domain: connection.shopDomain,
      status: connection.status,
      productsCount: connection.productsCount,
      lastSyncedAt: connection.lastSyncedAt,
    }));
    const needsFromUser: { topic: string; question: string; suggestion: string }[] = [];
    if (essentials.length) {
      needsFromUser.push({
        topic: "Brand Brain",
        question:
          "Brand Brain is missing essentials the audit needs. Ask the user for these before the deep audit, showing each suggested answer:",
        suggestion: essentials.map((item) => `${item.label}: ${item.suggestion}`).join(" | "),
      });
    }
    if (!stores.length) {
      needsFromUser.push({
        topic: "Store",
        question:
          "No Shopify store is connected. Ask for the storefront URL to audit the public site, or point them at /connections to connect Shopify for synced product and revenue data.",
        suggestion: "https://your-store.myshopify.com",
      });
    }
    return {
      brandBrain: {
        present: stored !== null && progress.completedCount > 0,
        completedSections: progress.completedCount,
        totalSections: progress.totalSections,
        missingEssentials: essentials,
      },
      stores,
      dataSources: {
        providers: connectedLabels(providers),
        ga4Configured: Boolean(ga4?.propertyId),
        seoData: toolNames.has("seo_keyword_volume"),
        adsData:
          toolNames.has("meta_ads_performance") || toolNames.has("google_ads_performance"),
        emailData:
          toolNames.has("klaviyo_campaign_performance") ||
          toolNames.has("mailchimp_campaign_performance"),
      },
      needsFromUser,
      plan: [
        {
          dimension: "SEO and discoverability",
          tools: ["fetch_url", "seo_keyword_volume", "seo_google_results", "ga4_sessions"],
          skills: ["seo-audit", "ai-seo"],
        },
        {
          dimension: "Store and product discovery",
          tools: ["fetch_url", "shopify_products"],
          skills: ["site-architecture"],
        },
        {
          dimension: "Product-page conversion",
          tools: ["shopify_products", "shopify_overview"],
          skills: ["cro"],
        },
        {
          dimension: "Traffic and acquisition",
          tools: [
            "ga4_sessions",
            "plausible_traffic",
            "meta_ads_performance",
            "google_ads_performance",
          ],
          skills: ["analytics"],
        },
        {
          dimension: "Lifecycle and retention",
          tools: ["fetch_url", "klaviyo_campaign_performance", "mailchimp_campaign_performance"],
          skills: ["emails", "popups", "sms"],
        },
        {
          dimension: "Offer and trust",
          tools: ["fetch_url", "shopify_products"],
          skills: ["offers", "pricing"],
        },
      ],
    };
  },
});
