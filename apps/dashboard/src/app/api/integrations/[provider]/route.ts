import { NextRequest, NextResponse } from "next/server";
import { auditAgentEvent } from "@/lib/agent/audit";
import { testProvider } from "@/lib/integrations/adapter";
import { isKnownProvider } from "@/lib/integrations/providers";
import { isGa4PropertyId } from "@/lib/integrations/ga4";
import {
  deleteIntegration,
  saveGa4PropertyId,
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
    const body = (await request.json()) as {
      apiKey?: unknown;
      propertyId?: unknown;
    };
    const ga4PropertyOnly =
      provider === "ga4" &&
      (typeof body.apiKey !== "string" || !body.apiKey.trim());
    if (ga4PropertyOnly) {
      // Connected with Google: only the property id is being set.
      const propertyId =
        typeof body.propertyId === "string" ? body.propertyId.trim() : "";
      if (!isGa4PropertyId(propertyId)) {
        return errorResponse("GA4 property id must be 6 to 12 digits.", 400);
      }
      const updated = await saveGa4PropertyId(access.workspaceId, propertyId);
      if (!updated) {
        return errorResponse("Connect GA4 with Google first, or paste a credential.", 400);
      }
      return NextResponse.json({ provider, configured: true, verified: true });
    }
    if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return errorResponse("API key is too short.", 400);
    }
    let propertyId = "";
    if (provider === "ga4") {
      propertyId =
        typeof body.propertyId === "string" ? body.propertyId.trim() : "";
      if (!isGa4PropertyId(propertyId)) {
        return errorResponse("GA4 property id must be 6 to 12 digits.", 400);
      }
    }
    const checked = await testProvider(provider, body.apiKey.trim());
    if (!checked.ok) {
      return errorResponse(checked.error || "API key is too short.", 400);
    }
    await saveIntegration(access.workspaceId, provider, body.apiKey.trim());
    if (propertyId) {
      await saveGa4PropertyId(access.workspaceId, propertyId);
    }
    await auditAgentEvent({
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      eventType: "integration.connected",
      targetType: "integration",
      targetId: provider,
      // Never the credential itself.
      metadata: { verified: checked.verified },
    });
    return NextResponse.json({ provider, configured: true, verified: checked.verified });
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
    await auditAgentEvent({
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      eventType: "integration.removed",
      targetType: "integration",
      targetId: provider,
    });
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
