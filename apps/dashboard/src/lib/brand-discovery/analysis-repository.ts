import { query } from "@/lib/database";
import type { BusinessModel, StorePlatform } from "./classify";

export type WebsiteAnalysis = {
  workspaceId: string;
  organizationId: string | null;
  url: string;
  platform: StorePlatform;
  businessModel: BusinessModel;
  confidence: "high" | "medium" | "low";
  title: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  socials: { network: string; url: string }[];
  headings: string[];
  signals: string[];
  industry: string | null;
  inferredBusinessModel: string | null;
  productsServices: string[];
  messaging: string[];
  targetAudiences: string[];
  positioning: string | null;
  voiceCharacteristics: string[];
  marketingChannels: string[];
  seoOpportunities: string[];
  competitors: string[];
  missingInfo: string[];
  pagesCrawled: string[];
  intelligenceSummary: string | null;
  updatedAt: string;
};

export type WebsiteAnalysisInput = {
  organizationId?: string | null;
  url: string;
  platform: string;
  businessModel: string;
  confidence: "high" | "medium" | "low";
  title: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  socials: { network: string; url: string }[];
  headings: string[];
  signals: string[];
  industry?: string | null;
  inferredBusinessModel?: string | null;
  productsServices?: string[];
  messaging?: string[];
  targetAudiences?: string[];
  positioning?: string | null;
  voiceCharacteristics?: string[];
  marketingChannels?: string[];
  seoOpportunities?: string[];
  competitors?: string[];
  missingInfo?: string[];
  pagesCrawled?: string[];
  intelligenceSummary?: string | null;
};

type WebsiteAnalysisRow = {
  workspace_id: string;
  organization_id: string | null;
  url: string;
  platform: string;
  business_model: string;
  confidence: string;
  title: string | null;
  description: string | null;
  emails: unknown;
  phones: unknown;
  socials: unknown;
  headings: unknown;
  signals: unknown;
  industry: string | null;
  inferred_business_model: string | null;
  products_services: unknown;
  messaging: unknown;
  target_audiences: unknown;
  positioning: string | null;
  voice_characteristics: unknown;
  marketing_channels: unknown;
  seo_opportunities: unknown;
  competitors: unknown;
  missing_info: unknown;
  pages_crawled: unknown;
  intelligence_summary: string | null;
  updated_at: Date | string;
};

const COLUMNS = `workspace_id, organization_id, url, platform, business_model, confidence,
  title, description, emails, phones, socials, headings, signals,
  industry, inferred_business_model, products_services, messaging,
  target_audiences, positioning, voice_characteristics, marketing_channels,
  seo_opportunities, competitors, missing_info, pages_crawled,
  intelligence_summary, updated_at`;

const PLATFORMS: readonly string[] = [
  "shopify",
  "woocommerce",
  "wix",
  "squarespace",
  "webflow",
  "bigcommerce",
  "magento",
  "custom",
  "unknown",
];

const MODELS: readonly string[] = ["shopify-store", "ecommerce", "standalone", "unknown"];

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function socialEntries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { network: string; url: string } =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as { network?: unknown }).network === "string" &&
        typeof (entry as { url?: unknown }).url === "string",
    )
    .map((entry) => ({ network: entry.network, url: entry.url }));
}

