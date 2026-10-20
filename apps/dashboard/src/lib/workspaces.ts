export type WorkspaceField = {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
};

export type WorkspaceJob = {
  id: string;
  label: string;
  detail: string;
  fields: WorkspaceField[];
};

export type WorkspaceDefinition = {
  id: string;
  name: string;
  summary: string;
  jobs: WorkspaceJob[];
};

const page = (placeholder: string): WorkspaceField => ({
  id: "surface",
  label: "Page, flow, or asset",
  placeholder,
  required: true,
});

const goal = (placeholder: string): WorkspaceField => ({
  id: "goal",
  label: "Outcome",
  placeholder,
  required: true,
});

const situation = (placeholder: string): WorkspaceField => ({
  id: "situation",
  label: "What is happening now",
  placeholder,
  required: true,
  multiline: true,
});

export const BRAND_BRAIN: WorkspaceDefinition = {
  id: "brand-brain",
  name: "Brand Brain",
  summary: "Cohorio Co-Pilot, grounded in the product context you have saved.",
  jobs: [
    {
      id: "ask",
      label: "Ask from your brand context",
      detail: "A question answered from your saved product, audience, and voice.",
      fields: [
        {
          id: "request",
          label: "What should Co-Pilot work from",
          placeholder: "Positioning, offer, audience, or a decision you need to make",
          required: true,
          multiline: true,
        },
      ],
    },
  ],
};

export const INTELLIGENCE: WorkspaceDefinition = {
  id: "intelligence",
  name: "Cohorio Intelligence",
  summary:
    "The growth engine for strategy, competition, orchestration, and recommendations.",
  jobs: [
    {
      id: "growth-strategy",
      label: "Set a growth strategy",
      detail: "A plan for the outcome, horizon, and constraints you name.",
      fields: [
        goal("Pipeline, activation, or revenue result"),
        {
          id: "horizon",
          label: "Time horizon",
          placeholder: "This quarter",
          required: true,
        },
        {
          id: "constraint",
          label: "Constraint",
          placeholder: "Team size, budget, or channel you cannot use",
          required: false,
        },
      ],
    },
    {
      id: "competition",
      label: "Read the competition",
      detail: "A competitive read from the names or URLs you provide.",
      fields: [
        {
          id: "competitors",
          label: "Competitors",
          placeholder: "Names or URLs, one per line",
          required: true,
          multiline: true,
        },
        {
          id: "question",
          label: "What you need to know",
          placeholder: "Where they win, and where you can be chosen instead",
          required: true,
          multiline: true,
        },
      ],
    },
    {
      id: "orchestrate",
      label: "Orchestrate the next move",
      detail: "One coordinated plan across the channels you can actually run.",
      fields: [
        goal("What this move must achieve"),
        {
          id: "channels",
          label: "Channels you can use",
          placeholder: "Site, email, social, sales, paid",
          required: true,
        },
        situation("What is already in motion"),
      ],
    },
    {
      id: "recommend",
      label: "Recommend what to do next",
      detail: "A short list of next actions from the situation you describe.",
      fields: [
        situation("The result, blocker, or opportunity in front of you"),
        goal("What good looks like"),
      ],
    },
    {
      id: "research",
      label: "Learn from customers",
      detail: "Research questions and a synthesis plan from the audience you name.",
      fields: [
        {
          id: "audience",
          label: "Who you need to learn from",
          placeholder: "Role, segment, or recent buyers",
          required: true,
        },
        {
          id: "question",
          label: "Decision the research must inform",
          placeholder: "Pricing, message, or why they hesitate",
          required: true,
          multiline: true,
        },
      ],
    },
    {
      id: "psychology",
      label: "Apply a recommendation principle",
      detail: "How to frame the offer using the behavior you describe.",
      fields: [
        {
          id: "behavior",
          label: "Behavior you want",
          placeholder: "Start a trial, book a demo, or finish checkout",
          required: true,
        },
        situation("Where people hesitate"),
      ],
    },
    {
      id: "pricing",
      label: "Shape pricing and packaging",
      detail: "Packaging options from the buyer and the value metric you name.",
      fields: [
        {
          id: "buyer",
          label: "Who pays",
          placeholder: "Team, founder, or consumer",
          required: true,
        },
        {
          id: "value",
          label: "What they pay for",
          placeholder: "Seats, usage, or outcome",
          required: true,
        },
        situation("How you charge today, if you already do"),
      ],
    },
    {
      id: "offer",
      label: "Design the offer",
      detail: "The offer, proof, and risk reversal for the product you describe.",
      fields: [
        {
          id: "product",
          label: "What you sell",
          placeholder: "Product, service, or package",
          required: true,
        },
        goal("The action the offer should drive"),
        situation("Objections you already hear"),
      ],
    },
    {
      id: "launch",
      label: "Plan a launch",
      detail: "A launch sequence for the audience and date you set.",
      fields: [
        {
          id: "release",
          label: "What is launching",
          placeholder: "Product, feature, or announcement",
          required: true,
        },
        {
          id: "date",
          label: "When",
          placeholder: "Date or window",
          required: true,
        },
        {
          id: "audience",
          label: "Who should hear it",
          placeholder: "Customers, prospects, or press",
          required: true,
        },
      ],
    },
  ],
};

