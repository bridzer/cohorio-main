import { query } from "@/lib/database";

export type LifecycleDraft = {
  id: string;
  name: string;
  trigger: string;
  bodyMarkdown: string;
  createdAt: string;
};

type LifecycleDraftRow = {
  id: string;
  name: string;
  trigger: string;
  body_markdown: string;
  created_at: Date | string;
};

function publicDraft(row: LifecycleDraftRow): LifecycleDraft {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    bodyMarkdown: row.body_markdown,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listLifecycleDrafts(workspaceId: string) {
  const result = await query<LifecycleDraftRow>(
    `SELECT id, name, trigger, body_markdown, created_at
       FROM lifecycle_drafts
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  );
  return result.rows.map(publicDraft);
}

export async function insertLifecycleDrafts(
  workspaceId: string,
  drafts: { name: string; trigger: string; bodyMarkdown: string }[],
) {
  const inserted: LifecycleDraft[] = [];
  for (const draft of drafts) {
    const result = await query<LifecycleDraftRow>(
      `INSERT INTO lifecycle_drafts (workspace_id, name, trigger, body_markdown)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, trigger, body_markdown, created_at`,
      [workspaceId, draft.name, draft.trigger, draft.bodyMarkdown],
    );
    inserted.push(publicDraft(result.rows[0]));
  }
  return inserted;
}
