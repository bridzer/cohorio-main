import { query } from "@/lib/database";
import type {
  OnboardingSession,
  OnboardingStage,
  SessionPatch,
  StageStatus,
} from "@/lib/onboarding";
import { channelSelections, isOnboardingStage } from "@/lib/onboarding";

type OnboardingSessionRow = {
  workspace_id: string;
  current_stage: string;
  stages: Partial<Record<string, StageStatus>> | null;
  objective: "business" | "social" | null;
  brand_path: "import" | "build" | null;
  organization_category: string | null;
  business_name: string | null;
  website_url: string | null;
  selected_channels: unknown;
  selected_objective: string | null;
  completed_at: Date | string | null;
  updated_at: Date | string;
};

const COLUMNS = `workspace_id, current_stage, stages, objective, brand_path,
  organization_category, business_name, website_url, selected_channels,
  selected_objective, completed_at, updated_at`;

function publicSession(row: OnboardingSessionRow): OnboardingSession {
  const stages: Partial<Record<OnboardingStage, StageStatus>> = {};
  for (const [key, value] of Object.entries(row.stages ?? {})) {
    if (
      isOnboardingStage(key) &&
      (value === "pending" || value === "in_progress" || value === "complete")
    ) {
      stages[key] = value;
    }
  }
  return {
    workspaceId: row.workspace_id,
    currentStage: isOnboardingStage(row.current_stage)
      ? row.current_stage
      : "profile",
    stages,
    objective: row.objective,
    brandPath: row.brand_path,
    organizationCategory: row.organization_category,
    businessName: row.business_name,
    websiteUrl: row.website_url,
    selectedChannels: channelSelections(row.selected_channels),
    selectedObjective: row.selected_objective,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getOnboardingSession(workspaceId: string) {
  const result = await query<OnboardingSessionRow>(
    `SELECT ${COLUMNS} FROM onboarding_sessions WHERE workspace_id = $1`,
    [workspaceId],
  );
  return result.rows[0] ? publicSession(result.rows[0]) : null;
}

/**
 * Completes onboarding: requires profile/objective/brand done plus a chosen
 * objective, then stamps activation complete with a server-owned timestamp.
 * Idempotent — recompleting keeps the original timestamp.
 */
export async function completeOnboardingSession(
  workspaceId: string,
  selectedObjective: string,
) {
  const result = await query<OnboardingSessionRow>(
    `UPDATE onboarding_sessions
        SET stages = stages || '{"activation":"complete"}'::jsonb,
            current_stage = 'activation',
            selected_objective = $2,
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
      WHERE workspace_id = $1
        AND (stages->>'profile') = 'complete'
        AND (stages->>'objective') = 'complete'
        AND (stages->>'brand') = 'complete'
     RETURNING ${COLUMNS}`,
    [workspaceId, selectedObjective.slice(0, 200)],
  );
  return result.rows[0] ? publicSession(result.rows[0]) : null;
}

/**
 * Partial-update merge: only provided fields change; stages merge per key.
 * completed_at is server-owned (a later milestone sets it) and never patched.
 */
export async function saveOnboardingSession(
  workspaceId: string,
  patch: SessionPatch,
) {
  const empty = (value: string | undefined) =>
    value === undefined ? null : value.trim() ? value.trim() : null;
  const result = await query<OnboardingSessionRow>(
    `INSERT INTO onboarding_sessions (
       workspace_id, current_stage, stages, objective, brand_path,
       organization_category, business_name, website_url,
       selected_channels, selected_objective, updated_at
     )
     VALUES (
       $1, COALESCE($2, 'profile'), $3::jsonb, $4, $5, $6, $7, $8,
       COALESCE($9::jsonb, '[]'::jsonb), $10, NOW()
     )
     ON CONFLICT (workspace_id) DO UPDATE SET
       current_stage = COALESCE($2, onboarding_sessions.current_stage),
       stages = onboarding_sessions.stages || $3::jsonb,
       objective = COALESCE($4, onboarding_sessions.objective),
       brand_path = COALESCE($5, onboarding_sessions.brand_path),
       organization_category = COALESCE($6, onboarding_sessions.organization_category),
       business_name = COALESCE($7, onboarding_sessions.business_name),
       website_url = COALESCE($8, onboarding_sessions.website_url),
       selected_channels = COALESCE($9::jsonb, onboarding_sessions.selected_channels),
       selected_objective = COALESCE($10, onboarding_sessions.selected_objective),
       updated_at = NOW()
     RETURNING ${COLUMNS}`,
    [
      workspaceId,
      patch.currentStage ?? null,
      JSON.stringify(patch.stages ?? {}),
      patch.objective ?? null,
      patch.brandPath ?? null,
      empty(patch.organizationCategory),
      empty(patch.businessName),
      empty(patch.websiteUrl),
      patch.selectedChannels ? JSON.stringify(patch.selectedChannels) : null,
      empty(patch.selectedObjective),
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Unable to save onboarding progress.");
  return publicSession(row);
}
