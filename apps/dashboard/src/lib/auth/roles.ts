export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

const ROLE_WEIGHT: Record<OrganizationRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export function roleAllows(
  actual: OrganizationRole,
  minimum: OrganizationRole,
) {
  return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[minimum];
}
