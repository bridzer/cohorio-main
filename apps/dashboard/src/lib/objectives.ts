/**
 * First-objective recommendations (Milestone 5). Deterministic ranking over a
 * fixed catalog — every suggestion explains itself, and every href points at
 * a real route or workspace that exists today.
 */

export type RankedObjective = {
  id: string;
  name: string;
  description: string;
  why: string;
  outcome: string;
  href: string;
  hrefLabel: string;
  requiredIntegrations: string[];
  relatedChannels: string[];
  relevantContext: string[];
  priority: "high" | "medium" | "low";
  score: number;
  reasons: string[];
};

type ObjectiveDefinition = Omit<RankedObjective, "priority" | "score" | "reasons"> & {
  categories: string[];
  goalPattern?: RegExp;
  goalReason?: string;
};

const OBJECTIVES: ObjectiveDefinition[] = [
  {
    id: "marketing-strategy",
    name: "Build a marketing strategy",
    description: "A focused growth plan grounded in your Brand Brain: positioning, audiences, channels, and sequencing.",
    why: "Strategy first prevents scattered tactics.",
    outcome: "A written strategy you can execute against for the quarter.",
    href: "/agent",
    hrefLabel: "Ask Cohorio",
    requiredIntegrations: [],
    relatedChannels: [],
    relevantContext: ["Goals", "Target audience", "Differentiation"],
    categories: ["professional-services", "software-technology", "civic-social"],
    goalPattern: /strateg|plan|growth/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "content-strategy",
    name: "Create a content strategy",
    description: "Pillars, formats, and cadence for content that compounds.",
    why: "Consistent content beats sporadic campaigns.",
    outcome: "Content pillars plus a repeatable production rhythm.",
    href: "/agent",
    hrefLabel: "Ask Cohorio",
    requiredIntegrations: [],
    relatedChannels: ["blog", "newsletter", "video"],
    relevantContext: ["Brand voice", "Goals"],
    categories: ["media-content", "professional-services", "software-technology", "civic-social"],
    goalPattern: /content|blog|social/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "calendar",
    name: "Generate a 30-day marketing calendar",
    description: "A month of dated posts and themes across your channels.",
    why: "Calendars turn strategy into shipped work.",
    outcome: "Thirty days of scheduled, on-brand content ideas.",
    href: "/social",
    hrefLabel: "Social Studio",
    requiredIntegrations: [],
    relatedChannels: ["facebook", "instagram", "tiktok", "linkedin", "newsletter"],
    relevantContext: ["Goals", "Brand voice"],
    categories: ["ecommerce", "consumer-services", "media-content", "physical-retail"],
    goalPattern: /calendar|consisten|every week/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "seo",
    name: "Improve website SEO",
    description: "Audit, quick wins, and a prioritized fix list for organic search.",
    why: "Organic traffic compounds while ads reset to zero.",
    outcome: "A ranked SEO fix list, starting with highest impact.",
    href: "/",
    hrefLabel: "SEO & Discovery workspace",
    requiredIntegrations: [],
    relatedChannels: ["google-search", "blog"],
    relevantContext: ["Goals"],
    categories: ["software-technology", "professional-services", "ecommerce"],
    goalPattern: /seo|search|traffic|rank/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "competitors",
    name: "Analyze competitors",
    description: "Who you are really compared against, and where they are weak.",
    why: "Positioning needs named rivals, not vibes.",
    outcome: "A competitor map with differentiation angles.",
    href: "/",
    hrefLabel: "SEO & Discovery workspace",
    requiredIntegrations: [],
    relatedChannels: ["google-search"],
    relevantContext: ["Competition", "Differentiation"],
    categories: ["software-technology", "ecommerce", "professional-services"],
    goalPattern: /competitor|competition|market/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "product-campaign",
    name: "Create a product marketing campaign",
    description: "Grounded ad creative for your catalog, ready for human review.",
    why: "Your products plus Brand Brain is Cohorio's home turf.",
    outcome: "Platform-sized drafts with budget structure and checklist.",
    href: "/commerce",
    hrefLabel: "Campaign builder",
    requiredIntegrations: ["meta-ads", "google-ads", "tiktok-ads"],
    relatedChannels: ["meta-ads", "google-ads", "tiktok-ads", "shopify"],
    relevantContext: ["Target audience", "Differentiation", "Goals"],
    categories: ["ecommerce", "consumer-services", "physical-retail"],
    goalPattern: /sales|revenue|launch|buy/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "social-campaign",
    name: "Launch a social media campaign",
    description: "A themed burst of posts designed for shares and follows.",
    why: "Concentrated bursts beat drips for launches and moments.",
    outcome: "A week of coordinated, scheduled social creative.",
    href: "/social",
    hrefLabel: "Social Studio",
    requiredIntegrations: ["meta-ads", "tiktok-ads"],
    relatedChannels: ["facebook", "instagram", "tiktok", "linkedin"],
    relevantContext: ["Target audience", "Brand voice"],
    categories: ["consumer-services", "media-content", "ecommerce", "civic-social"],
    goalPattern: /social|awareness|followers|viral/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "product-descriptions",
    name: "Improve product descriptions",
    description: "Rewrite thin catalog copy with CRO structure and proof.",
    why: "Product pages are where ad spend converts or dies.",
    outcome: "Higher-converting descriptions for your top products.",
    href: "/commerce",
    hrefLabel: "Product pages",
    requiredIntegrations: [],
    relatedChannels: ["shopify", "blog"],
    relevantContext: ["Differentiation", "Customer language"],
    categories: ["ecommerce", "physical-retail"],
    goalPattern: /product|listing|catalog|descriptions/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "acquisition",
    name: "Develop a customer acquisition strategy",
    description: "Ranked channels and offers for profitable new customers.",
    why: "Acquisition without a model burns budget.",
    outcome: "A channel mix with costs, tests, and kill criteria.",
    href: "/agent",
    hrefLabel: "Ask Cohorio",
    requiredIntegrations: [],
    relatedChannels: ["google-ads", "meta-ads", "linkedin-ads"],
    relevantContext: ["Goals", "Target audience"],
    categories: ["software-technology", "ecommerce", "professional-services", "consumer-services"],
    goalPattern: /acquisition|leads|customers|growth/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "messaging",
    name: "Create brand messaging guidelines",
    description: "One-liners, proof points, and voice rules every output reuses.",
    why: "Guidelines make all future AI output sound like you.",
    outcome: "A one-page messaging source of truth.",
    href: "/agent",
    hrefLabel: "Ask Cohorio",
    requiredIntegrations: [],
    relatedChannels: ["blog", "newsletter"],
    relevantContext: ["Brand voice", "Differentiation"],
    categories: ["professional-services", "software-technology", "civic-social"],
    goalPattern: /messag|brand|voice|positioning/i,
    goalReason: "Matches your stated goal",
  },
  {
    id: "complete-brain",
    name: "Complete your Brand Brain",
    description: "Fill the remaining gaps so every recommendation gets sharper.",
    why: "Thin context caps everything downstream.",
    outcome: "A complete, review-approved knowledge base.",
    href: "/onboarding/brain",
    hrefLabel: "Brand Brain setup",
    requiredIntegrations: [],
    relatedChannels: [],
    relevantContext: [],
    categories: [],
  },
];

