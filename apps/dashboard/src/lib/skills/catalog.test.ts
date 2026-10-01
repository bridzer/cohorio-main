import { describe, expect, it } from "vitest";
import { access } from "node:fs/promises";
import path from "node:path";
import { PLAYBOOKS, resolvePlaybook } from "./catalog";
import { resolveSkillsRoot } from "./load-skill";

describe("playbook catalog", () => {
  it("maps Home skill ids to skill directories", () => {
    expect(resolvePlaybook("social-content").directory).toBe("social");
    expect(resolvePlaybook("ad-creative").directory).toBe("ad-creative");
    expect(resolvePlaybook("copywriting").directory).toBe("copywriting");
    expect(resolvePlaybook("page-cro").directory).toBe("cro");
    expect(resolvePlaybook("email-sequence").directory).toBe("emails");
    expect(resolvePlaybook("seo-audit").directory).toBe("seo-audit");
    expect(Object.keys(PLAYBOOKS)).toEqual([
      "social-content",
      "ad-creative",
      "copywriting",
      "page-cro",
      "email-sequence",
      "seo-audit",
    ]);
  });

  it("rejects an unknown playbook", () => {
    expect(() => resolvePlaybook("missing")).toThrow(/Unknown playbook/);
  });

  it("finds each playbook skill file under the resolved skills root", async () => {
    const root = await resolveSkillsRoot();
    for (const playbook of Object.values(PLAYBOOKS)) {
      await expect(
        access(path.join(root, playbook.directory, "SKILL.md")),
      ).resolves.toBeUndefined();
    }
  });
});
