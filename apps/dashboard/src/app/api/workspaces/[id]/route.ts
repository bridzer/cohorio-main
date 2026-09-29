import { NextRequest, NextResponse } from "next/server";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import { assertSameOrigin } from "@/lib/auth/request";
import { archiveWorkspace } from "@/lib/tenant-repository";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("admin");
    const { id } = await context.params;
    const archived = await archiveWorkspace(access.organizationId, id);
    if (!archived) {
      return NextResponse.json(
        { error: "Default workspaces cannot be archived." },
        { status: 400 },
      );
    }
    return NextResponse.json({ archived: true });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to archive workspace." }, { status: 503 })
    );
  }
}
