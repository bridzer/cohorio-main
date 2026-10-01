import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SKILL_MARKDOWN_LIMIT = 80_000;

async function directoryExists(directory: string) {
  try {
    await access(path.join(directory, "social", "SKILL.md"));
    return true;
  } catch {
    return false;
  }
}

export async function resolveSkillsRoot() {
  const candidates = [
    path.join(process.cwd(), "skills"),
    path.join(process.cwd(), "..", "..", "skills"),
  ];
  for (const candidate of candidates) {
    if (await directoryExists(candidate)) return candidate;
  }
  throw new Error("Skills directory was not found.");
}

export async function readSkillMarkdown(directory: string) {
  const root = await resolveSkillsRoot();
  const filePath = path.join(root, directory, "SKILL.md");
  let markdown: string;
  try {
    markdown = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Skill markdown was not found for ${directory}.`);
  }
  if (markdown.length > SKILL_MARKDOWN_LIMIT) {
    return markdown.slice(0, SKILL_MARKDOWN_LIMIT);
  }
  return markdown;
}
