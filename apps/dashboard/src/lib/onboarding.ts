import { z } from "zod";
import type { ChannelIntent } from "./channels";

/**
 * Shared onboarding foundation (Milestone 1). Client-safe: constants, types,
 * and zod schemas only — no server imports, so the wizard UI imports this too.
 */

export const ONBOARDING_STAGES = [
  "profile",
  "objective",
  "brand",
  "channels",
  "integrations",
  "activation",
] as const;

export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export const STAGE_META: Record<OnboardingStage, { title: string; blurb: string }> = {
  profile: { title: "Your profile", blurb: "Who is setting up this workspace." },
  objective: { title: "Objective", blurb: "Business or social media." },
  brand: { title: "Brand", blurb: "Import an existing brand or build a new one." },
  channels: { title: "Channels", blurb: "Where marketing happens. Arrives in Milestone 2." },
  integrations: { title: "Integrations", blurb: "Connect business tools. Arrives in Milestone 4." },
  activation: { title: "Activation", blurb: "First objective and workspace launch. Arrives in Milestone 5." },
};

export function isOnboardingStage(value: unknown): value is OnboardingStage {
  return (
    typeof value === "string" &&
    (ONBOARDING_STAGES as readonly string[]).includes(value)
  );
}

export type StageStatus = "pending" | "in_progress" | "complete";

export const ORGANIZATION_CATEGORIES = [
  {
    id: "ecommerce",
    title: "E-commerce",
    description: "Sells products online.",
    examples: "DTC brands, online boutiques, digital products",
  },
  {
    id: "physical-retail",
    title: "Physical retail",
    description: "Products sold in stores, pop-up markets, or otherwise.",
    examples: "Boutiques, showrooms, market stalls",
  },
  {
    id: "professional-services",
    title: "Professional services",
    description: "Marketing/design, law firms, consulting, IT, finance, construction, etc.",
    examples: "Agencies, firms, consultancies, contractors",
  },
  {
    id: "consumer-services",
    title: "Consumer services",
    description: "Restaurants, gyms, salons, tourism, sports, events, automotive, etc.",
    examples: "Hospitality, fitness, venues, local services",
  },
  {
    id: "media-content",
    title: "Media and content",
    description: "Publishing, news, blogs, video, music, and creator businesses.",
    examples: "Publishers, creators, studios, newsletters",
  },
  {
    id: "software-technology",
    title: "Software and technology",
    description: "SaaS, apps, platforms, and technology products.",
    examples: "SaaS, mobile apps, developer tools",
  },
  {
    id: "civic-social",
    title: "Civil and social services",
    description: "Non-profits, government, education, and community work.",
    examples: "Charities, schools, public sector, community groups",
  },
] as const;

export type OrganizationCategoryId =
  (typeof ORGANIZATION_CATEGORIES)[number]["id"];

export function isOrganizationCategory(value: unknown): value is OrganizationCategoryId {
  return (
    typeof value === "string" &&
    ORGANIZATION_CATEGORIES.some((entry) => entry.id === value)
  );
}

const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((value) => !value || E164_PHONE.test(value), {
      message: "Use international format, e.g. +14155552671.",
    })
    .optional()
    .default(""),
  addressLine1: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  region: z.string().trim().max(120).optional().default(""),
  postalCode: z.string().trim().max(30).optional().default(""),
  country: z.string().trim().max(120).optional().default(""),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export type UserProfile = ProfileInput & {
  userId: string;
  updatedAt: string;
};

const stageStatusSchema = z.enum(["pending", "in_progress", "complete"]);

export const sessionPatchSchema = z
  .object({
    currentStage: z
      .string()
      .refine(isOnboardingStage, { message: "Unknown onboarding stage." })
      .optional(),
    stages: z.record(z.string(), stageStatusSchema).optional(),
    objective: z.enum(["business", "social"]).optional(),
    brandPath: z.enum(["import", "build"]).optional(),
    organizationCategory: z
      .string()
      .max(60)
      .refine(
        (value) => !value || isOrganizationCategory(value),
        { message: "Unknown organization category." },
      )
      .optional(),
    businessName: z.string().trim().max(200).optional(),
    websiteUrl: z
      .string()
      .trim()
      .max(2000)
      .refine((value) => !value || /^https?:\/\/.+\..+/.test(value), {
        message: "Website URL must start with http(s)://.",
      })
      .optional(),
    selectedChannels: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80),
          intent: z.enum(["using", "planning"]),
        }),
      )
      .max(100)
      .optional(),
    selectedObjective: z.string().trim().max(200).optional(),
  })
  .strict();

export type SessionPatch = z.infer<typeof sessionPatchSchema>;

export type OnboardingSession = {
  workspaceId: string;
  currentStage: OnboardingStage;
  stages: Partial<Record<OnboardingStage, StageStatus>>;
  objective: "business" | "social" | null;
  brandPath: "import" | "build" | null;
  organizationCategory: string | null;
  businessName: string | null;
  websiteUrl: string | null;
  selectedChannels: ChannelSelection[];
  selectedObjective: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type ChannelSelection = {
  id: string;
  intent: ChannelIntent;
};

/** Defensive parse of the session's channel JSONB (tolerates legacy id-only rows). */
export function channelSelections(value: unknown): ChannelSelection[] {
  if (!Array.isArray(value)) return [];
  const selections: ChannelSelection[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      selections.push({ id: entry.trim().slice(0, 80), intent: "planning" });
      continue;
    }
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { id?: unknown }).id === "string" &&
      (entry as { id: string }).id.trim() &&
      ((entry as { intent?: unknown }).intent === "using" ||
        (entry as { intent?: unknown }).intent === "planning")
    ) {
      selections.push({
        id: ((entry as { id: string }).id as string).trim().slice(0, 80),
        intent: (entry as { intent: ChannelIntent }).intent,
      });
    }
  }
  return selections.slice(0, 100);
}
