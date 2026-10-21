import { query, transaction } from "@/lib/database";

export const RETENTION_KINDS = ["survey", "offer", "confirm"] as const;
export type RetentionKind = (typeof RETENTION_KINDS)[number];

export type RetentionStep = {
  id: string;
  position: number;
  kind: RetentionKind;
  body: string;
};

type StepRow = RetentionStep;

export async function listRetentionSteps(workspaceId: string) {
  const result = await query<StepRow>(
    `SELECT id, position, kind, body
       FROM retention_steps
      WHERE workspace_id = $1
      ORDER BY position ASC`,
    [workspaceId],
  );
  return result.rows;
}

export async function replaceRetentionSteps(
  workspaceId: string,
  steps: { position: number; kind: RetentionKind; body: string }[],
) {
  return transaction(async (client) => {
    await client.query(`DELETE FROM retention_steps WHERE workspace_id = $1`, [
      workspaceId,
    ]);
    const saved: RetentionStep[] = [];
    for (const step of [...steps].sort((a, b) => a.position - b.position)) {
      const result = await client.query<StepRow>(
        `INSERT INTO retention_steps (workspace_id, position, kind, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, position, kind, body`,
        [workspaceId, step.position, step.kind, step.body],
      );
      saved.push(result.rows[0]);
    }
    return saved;
  });
}
