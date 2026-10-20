import { describe, expect, it } from "vitest";
import { access } from "node:fs/promises";
import path from "node:path";
import {
  LEGACY_PLAYBOOKS,
  PLAYBOOKS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY,
  listSkillDirectories,
  resolvePlaybook,
  skillCategory,
} from "./catalog";
import { readSkillFrontmatter, resolveSkillsRoot } from "./load-skill";

describe("playbook catalog", () => {
  it("maps legacy Home skill ids to skill directories", async () => {
    expect((await resolvePlaybook("social-content")).directory).toBe("social");
    expect((await resolvePlaybook("ad-creative")).directory).toBe("ad-creative");
    expect((await resolvePlaybook("copywriting")).directory).toBe("copywriting");
    expect((await resolvePlaybook("page-cro")).directory).toBe("cro");
    expect((await resolvePlaybook("email-sequence")).directory).toBe("emails");
    expect((await resolvePlaybook("seo-audit")).directory).toBe("seo-audit");
    expect(Object.keys(PLAYBOOKS)).toEqual(Object.keys(LEGACY_PLAYBOOKS));
    expect(Object.keys(LEGACY_PLAYBOOKS)).toEqual([
      "social-content",
      "ad-creative",
      "copywriting",
      "page-cro",
      "email-sequence",
      "seo-audit",
    ]);
  });

  it("resolves every on-disk skill directory", async () => {
    const directories = await listSkillDirectories();
    expect(directories).toContain("form");
    expect(directories.length).toBeGreaterThan(6);
    for (const directory of directories) {
      expect((await resolvePlaybook(directory)).directory).toBe(directory);
    }
  });

  it("rejects an unknown playbook", async () => {
    await expect(resolvePlaybook("missing")).rejects.toThrow(/Unknown playbook/);
  });

  it("finds each playbook skill file under the resolved skills root", async () => {
    const root = await resolveSkillsRoot();
    const directories = await listSkillDirectories();
    for (const directory of directories) {
      await expect(
        access(path.join(root, directory, "SKILL.md")),
      ).resolves.toBeUndefined();
    }
  });

  it("assigns every skill directory to one major category", async () => {
    const directories = await listSkillDirectories();
    expect(Object.keys(SKILL_CATEGORY).sort()).toEqual([...directories].sort());
    for (const directory of directories) {
      expect(SKILL_CATEGORIES).toContain(skillCategory(directory));
    }
    expect(() => skillCategory("missing")).toThrow(/Skill has no category/);
  });

  it("reads skill frontmatter", async () => {
    const cro = await readSkillFrontmatter("cro");
    expect(cro.name).toBe("cro");
    expect(cro.description.length).toBeGreaterThan(20);
    const form = await readSkillFrontmatter("form");
    expect(form.name).toBe("form");
    expect(form.description).toMatch(/lead, contact, and non-signup forms/);
  });
});
