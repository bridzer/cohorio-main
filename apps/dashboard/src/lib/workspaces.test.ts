import { describe, expect, it } from "vitest";
import { SKILL_CATEGORY } from "./skills/categories";
import { FEATURE_WORKSPACES, INTELLIGENCE, BRAND_BRAIN } from "./workspaces";
import { assignedSkills, skillForJob } from "./workspaces-server";

describe("workspace skill assignment", () => {
  it("assigns every skill to one workspace job", () => {
    const assigned = assignedSkills().sort();
    expect(assigned).toEqual(Object.keys(SKILL_CATEGORY).sort());
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("resolves each published job without naming the skill in the workspace copy", () => {
    const workspaces = [BRAND_BRAIN, INTELLIGENCE, ...FEATURE_WORKSPACES];
    for (const workspace of workspaces) {
      expect(workspace.summary.toLowerCase()).not.toContain("skill");
      for (const job of workspace.jobs) {
        expect(skillForJob(workspace.id, job.id).length).toBeGreaterThan(0);
        expect(job.label.toLowerCase()).not.toContain("skill");
      }
    }
  });
});