export const FEATURE_WORKSPACES: WorkspaceDefinition[] = [
  {
    id: "conversion",
    name: "Conversion",
    summary: "Pages, signup, activation, forms, popups, and upgrade moments.",
    jobs: [
      {
        id: "page",
        label: "Improve a marketing page",
        detail: "What to change on the page so more visitors take the action.",
        fields: [page("Homepage, pricing, or landing URL"), goal("Demo, trial, or purchase"), situation("Where visitors drop")],
      },
      {
        id: "signup",
        label: "Improve signup or trial start",
        detail: "How to shorten the path from visit to account.",
        fields: [page("Signup or trial URL"), goal("Account created or trial started"), situation("Fields, steps, or errors in the way")],
      },
      {
        id: "activation",
        label: "Improve first-run activation",
        detail: "The first session that gets a new account to value.",
        fields: [page("Product area a new user sees"), goal("The first success"), situation("Where new users stall")],
      },
      {
        id: "form",
        label: "Improve a lead or contact form",
        detail: "Which fields to keep, cut, or ask later.",
        fields: [page("Form name or URL"), goal("Lead, demo, or contact"), situation("Current fields and where people abandon")],
      },
      {
        id: "popup",
        label: "Design a popup or banner",
        detail: "When it appears, who sees it, and what it asks.",
        fields: [page("Page where it should appear"), goal("Email, demo, or return visit"), situation("Who should and should not see it")],
      },
      {
        id: "upgrade",
        label: "Design an upgrade moment",
        detail: "When a free or trial user is asked to pay.",
        fields: [page("Screen or feature gate"), goal("Plan you want them to choose"), situation("What they have already done")],
      },
    ],
  },
  {
    id: "content",
    name: "Content",
    summary: "Pages, email, SMS, social, topics, lead magnets, images, and video.",
    jobs: [
      {
        id: "page-copy",
        label: "Write page copy",
        detail: "Page copy in your brand voice.",
        fields: [page("Page to write"), goal("The action on the page"), situation("Offer and proof you can use")],
      },
      {
        id: "edit",
        label: "Edit existing copy",
        detail: "A tighter version of copy you paste in.",
        fields: [
          {
            id: "draft",
            label: "Copy to edit",
            placeholder: "Paste the current text",
            required: true,
            multiline: true,
          },
          goal("What the edited copy must do"),
        ],
      },
      {
        id: "cold-email",
        label: "Write a cold email",
        detail: "A first email and follow-up for the person you name.",
        fields: [
          {
            id: "recipient",
            label: "Who receives it",
            placeholder: "Role and company type",
            required: true,
          },
          goal("Reply, meeting, or referral"),
          situation("Why you are writing now"),
        ],
      },
      {
        id: "email",
        label: "Plan an email sequence",
        detail: "The sequence, timing, and purpose of each email.",
        fields: [
          {
            id: "trigger",
            label: "What starts the sequence",
            placeholder: "Signup, purchase, or inactivity",
            required: true,
          },
          goal("Activate, nurture, or win back"),
          situation("What the reader already knows"),
        ],
      },
      {
        id: "sms",
        label: "Plan SMS",
        detail: "Texts, timing, and consent notes.",
        fields: [
          {
            id: "trigger",
            label: "What starts the texts",
            placeholder: "Opt-in, abandoned checkout, or delivery",
            required: true,
          },
          goal("Click, reply, or reminder"),
          situation("Consent you already have"),
        ],
      },
      {
        id: "social",
        label: "Create social posts",
        detail: "Opens the social studio with your source material.",
        fields: [
          {
            id: "source",
            label: "Source",
            placeholder: "Idea, article, or transcript",
            required: true,
            multiline: true,
          },
        ],
      },
      {
        id: "topics",
        label: "Plan topics",
        detail: "A topic plan from the audience and the job you want content to do.",
        fields: [
          {
            id: "audience",
            label: "Audience",
            placeholder: "Who the content is for",
            required: true,
          },
          goal("Demand, education, or sales support"),
          situation("Topics you already cover"),
        ],
      },
      {
        id: "lead-magnet",
        label: "Design a lead magnet",
        detail: "The asset, the promise, and the follow-up.",
        fields: [
          {
            id: "audience",
            label: "Who it is for",
            placeholder: "Role or problem",
            required: true,
          },
          goal("What they should do after downloading"),
          situation("What you can teach from real experience"),
        ],
      },
      {
        id: "image",
        label: "Brief an image",
        detail: "A production brief. This does not generate the file.",
        fields: [
          {
            id: "use",
            label: "Where it will be used",
            placeholder: "Homepage hero, social, or ad",
            required: true,
          },
          goal("What the image must communicate"),
          situation("Brand constraints or assets you already have"),
        ],
      },
      {
        id: "video",
        label: "Brief a video",
        detail: "A script and shot brief. This does not render the video.",
        fields: [
          {
            id: "use",
            label: "Where it will run",
            placeholder: "Site, social, or sales",
            required: true,
          },
          goal("What the viewer should do"),
          situation("Length and proof you can show"),
        ],
      },
    ],
  },
  {
    id: "seo",
    name: "SEO & Discovery",
    summary: "Search, site structure, comparisons, schema, app stores, and directories.",
    jobs: [
      {
        id: "audit",
        label: "Audit a site or page",
        detail: "Priority fixes for the URL you provide.",
        fields: [page("Site or page URL"), goal("Rank, index, or convert from search"), situation("Issues you already know")],
      },
      {
        id: "ai",
        label: "Be cited in AI answers",
        detail: "How the page should be structured so AI answers can cite it.",
        fields: [page("Page URL or topic"), goal("Question you want to be the answer to"), situation("Proof you can publish")],
      },
      {
        id: "scale",
        label: "Plan pages at scale",
        detail: "A template and the data that should fill it.",
        fields: [
          {
            id: "pattern",
            label: "Page pattern",
            placeholder: "Location, integration, or comparison",
            required: true,
          },
          goal("Query each page should win"),
          situation("Data you already have"),
        ],
      },
      {
        id: "structure",
        label: "Restructure the site",
        detail: "Navigation and URL groups for the pages you list.",
        fields: [
          {
            id: "pages",
            label: "Important pages",
            placeholder: "One URL or page name per line",
            required: true,
            multiline: true,
          },
          goal("What visitors and search should find first"),
        ],
      },
      {
        id: "compare",
        label: "Write a comparison",
        detail: "A comparison from the competitor and the difference you name.",
        fields: [
          {
            id: "competitor",
            label: "Competitor",
            placeholder: "Name or URL",
            required: true,
          },
          goal("Why a buyer should choose you"),
          situation("Facts you can stand behind"),
        ],
      },
      {
        id: "schema",
        label: "Add structured data",
        detail: "JSON-LD types for the page you describe.",
        fields: [page("Page URL and type"), goal("Rich result you want"), situation("Fields you can fill from real data")],
      },
      {
        id: "aso",
        label: "Improve an app listing",
        detail: "Listing changes for the store and keywords you name.",
        fields: [
          {
            id: "store",
            label: "Store",
            placeholder: "App Store or Google Play",
            required: true,
          },
          goal("Keywords or category"),
          situation("Current title, subtitle, and screenshots"),
        ],
      },
      {
        id: "directories",
        label: "Plan directory submissions",
        detail: "Which directories matter and what to submit.",
        fields: [
          {
            id: "product",
            label: "Product",
            placeholder: "What you want listed",
            required: true,
          },
          goal("Backlinks, users, or reviews"),
          situation("Listings you already have"),
        ],
      },
    ],
  },
  {
    id: "paid",
    name: "Paid & Distribution",
    summary: "Campaigns, creative, creators, and press.",
    jobs: [
      {
        id: "campaign",
        label: "Plan a paid campaign",
        detail: "Channel, audience, and offer for the budget you have.",
        fields: [
          {
            id: "channel",
            label: "Channel",
            placeholder: "Google, Meta, LinkedIn, or another network",
            required: true,
          },
          goal("Leads, purchases, or traffic"),
          situation("Audience, offer, and budget"),
        ],
      },
      {
        id: "creative",
        label: "Write ad creative",
        detail: "Headlines and primary text for the offer you describe.",
        fields: [
          {
            id: "offer",
            label: "Offer",
            placeholder: "What the ad promotes",
            required: true,
          },
          goal("The click or conversion"),
          situation("Proof and claims you can use"),
        ],
      },
      {
        id: "creators",
        label: "Plan creator partnerships",
        detail: "Who to approach and what to ask them to make.",
        fields: [
          {
            id: "audience",
            label: "Audience",
            placeholder: "Who the creators already reach",
            required: true,
          },
          goal("Awareness, content, or tracked signups"),
          situation("Budget and product access you can offer"),
        ],
      },
      {
        id: "press",
        label: "Plan press outreach",
        detail: "The story and the outlets worth pitching.",
        fields: [
          {
            id: "story",
            label: "Story",
            placeholder: "News, data, or customer result",
            required: true,
            multiline: true,
          },
          goal("Coverage you want"),
          situation("Proof a journalist can check"),
        ],
      },
    ],
  },
  {
    id: "measurement",
    name: "Measurement",
    summary: "Tracking, experiments, and what actually drives revenue.",
    jobs: [
      {
        id: "tracking",
        label: "Define what to track",
        detail: "Events worth capturing for the decision you name.",
        fields: [
          {
            id: "decision",
            label: "Decision",
            placeholder: "Which page, channel, or feature to keep",
            required: true,
          },
          situation("Tools and events you already have"),
        ],
      },
      {
        id: "test",
        label: "Design a test",
        detail: "Hypothesis, audience, and the result that would change your mind.",
        fields: [
          {
            id: "change",
            label: "Change to test",
            placeholder: "Headline, price, or step",
            required: true,
          },
          goal("Metric that decides the winner"),
          situation("Traffic or customers you can include"),
        ],
      },
      {
        id: "attribution",
        label: "Explain what drives revenue",
        detail: "How to read credit across the touches you list.",
        fields: [
          {
            id: "touches",
            label: "Touches you can see",
            placeholder: "Ads, email, sales, organic",
            required: true,
          },
          goal("Question the model must answer"),
          situation("Revenue event you trust"),
        ],
      },
    ],
  },
  {
    id: "retention",
    name: "Retention",
    summary: "Cancel reasons, save offers, and failed payments.",
    jobs: [
      {
        id: "churn",
        label: "Reduce churn",
        detail: "A save path from the reasons and offers you can actually make.",
        fields: [
          {
            id: "who",
            label: "Who is leaving",
            placeholder: "Plan, segment, or tenure",
            required: true,
          },
          situation("Reasons you hear"),
          {
            id: "offer",
            label: "Save offer you can make",
            placeholder: "Pause, downgrade, or help",
            required: false,
          },
        ],
      },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    summary: "Partners, free tools, referrals, community, and loops.",
    jobs: [
      {
        id: "partners",
        label: "Find co-marketing partners",
        detail: "Partner types and a joint offer.",
        fields: [
          {
            id: "audience",
            label: "Shared audience",
            placeholder: "Who both products serve",
            required: true,
          },
          goal("What the partnership should produce"),
        ],
      },
      {
        id: "tool",
        label: "Plan a free tool",
        detail: "Whether a tool is worth building, and what it should do.",
        fields: [
          {
            id: "problem",
            label: "Problem the tool solves",
            placeholder: "Calculation, grade, or generator",
            required: true,
          },
          goal("Leads, links, or product habit"),
        ],
      },
      {
        id: "referral",
        label: "Design a referral offer",
        detail: "Who invites whom, and what both sides get.",
        fields: [
          {
            id: "participant",
            label: "Who refers",
            placeholder: "Customers, partners, or users",
            required: true,
          },
          goal("Reward you can afford"),
          situation("How a referral would be tracked"),
        ],
      },
      {
        id: "community",
        label: "Plan a community",
        detail: "Who it is for and why they would return.",
        fields: [
          {
            id: "members",
            label: "Members",
            placeholder: "Role or stage",
            required: true,
          },
          goal("What members should do there"),
        ],
      },
      {
        id: "loop",
        label: "Design a growth loop",
        detail: "The repeating step that creates the next user or asset.",
        fields: [
          {
            id: "input",
            label: "What starts the loop",
            placeholder: "A user, a piece of content, or a referral",
            required: true,
          },
          goal("What the loop should produce next"),
        ],
      },
    ],
  },
  {
    id: "sales",
    name: "Sales",
    summary: "Pipeline, collateral, and prospect lists.",
    jobs: [
      {
        id: "pipeline",
        label: "Define the pipeline",
        detail: "Stages, handoff, and what must be true to move forward.",
        fields: [
          {
            id: "motion",
            label: "How you sell",
            placeholder: "Self-serve, sales-led, or both",
            required: true,
          },
          goal("Stage that needs a clearer rule"),
          situation("Where leads stall"),
        ],
      },
      {
        id: "collateral",
        label: "Create sales material",
        detail: "The leave-behind for the conversation you name.",
        fields: [
          {
            id: "conversation",
            label: "Conversation",
            placeholder: "First call, demo, or security review",
            required: true,
          },
          goal("What the buyer should believe afterward"),
          situation("Objections that come up"),
        ],
      },
      {
        id: "prospects",
        label: "Define who to prospect",
        detail: "The account and person profile for outreach.",
        fields: [
          {
            id: "account",
            label: "Account fit",
            placeholder: "Industry, size, or trigger",
            required: true,
          },
          {
            id: "person",
            label: "Person",
            placeholder: "Role",
            required: true,
          },
          goal("Meeting, reply, or qualified lead"),
        ],
      },
    ],
  },
];

export const WORKSPACES = [INTELLIGENCE, ...FEATURE_WORKSPACES];

export function findWorkspace(workspaceId: string) {
  if (workspaceId === BRAND_BRAIN.id) return BRAND_BRAIN;
  return WORKSPACES.find((workspace) => workspace.id === workspaceId) ?? null;
}

export function findJob(workspaceId: string, jobId: string) {
  const workspace = findWorkspace(workspaceId);
  const job = workspace?.jobs.find((item) => item.id === jobId) ?? null;
  if (!workspace || !job) return null;
  return { workspace, job };
}
