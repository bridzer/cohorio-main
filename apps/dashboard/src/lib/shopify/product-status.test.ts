import { describe, expect, it } from "vitest";
import { normalizeProductStatus } from "./client";

describe("normalizeProductStatus", () => {
  it.each([
    ["ACTIVE", "ACTIVE"],
    ["DRAFT", "DRAFT"],
    ["ARCHIVED", "ARCHIVED"],
    ["active", "ACTIVE"],
    ["  draft  ", "DRAFT"],
    ["Archived", "ARCHIVED"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeProductStatus(input, "Tote")).toBe(expected);
  });

  it("rejects unknown statuses without mapping them to ACTIVE", () => {
    expect(() => normalizeProductStatus("PENDING", "Tote")).toThrow(RangeError);
    expect(() => normalizeProductStatus("PENDING", "Tote")).toThrow(/PENDING/);
    expect(() => normalizeProductStatus("PENDING", "Tote")).toThrow(/Tote/);
  });

  it("rejects missing and non-string statuses", () => {
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      expect(() => normalizeProductStatus(bad)).toThrow(RangeError);
      expect(() => normalizeProductStatus(bad)).toThrow(/ACTIVE, DRAFT, ARCHIVED/);
    }
  });
});
