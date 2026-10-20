import { NextResponse } from "next/server";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  BRAND_BRAIN,
  FEATURE_WORKSPACES,
  INTELLIGENCE,
} from "@/lib/workspaces";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    await requireWorkspaceAccess("viewer");
    const workspaces = [BRAND_BRAIN, INTELLIGENCE, ...FEATURE_WORKSPACES].map(
      (workspace) => ({
        id: workspace.id,
        name: workspace.name,
        summary: workspace.summary,
        jobs: workspace.jobs.map((job) => ({
          id: job.id,
          label: job.label,
          detail: job.detail,
          fields: job.fields,
        })),
      }),
    );
    return NextResponse.json({ workspaces });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load skills.";
    return errorResponse(message, 503);
  }
}
