import { contextToMarkdown } from "./marketing-context";
import {
  getMarketingContext,
  type StoredMarketingContext,
} from "./marketing-context-repository";

export const MISSING_BRAND_BRAIN_CONTEXT = "No Brand Brain context saved.";

export function renderWorkspaceContextMarkdown(
  stored: StoredMarketingContext | null,
) {
  if (!stored) return MISSING_BRAND_BRAIN_CONTEXT;
  return contextToMarkdown(stored.sections, stored.updatedAt);
}

export async function workspaceContextMarkdown(workspaceId: string) {
  return renderWorkspaceContextMarkdown(await getMarketingContext(workspaceId));
}
