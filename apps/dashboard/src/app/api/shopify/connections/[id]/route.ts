import { NextRequest, NextResponse } from "next/server";
import { disconnectConnection } from "@/lib/shopify/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import { assertSameOrigin } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]">,
) {
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("admin")).workspaceId;
    const { id } = await context.params;
    const disconnected = await disconnectConnection(id, workspaceId);
    if (!disconnected) {
      return NextResponse.json(
        { error: "Shopify connection not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json(
      { error: "Unable to disconnect this Shopify store." },
      { status: 500 },
    );
  }
}
