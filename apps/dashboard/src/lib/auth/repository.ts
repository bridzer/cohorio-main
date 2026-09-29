import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { query, transaction } from "@/lib/database";
import { hashRateLimitKey, normalizeEmail, createActionToken } from "./security";

export type UserStatus = "pending" | "active" | "suspended" | "deleted";

export type AuthUser = {
  id: string;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  image: string | null;
  status: UserStatus;
  sessionVersion: number;
};

type UserRow = QueryResultRow & {
  id: string;
  name: string | null;
  email: string;
  email_verified_at: Date | string | null;
  image_url: string | null;
  status: UserStatus;
  session_version: number;
};

type CredentialRow = UserRow & {
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | string | null;
};

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified_at
      ? new Date(row.email_verified_at)
      : null,
    image: row.image_url,
    status: row.status,
    sessionVersion: row.session_version,
  };
}

const USER_COLUMNS = `
  id, name, email, email_verified_at, image_url, status, session_version
`;
const QUALIFIED_USER_COLUMNS = `
  u.id, u.name, u.email, u.email_verified_at, u.image_url,
  u.status, u.session_version
`;

export async function getUserById(id: string) {
  const result = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function getUserByEmail(email: string) {
  const result = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users
      WHERE email = $1 AND deleted_at IS NULL`,
    [normalizeEmail(email)],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function getUserByAccount(
  provider: string,
  providerAccountId: string,
) {
  const result = await query<UserRow>(
    `SELECT ${QUALIFIED_USER_COLUMNS}
       FROM users u
       JOIN auth_accounts a ON a.user_id = u.id
      WHERE a.provider = $1 AND a.provider_account_id = $2
        AND u.deleted_at IS NULL`,
    [provider, providerAccountId],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function createAdapterUser(input: {
  name?: string | null;
  email: string;
  emailVerified?: Date | null;
  image?: string | null;
}) {
  const result = await query<UserRow>(
    `INSERT INTO users (
       name, email, email_verified_at, image_url, status
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [
      input.name?.trim() || null,
      normalizeEmail(input.email),
      input.emailVerified ?? null,
      input.image ?? null,
      input.emailVerified ? "active" : "pending",
    ],
  );
  return mapUser(result.rows[0]);
}

export async function updateAdapterUser(
  id: string,
  input: {
    name?: string | null;
    email?: string;
    emailVerified?: Date | null;
    image?: string | null;
  },
) {
  const current = await getUserById(id);
  if (!current) throw new Error("User not found.");
  const result = await query<UserRow>(
    `UPDATE users
        SET name = $2,
            email = $3,
            email_verified_at = $4,
            image_url = $5,
            status = CASE WHEN $4::timestamptz IS NOT NULL
                          THEN 'active' ELSE status END,
            updated_at = NOW()
      WHERE id = $1
      RETURNING ${USER_COLUMNS}`,
    [
      id,
      input.name === undefined ? current.name : input.name,
      input.email === undefined ? current.email : normalizeEmail(input.email),
      input.emailVerified === undefined
        ? current.emailVerified
        : input.emailVerified,
      input.image === undefined ? current.image : input.image,
    ],
  );
  return mapUser(result.rows[0]);
}

export async function deleteAdapterUser(id: string) {
  await query(
    `UPDATE users
        SET status = 'deleted', deleted_at = NOW(),
            email = CONCAT('deleted+', id::text, '@invalid.local'),
            session_version = session_version + 1,
            updated_at = NOW()
      WHERE id = $1`,
    [id],
  );
}

export async function linkAuthAccount(input: {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}) {
  await query(
    `INSERT INTO auth_accounts (
       user_id, type, provider, provider_account_id, refresh_token,
       access_token, expires_at, token_type, scope, id_token, session_state
     ) VALUES ($1,$2,$3,$4,NULL,NULL,$5,$6,$7,NULL,$8)
     ON CONFLICT (provider, provider_account_id) DO UPDATE
       SET expires_at = EXCLUDED.expires_at,
           token_type = EXCLUDED.token_type,
           scope = EXCLUDED.scope,
           session_state = EXCLUDED.session_state,
           refresh_token = NULL,
           access_token = NULL,
           id_token = NULL,
           updated_at = NOW()`,
    [
      input.userId,
      input.type,
      input.provider,
      input.providerAccountId,
      input.expires_at ?? null,
      input.token_type ?? null,
      input.scope ?? null,
      input.session_state ?? null,
    ],
  );
  return input;
}

export async function unlinkAuthAccount(
  provider: string,
  providerAccountId: string,
) {
  await query(
    `DELETE FROM auth_accounts
      WHERE provider = $1 AND provider_account_id = $2`,
    [provider, providerAccountId],
  );
}

export async function getCredentialUser(email: string) {
  const result = await query<CredentialRow>(
    `SELECT u.id, u.name, u.email, u.email_verified_at, u.image_url,
            u.status, u.session_version, c.password_hash,
            c.failed_attempts, c.locked_until
       FROM users u
       JOIN user_credentials c ON c.user_id = u.id
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
    [normalizeEmail(email)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    user: mapUser(row),
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
  };
}

export async function recordLoginFailure(userId: string) {
  await query(
    `UPDATE user_credentials
        SET failed_attempts = failed_attempts + 1,
            last_failed_at = NOW(),
            locked_until = CASE
              WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
              ELSE locked_until
            END,
            updated_at = NOW()
      WHERE user_id = $1`,
    [userId],
  );
  await writeAuditEvent({ actorUserId: userId, eventType: "auth.login_failed" });
}

export async function recordLoginSuccess(userId: string) {
  await transaction(async (client) => {
    await client.query(
      `UPDATE user_credentials
          SET failed_attempts = 0, locked_until = NULL,
              last_failed_at = NULL, updated_at = NOW()
        WHERE user_id = $1`,
      [userId],
    );
    await client.query(
      `UPDATE users SET last_login_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [userId],
    );
  });
  await writeAuditEvent({ actorUserId: userId, eventType: "auth.login_succeeded" });
}

