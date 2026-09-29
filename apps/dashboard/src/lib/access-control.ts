import { auth } from "@/auth";
import { query } from "@/lib/database";
import { getUserById } from "@/lib/auth/repository";
import { readWorkspaceId } from "@/lib/workspace";
import {
  roleAllows,
  type OrganizationRole,
} from "@/lib/auth/roles";
export type { OrganizationRole } from "@/lib/auth/roles";

export type AccessContext = {
  userId: string;
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
  role: OrganizationRole;
};

type AccessRow = {
  user_id: string;
  organization_id: string;
  organization_name: string;
  workspace_id: string;
  workspace_name: string;
  role: OrganizationRole;
};

export class AccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
  }
}

export async function resolveWorkspaceAccess(
  minimumRole: OrganizationRole = "viewer",
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await getUserById(userId);
  if (
    !user ||
    user.status !== "active" ||
    user.sessionVersion !== session.user.sessionVersion
  ) {
    return null;
  }

  const preferredWorkspaceId = await readWorkspaceId();
  const result = await query<AccessRow>(
    `SELECT m.user_id, o.id AS organization_id, o.name AS organization_name,
            w.id AS workspace_id, w.name AS workspace_name, m.role
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       JOIN workspaces w ON w.organization_id = o.id
      WHERE m.user_id = $1 AND m.status = 'active'
        AND o.status = 'active' AND w.status = 'active'
      ORDER BY (w.id = $2::uuid) DESC NULLS LAST,
               w.is_default DESC, w.created_at
      LIMIT 1`,
    [userId, preferredWorkspaceId],
  );
  const row = result.rows[0];
  if (!row || !roleAllows(row.role, minimumRole)) return null;
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    role: row.role,
  } satisfies AccessContext;
}

export async function requireWorkspaceAccess(
  minimumRole: OrganizationRole = "viewer",
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AccessError("Authentication required.", 401);
  }
  const access = await resolveWorkspaceAccess(minimumRole);
  if (!access) {
    throw new AccessError("You do not have access to this workspace.", 403);
  }
  return access;
}

export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}
