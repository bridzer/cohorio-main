import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/database";
import { normalizeEmail } from "@/lib/auth/security";
import type { OrganizationRole } from "@/lib/access-control";

type WorkspaceRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  is_default: boolean;
  created_at: Date | string;
};

type MemberRow = {
  user_id: string;
  name: string | null;
  email: string;
  image_url: string | null;
  role: OrganizationRole;
  status: "active" | "suspended";
  joined_at: Date | string;
};

export async function listUserWorkspaces(userId: string) {
  const result = await query<WorkspaceRow & { organization_name: string }>(
    `SELECT w.id, w.organization_id, w.name, w.slug, w.status,
            w.is_default, w.created_at, o.name AS organization_name
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       JOIN workspaces w ON w.organization_id = o.id
      WHERE m.user_id = $1 AND m.status = 'active'
        AND o.status = 'active' AND w.status <> 'archived'
      ORDER BY o.created_at, w.is_default DESC, w.created_at`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    name: row.name,
    slug: row.slug,
    isDefault: row.is_default,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function createWorkspace(input: {
  organizationId: string;
  userId: string;
  name: string;
}) {
  const id = randomUUID();
  const slug = `${input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace"}-${id.slice(0, 6)}`;
  const result = await query<WorkspaceRow>(
    `INSERT INTO workspaces (
       id, organization_id, name, slug, status, created_by_user_id, claimed_at
     ) VALUES ($1, $2, $3, $4, 'active', $5, NOW())
     RETURNING id, organization_id, name, slug, status, is_default, created_at`,
    [id, input.organizationId, input.name.trim(), slug, input.userId],
  );
  return result.rows[0];
}

export async function archiveWorkspace(
  organizationId: string,
  workspaceId: string,
) {
  const result = await query<{ id: string }>(
    `UPDATE workspaces
        SET status = 'archived', archived_at = NOW(), is_default = FALSE,
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = 'active'
        AND is_default = FALSE
      RETURNING id`,
    [workspaceId, organizationId],
  );
  return Boolean(result.rows[0]);
}

export async function workspaceAccessibleToUser(
  workspaceId: string,
  userId: string,
) {
  const result = await query<{ id: string }>(
    `SELECT w.id
       FROM workspaces w
       JOIN organization_memberships m
         ON m.organization_id = w.organization_id
      WHERE w.id = $1 AND m.user_id = $2
        AND w.status = 'active' AND m.status = 'active'`,
    [workspaceId, userId],
  );
  return Boolean(result.rows[0]);
}

export async function listOrganizationMembers(organizationId: string) {
  const result = await query<MemberRow>(
    `SELECT u.id AS user_id, u.name, u.email, u.image_url,
            m.role, m.status, m.joined_at
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1 AND u.status <> 'deleted'
      ORDER BY CASE m.role
        WHEN 'owner' THEN 1 WHEN 'admin' THEN 2
        WHEN 'member' THEN 3 ELSE 4 END, u.name, u.email`,
    [organizationId],
  );
  return result.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    image: row.image_url,
    role: row.role,
    status: row.status,
    joinedAt: new Date(row.joined_at).toISOString(),
  }));
}

export async function createInvitation(input: {
  organizationId: string;
  email: string;
  role: Exclude<OrganizationRole, "owner">;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
}) {
  const result = await query<{ id: string }>(
    `INSERT INTO organization_invitations (
       organization_id, email, role, token_hash, invited_by_user_id, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, email)
       WHERE accepted_at IS NULL AND revoked_at IS NULL
     DO UPDATE SET role = EXCLUDED.role, token_hash = EXCLUDED.token_hash,
                   invited_by_user_id = EXCLUDED.invited_by_user_id,
                   expires_at = EXCLUDED.expires_at, created_at = NOW()
     RETURNING id`,
    [
      input.organizationId,
      normalizeEmail(input.email),
      input.role,
      input.tokenHash,
      input.invitedByUserId,
      input.expiresAt,
    ],
  );
  return result.rows[0];
}

