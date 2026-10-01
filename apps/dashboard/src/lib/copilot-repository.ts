import { query } from "@/lib/database";

export type CopilotRun = {
  id: string;
  skill_id: string;
  prompt: string;
  output: string;
  created_at: string;
};

type CopilotRunRow = {
  id: string;
  skill_id: string;
  prompt: string;
  output: string;
  created_at: Date | string;
};

function publicRun(row: CopilotRunRow): CopilotRun {
  return {
    id: row.id,
    skill_id: row.skill_id,
    prompt: row.prompt,
    output: row.output,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export async function listCopilotRuns(workspaceId: string) {
  const result = await query<CopilotRunRow>(
    `SELECT id, skill_id, prompt, output, created_at
       FROM copilot_runs
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [workspaceId],
  );
  return result.rows.map(publicRun);
}

export async function insertCopilotRun(input: {
  workspaceId: string;
  userId: string;
  skillId: string;
  prompt: string;
  output: string;
}) {
  const result = await query<CopilotRunRow>(
    `INSERT INTO copilot_runs (workspace_id, user_id, skill_id, prompt, output)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, skill_id, prompt, output, created_at`,
    [
      input.workspaceId,
      input.userId,
      input.skillId,
      input.prompt,
      input.output,
    ],
  );
  return publicRun(result.rows[0]);
}
