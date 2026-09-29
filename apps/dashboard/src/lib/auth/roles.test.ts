import { describe, expect, it } from "vitest";
import { roleAllows, type OrganizationRole } from "./roles";

describe("organization role matrix", () => {
  const roles: OrganizationRole[] = ["viewer", "member", "admin", "owner"];

  it("allows every role to read", () => {
    for (const role of roles) expect(roleAllows(role, "viewer")).toBe(true);
  });

  it("keeps content mutation above viewer", () => {
    expect(roleAllows("viewer", "member")).toBe(false);
    expect(roleAllows("member", "member")).toBe(true);
  });

  it("keeps connection and tenancy management above members", () => {
    expect(roleAllows("member", "admin")).toBe(false);
    expect(roleAllows("admin", "admin")).toBe(true);
  });

  it("reserves ownership operations for owners", () => {
    expect(roleAllows("admin", "owner")).toBe(false);
    expect(roleAllows("owner", "owner")).toBe(true);
  });
});
