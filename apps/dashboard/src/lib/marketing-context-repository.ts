import { query } from "@/lib/database";
import type {
  ContextSectionId,
  ContextSectionValues,
  MarketingContext,
} from "@/lib/marketing-context";

type MarketingContextRow = {
  workspace_id: string;
  sections: MarketingContext;
  created_at: Date | string;
  updated_at: Date | string;
};

export type StoredMarketingContext = {
  workspaceId: string;
  sections: MarketingContext;
  createdAt: string;
  updatedAt: string;
};

function publicContext(row: MarketingContextRow): StoredMarketingContext {
  return {
    workspaceId: row.workspace_id,
    sections: row.sections ?? {},
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getMarketingContext(workspaceId: string) {
  const result = await query<MarketingContextRow>(
    `SELECT workspace_id, sections, created_at, updated_at
       FROM product_marketing_contexts
      WHERE workspace_id = $1`,
    [workspaceId],
  );
  return result.rows[0] ? publicContext(result.rows[0]) : null;
}

export async function saveMarketingContextSection(
  workspaceId: string,
  sectionId: ContextSectionId,
  values: ContextSectionValues,
) {
  const result = await query<MarketingContextRow>(
    `INSERT INTO product_marketing_contexts (workspace_id, sections)
     VALUES ($1, jsonb_build_object($2::text, $3::jsonb))
     ON CONFLICT (workspace_id) DO UPDATE
       SET sections = product_marketing_contexts.sections || EXCLUDED.sections,
           updated_at = NOW()
     RETURNING workspace_id, sections, created_at, updated_at`,
    [workspaceId, sectionId, JSON.stringify(values)],
  );
  return publicContext(result.rows[0]);
}
