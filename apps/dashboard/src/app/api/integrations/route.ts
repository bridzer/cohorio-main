import { NextResponse } from "next/server";
import { listProviderIds } from "@/lib/integrations/providers";
import { listIntegrationStatus } from "@/lib/integrations/store";
import { connectorFor } from "@/lib/integrations/connectors";

// Providers Cohorio checks against the live API before saving, outside the connector registry.
const VERIFIED_ELSEWHERE = new Set(["resend"]);
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to load connections.", 503);
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    const providers = await listProviderIds();
    const statuses = await listIntegrationStatus(workspaceId, providers);
    return NextResponse.json({
      integrations: statuses.map((status) => {
        const connector = connectorFor(status.provider);
        return {
          ...status,
          label: connector?.label ?? null,
          keyHint: connector?.keyHint ?? null,
          agentTools: connector?.tools.map((tool) => tool.name) ?? [],
          verifies: Boolean(connector) || VERIFIED_ELSEWHERE.has(status.provider),
        };
      }),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load connections.";
    return errorResponse(message, 503);
  }
}
