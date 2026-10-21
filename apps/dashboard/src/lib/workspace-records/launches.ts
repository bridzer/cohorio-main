import { query } from "@/lib/database";

export const LAUNCH_ASSET_TYPES = ["copilot", "social", "lifecycle"] as const;
export type LaunchAssetType = (typeof LAUNCH_ASSET_TYPES)[number];

const ASSET_TABLES: Record<LaunchAssetType, string> = {
  copilot: "copilot_runs",
  social: "social_posts",
  lifecycle: "lifecycle_drafts",
};

export type Launch = {
  id: string;
  name: string;
  createdAt: string;
  assets: { assetType: LaunchAssetType; assetId: string; title: string }[];
};

type LaunchRow = {
  id: string;
  name: string;
  created_at: Date | string;
};

type LaunchAssetRow = {
  launch_id: string;
  asset_type: LaunchAssetType;
  asset_id: string;
  title: string | null;
};

export async function listLaunches(workspaceId: string): Promise<Launch[]> {
  const launches = await query<LaunchRow>(
    `SELECT id, name, created_at
       FROM launches
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  );
  if (!launches.rowCount) return [];
  // Titles are read from the source rows; launch_assets stores references only.
  const assets = await query<LaunchAssetRow>(
    `SELECT link.launch_id, link.asset_type, link.asset_id::text AS asset_id,
            COALESCE(
              split_part(run.prompt, E'\\n', 1),
              left(post.body, 80),
              draft.name
            ) AS title
       FROM launch_assets link
       JOIN launches launch ON launch.id = link.launch_id
       LEFT JOIN copilot_runs run
         ON link.asset_type = 'copilot' AND run.id = link.asset_id
        AND run.workspace_id = launch.workspace_id
       LEFT JOIN social_posts post
         ON link.asset_type = 'social' AND post.id = link.asset_id
        AND post.workspace_id = launch.workspace_id
       LEFT JOIN lifecycle_drafts draft
         ON link.asset_type = 'lifecycle' AND draft.id = link.asset_id
        AND draft.workspace_id = launch.workspace_id
      WHERE launch.workspace_id = $1`,
    [workspaceId],
  );
  return launches.rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
    assets: assets.rows
      .filter((asset) => asset.launch_id === row.id)
      .map((asset) => ({
        assetType: asset.asset_type,
        assetId: asset.asset_id,
        title: asset.title?.trim() || "Removed asset",
      })),
  }));
}

export async function createLaunch(workspaceId: string, name: string) {
  const result = await query<LaunchRow>(
    `INSERT INTO launches (workspace_id, name)
     VALUES ($1, $2)
     RETURNING id, name, created_at`,
    [workspaceId, name],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
    assets: [],
  } satisfies Launch;
}

export async function launchBelongsToWorkspace(workspaceId: string, launchId: string) {
  const result = await query(
    `SELECT 1 FROM launches WHERE id = $1 AND workspace_id = $2`,
    [launchId, workspaceId],
  );
  return Boolean(result.rowCount);
}

export async function assetExists(
  workspaceId: string,
  assetType: LaunchAssetType,
  assetId: string,
) {
  const result = await query(
    `SELECT 1 FROM ${ASSET_TABLES[assetType]} WHERE id = $1 AND workspace_id = $2`,
    [assetId, workspaceId],
  );
  return Boolean(result.rowCount);
}

export async function attachLaunchAsset(
  launchId: string,
  assetType: LaunchAssetType,
  assetId: string,
) {
  await query(
    `INSERT INTO launch_assets (launch_id, asset_type, asset_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [launchId, assetType, assetId],
  );
}
