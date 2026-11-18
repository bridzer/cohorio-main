import { NextRequest, NextResponse } from "next/server";
import { auditAgentEvent } from "@/lib/agent/audit";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";
import { connector as metaAds } from "@/lib/integrations/connectors/meta-ads";
import { listMetaPages, serializeMetaCredential } from "@/lib/integrations/meta";
import { loadIntegration, saveIntegration } from "@/lib/integrations/store";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Switches the Facebook Page attached to an OAuth-connected workspace. The
 * choice is verified against Meta: only Pages the stored token can manage
 * are accepted. The ad account on the saved credential is preserved.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as {
      pageId?: unknown;
    } | null;
    const pageId =
      typeof body?.pageId === "string" ? body.pageId.trim() : "";
    if (!/^\d{1,30}$/.test(pageId)) {
      return errorResponse("Select a valid Facebook Page.", 400);
    }
    const plaintext = await loadIntegration(access.workspaceId, "meta-ads");
    if (!plaintext) {
      return errorResponse("Connect Meta with Facebook first.", 400);
    }
    let credential: { accessToken: string; accountId: string };
    try {
      credential = metaAds.parse(plaintext);
    } catch {
      return errorResponse("The saved Meta credential is unreadable. Reconnect with Facebook.", 400);
    }
    const pages = await listMetaPages(credential.accessToken);
    const chosen = pages.find((page) => page.id === pageId);
    if (!chosen) {
      return errorResponse("That Page is not available to the connected Facebook user.", 400);
    }
    await saveIntegration(
      access.workspaceId,
      "meta-ads",
      serializeMetaCredential(credential.accessToken, { id: credential.accountId, name: "", currency: null }, chosen),
    );
    await auditAgentEvent({
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      eventType: "integration.connected",
      targetType: "integration",
      targetId: "meta-ads",
      metadata: { verified: true, oauth: true, pageId: chosen.id, pageSwitched: true },
    });
    return NextResponse.json({
      provider: "meta-ads",
      page: { id: chosen.id, name: chosen.name },
    });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message = error instanceof Error ? error.message : "Unable to switch Page.";
    return errorResponse(message, 503);
  }
}
