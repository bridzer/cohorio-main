import type { ContextSectionId } from "../marketing-context";
import type { OrganizationCategoryId } from "../onboarding";

/**
 * Category-specific adaptive discovery templates & 3-mode types (Milestone 2).
 * Client-safe: contains no server imports. Examples here are NEVER persisted
 * as business facts.
 */

export type DiscoveryAnswerMode = "autofill" | "suggestion" | "placeholder";

export type DiscoveryQuestionTemplate = {
  id: string;
  label: string;
  section: ContextSectionId;
  field: string;
  multiline: boolean;
  queryKeywords: string[];
  examplePlaceholder: string;
  usefulHint: string;
};

export type DiscoveryQuestionItem = {
  id: string;
  label: string;
  section: ContextSectionId;
  field: string;
  sectionTitle: string;
  multiline: boolean;
  alreadyConfirmed: boolean;
  confirmedValue: string | null;
  mode: DiscoveryAnswerMode;
  suggestedValue: string;
  source: string | null;
  sourceType: "user_input" | "website" | "document" | "integration" | "ai_inference" | "system" | null;
  confidence: "high" | "medium" | "low" | null;
  verificationStatus: "VERIFIED" | "USER_CONFIRMED" | "AI_INFERRED" | "NEEDS_REVIEW" | "UNKNOWN";
  reasoning: string | null;
  evidence: string[];
  placeholderExample: string;
  usefulHint: string;
};

