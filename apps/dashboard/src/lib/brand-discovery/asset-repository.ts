import { query } from "@/lib/database";

export type BrandAssetMeta = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  hasText: boolean;
  createdAt: string;
};

type BrandAssetRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  extracted_text: string | null;
  created_at: Date | string;
};

const COLUMNS = `id, filename, mime_type, size_bytes, sha256,
  (extracted_text IS NOT NULL) AS has_text, created_at`;

function publicAsset(row: BrandAssetRow & { has_text: boolean }): BrandAssetMeta {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    hasText: row.has_text,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listBrandAssets(workspaceId: string) {
  const result = await query<BrandAssetRow & { has_text: boolean }>(
    `SELECT ${COLUMNS} FROM brand_assets
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [workspaceId],
  );
  return result.rows.map(publicAsset);
}

export async function saveBrandAsset(input: {
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  blob: Buffer;
  extractedText: string | null;
}) {
  try {
    const result = await query<BrandAssetRow & { has_text: boolean }>(
      `INSERT INTO brand_assets (
         workspace_id, filename, mime_type, size_bytes, sha256, blob, extracted_text
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        input.workspaceId,
        input.filename,
        input.mimeType,
        input.sizeBytes,
        input.sha256,
        input.blob,
        input.extractedText,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Unable to save asset.");
    return publicAsset(row);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
    ) {
      throw new RangeError("This file was already uploaded.");
    }
    throw error;
  }
}

export async function deleteBrandAsset(workspaceId: string, assetId: string) {
  const result = await query(
    `DELETE FROM brand_assets WHERE id = $1 AND workspace_id = $2`,
    [assetId, workspaceId],
  );
  return (result.rowCount ?? 0) > 0;
}
