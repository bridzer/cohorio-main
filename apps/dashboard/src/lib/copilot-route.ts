export type CopilotRoute = {
  workspaceId: string;
  jobId: string;
};

const RULES: Array<{ pattern: RegExp; route: CopilotRoute }> = [
  {
    pattern: /\b(ad creative|headlines?|ad copy|google ads|meta ads)\b/i,
    route: { workspaceId: "paid", jobId: "creative" },
  },
  {
    pattern: /\b(paid campaign|media plan|ad campaign)\b/i,
    route: { workspaceId: "paid", jobId: "campaign" },
  },
  {
    pattern: /\b(welcome email|email sequence|nurture sequence|drip)\b/i,
    route: { workspaceId: "content", jobId: "email" },
  },
  {
    pattern: /\bcold email\b/i,
    route: { workspaceId: "content", jobId: "cold-email" },
  },
  {
    pattern: /\b(linkedin|instagram|tiktok|social post|social content)\b/i,
    route: { workspaceId: "content", jobId: "social" },
  },
  {
    pattern: /\b(homepage|landing page|conversion rate|cro)\b/i,
    route: { workspaceId: "conversion", jobId: "page" },
  },
  {
    pattern: /\b(seo|search audit)\b/i,
    route: { workspaceId: "seo", jobId: "audit" },
  },
  {
    pattern: /\b(competitor|competition)\b/i,
    route: { workspaceId: "intelligence", jobId: "competition" },
  },
  {
    pattern: /\b(pric(e|ing)|packaging)\b/i,
    route: { workspaceId: "intelligence", jobId: "pricing" },
  },
  {
    pattern: /\b(churn|cancel)\b/i,
    route: { workspaceId: "retention", jobId: "churn" },
  },
];

export function routeCopilotRequest(prompt: string): CopilotRoute {
  const text = prompt.trim();
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.route;
  }
  return { workspaceId: "brand-brain", jobId: "ask" };
}
