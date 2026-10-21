import { query } from "@/lib/database";

export type WorkspaceAsset = {
  type: "copilot" | "social" | "lifecycle" | "campaign";
  id: string;
  title: string;
  createdAt: string;
  href: string;
};

type AssetRow = {
  type: WorkspaceAsset["type"];
  id: string;
  title: string;
  created_at: Date | string;
  href: string;
};

export function copilotAssetTitle(prompt: string) {
  const firstLine = prompt.split("\n")[0]?.trim() || "Brand Brain";
  return firstLine.slice(0, 160);
}

export function socialAssetTitle(body: string) {
  const title = body.trim().slice(0, 80);
  return title || "Social post";
}

export async function listWorkspaceAssets(workspaceId: string) {
  const result = await query<AssetRow>(
    `SELECT type, id, title, created_at, href
       FROM (
         SELECT 'copilot'::text AS type,
                run.id::text AS id,
                run.prompt AS title,
                run.created_at,
                COALESCE('/agent?thread=' || agent.thread_id::text, '/') AS href
           FROM copilot_runs run
           LEFT JOIN agent_runs agent
             ON agent.copilot_run_id = run.id
            AND agent.workspace_id = run.workspace_id
          WHERE run.workspace_id = $1
         UNION ALL
         SELECT 'social'::text,
                id::text,
                body,
                created_at,
                '/social'
           FROM social_posts
          WHERE workspace_id = $1
         UNION ALL
         SELECT 'lifecycle'::text,
                id::text,
                name,
                created_at,
                '/commerce'
           FROM lifecycle_drafts
          WHERE workspace_id = $1
         UNION ALL
         SELECT 'campaign'::text,
                campaign.id::text,
                campaign.name,
                campaign.created_at,
                '/commerce'
           FROM shopify_ad_campaigns campaign
           JOIN shopify_connections connection
             ON connection.id = campaign.connection_id
          WHERE connection.workspace_id::text = $1::text
       ) assets
      ORDER BY created_at DESC
      LIMIT 100`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    type: row.type,
    id: row.id,
    title:
      row.type === "copilot"
        ? copilotAssetTitle(row.title)
        : row.type === "social"
          ? socialAssetTitle(row.title)
          : row.title.trim().slice(0, 160) || "Saved work",
    createdAt: new Date(row.created_at).toISOString(),
    href: row.href,
  }));
}
