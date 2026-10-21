import { z } from "zod";
import { CONTEXT_SECTIONS } from "@/lib/marketing-context";
import { defineTool } from "../registry";

// These tools describe actions that leave Cohorio or change Brand Brain. They
// have no execute function: the loop records them as pending actions, and
// lib/agent/actions.ts runs them only after a person approves.

export const sendLifecycleEmail = defineTool({
  name: "send_lifecycle_email",
  tier: "external",
  description:
    "Propose sending a saved lifecycle email draft to one address through the workspace's Resend account. Requires human approval; it is not sent by calling this.",
  input: z.object({
    draftId: z.string().uuid(),
    to: z.string().email().max(320),
  }),
  summarize: ({ draftId, to }) => `Send lifecycle draft ${draftId} to ${to}`,
});

export const publishAdCampaign = defineTool({
  name: "publish_ad_campaign",
  tier: "external",
  description:
    "Propose publishing a draft ad campaign to its ad network. Requires human approval; it is not published by calling this.",
  input: z.object({
    connectionId: z.string().uuid(),
    campaignId: z.string().uuid(),
  }),
  summarize: ({ campaignId }) => `Publish ad campaign ${campaignId}`,
});

const SECTION_IDS = CONTEXT_SECTIONS.map((section) => section.id) as [
  (typeof CONTEXT_SECTIONS)[number]["id"],
  ...(typeof CONTEXT_SECTIONS)[number]["id"][],
];

export const BRAND_BRAIN_FIELDS = Object.fromEntries(
  CONTEXT_SECTIONS.map((section) => [
    section.id,
    section.fields.map((field) => field.id as string),
  ]),
) as Record<string, string[]>;

export const proposeBrandBrainUpdate = defineTool({
  name: "propose_brand_brain_update",
  tier: "external",
  description: `Propose changing saved Brand Brain facts when the user states a durable fact about their brand that is missing or outdated. Requires human approval. Only include fields you are changing. Sections and field ids: ${CONTEXT_SECTIONS.map(
    (section) => `${section.id} (${section.fields.map((field) => field.id).join(", ")})`,
  ).join("; ")}.`,
  input: z
    .object({
      section: z.enum(SECTION_IDS),
      values: z.record(z.string(), z.string().trim().min(1).max(4_000)),
      reason: z.string().max(300).describe("Why this change, quoting the user where possible"),
    })
    .superRefine((input, issues) => {
      const allowed = BRAND_BRAIN_FIELDS[input.section] ?? [];
      const keys = Object.keys(input.values);
      if (!keys.length) {
        issues.addIssue({ code: "custom", path: ["values"], message: "must change at least one field" });
      }
      for (const key of keys) {
        if (!allowed.includes(key)) {
          issues.addIssue({
            code: "custom",
            path: ["values", key],
            message: `is not a field of ${input.section}; use one of ${allowed.join(", ")}`,
          });
        }
      }
    }),
  summarize: ({ section, values }) =>
    `Update Brand Brain ${section}: ${Object.keys(values).join(", ")}`,
});
