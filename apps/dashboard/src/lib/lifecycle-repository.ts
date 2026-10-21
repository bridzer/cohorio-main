import { query } from "@/lib/database";

export type LifecycleDraftStatus = "draft" | "sent";

export type LifecycleDraft = {
  id: string;
  name: string;
  trigger: string;
  bodyMarkdown: string;
  status: LifecycleDraftStatus;
  sentAt: string | null;
  createdAt: string;
};

type LifecycleDraftRow = {
  id: string;
  name: string;
  trigger: string;
  body_markdown: string;
  status: LifecycleDraftStatus;
  sent_at: Date | string | null;
  created_at: Date | string;
};

const COLUMNS = "id, name, trigger, body_markdown, status, sent_at, created_at";

function publicDraft(row: LifecycleDraftRow): LifecycleDraft {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    bodyMarkdown: row.body_markdown,
    status: row.status,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listLifecycleDrafts(workspaceId: string) {
  const result = await query<LifecycleDraftRow>(
    `SELECT ${COLUMNS}
       FROM lifecycle_drafts
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  );
  return result.rows.map(publicDraft);
}

export async function getLifecycleDraft(workspaceId: string, id: string) {
  const result = await query<LifecycleDraftRow>(
    `SELECT ${COLUMNS}
       FROM lifecycle_drafts
      WHERE id = $1
        AND workspace_id = $2`,
    [id, workspaceId],
  );
  return result.rows[0] ? publicDraft(result.rows[0]) : null;
}

export async function markLifecycleDraftSent(workspaceId: string, id: string) {
  const result = await query<LifecycleDraftRow>(
    `UPDATE lifecycle_drafts
        SET status = 'sent',
            sent_at = NOW()
      WHERE id = $1
        AND workspace_id = $2
      RETURNING ${COLUMNS}`,
    [id, workspaceId],
  );
  return result.rows[0] ? publicDraft(result.rows[0]) : null;
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
       RETURNING ${COLUMNS}`,
      [workspaceId, draft.name, draft.trigger, draft.bodyMarkdown],
    );
    inserted.push(publicDraft(result.rows[0]));
  }
  return inserted;
}
