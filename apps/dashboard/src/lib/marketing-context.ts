export const CONTEXT_SECTIONS = [
  {
    id: "productOverview",
    title: "Product overview",
    shortTitle: "Product",
    description:
      "Define what you sell, the category buyers place you in, and how the business works.",
    fields: [
      {
        id: "oneLiner",
        label: "One-line description",
        placeholder: "Cohorio is an AI marketing workspace for...",
        required: true,
        multiline: false,
      },
      {
        id: "whatItDoes",
        label: "What it does",
        placeholder: "Explain the product in two or three clear sentences.",
        required: true,
        multiline: true,
      },
      {
        id: "category",
        label: "Product category",
        placeholder: "The shelf customers would search for",
        required: true,
        multiline: false,
      },
      {
        id: "productType",
        label: "Product type",
        placeholder: "SaaS, marketplace, service, e-commerce...",
        required: true,
        multiline: false,
      },
      {
        id: "businessModel",
        label: "Business model and pricing",
        placeholder: "How customers buy and what plans cost",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    id: "targetAudience",
    title: "Target audience",
    shortTitle: "Audience",
    description:
      "Capture the companies, decision-makers, and situations where the product creates the most value.",
    fields: [
      {
        id: "targetCompanies",
        label: "Target companies",
        placeholder: "Industry, size, stage, geography",
        required: true,
        multiline: true,
      },
      {
        id: "decisionMakers",
        label: "Decision-makers",
        placeholder: "Roles, teams, and buying influence",
        required: true,
        multiline: true,
      },
      {
        id: "primaryUseCase",
        label: "Primary use case",
        placeholder: "The main problem you solve",
        required: true,
        multiline: true,
      },
      {
        id: "jobsToBeDone",
        label: "Jobs to be done",
        placeholder: "One job per line",
        required: false,
        multiline: true,
      },
      {
        id: "useCases",
        label: "Specific scenarios",
        placeholder: "When and why customers reach for the product",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "personas",
    title: "Personas",
    shortTitle: "Personas",
    description:
      "Map users, champions, decision-makers, financial buyers, and technical influencers.",
    fields: [
      {
        id: "stakeholders",
        label: "Stakeholder map",
        placeholder:
          "For each persona: role, what they care about, challenge, and value promised",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    id: "problems",
    title: "Problems and pain points",
    shortTitle: "Problems",
    description:
      "Describe the situation before your product and the practical and emotional cost of leaving it unresolved.",
    fields: [
      {
        id: "coreProblem",
        label: "Core problem",
        placeholder: "The number-one frustration that brings buyers to you",
        required: true,
        multiline: true,
      },
      {
        id: "alternativesFallShort",
        label: "Why current solutions fall short",
        placeholder: "Where existing tools or approaches fail",
        required: true,
        multiline: true,
      },
      {
        id: "cost",
        label: "What the problem costs",
        placeholder: "Time, money, risk, or missed opportunities",
        required: true,
        multiline: true,
      },
      {
        id: "emotionalTension",
        label: "Emotional tension",
        placeholder: "Stress, fear, uncertainty, or frustration",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    id: "competition",
    title: "Competitive landscape",
    shortTitle: "Competition",
    description:
      "Name direct products, alternative approaches, and the status quo buyers compare against.",
    fields: [
      {
        id: "direct",
        label: "Direct competitors",
        placeholder: "Competitor — where it falls short",
        required: true,
        multiline: true,
      },
      {
        id: "secondary",
        label: "Secondary alternatives",
        placeholder: "Different solution to the same problem",
        required: false,
        multiline: true,
      },
      {
        id: "indirect",
        label: "Indirect competitors",
        placeholder: "Manual work, status quo, agencies, spreadsheets...",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "differentiation",
    title: "Differentiation",
    shortTitle: "Difference",
    description:
      "Connect unique capabilities to customer benefits and a defensible reason to choose you.",
    fields: [
      {
        id: "differentiators",
        label: "Key differentiators",
        placeholder: "Capabilities alternatives lack",
        required: true,
        multiline: true,
      },
      {
        id: "approach",
        label: "How you solve it differently",
        placeholder: "Your method, model, workflow, or technology",
        required: true,
        multiline: true,
      },
      {
        id: "benefits",
        label: "Why that is better",
        placeholder: "Customer outcomes created by the difference",
        required: true,
        multiline: true,
      },
      {
        id: "whyChoose",
        label: "Why customers choose you",
        placeholder: "The clearest buying reason",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    id: "objections",
    title: "Objections and anti-personas",
    shortTitle: "Objections",
    description:
      "Record reasons qualified buyers hesitate and define who should not buy the product.",
    fields: [
      {
        id: "topObjections",
        label: "Top objections and responses",
        placeholder: "Objection → honest response, one per line",
        required: true,
        multiline: true,
      },
      {
        id: "antiPersona",
        label: "Who is not a good fit",
        placeholder: "Customers who will not get enough value",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    id: "switching",
    title: "Switching dynamics",
    shortTitle: "Switching",
    description:
      "Use the JTBD Four Forces to explain what moves buyers toward or away from change.",
    fields: [
      {
        id: "push",
        label: "Push",
        placeholder: "Frustrations driving buyers away from today’s solution",
        required: true,
        multiline: true,
      },
      {
        id: "pull",
        label: "Pull",
        placeholder: "What attracts them to your product",
        required: true,
        multiline: true,
      },
      {
        id: "habit",
        label: "Habit",
        placeholder: "What keeps them stuck with the current approach",
        required: true,
        multiline: true,
      },
      {
        id: "anxiety",
        label: "Anxiety",
        placeholder: "What worries them about switching",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    id: "customerLanguage",
    title: "Customer language",
    shortTitle: "Language",
    description:
      "Capture exact customer phrases. Verbatim language is more useful than polished internal messaging.",
    fields: [
      {
        id: "problemLanguage",
        label: "How customers describe the problem",
        placeholder: "Verbatim phrases, one per line",
        required: true,
        multiline: true,
      },
      {
        id: "solutionLanguage",
        label: "How customers describe your solution",
        placeholder: "Verbatim phrases, one per line",
        required: true,
        multiline: true,
      },
      {
        id: "wordsToUse",
        label: "Words and phrases to use",
        placeholder: "Preferred vocabulary",
        required: true,
        multiline: true,
      },
      {
        id: "wordsToAvoid",
        label: "Words and phrases to avoid",
        placeholder: "Jargon, clichés, or off-brand terms",
        required: false,
        multiline: true,
      },
      {
        id: "glossary",
        label: "Product glossary",
        placeholder: "Term — meaning",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "brandVoice",
    title: "Brand voice",
    shortTitle: "Voice",
    description:
      "Define how the brand sounds so generated work is recognizable and consistent.",
    fields: [
      {
        id: "tone",
        label: "Tone",
        placeholder: "Professional, casual, playful, authoritative...",
        required: true,
        multiline: true,
      },
      {
        id: "style",
        label: "Communication style",
        placeholder: "Direct, conversational, technical, concise...",
        required: true,
        multiline: true,
      },
      {
        id: "personality",
        label: "Brand personality",
        placeholder: "Three to five adjectives",
        required: true,
        multiline: false,
      },
    ],
  },
  {
    id: "proofPoints",
    title: "Proof points",
    shortTitle: "Proof",
    description:
      "Document evidence the team can safely cite. Write “none yet” rather than inventing proof.",
    fields: [
      {
        id: "evidence",
        label: "Evidence available today",
        placeholder: "Metrics, customers, testimonials, or “none yet”",
        required: true,
        multiline: true,
      },
      {
        id: "valueThemes",
        label: "Value themes and supporting proof",
        placeholder: "Theme → supporting evidence",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "goals",
    title: "Goals",
    shortTitle: "Goals",
    description:
      "Align generated work to the primary business outcome and conversion action.",
    fields: [
      {
        id: "businessGoal",
        label: "Primary business goal",
        placeholder: "The outcome marketing should drive",
        required: true,
        multiline: true,
      },
      {
        id: "conversionAction",
        label: "Key conversion action",
        placeholder: "Buy, sign up, book a demo, start a trial...",
        required: true,
        multiline: false,
      },
      {
        id: "currentMetrics",
        label: "Current metrics",
        placeholder: "Baseline conversion, pipeline, revenue, or traffic",
        required: false,
        multiline: true,
      },
    ],
  },
] as const;

export type ContextSectionId = (typeof CONTEXT_SECTIONS)[number]["id"];
export type ContextSectionValues = Record<string, string>;
export type MarketingContext = Partial<
  Record<ContextSectionId, ContextSectionValues>
>;

export function isContextSectionId(value: string): value is ContextSectionId {
  return CONTEXT_SECTIONS.some((section) => section.id === value);
}

export function isSectionComplete(
  sectionId: ContextSectionId,
  values: ContextSectionValues | undefined,
) {
  if (values?._notApplicable === "true") return true;
  const section = CONTEXT_SECTIONS.find((item) => item.id === sectionId);
  return Boolean(
    section?.fields
      .filter((field) => field.required)
      .every((field) => values?.[field.id]?.trim()),
  );
}

export function contextProgress(context: MarketingContext) {
  const completedSections = CONTEXT_SECTIONS.filter((section) =>
    isSectionComplete(section.id, context[section.id]),
  ).map((section) => section.id);
  return {
    completedSections,
    completedCount: completedSections.length,
    totalSections: CONTEXT_SECTIONS.length,
    percentage: Math.round(
      (completedSections.length / CONTEXT_SECTIONS.length) * 100,
    ),
  };
}

export function contextToMarkdown(
  context: MarketingContext,
  updatedAt = new Date().toISOString(),
) {
  const lines = [
    "# Product Marketing Context",
    "",
    `*Last updated: ${updatedAt.slice(0, 10)}*`,
    "",
  ];
  for (const section of CONTEXT_SECTIONS) {
    lines.push(`## ${section.title}`, "");
    const values = context[section.id];
    if (values?._notApplicable === "true") {
      lines.push("*Not applicable*", "");
      continue;
    }
    for (const field of section.fields) {
      lines.push(`**${field.label}:**`);
      lines.push(values?.[field.id]?.trim() || "_Not provided_");
      lines.push("");
    }
  }
  return lines.join("\n");
}