function publicAnalysis(row: WebsiteAnalysisRow): WebsiteAnalysis {
  return {
    workspaceId: row.workspace_id,
    organizationId: row.organization_id ?? null,
    url: row.url,
    platform: (PLATFORMS.includes(row.platform) ? row.platform : "unknown") as StorePlatform,
    businessModel: (MODELS.includes(row.business_model) ? row.business_model : "unknown") as BusinessModel,
    confidence: row.confidence === "high" || row.confidence === "medium" ? row.confidence : "low",
    title: row.title,
    description: row.description,
    emails: strings(row.emails),
    phones: strings(row.phones),
    socials: socialEntries(row.socials),
    headings: strings(row.headings),
    signals: strings(row.signals),
    industry: row.industry ?? null,
    inferredBusinessModel: row.inferred_business_model ?? null,
    productsServices: strings(row.products_services),
    messaging: strings(row.messaging),
    targetAudiences: strings(row.target_audiences),
    positioning: row.positioning ?? null,
    voiceCharacteristics: strings(row.voice_characteristics),
    marketingChannels: strings(row.marketing_channels),
    seoOpportunities: strings(row.seo_opportunities),
    competitors: strings(row.competitors),
    missingInfo: strings(row.missing_info),
    pagesCrawled: strings(row.pages_crawled),
    intelligenceSummary: row.intelligence_summary ?? null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getWebsiteAnalysis(workspaceId: string) {
  const result = await query<WebsiteAnalysisRow>(
    `SELECT ${COLUMNS} FROM website_analyses WHERE workspace_id = $1`,
    [workspaceId],
  );
  return result.rows[0] ? publicAnalysis(result.rows[0]) : null;
}

export async function saveWebsiteAnalysis(
  workspaceId: string,
  input: WebsiteAnalysisInput,
) {
  const result = await query<WebsiteAnalysisRow>(
    `INSERT INTO website_analyses (
       workspace_id, organization_id, url, platform, business_model, confidence,
       title, description, emails, phones, socials, headings, signals,
       industry, inferred_business_model, products_services, messaging,
       target_audiences, positioning, voice_characteristics, marketing_channels,
       seo_opportunities, competitors, missing_info, pages_crawled,
       intelligence_summary, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb,
       $14, $15, $16::jsonb, $17::jsonb,
       $18::jsonb, $19, $20::jsonb, $21::jsonb,
       $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb,
       $26, NOW()
     )
     ON CONFLICT (workspace_id) DO UPDATE SET
       organization_id = COALESCE(EXCLUDED.organization_id, website_analyses.organization_id),
       url = EXCLUDED.url,
       platform = EXCLUDED.platform,
       business_model = EXCLUDED.business_model,
       confidence = EXCLUDED.confidence,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       emails = EXCLUDED.emails,
       phones = EXCLUDED.phones,
       socials = EXCLUDED.socials,
       headings = EXCLUDED.headings,
       signals = EXCLUDED.signals,
       industry = EXCLUDED.industry,
       inferred_business_model = EXCLUDED.inferred_business_model,
       products_services = EXCLUDED.products_services,
       messaging = EXCLUDED.messaging,
       target_audiences = EXCLUDED.target_audiences,
       positioning = EXCLUDED.positioning,
       voice_characteristics = EXCLUDED.voice_characteristics,
       marketing_channels = EXCLUDED.marketing_channels,
       seo_opportunities = EXCLUDED.seo_opportunities,
       competitors = EXCLUDED.competitors,
       missing_info = EXCLUDED.missing_info,
       pages_crawled = EXCLUDED.pages_crawled,
       intelligence_summary = EXCLUDED.intelligence_summary,
       updated_at = NOW()
     RETURNING ${COLUMNS}`,
    [
      workspaceId,
      input.organizationId ?? null,
      input.url,
      input.platform,
      input.businessModel,
      input.confidence,
      input.title,
      input.description,
      JSON.stringify(input.emails),
      JSON.stringify(input.phones),
      JSON.stringify(input.socials),
      JSON.stringify(input.headings),
      JSON.stringify(input.signals),
      input.industry ?? null,
      input.inferredBusinessModel ?? null,
      JSON.stringify(input.productsServices ?? []),
      JSON.stringify(input.messaging ?? []),
      JSON.stringify(input.targetAudiences ?? []),
      input.positioning ?? null,
      JSON.stringify(input.voiceCharacteristics ?? []),
      JSON.stringify(input.marketingChannels ?? []),
      JSON.stringify(input.seoOpportunities ?? []),
      JSON.stringify(input.competitors ?? []),
      JSON.stringify(input.missingInfo ?? []),
      JSON.stringify(input.pagesCrawled ?? []),
      input.intelligenceSummary ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Unable to save website analysis.");
  return publicAnalysis(row);
}