export async function listPendingInvitations(organizationId: string) {
  const result = await query<{
    id: string;
    email: string;
    role: Exclude<OrganizationRole, "owner">;
    expires_at: Date | string;
    created_at: Date | string;
  }>(
    `SELECT id, email, role, expires_at, created_at
       FROM organization_invitations
      WHERE organization_id = $1 AND accepted_at IS NULL
        AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC`,
    [organizationId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function acceptInvitation(input: {
  tokenHash: string;
  userId: string;
  userEmail: string;
}) {
  return transaction(async (client) => {
    const invitation = await client.query<{
      id: string;
      organization_id: string;
      email: string;
      role: Exclude<OrganizationRole, "owner">;
    }>(
      `SELECT id, organization_id, email, role
         FROM organization_invitations
        WHERE token_hash = $1 AND accepted_at IS NULL
          AND revoked_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [input.tokenHash],
    );
    const row = invitation.rows[0];
    if (!row || normalizeEmail(row.email) !== normalizeEmail(input.userEmail)) {
      return null;
    }
    await client.query(
      `INSERT INTO organization_memberships (
         organization_id, user_id, role, status, invited_by_user_id
       )
       SELECT organization_id, $2, role, 'active', invited_by_user_id
         FROM organization_invitations WHERE id = $1
       ON CONFLICT (organization_id, user_id) DO UPDATE
         SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
      [row.id, input.userId],
    );
    await client.query(
      `UPDATE organization_invitations SET accepted_at = NOW() WHERE id = $1`,
      [row.id],
    );
    const workspace = await client.query<{ id: string }>(
      `SELECT id FROM workspaces
        WHERE organization_id = $1 AND status = 'active'
        ORDER BY is_default DESC, created_at LIMIT 1`,
      [row.organization_id],
    );
    return {
      organizationId: row.organization_id,
      workspaceId: workspace.rows[0]?.id ?? null,
    };
  });
}

export async function updateMember(input: {
  organizationId: string;
  actorUserId: string;
  targetUserId: string;
  role?: OrganizationRole;
  status?: "active" | "suspended";
}) {
  return transaction(async (client) => {
    if (input.role === "owner") {
      const promoted = await client.query<{ user_id: string }>(
        `UPDATE organization_memberships
            SET role = 'owner', status = 'active', updated_at = NOW()
          WHERE organization_id = $1 AND user_id = $2
          RETURNING user_id`,
        [input.organizationId, input.targetUserId],
      );
      if (!promoted.rows[0]) return false;
      await client.query(
        `UPDATE organization_memberships
            SET role = 'admin', updated_at = NOW()
          WHERE organization_id = $1 AND user_id = $2 AND role = 'owner'`,
        [input.organizationId, input.actorUserId],
      );
      return true;
    }
    const result = await client.query<{ user_id: string }>(
      `UPDATE organization_memberships
          SET role = COALESCE($3, role),
              status = COALESCE($4, status),
              updated_at = NOW()
        WHERE organization_id = $1 AND user_id = $2
        RETURNING user_id`,
      [
        input.organizationId,
        input.targetUserId,
        input.role ?? null,
        input.status ?? null,
      ],
    );
    return Boolean(result.rows[0]);
  });
}

export async function removeMember(
  organizationId: string,
  targetUserId: string,
) {
  const result = await query<{ user_id: string }>(
    `DELETE FROM organization_memberships
      WHERE organization_id = $1 AND user_id = $2
      RETURNING user_id`,
    [organizationId, targetUserId],
  );
  return Boolean(result.rows[0]);
}

export async function updateUserProfile(userId: string, name: string) {
  const result = await query<{ id: string; name: string; email: string }>(
    `UPDATE users SET name = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'active'
      RETURNING id, name, email`,
    [userId, name.trim()],
  );
  return result.rows[0] ?? null;
}

export async function incrementSessionVersion(userId: string) {
  await query(
    `UPDATE users
        SET session_version = session_version + 1, updated_at = NOW()
      WHERE id = $1`,
    [userId],
  );
}