export async function activateOAuthUser(userId: string) {
  const result = await query<UserRow>(
    `UPDATE users
        SET status = 'active',
            email_verified_at = COALESCE(email_verified_at, NOW()),
            last_login_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'active')
      RETURNING ${USER_COLUMNS}`,
    [userId],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

type TenantBootstrap = {
  organizationId: string;
  workspaceId: string;
};

function tenantName(name: string | null, email: string) {
  const base = name?.trim() || email.split("@")[0] || "My";
  return `${base}'s organization`;
}

async function ensureUserTenantWithClient(
  client: PoolClient,
  user: AuthUser,
  preferredWorkspaceId?: string | null,
): Promise<TenantBootstrap> {
  const existing = await client.query<{
    organization_id: string;
    workspace_id: string;
  }>(
    `SELECT m.organization_id, w.id AS workspace_id
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       JOIN workspaces w ON w.organization_id = o.id
      WHERE m.user_id = $1 AND m.status = 'active'
        AND o.status = 'active' AND w.status = 'active'
      ORDER BY w.is_default DESC, w.created_at
      LIMIT 1`,
    [user.id],
  );
  if (existing.rows[0]) {
    const current = existing.rows[0];
    if (preferredWorkspaceId) {
      const anonymous = await client.query<{ id: string }>(
        `SELECT id FROM workspaces
          WHERE id = $1 AND organization_id IS NULL AND status = 'anonymous'
          FOR UPDATE`,
        [preferredWorkspaceId],
      );
      if (anonymous.rows[0]) {
        await client.query(
          `UPDATE workspaces
              SET organization_id = $2, status = 'active',
                  name = 'Imported workspace',
                  slug = CONCAT('imported-', LEFT(id::text, 8)),
                  is_default = FALSE, created_by_user_id = $3,
                  claimed_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [preferredWorkspaceId, current.organization_id, user.id],
        );
        return {
          organizationId: current.organization_id,
          workspaceId: preferredWorkspaceId,
        };
      }
    }
    return {
      organizationId: current.organization_id,
      workspaceId: current.workspace_id,
    };
  }

  const organizationId = randomUUID();
  const slug = `org-${organizationId.slice(0, 8)}`;
  await client.query(
    `INSERT INTO organizations (id, name, slug, created_by_user_id)
     VALUES ($1, $2, $3, $4)`,
    [organizationId, tenantName(user.name, user.email), slug, user.id],
  );
  await client.query(
    `INSERT INTO organization_memberships (
       organization_id, user_id, role, status
     ) VALUES ($1, $2, 'owner', 'active')`,
    [organizationId, user.id],
  );

  let workspaceId = preferredWorkspaceId ?? null;
  if (workspaceId) {
    const claimed = await client.query<{ id: string }>(
      `UPDATE workspaces
          SET organization_id = $2, status = 'active',
              name = 'Main workspace', slug = 'main',
              is_default = TRUE, created_by_user_id = $3,
              claimed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND organization_id IS NULL AND status = 'anonymous'
        RETURNING id`,
      [workspaceId, organizationId, user.id],
    );
    if (!claimed.rows[0]) workspaceId = null;
  }
  if (!workspaceId) {
    workspaceId = randomUUID();
    await client.query(
      `INSERT INTO workspaces (
         id, organization_id, name, slug, status, is_default,
         created_by_user_id, claimed_at
       ) VALUES ($1, $2, 'Main workspace', 'main', 'active', TRUE, $3, NOW())`,
      [workspaceId, organizationId, user.id],
    );
  }
  await client.query(
    `INSERT INTO audit_events (
       organization_id, workspace_id, actor_user_id, event_type,
       target_type, target_id
     ) VALUES ($1, $2, $3, 'workspace.claimed', 'workspace', $4)`,
    [organizationId, workspaceId, user.id, workspaceId],
  );
  return { organizationId, workspaceId };
}

export async function ensureUserTenant(
  userId: string,
  preferredWorkspaceId?: string | null,
) {
  return transaction(async (client) => {
    const result = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users
        WHERE id = $1 AND status = 'active' FOR UPDATE`,
      [userId],
    );
    if (!result.rows[0]) throw new Error("Active user not found.");
    return ensureUserTenantWithClient(
      client,
      mapUser(result.rows[0]),
      preferredWorkspaceId,
    );
  });
}

export async function createPendingRegistration(input: {
  name: string;
  email: string;
  passwordHash: string;
  tokenHash: string;
  expiresAt: Date;
  workspaceId?: string | null;
}) {
  return transaction(async (client) => {
    const email = normalizeEmail(input.email);
    const current = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = $1 FOR UPDATE`,
      [email],
    );
    if (current.rows[0]?.status === "active" || current.rows[0]?.status === "suspended") {
      return null;
    }

    let user: AuthUser;
    if (current.rows[0]) {
      const updated = await client.query<UserRow>(
        `UPDATE users
            SET name = $2, updated_at = NOW()
          WHERE id = $1
          RETURNING ${USER_COLUMNS}`,
        [current.rows[0].id, input.name.trim()],
      );
      user = mapUser(updated.rows[0]);
      await client.query(
        `INSERT INTO user_credentials (user_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               password_changed_at = NOW(), failed_attempts = 0,
               locked_until = NULL, updated_at = NOW()`,
        [user.id, input.passwordHash],
      );
    } else {
      const inserted = await client.query<UserRow>(
        `INSERT INTO users (name, email, status)
         VALUES ($1, $2, 'pending')
         RETURNING ${USER_COLUMNS}`,
        [input.name.trim(), email],
      );
      user = mapUser(inserted.rows[0]);
      await client.query(
        `INSERT INTO user_credentials (user_id, password_hash)
         VALUES ($1, $2)`,
        [user.id, input.passwordHash],
      );
    }
    await client.query(
      `UPDATE auth_action_tokens
          SET consumed_at = NOW()
        WHERE identifier = $1 AND purpose = 'verify_email'
          AND consumed_at IS NULL`,
      [email],
    );
    await client.query(
      `INSERT INTO auth_action_tokens (
         user_id, identifier, purpose, token_hash, expires_at, metadata
       ) VALUES ($1, $2, 'verify_email', $3, $4, $5::jsonb)`,
      [
        user.id,
        email,
        input.tokenHash,
        input.expiresAt,
        JSON.stringify({ workspaceId: input.workspaceId ?? null }),
      ],
    );
    return user;
  });
}

export async function renewEmailVerificationToken(input: {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  workspaceId?: string | null;
}) {
  return transaction(async (client) => {
    const email = normalizeEmail(input.email);
    const user = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users
        WHERE email = $1 AND status = 'pending'
        FOR UPDATE`,
      [email],
    );
    if (!user.rows[0]) return null;
    await client.query(
      `UPDATE auth_action_tokens
          SET consumed_at = NOW()
        WHERE identifier = $1 AND purpose = 'verify_email'
          AND consumed_at IS NULL`,
      [email],
    );
    await client.query(
      `INSERT INTO auth_action_tokens (
         user_id, identifier, purpose, token_hash, expires_at, metadata
       ) VALUES ($1, $2, 'verify_email', $3, $4, $5::jsonb)`,
      [
        user.rows[0].id,
        email,
        input.tokenHash,
        input.expiresAt,
        JSON.stringify({ workspaceId: input.workspaceId ?? null }),
      ],
    );
    return mapUser(user.rows[0]);
  });
}

export async function verifyEmailToken(tokenHash: string) {
  return transaction(async (client) => {
    const token = await client.query<{
      id: string;
      user_id: string;
      consumed_at: Date | string | null;
      metadata: { workspaceId?: string | null };
    }>(
      `SELECT id, user_id, consumed_at, metadata
         FROM auth_action_tokens
        WHERE token_hash = $1 AND purpose = 'verify_email'
          AND expires_at > NOW()
        FOR UPDATE`,
      [tokenHash],
    );
    if (!token.rows[0]) {
      await client.query(
        `UPDATE auth_action_tokens
            SET attempts = attempts + 1
          WHERE token_hash = $1 AND purpose = 'verify_email'
            AND consumed_at IS NULL`,
        [tokenHash],
      );
      return null;
    }
    if (token.rows[0].consumed_at) {
      const existing = await client.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users
          WHERE id = $1 AND status = 'active'`,
        [token.rows[0].user_id],
      );
      return existing.rows[0]
        ? { user: mapUser(existing.rows[0]), alreadyVerified: true as const }
        : null;
    }
    const userResult = await client.query<UserRow>(
      `UPDATE users
          SET email_verified_at = COALESCE(email_verified_at, NOW()),
              status = 'active', session_version = session_version + 1,
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING ${USER_COLUMNS}`,
      [token.rows[0].user_id],
    );
    if (!userResult.rows[0]) return null;
    await client.query(
      `UPDATE auth_action_tokens SET consumed_at = NOW() WHERE id = $1`,
      [token.rows[0].id],
    );
    const user = mapUser(userResult.rows[0]);
    const tenant = await ensureUserTenantWithClient(
      client,
      user,
      token.rows[0].metadata?.workspaceId,
    );
    return { user, alreadyVerified: false as const, ...tenant };
  });
}

export async function createSessionBootstrapToken(userId: string) {
  const { token, tokenHash } = createActionToken();
  await query(
    `UPDATE auth_action_tokens SET consumed_at = NOW()
      WHERE user_id = $1 AND purpose = 'session_bootstrap'
        AND consumed_at IS NULL`,
    [userId],
  );
  await query(
    `INSERT INTO auth_action_tokens (
       user_id, identifier, purpose, token_hash, expires_at
     )
     SELECT id, email, 'session_bootstrap', $2, NOW() + INTERVAL '5 minutes'
       FROM users WHERE id = $1`,
    [userId, tokenHash],
  );
  return token;
}

export async function consumeSessionBootstrapToken(tokenHash: string) {
  return transaction(async (client) => {
    const token = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM auth_action_tokens
        WHERE token_hash = $1 AND purpose = 'session_bootstrap'
          AND consumed_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [tokenHash],
    );
    if (!token.rows[0]) {
      await client.query(
        `UPDATE auth_action_tokens
            SET attempts = attempts + 1
          WHERE token_hash = $1 AND purpose = 'session_bootstrap'
            AND consumed_at IS NULL`,
        [tokenHash],
      );
      return null;
    }
    const userResult = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users
        WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
      [token.rows[0].user_id],
    );
    if (!userResult.rows[0]) return null;
    await client.query(
      `UPDATE auth_action_tokens SET consumed_at = NOW() WHERE id = $1`,
      [token.rows[0].id],
    );
    return mapUser(userResult.rows[0]);
  });
}

export async function createPasswordResetToken(input: {
  email: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  return transaction(async (client) => {
    const user = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users
        WHERE email = $1 AND status = 'active' FOR UPDATE`,
      [normalizeEmail(input.email)],
    );
    if (!user.rows[0]) return null;
    await client.query(
      `UPDATE auth_action_tokens SET consumed_at = NOW()
        WHERE user_id = $1 AND purpose = 'reset_password'
          AND consumed_at IS NULL`,
      [user.rows[0].id],
    );
    await client.query(
      `INSERT INTO auth_action_tokens (
         user_id, identifier, purpose, token_hash, expires_at
       ) VALUES ($1, $2, 'reset_password', $3, $4)`,
      [
        user.rows[0].id,
        user.rows[0].email,
        input.tokenHash,
        input.expiresAt,
      ],
    );
    return mapUser(user.rows[0]);
  });
}

export async function resetPassword(tokenHash: string, passwordHash: string) {
  return transaction(async (client) => {
    const token = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM auth_action_tokens
        WHERE token_hash = $1 AND purpose = 'reset_password'
          AND consumed_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [tokenHash],
    );
    if (!token.rows[0]) return false;
    await client.query(
      `UPDATE user_credentials
          SET password_hash = $2, password_algorithm = 'argon2id',
              password_changed_at = NOW(), failed_attempts = 0,
              locked_until = NULL, updated_at = NOW()
        WHERE user_id = $1`,
      [token.rows[0].user_id, passwordHash],
    );
    await client.query(
      `UPDATE users
          SET session_version = session_version + 1, updated_at = NOW()
        WHERE id = $1`,
      [token.rows[0].user_id],
    );
    await client.query(
      `UPDATE auth_action_tokens SET consumed_at = NOW() WHERE id = $1`,
      [token.rows[0].id],
    );
    return true;
  });
}

export async function consumeRateLimit(input: {
  key: string;
  action: string;
  limit: number;
  windowMinutes: number;
  blockMinutes?: number;
}) {
  const keyHash = hashRateLimitKey(input.key);
  return transaction(async (client) => {
    const current = await client.query<{
      window_started_at: Date | string;
      attempt_count: number;
      blocked_until: Date | string | null;
    }>(
      `SELECT window_started_at, attempt_count, blocked_until
         FROM auth_rate_limits
        WHERE key_hash = $1 AND action = $2
        FOR UPDATE`,
      [keyHash, input.action],
    );
    const now = Date.now();
    const row = current.rows[0];
    if (row?.blocked_until && new Date(row.blocked_until).getTime() > now) {
      return false;
    }
    const expired =
      !row ||
      new Date(row.window_started_at).getTime() +
        input.windowMinutes * 60_000 <=
        now;
    const attempts = expired ? 1 : row.attempt_count + 1;
    const blockedUntil =
      attempts > input.limit
        ? new Date(now + (input.blockMinutes ?? input.windowMinutes) * 60_000)
        : null;
    await client.query(
      `INSERT INTO auth_rate_limits (
         key_hash, action, window_started_at, attempt_count, blocked_until
       ) VALUES ($1, $2, NOW(), $3, $4)
       ON CONFLICT (key_hash, action) DO UPDATE
         SET window_started_at = CASE WHEN $5 THEN NOW()
                                      ELSE auth_rate_limits.window_started_at END,
             attempt_count = $3, blocked_until = $4, updated_at = NOW()`,
      [keyHash, input.action, attempts, blockedUntil, expired],
    );
    return !blockedUntil;
  });
}

export async function writeAuditEvent(input: {
  organizationId?: string | null;
  workspaceId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await query(
    `INSERT INTO audit_events (
       organization_id, workspace_id, actor_user_id, event_type,
       target_type, target_id, ip_address, user_agent, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      input.organizationId ?? null,
      input.workspaceId ?? null,
      input.actorUserId ?? null,
      input.eventType,
      input.targetType ?? null,
      input.targetId ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
