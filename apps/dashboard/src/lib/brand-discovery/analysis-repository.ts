import { query } from "@/lib/database";
import type { BusinessModel, StorePlatform } from "./classify";

export type WebsiteAnalysis = {
  workspaceId: string;
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
  updatedAt: string;
};

export type WebsiteAnalysisInput = Omit<WebsiteAnalysis, "workspaceId" | "updatedAt">;

type WebsiteAnalysisRow = {
  workspace_id: string;
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
  updated_at: Date | string;
};

const COLUMNS = `workspace_id, url, platform, business_model, confidence,
  title, description, emails, phones, socials, headings, signals, updated_at`;

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

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function publicAnalysis(row: WebsiteAnalysisRow): WebsiteAnalysis {
  return {
    workspaceId: row.workspace_id,
    url: row.url,
    platform: oneOf(row.platform, ["shopify", "woocommerce", "wix", "squarespace", "webflow", "bigcommerce", "magento", "custom", "unknown"] as const, "unknown"),
    businessModel: oneOf(row.business_model, ["shopify-store", "ecommerce", "standalone", "unknown"] as const, "unknown"),
    confidence: oneOf(row.confidence, ["high", "medium", "low"] as const, "low"),
    title: row.title,
    description: row.description,
    emails: strings(row.emails),
    phones: strings(row.phones),
    socials: socialEntries(row.socials),
    headings: strings(row.headings),
    signals: strings(row.signals),
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
       workspace_id, url, platform, business_model, confidence, title,
       description, emails, phones, socials, headings, signals, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET
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
       updated_at = NOW()
     RETURNING ${COLUMNS}`,
    [
      workspaceId,
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
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Unable to save website analysis.");
  return publicAnalysis(row);
}
