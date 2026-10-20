import { NextRequest, NextResponse } from "next/server";
import { testProvider } from "@/lib/integrations/adapter";
import { isKnownProvider } from "@/lib/integrations/providers";
import {
  deleteIntegration,
  saveIntegration,
} from "@/lib/integrations/store";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const { provider } = await context.params;
    if (!(await isKnownProvider(provider))) {
      return errorResponse("That connection is not available.", 400);
    }
    const body = (await request.json()) as { apiKey?: unknown };
    if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return errorResponse("API key is too short.", 400);
    }
    const checked = await testProvider(provider, body.apiKey.trim());
    if (!checked.ok) {
      return errorResponse(checked.error || "API key is too short.", 400);
    }
    await saveIntegration(access.workspaceId, provider, body.apiKey.trim());
    return NextResponse.json({ provider, configured: true });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to save this connection.";
    return errorResponse(message, 503);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const { provider } = await context.params;
    if (!(await isKnownProvider(provider))) {
      return errorResponse("That connection is not available.", 400);
    }
    await deleteIntegration(access.workspaceId, provider);
    return NextResponse.json({ provider, configured: false });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to remove this connection.";
    return errorResponse(message, 503);
  }
}
