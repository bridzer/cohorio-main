import { markdownFieldValue } from "@/lib/marketing-context";
import { completeChat } from "@/lib/llm/client";
import { readSkillMarkdown } from "@/lib/skills/load-skill";

export const LIFECYCLE_DRAFT_NAMES = [
  "Abandoned checkout",
  "Post-purchase",
  "Win-back",
] as const;

export type LifecycleDraftInput = {
  name: (typeof LIFECYCLE_DRAFT_NAMES)[number];
  trigger: string;
  bodyMarkdown: string;
};

const TRIGGERS: Record<(typeof LIFECYCLE_DRAFT_NAMES)[number], string> = {
  "Abandoned checkout": "Checkout started and not completed within 1 hour",
  "Post-purchase": "Order paid",
  "Win-back": "No order in the last 60 days",
};

export function lifecycleTemplates(brandContextMarkdown: string) {
  const oneLiner =
    markdownFieldValue(
      brandContextMarkdown,
      "Product overview",
      "One-line description",
    ) || "the offer saved in Brand Brain";
  return LIFECYCLE_DRAFT_NAMES.map((name) => ({
    name,
    trigger: TRIGGERS[name],
    bodyMarkdown: [
      `Subject: ${name}`,
      "",
      `This draft stays with the Brand Brain one-liner: ${oneLiner}.`,
      "",
      "Write the next version from that offer. Do not invent revenue, discounts, or customer counts.",
    ].join("\n"),
  }));
}

function draftsFromModel(content: string): LifecycleDraftInput[] | null {
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const byName = new Map<string, { trigger?: unknown; bodyMarkdown?: unknown }>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string") continue;
    byName.set(record.name, record);
  }
  const drafts: LifecycleDraftInput[] = [];
  for (const name of LIFECYCLE_DRAFT_NAMES) {
    const item = byName.get(name);
    const body =
      typeof item?.bodyMarkdown === "string" ? item.bodyMarkdown.trim() : "";
    if (!body) return null;
    const trigger =
      typeof item?.trigger === "string" && item.trigger.trim()
        ? item.trigger.trim()
        : TRIGGERS[name];
    drafts.push({ name, trigger, bodyMarkdown: body.slice(0, 20_000) });
  }
  return drafts;
}

export async function buildLifecycleDrafts(brandContextMarkdown: string) {
  if (!process.env.COHORIO_LLM_API_KEY?.trim()) {
    return lifecycleTemplates(brandContextMarkdown);
  }
  const skill = await readSkillMarkdown("emails");
  const content = await completeChat([
    {
      role: "system",
      content: `${skill}\n\n${brandContextMarkdown}`,
    },
    {
      role: "user",
      content: [
        "Write three lifecycle email drafts.",
        "Return only a JSON array with objects named exactly Abandoned checkout, Post-purchase, and Win-back.",
        "Each object has name, trigger, and bodyMarkdown.",
        "Do not invent revenue, discounts, or customer counts.",
      ].join(" "),
    },
  ]);
  return draftsFromModel(content) ?? lifecycleTemplates(brandContextMarkdown);
}
