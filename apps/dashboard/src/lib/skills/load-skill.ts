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

function frontmatterScalar(block: string, key: string) {
  const lines = block.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (index < 0) return "";
  const raw = lines[index].slice(key.length + 1).trim();
  if (raw.startsWith('"')) {
    const parts = [raw.slice(1)];
    if (raw.endsWith('"') && raw.length > 1) {
      return raw.slice(1, -1);
    }
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.endsWith('"')) {
        parts.push(line.slice(0, -1));
        return parts.join(" ");
      }
      parts.push(line);
    }
    return "";
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length > 1) {
    return raw.slice(1, -1);
  }
  return raw;
}

export async function readSkillFrontmatter(directory: string) {
  const root = await resolveSkillsRoot();
  const filePath = path.join(root, directory, "SKILL.md");
  let markdown: string;
  try {
    markdown = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Skill markdown was not found for ${directory}.`);
  }
  if (!markdown.startsWith("---")) {
    throw new Error(`Skill frontmatter is incomplete for ${directory}.`);
  }
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) {
    throw new Error(`Skill frontmatter is incomplete for ${directory}.`);
  }
  const block = markdown.slice(markdown.indexOf("\n", 3) + 1, end);
  const name = frontmatterScalar(block, "name");
  const description = frontmatterScalar(block, "description");
  if (!name || !description) {
    throw new Error(`Skill frontmatter is incomplete for ${directory}.`);
  }
  return { name, description };
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
