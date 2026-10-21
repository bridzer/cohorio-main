import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { listSkillDirectories } from "@/lib/skills/catalog";
import {
  readSkillFrontmatter,
  readSkillMarkdown,
  resolveSkillsRoot,
} from "@/lib/skills/load-skill";
import { defineTool, ToolInputError } from "../registry";

const REFERENCE_FILE = /^[a-z0-9][a-z0-9-]*\.md$/;
const REFERENCE_LIMIT = 40_000;

export type SkillSummary = { id: string; description: string };

let catalogCache: Promise<SkillSummary[]> | null = null;

function firstSentence(description: string) {
  const sentence = description.split(/(?<=\.)\s/)[0] ?? description;
  return sentence.length > 220 ? `${sentence.slice(0, 219)}…` : sentence;
}

/** Skills ship with the deploy, so the catalog is read once per process. */
export function skillCatalog() {
  catalogCache ??= (async () => {
    const directories = await listSkillDirectories();
    const entries = await Promise.all(
      directories.map(async (id) => {
        try {
          const { description } = await readSkillFrontmatter(id);
          return { id, description: firstSentence(description) };
        } catch {
          return null;
        }
      }),
    );
    return entries.filter((entry): entry is SkillSummary => entry !== null);
  })().catch((error) => {
    catalogCache = null;
    throw error;
  });
  return catalogCache;
}

async function assertSkill(id: string) {
  const directories = await listSkillDirectories();
  if (!directories.includes(id)) {
    throw new ToolInputError(`Unknown skill: ${id}. Use an id from the skill catalog.`);
  }
}

async function referenceFiles(skillId: string) {
  const root = await resolveSkillsRoot();
  try {
    const entries = await readdir(path.join(root, skillId, "references"), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile() && REFERENCE_FILE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export const loadSkill = defineTool({
  name: "load_skill",
  tier: "read",
  description:
    "Load the full expert playbook for a marketing skill from the catalog. Do this before producing work in that skill's area. Returns the playbook and the names of its optional reference files.",
  input: z.object({
    skill: z.string().min(1).max(64).describe("Skill id from the catalog, e.g. ad-creative"),
  }),
  async execute(_ctx, { skill }) {
    await assertSkill(skill);
    const [markdown, references] = await Promise.all([
      readSkillMarkdown(skill),
      referenceFiles(skill),
    ]);
    return { skill, references, playbook: markdown };
  },
});

export const readSkillReference = defineTool({
  name: "read_skill_reference",
  tier: "read",
  description:
    "Read one reference file listed by load_skill, for detailed frameworks, templates or platform specs.",
  input: z.object({
    skill: z.string().min(1).max(64),
    file: z.string().regex(REFERENCE_FILE).describe("File name as listed by load_skill"),
  }),
  async execute(_ctx, { skill, file }) {
    await assertSkill(skill);
    // Only names from the directory listing are readable, so paths cannot escape it.
    if (!(await referenceFiles(skill)).includes(file)) {
      throw new ToolInputError(`${skill} has no reference file named ${file}.`);
    }
    const root = await resolveSkillsRoot();
    const text = await readFile(path.join(root, skill, "references", file), "utf8");
    return { skill, file, content: text.slice(0, REFERENCE_LIMIT) };
  },
});
