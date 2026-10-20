import { NextResponse } from "next/server";
import { listProviderIds } from "@/lib/integrations/providers";
import { listIntegrationStatus } from "@/lib/integrations/store";
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
    return NextResponse.json({
      integrations: await listIntegrationStatus(workspaceId, providers),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load connections.";
    return errorResponse(message, 503);
  }
}
