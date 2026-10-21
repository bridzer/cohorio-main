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
  imageUrl: string | null;
  createdAt: string;
};

type SocialPostRow = {
  id: string;
  platform: SocialPlatform;
  body: string;
  source_prompt: string | null;
  scheduled_for: Date | string | null;
  status: SocialPostStatus;
  image_url: string | null;
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
    imageUrl: row.image_url,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listSocialPosts(workspaceId: string) {
  const result = await query<SocialPostRow>(
    `SELECT id, platform, body, source_prompt, scheduled_for, status, image_url, created_at
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
     RETURNING id, platform, body, source_prompt, scheduled_for, status, image_url, created_at`,
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
  input: { status: SocialPostStatus; scheduledFor: string | null; body?: string },
) {
  const result = await query<SocialPostRow>(
    `UPDATE social_posts
        SET status = $3,
            scheduled_for = $4,
            body = COALESCE($5, body)
      WHERE id = $1
        AND workspace_id = $2
      RETURNING id, platform, body, source_prompt, scheduled_for, status, image_url, created_at`,
    [id, workspaceId, input.status, input.scheduledFor, input.body ?? null],
  );
  return result.rows[0] ? publicPost(result.rows[0]) : null;
}

export async function getSocialPost(workspaceId: string, id: string) {
  const result = await query<SocialPostRow>(
    `SELECT id, platform, body, source_prompt, scheduled_for, status, image_url, created_at
       FROM social_posts
      WHERE id = $1
        AND workspace_id = $2`,
    [id, workspaceId],
  );
  return result.rows[0] ? publicPost(result.rows[0]) : null;
}

export async function setSocialPostImage(
  workspaceId: string,
  id: string,
  imageUrl: string,
) {
  const result = await query<SocialPostRow>(
    `UPDATE social_posts
        SET image_url = $3
      WHERE id = $1
        AND workspace_id = $2
      RETURNING id, platform, body, source_prompt, scheduled_for, status, image_url, created_at`,
    [id, workspaceId, imageUrl],
  );
  return result.rows[0] ? publicPost(result.rows[0]) : null;
}
