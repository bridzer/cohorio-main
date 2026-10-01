import { NextRequest, NextResponse } from "next/server";
import { getConnectionForWorkspace } from "@/lib/shopify/repository";
import { workspaceContextMarkdown } from "@/lib/marketing-context-prompt";
import { buildLifecycleDrafts } from "@/lib/lifecycle-drafts";
import {
  insertLifecycleDrafts,
  listLifecycleDrafts,
} from "@/lib/lifecycle-repository";
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

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to load lifecycle drafts.", 503);
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    return NextResponse.json({
      drafts: await listLifecycleDrafts(workspaceId),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load lifecycle drafts.";
    return errorResponse(message, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save lifecycle drafts.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const payload = await request.json().catch(() => ({}));
    const body =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    if (body.connectionId !== undefined) {
      if (typeof body.connectionId !== "string" || !body.connectionId) {
        return errorResponse("connectionId must be a Shopify connection id.", 400);
      }
      const connection = await getConnectionForWorkspace(
        body.connectionId,
        workspaceId,
      );
      if (!connection) {
        return errorResponse("Shopify connection not found.", 404);
      }
    }
    const drafts = await insertLifecycleDrafts(
      workspaceId,
      await buildLifecycleDrafts(await workspaceContextMarkdown(workspaceId)),
    );
    return NextResponse.json({ drafts }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to create lifecycle drafts.";
    return errorResponse(message, 503);
  }
}
