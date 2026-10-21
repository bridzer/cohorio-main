const TOOL_LABELS: Record<string, string> = {
  load_skill: "Loaded a playbook",
  read_skill_reference: "Read a playbook reference",
  list_assets: "Checked saved work",
  fetch_url: "Read a web page",
  list_shopify_stores: "Looked up Shopify stores",
  shopify_overview: "Pulled store performance",
  shopify_products: "Scored product pages",
  ga4_sessions: "Pulled GA4 sessions",
  list_leads: "Checked RevOps leads",
  save_social_posts: "Saved social post drafts",
  draft_lifecycle_emails: "Drafted lifecycle emails",
  draft_ad_campaign: "Drafted an ad campaign",
  save_lead: "Saved a lead",
  create_launch: "Created a launch",
  attach_to_launch: "Attached work to a launch",
  remember: "Saved a preference",
  send_lifecycle_email: "Send a lifecycle email",
  publish_ad_campaign: "Publish an ad campaign",
  propose_brand_brain_update: "Update Brand Brain",
};

const TOOL_IN_PROGRESS: Record<string, string> = {
  load_skill: "Loading a playbook",
  read_skill_reference: "Reading a playbook reference",
  fetch_url: "Reading a web page",
  shopify_overview: "Pulling store performance",
  shopify_products: "Scoring product pages",
  ga4_sessions: "Pulling GA4 sessions",
  draft_lifecycle_emails: "Drafting lifecycle emails",
  draft_ad_campaign: "Drafting an ad campaign",
  save_social_posts: "Saving social post drafts",
};

function skillDetail(input: unknown) {
  if (!input || typeof input !== "object") return "";
  const { skill, file } = input as { skill?: unknown; file?: unknown };
  const parts = [skill, file].filter((part): part is string => typeof part === "string");
  return parts.length ? ` · ${parts.join(" / ")}` : "";
}

export function toolLabel(tool: string, input?: unknown) {
  const base = TOOL_LABELS[tool] ?? tool.replace(/_/g, " ");
  return tool === "load_skill" || tool === "read_skill_reference"
    ? `${base}${skillDetail(input)}`
    : base;
}

export function toolProgressLabel(tool: string) {
  return `${TOOL_IN_PROGRESS[tool] ?? TOOL_LABELS[tool] ?? tool.replace(/_/g, " ")}…`;
}

export const STOP_REASON_NOTE: Record<string, string> = {
  step_limit: "Stopped at the step limit for one request.",
  tool_limit: "Stopped at the tool limit for one request.",
  token_limit: "Stopped at the size limit for one request.",
};

export function formatDuration(milliseconds: number) {
  return milliseconds < 1000
    ? `${Math.max(1, Math.round(milliseconds))}ms`
    : `${(milliseconds / 1000).toFixed(1)}s`;
}
