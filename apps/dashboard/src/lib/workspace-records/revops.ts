import { query } from "@/lib/database";

export const LEAD_STAGES = [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "opportunity",
  "customer",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export type RevopsLead = {
  id: string;
  email: string;
  stage: LeadStage;
  score: number;
  createdAt: string;
};

type LeadRow = {
  id: string;
  email: string;
  stage: LeadStage;
  score: number;
  created_at: Date | string;
};

function publicLead(row: LeadRow): RevopsLead {
  return {
    id: row.id,
    email: row.email,
    stage: row.stage,
    score: row.score,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listLeads(workspaceId: string) {
  const result = await query<LeadRow>(
    `SELECT id, email, stage, score, created_at
       FROM revops_leads
      WHERE workspace_id = $1
      ORDER BY score DESC, created_at DESC`,
    [workspaceId],
  );
  return result.rows.map(publicLead);
}

export async function upsertLead(
  workspaceId: string,
  input: { email: string; stage: LeadStage; score: number },
) {
  const result = await query<LeadRow>(
    `INSERT INTO revops_leads (workspace_id, email, stage, score)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, email) DO UPDATE
        SET stage = EXCLUDED.stage,
            score = EXCLUDED.score
     RETURNING id, email, stage, score, created_at`,
    [workspaceId, input.email, input.stage, input.score],
  );
  return publicLead(result.rows[0]);
}
