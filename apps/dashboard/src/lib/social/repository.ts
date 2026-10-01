import { query } from "@/lib/database";
import type { SocialPlatform } from "@/lib/social/generate";

export type SocialPostStatus = "draft" | "scheduled" | "published";

export type SocialPost = {
  id: string;
  platform: SocialPlatform;
  body: string;
  sourcePrompt: string | null;
  scheduledFor: string | null;
  status: SocialPostStatus;
  createdAt: string;
};

type SocialPostRow = {
  id: string;
  platform: SocialPlatform;
  body: string;
  source_prompt: string | null;
  scheduled_for: Date | string | null;
  status: SocialPostStatus;
  created_at: Date | string;
};

function publicPost(row: SocialPostRow): SocialPost {
  return {
    id: row.id,
    platform: row.platform,
    body: row.body,
    sourcePrompt: row.source_prompt,
    scheduledFor: row.scheduled_for
      ? new Date(row.scheduled_for).toISOString()
      : null,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listSocialPosts(workspaceId: string) {
  const result = await query<SocialPostRow>(
    `SELECT id, platform, body, source_prompt, scheduled_for, status, created_at
       FROM social_posts
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  );
  return result.rows.map(publicPost);
}

export async function insertSocialPost(input: {
  workspaceId: string;
  platform: SocialPlatform;
  body: string;
  sourcePrompt?: string | null;
  status?: SocialPostStatus;
}) {
  const result = await query<SocialPostRow>(
    `INSERT INTO social_posts
       (workspace_id, platform, body, source_prompt, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, platform, body, source_prompt, scheduled_for, status, created_at`,
    [
      input.workspaceId,
      input.platform,
      input.body,
      input.sourcePrompt ?? null,
      input.status ?? "draft",
    ],
  );
  return publicPost(result.rows[0]);
}

export async function updateSocialPost(
  workspaceId: string,
  id: string,
  input: { status: SocialPostStatus; scheduledFor: string | null },
) {
  const result = await query<SocialPostRow>(
    `UPDATE social_posts
        SET status = $3,
            scheduled_for = $4
      WHERE id = $1
        AND workspace_id = $2
      RETURNING id, platform, body, source_prompt, scheduled_for, status, created_at`,
    [id, workspaceId, input.status, input.scheduledFor],
  );
  return result.rows[0] ? publicPost(result.rows[0]) : null;
}
