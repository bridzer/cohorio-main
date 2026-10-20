import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveSkillsRoot } from "./load-skill";

export {
  SKILL_CATEGORIES,
  SKILL_CATEGORY,
  skillCategory,
  type SkillCategory,
} from "./categories";

export const LEGACY_PLAYBOOKS: Record<string, { directory: string; title: string }> = {
  "social-content": { directory: "social", title: "Social content" },
  "ad-creative": { directory: "ad-creative", title: "Ad creative" },
  copywriting: { directory: "copywriting", title: "Copywriting" },
  "page-cro": { directory: "cro", title: "Page CRO" },
  "email-sequence": { directory: "emails", title: "Email sequence" },
  "seo-audit": { directory: "seo-audit", title: "SEO audit" },
};

export const PLAYBOOKS = LEGACY_PLAYBOOKS;

export async function listSkillDirectories() {
  const root = await resolveSkillsRoot();
  const entries = await readdir(root, { withFileTypes: true });
  const directories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await access(path.join(root, entry.name, "SKILL.md"));
      directories.push(entry.name);
    } catch {
      continue;
    }
  }
  directories.sort();
  return directories;
}

export async function resolvePlaybook(skillId: string) {
  const legacy = LEGACY_PLAYBOOKS[skillId];
  if (legacy) return legacy;
  const directories = await listSkillDirectories();
  if (!directories.includes(skillId)) {
    throw new Error(`Unknown playbook: ${skillId}.`);
  }
  return { directory: skillId, title: skillId };
}
