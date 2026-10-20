import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { query } from "@/lib/database";

type IntegrationRow = {
  provider: string;
  ciphertext: string;
};

export async function saveIntegration(
  workspaceId: string,
  provider: string,
  plaintext: string,
) {
  await query(
    `INSERT INTO workspace_integrations (workspace_id, provider, ciphertext)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, provider) DO UPDATE
        SET ciphertext = EXCLUDED.ciphertext`,
    [workspaceId, provider, encryptSecret(plaintext)],
  );
}

export async function deleteIntegration(workspaceId: string, provider: string) {
  await query(
    `DELETE FROM workspace_integrations
      WHERE workspace_id = $1 AND provider = $2`,
    [workspaceId, provider],
  );
}

export async function loadIntegration(workspaceId: string, provider: string) {
  const result = await query<IntegrationRow>(
    `SELECT provider, ciphertext
       FROM workspace_integrations
      WHERE workspace_id = $1 AND provider = $2`,
    [workspaceId, provider],
  );
  const row = result.rows[0];
  if (!row) return null;
  return decryptSecret(row.ciphertext);
}

export async function listIntegrationStatus(
  workspaceId: string,
  providers: string[],
) {
  const result = await query<{ provider: string }>(
    `SELECT provider
       FROM workspace_integrations
      WHERE workspace_id = $1`,
    [workspaceId],
  );
  const configured = new Set(result.rows.map((row) => row.provider));
  return providers.map((provider) => ({
    provider,
    configured: configured.has(provider),
  }));
}
