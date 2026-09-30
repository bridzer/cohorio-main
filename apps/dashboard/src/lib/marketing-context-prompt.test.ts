import { describe, expect, it } from "vitest";
import {
  contextToMarkdown,
  markdownFieldValue,
  markdownSection,
  markdownSectionHasProvidedValues,
} from "./marketing-context";
import {
  MISSING_BRAND_BRAIN_CONTEXT,
  renderWorkspaceContextMarkdown,
} from "./marketing-context-prompt";

describe("Brand Brain markdown", () => {
  const markdown = contextToMarkdown(
    {
      productOverview: {
        oneLiner: "Acme widgets cut warehouse picking time in half",
      },
      brandVoice: {
        tone: "Direct and practical",
      },
    },
    "2026-09-29T12:00:00.000Z",
  );

  it("extracts the product one-liner and voice section", () => {
    expect(markdownSection(markdown, "Product overview")).toContain(
      "**One-line description:**",
    );
    expect(
      markdownFieldValue(markdown, "Product overview", "One-line description"),
    ).toBe("Acme widgets cut warehouse picking time in half");
    expect(markdownSectionHasProvidedValues(markdown, "Brand voice")).toBe(true);
    expect(
      markdownSectionHasProvidedValues(markdown, "Target audience"),
    ).toBe(false);
  });

  it("ignores empty and not-applicable sections", () => {
    const empty = contextToMarkdown({}, "2026-09-29T12:00:00.000Z");
    expect(
      markdownFieldValue(empty, "Product overview", "One-line description"),
    ).toBe("");
    expect(markdownSectionHasProvidedValues(empty, "Brand voice")).toBe(false);

    const skipped = contextToMarkdown(
      { brandVoice: { _notApplicable: "true" } },
      "2026-09-29T12:00:00.000Z",
    );
    expect(markdownSectionHasProvidedValues(skipped, "Brand voice")).toBe(false);
  });

  it("renders saved context and a missing-row fallback", () => {
    expect(renderWorkspaceContextMarkdown(null)).toBe(
      MISSING_BRAND_BRAIN_CONTEXT,
    );
    expect(
      renderWorkspaceContextMarkdown({
        workspaceId: "ws_1",
        sections: {
          productOverview: { oneLiner: "Acme widgets cut warehouse picking time in half" },
        },
        createdAt: "2026-09-29T12:00:00.000Z",
        updatedAt: "2026-09-29T12:00:00.000Z",
      }),
    ).toContain("Acme widgets cut warehouse picking time in half");
  });
});