export const DISCOVERY_TEMPLATES: Record<OrganizationCategoryId, DiscoveryQuestionTemplate[]> = {
  ecommerce: [
    {
      id: "products",
      label: "What products do you sell?",
      section: "productOverview",
      field: "whatItDoes",
      multiline: true,
      queryKeywords: ["product", "catalog", "store", "sku", "collection", "sell", "merchandise"],
      examplePlaceholder: "e.g. Small-batch roasted specialty coffee beans and pour-over brewing gear sold online.",
      usefulHint: "Describe your core product categories, hero items, and what shoppers receive.",
    },
    {
      id: "customers",
      label: "Who are your ideal customers?",
      section: "targetAudience",
      field: "targetCompanies",
      multiline: true,
      queryKeywords: ["customer", "buyer", "audience", "shopper", "demographic", "segment"],
      examplePlaceholder: "e.g. Busy home coffee drinkers aged 25-45 who value fresh, ethically sourced beans.",
      usefulHint: "Describe who buys most often, what they care about, and what prompts a purchase.",
    },
    {
      id: "difference",
      label: "What makes your products different?",
      section: "differentiation",
      field: "differentiators",
      multiline: true,
      queryKeywords: ["different", "unique", "edge", "quality", "handmade", "sustainable", "benefit"],
      examplePlaceholder: "e.g. Roasted to order within 24 hours of shipping in compostable packaging.",
      usefulHint: "Name the concrete product, sourcing, or experience edge alternatives lack.",
    },
    {
      id: "voice",
      label: "How should your store sound?",
      section: "brandVoice",
      field: "tone",
      multiline: false,
      queryKeywords: ["voice", "tone", "style", "personality", "brand"],
      examplePlaceholder: "e.g. Warm, approachable, and knowledgeable without snobbery.",
      usefulHint: "List 2-3 tone words that fit your product pages, emails, and ads.",
    },
    {
      id: "goal",
      label: "What should marketing achieve first?",
      section: "goals",
      field: "businessGoal",
      multiline: true,
      queryKeywords: ["goal", "revenue", "orders", "conversion", "growth", "repeat"],
      examplePlaceholder: "e.g. Increase first-time online orders and grow repeat subscription revenue.",
      usefulHint: "State one concrete commercial outcome for the next 90 days.",
    },
  ],
  "physical-retail": [
    {
      id: "products",
      label: "What do you sell in store?",
      section: "productOverview",
      field: "whatItDoes",
      multiline: true,
      queryKeywords: ["store", "shop", "retail", "product", "goods", "merchandise"],
      examplePlaceholder: "e.g. Curated indoor plants, ceramic planters, and local home goods in our Austin storefront.",
      usefulHint: "Summarize your main product categories and any in-store experience.",
    },
    {
      id: "customers",
      label: "Who visits and buys from your store?",
      section: "targetAudience",
      field: "targetCompanies",
      multiline: true,
      queryKeywords: ["local", "visitor", "customer", "neighborhood", "regular", "shopper"],
      examplePlaceholder: "e.g. Local homeowners, apartment dwellers, and weekend gift shoppers within 10 miles.",
      usefulHint: "Mention local vs. tourist shoppers, regulars, and common buying occasions.",
    },
    {
      id: "difference",
      label: "Why do shoppers choose your store over big-box or online options?",
      section: "differentiation",
      field: "differentiators",
      multiline: true,
      queryKeywords: ["difference", "in-store", "local", "curation", "service", "experience"],
      examplePlaceholder: "e.g. Hands-on care advice, locally crafted pots, and same-day neighborhood pickup.",
      usefulHint: "Highlight the in-person service, curation, or local trust that brings people in.",
    },
    {
      id: "goal",
      label: "What should marketing drive first?",
      section: "goals",
      field: "businessGoal",
      multiline: true,
      queryKeywords: ["foot traffic", "visits", "local", "pickup", "goal", "sales"],
      examplePlaceholder: "e.g. Drive weekend foot traffic and local pickup orders.",
      usefulHint: "Focus on foot traffic, local awareness, events, or omnichannel pickup.",
    },
  ],
  "professional-services": [
    {
      id: "services",
      label: "What services does your firm provide?",
      section: "productOverview",
      field: "whatItDoes",
      multiline: true,
      queryKeywords: ["service", "consulting", "agency", "advisory", "practice", "deliverable"],
      examplePlaceholder: "e.g. Fractional CFO advisory, monthly close management, and fundraising modeling for startups.",
      usefulHint: "State your core engagements and deliverables in plain buyer language.",
    },
    {
      id: "clients",
      label: "Who are your target clients and decision-makers?",
      section: "targetAudience",
      field: "targetCompanies",
      multiline: true,
      queryKeywords: ["client", "company", "industry", "b2b", "founder", "executive", "size"],
      examplePlaceholder: "e.g. Seed-to-Series B SaaS companies with 15-100 employees in North America.",
      usefulHint: "Specify client industry, company size/stage, and who signs the engagement.",
    },
    {
      id: "problems",
      label: "What costly problem do clients hire you to solve?",
      section: "problems",
      field: "coreProblem",
      multiline: true,
      queryKeywords: ["problem", "pain", "risk", "delay", "compliance", "cost"],
      examplePlaceholder: "e.g. Founders spend weeks reconciling spreadsheets and lack investor-ready forecasts.",
      usefulHint: "Describe the operational bottleneck, risk, or cost before hiring you.",
    },
    {
      id: "difference",
      label: "What separates your firm from competing agencies or consultants?",
      section: "differentiation",
      field: "differentiators",
      multiline: true,
      queryKeywords: ["method", "approach", "specialty", "proof", "senior", "process"],
      examplePlaceholder: "e.g. Dedicated senior finance leads and fixed monthly retainers instead of hourly billing.",
      usefulHint: "Mention your methodology, vertical focus, senior staffing, or pricing clarity.",
    },
  ],
  "consumer-services": [
    {
      id: "services",
      label: "What services or experiences do you offer?",
      section: "productOverview",
      field: "whatItDoes",
      multiline: true,
      queryKeywords: ["service", "booking", "appointment", "menu", "session", "treatment", "hospitality"],
      examplePlaceholder: "e.g. Small-group reformer Pilates classes and private recovery sessions.",
      usefulHint: "Describe your core service menu, memberships, or packages.",
    },
    {
      id: "customers",
      label: "Who books with you most often?",
      section: "targetAudience",
      field: "targetCompanies",
      multiline: true,
      queryKeywords: ["guest", "member", "client", "local", "audience", "book"],
      examplePlaceholder: "e.g. Working professionals aged 25-50 looking for low-impact strength training near downtown.",
      usefulHint: "Note who books, how often they return, and what occasion brings them in.",
    },
    {
      id: "difference",
      label: "What makes your experience memorable compared to nearby alternatives?",
      section: "differentiation",
      field: "differentiators",
      multiline: true,
      queryKeywords: ["experience", "atmosphere", "hospitality", "quality", "convenience"],
      examplePlaceholder: "e.g. Maximum 8 people per class with personalized form coaching and flexible rescheduling.",
      usefulHint: "Highlight quality, hospitality, convenience, or outcomes guests notice immediately.",
    },
    {
      id: "goal",
      label: "What should marketing increase first?",
      section: "goals",
      field: "businessGoal",
      multiline: true,
      queryKeywords: ["booking", "membership", "appointment", "repeat", "goal"],
      examplePlaceholder: "e.g. Fill weekday morning bookings and convert intro trials into monthly memberships.",
      usefulHint: "Name whether bookings, trial passes, memberships, or repeat visits matter most.",
    },
  ],
  "media-content": [
    {
      id: "content",
      label: "What content or media do you publish?",
      section: "productOverview",
      field: "whatItDoes",
      multiline: true,
      queryKeywords: ["content", "newsletter", "podcast", "video", "publication", "editorial", "topic"],
      examplePlaceholder: "e.g. Twice-weekly newsletter and podcast breaking down climate tech deals and policy.",
      usefulHint: "Describe your formats, publishing cadence, and core editorial topics.",
    },
    {
      id: "audience",
      label: "Who reads, watches, or listens?",
      section: "targetAudience",
      field: "targetCompanies",
      multiline: true,
      queryKeywords: ["reader", "subscriber", "listener", "viewer", "audience", "community"],
      examplePlaceholder: "e.g. Clean-energy operators, venture investors, and corporate sustainability leads.",
      usefulHint: "Define your core reader/viewer profile and why they subscribe.",
    },
    {
      id: "difference",
      label: "What gives your editorial voice or coverage an edge?",
      section: "differentiation",
      field: "differentiators",
      multiline: true,
      queryKeywords: ["voice", "perspective", "access", "depth", "original", "reporting"],
      examplePlaceholder: "e.g. Primary-source operator interviews and verified unit-economics breakdowns.",
      usefulHint: "Explain what your audience gets from you that generic feeds do not offer.",
    },
    {
      id: "goal",
      label: "What is the primary growth goal?",
      section: "goals",
      field: "businessGoal",
      multiline: true,
      queryKeywords: ["subscriber", "sponsor", "member", "ad", "monetize", "goal"],
      examplePlaceholder: "e.g. Grow active newsletter subscribers and close Q1 B2B sponsorships.",
      usefulHint: "Specify subscriber growth, paid memberships, or sponsorship revenue.",
    },
  ],
  "software-technology": [
    {
      id: "product",
      label: "What product or technology are you building?",
      section: "productOverview",
      field: "whatItDoes",
      multiline: true,
      queryKeywords: ["software", "saas", "platform", "app", "api", "tool", "automation"],
      examplePlaceholder: "e.g. Automated accounts-payable reconciliation software that syncs invoices directly to NetSuite.",
      usefulHint: "Explain what the software does in plain terms without internal buzzwords.",
    },
    {
      id: "users",
      label: "Who are the target accounts and buyers?",
      section: "targetAudience",
      field: "targetCompanies",
      multiline: true,
      queryKeywords: ["team", "user", "buyer", "company", "icp", "role", "enterprise", "smb"],
      examplePlaceholder: "e.g. Multi-entity finance teams (50-500 employees) using NetSuite or QuickBooks.",
      usefulHint: "Include company size/stack, end users, and budget owners.",
    },
    {
      id: "problems",
      label: "What friction or cost does the status quo create?",
      section: "problems",
      field: "coreProblem",
      multiline: true,
      queryKeywords: ["manual", "error", "spreadsheet", "slow", "problem", "status quo"],
      examplePlaceholder: "e.g. Finance teams spend 18 hours a week manually matching POs and catching duplicate bills.",
      usefulHint: "Quantify the wasted time, errors, or operational risk your product removes.",
    },
    {
      id: "model",
      label: "How do customers buy and pay?",
      section: "productOverview",
      field: "businessModel",
      multiline: true,
      queryKeywords: ["pricing", "plan", "subscription", "seat", "usage", "trial", "demo", "model"],
      examplePlaceholder: "e.g. Self-serve 14-day free trial with tiered monthly SaaS plans starting at \$99/month.",
      usefulHint: "Note self-serve vs. sales-led motion and pricing structure (seat, usage, tiered).",
    },
    {
      id: "difference",
      label: "Why do teams choose you over existing tools?",
      section: "differentiation",
      field: "differentiators",
      multiline: true,
      queryKeywords: ["faster", "integration", "accuracy", "difference", "workflow"],
      examplePlaceholder: "e.g. Two-minute ERP setup with line-item matching accuracy above 99%.",
      usefulHint: "Name the capability + measurable customer outcome competitors lack.",
    },
  ],
  "civic-social": [
    {
      id: "services",
      label: "What programs or public services do you provide?",
      section: "productOverview",
      field: "whatItDoes",
      multiline: true,
      queryKeywords: ["program", "community", "support", "nonprofit", "education", "service"],
      examplePlaceholder: "e.g. Free job-readiness training, mentorship, and emergency housing referrals for young adults.",
      usefulHint: "Summarize your core programs, beneficiaries, and service area.",
    },
    {
      id: "community",
      label: "Who do you serve and who supports your mission?",
      section: "targetAudience",
      field: "targetCompanies",
      multiline: true,
      queryKeywords: ["community", "resident", "donor", "volunteer", "partner", "grant"],
      examplePlaceholder: "e.g. First-generation job seekers in Metro Atlanta, plus local employers and individual donors.",
      usefulHint: "Identify both the community served and key supporters (donors, volunteers, partners).",
    },
    {
      id: "difference",
      label: "What makes your community approach trusted and effective?",
      section: "differentiation",
      field: "differentiators",
      multiline: true,
      queryKeywords: ["trust", "impact", "outcome", "local", "partnership", "approach"],
      examplePlaceholder: "e.g. Bilingual neighborhood caseworkers and 82% six-month job placement retention.",
      usefulHint: "Share community trust, accessibility, or verified outcome proof.",
    },
    {
      id: "goal",
      label: "What outcome should outreach achieve first?",
      section: "goals",
      field: "businessGoal",
      multiline: true,
      queryKeywords: ["donor", "volunteer", "enrollment", "awareness", "grant", "goal"],
      examplePlaceholder: "e.g. Increase program enrollments by 30% and recruit 50 recurring monthly donors.",
      usefulHint: "Choose whether participant enrollment, donor support, or volunteer recruitment is top priority.",
    },
  ],
};

export const DISCOVERY_SECTION_TITLES: Record<string, string> = {
  productOverview: "Product overview",
  targetAudience: "Target audience",
  problems: "Problems",
  differentiation: "Differentiation",
  brandVoice: "Brand voice",
  goals: "Goals",
};
