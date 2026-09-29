import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { assertSameOrigin } from "@/lib/auth/request";
import { workspaceAccessibleToUser } from "@/lib/tenant-repository";
import { setWorkspaceCookie } from "@/lib/workspace";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const parsed = z
      .object({ workspaceId: z.string().uuid() })
      .safeParse(await request.json());
    if (
      !parsed.success ||
      !(await workspaceAccessibleToUser(parsed.data.workspaceId, session.user.id))
    ) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    const response = NextResponse.json({ activeWorkspaceId: parsed.data.workspaceId });
    setWorkspaceCookie(response, parsed.data.workspaceId);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Unable to switch workspace." },
      { status: 503 },
    );
  }
}