export type RankInputs = {
  organizationCategory?: string | null;
  selectedChannelIds?: string[] | null;
  connectedProviders?: string[] | null;
  goalsText?: string | null;
  brainCompleteness?: number | null;
};

export function rankObjectives(input: RankInputs): RankedObjective[] {
  const selected = new Set(input.selectedChannelIds ?? []);
  const connected = new Set(input.connectedProviders ?? []);
  const goals = (input.goalsText ?? "").trim();
  const completeness =
    typeof input.brainCompleteness === "number" ? input.brainCompleteness : null;

  return OBJECTIVES.map((definition) => {
    let score = 0;
    const reasons: string[] = [];
    const isBrainTask = definition.id === "complete-brain";

    if (!isBrainTask && definition.categories.includes(input.organizationCategory ?? "")) {
      score += 3;
      reasons.push("Fits your business profile");
    }
    if (!isBrainTask) {
      const overlap = definition.relatedChannels.filter((id) => selected.has(id));
      if (overlap.length) {
        score += Math.min(3, overlap.length);
        reasons.push(`Matches your ${overlap.length === 1 ? "channel pick" : "channel picks"}`);
      }
    }
    if (!isBrainTask && definition.goalPattern && goals && definition.goalPattern.test(goals)) {
      score += 2;
      reasons.push(definition.goalReason ?? "Matches your stated goal");
    }
    if (definition.requiredIntegrations.length) {
      const ready = definition.requiredIntegrations.some((provider) => connected.has(provider));
      if (ready) {
        score += 2;
        reasons.push("Ready to launch — ad account connected");
      }
    } else if (!isBrainTask) {
      score += 1;
      reasons.push("No connections needed to start");
    }
    if (isBrainTask && completeness !== null && completeness < 50) {
      score += 4;
      reasons.push(`Your Brand Brain is ${completeness}% — this unlocks everything else`);
    }

    return {
      ...definition,
      priority: (score >= 6 ? "high" : score >= 4 ? "medium" : "low") as
        | "high"
        | "medium"
        | "low",
      score,
      reasons,
    };
  }).sort((left, right) => right.score - left.score);
}

export function objectiveById(id: string) {
  return OBJECTIVES.find((definition) => definition.id === id) ?? null;
}
