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
import { listMetaAdAccounts, serializeMetaCredential } from "@/lib/integrations/meta";
import { loadIntegration, saveIntegration } from "@/lib/integrations/store";
import { requiredString } from "@/lib/integrations/connectors/types";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Switches an OAuth-connected workspace to a different ad account without
 * reconnecting. The choice is verified against Meta: only accounts the stored
 * token can actually access are accepted.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as {
      accountId?: unknown;
    } | null;
    const accountId =
      typeof body?.accountId === "string"
        ? body.accountId.replace(/^act_/, "").trim()
        : "";
    if (!/^\d{1,20}$/.test(accountId)) {
      return errorResponse("Select a valid ad account.", 400);
    }
    const plaintext = await loadIntegration(access.workspaceId, "meta-ads");
    if (!plaintext) {
      return errorResponse("Connect Meta Ads with Facebook first.", 400);
    }
    let accessToken: string;
    try {
      const parsed = JSON.parse(plaintext) as { accessToken?: unknown };
      accessToken = requiredString(parsed.accessToken, "accessToken", "Meta Ads");
    } catch {
      return errorResponse("The saved Meta Ads credential is unreadable. Reconnect with Facebook.", 400);
    }
    const accounts = await listMetaAdAccounts(accessToken);
    const chosen = accounts.find((account) => account.id === accountId);
    if (!chosen) {
      return errorResponse("That ad account is not available to the connected Facebook user.", 400);
    }
    await saveIntegration(access.workspaceId, "meta-ads", serializeMetaCredential(accessToken, chosen));
    await auditAgentEvent({
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      eventType: "integration.connected",
      targetType: "integration",
      targetId: "meta-ads",
      metadata: { verified: true, oauth: true, accountId: chosen.id, switched: true },
    });
    return NextResponse.json({ provider: "meta-ads", account: { id: chosen.id, name: chosen.name } });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message = error instanceof Error ? error.message : "Unable to switch ad account.";
    return errorResponse(message, 503);
  }
}
