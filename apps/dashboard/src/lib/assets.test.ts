import { describe, expect, it } from "vitest";
import { copilotAssetTitle, socialAssetTitle } from "./assets";

describe("asset titles", () => {
  it("uses the workspace line and does not require a skill name", () => {
    expect(
      copilotAssetTitle("Workspace: Cohorio Intelligence\nRequest: Read the competition"),
    ).toBe("Workspace: Cohorio Intelligence");
  });

  it("clips social copy to 80 characters", () => {
    expect(socialAssetTitle(`x${"y".repeat(100)}`)).toHaveLength(80);
  });
});
