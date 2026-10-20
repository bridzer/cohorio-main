import { SKILL_CATEGORY } from "./skills/categories";

const JOB_SKILL: Record<string, string> = {
  "brand-brain:ask": "product-marketing",
  "intelligence:growth-strategy": "marketing-plan",
  "intelligence:competition": "competitor-profiling",
  "intelligence:orchestrate": "marketing-council",
  "intelligence:recommend": "marketing-ideas",
  "intelligence:research": "customer-research",
  "intelligence:psychology": "marketing-psychology",
  "intelligence:pricing": "pricing",
  "intelligence:offer": "offers",
  "intelligence:launch": "launch",
  "conversion:page": "cro",
  "conversion:signup": "signup",
  "conversion:activation": "onboarding",
  "conversion:form": "form",
  "conversion:popup": "popups",
  "conversion:upgrade": "paywalls",
  "content:page-copy": "copywriting",
  "content:edit": "copy-editing",
  "content:cold-email": "cold-email",
  "content:email": "emails",
  "content:sms": "sms",
  "content:social": "social",
  "content:topics": "content-strategy",
  "content:lead-magnet": "lead-magnets",
  "content:image": "image",
  "content:video": "video",
  "seo:audit": "seo-audit",
  "seo:ai": "ai-seo",
  "seo:scale": "programmatic-seo",
  "seo:structure": "site-architecture",
  "seo:compare": "competitors",
  "seo:schema": "schema",
  "seo:aso": "aso",
  "seo:directories": "directory-submissions",
  "paid:campaign": "ads",
  "paid:creative": "ad-creative",
  "paid:creators": "influencer-marketing",
  "paid:press": "public-relations",
  "measurement:tracking": "analytics",
  "measurement:test": "ab-testing",
  "measurement:attribution": "attribution",
  "retention:churn": "churn-prevention",
  "growth:partners": "co-marketing",
  "growth:tool": "free-tools",
  "growth:referral": "referrals",
  "growth:community": "community-marketing",
  "growth:loop": "marketing-loops",
  "sales:pipeline": "revops",
  "sales:collateral": "sales-enablement",
  "sales:prospects": "prospecting",
};

export function skillForJob(workspaceId: string, jobId: string) {
  const skill = JOB_SKILL[`${workspaceId}:${jobId}`];
  if (!skill || !SKILL_CATEGORY[skill]) {
    throw new Error("That workspace request is not available.");
  }
  return skill;
}

export function assignedSkills() {
  return Object.values(JOB_SKILL);
}
