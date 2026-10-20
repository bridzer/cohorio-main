export const SKILL_CATEGORIES = [
  "Conversion Optimization",
  "Content & Copy",
  "SEO & Discovery",
  "Paid & Distribution",
  "Measurement & Testing",
  "Retention",
  "Growth Engineering",
  "Strategy & Monetization",
  "Sales & RevOps",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SKILL_CATEGORY: Record<string, SkillCategory> = {
  cro: "Conversion Optimization",
  signup: "Conversion Optimization",
  onboarding: "Conversion Optimization",
  form: "Conversion Optimization",
  popups: "Conversion Optimization",
  paywalls: "Conversion Optimization",
  copywriting: "Content & Copy",
  "copy-editing": "Content & Copy",
  "cold-email": "Content & Copy",
  emails: "Content & Copy",
  social: "Content & Copy",
  sms: "Content & Copy",
  "content-strategy": "Content & Copy",
  "lead-magnets": "Content & Copy",
  image: "Content & Copy",
  video: "Content & Copy",
  "seo-audit": "SEO & Discovery",
  "ai-seo": "SEO & Discovery",
  "programmatic-seo": "SEO & Discovery",
  "site-architecture": "SEO & Discovery",
  competitors: "SEO & Discovery",
  schema: "SEO & Discovery",
  aso: "SEO & Discovery",
  "directory-submissions": "SEO & Discovery",
  ads: "Paid & Distribution",
  "ad-creative": "Paid & Distribution",
  "influencer-marketing": "Paid & Distribution",
  "public-relations": "Paid & Distribution",
  analytics: "Measurement & Testing",
  "ab-testing": "Measurement & Testing",
  attribution: "Measurement & Testing",
  "churn-prevention": "Retention",
  "co-marketing": "Growth Engineering",
  "free-tools": "Growth Engineering",
  referrals: "Growth Engineering",
  "community-marketing": "Growth Engineering",
  "marketing-loops": "Growth Engineering",
  "product-marketing": "Strategy & Monetization",
  "marketing-ideas": "Strategy & Monetization",
  "marketing-psychology": "Strategy & Monetization",
  "marketing-plan": "Strategy & Monetization",
  "marketing-council": "Strategy & Monetization",
  launch: "Strategy & Monetization",
  pricing: "Strategy & Monetization",
  offers: "Strategy & Monetization",
  "customer-research": "Strategy & Monetization",
  "competitor-profiling": "Strategy & Monetization",
  revops: "Sales & RevOps",
  "sales-enablement": "Sales & RevOps",
  prospecting: "Sales & RevOps",
};

export function skillCategory(directory: string) {
  const category = SKILL_CATEGORY[directory];
  if (!category) {
    throw new Error(`Skill has no category: ${directory}.`);
  }
  return category;
}
