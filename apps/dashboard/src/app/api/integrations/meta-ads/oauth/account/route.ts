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
import {
  listMetaAdAccounts,
  listMetaPages,
  selectMetaPage,
  serializeMetaCredential,
} from "@/lib/integrations/meta";
import { loadIntegration, saveIntegration } from "@/lib/integrations/store";
import { requiredString } from "@/lib/integrations/connectors/types";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function storedAccessToken(workspaceId: string) {
  const plaintext = await loadIntegration(workspaceId, "meta-ads");
  if (!plaintext) return null;
  try {
    const parsed = JSON.parse(plaintext) as { accessToken?: unknown };
    return requiredString(parsed.accessToken, "accessToken", "Meta Ads");
  } catch {
    return null;
  }
}

/**
 * Switches an OAuth-connected workspace to a different ad account without
 * reconnecting. The choice is verified against Meta: only accounts the stored
 * token can actually access are accepted. Pages ride along: a single Page
 * re-attaches silently, several are returned for the picker.
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
    const accessToken = await storedAccessToken(access.workspaceId);
    if (!accessToken) {
      return errorResponse("Connect Meta with Facebook first.", 400);
    }
    const [accounts, pages] = await Promise.all([
      listMetaAdAccounts(accessToken),
      listMetaPages(accessToken),
    ]);
    const chosen = accounts.find((account) => account.id === accountId);
    if (!chosen) {
      return errorResponse("That ad account is not available to the connected Facebook user.", 400);
    }
    const page = selectMetaPage(pages) ?? pages[0] ?? null;
    await saveIntegration(access.workspaceId, "meta-ads", serializeMetaCredential(accessToken, chosen, page));
    await auditAgentEvent({
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      eventType: "integration.connected",
      targetType: "integration",
      targetId: "meta-ads",
      metadata: {
        verified: true,
        oauth: true,
        accountId: chosen.id,
        switched: true,
        ...(page ? { pageId: page.id } : {}),
      },
    });
    return NextResponse.json({
      provider: "meta-ads",
      account: { id: chosen.id, name: chosen.name },
      page: page ? { id: page.id, name: page.name } : null,
      pages: pages.map((entry) => ({ id: entry.id, name: entry.name })),
    });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message = error instanceof Error ? error.message : "Unable to switch ad account.";
    return errorResponse(message, 503);
  }
}
