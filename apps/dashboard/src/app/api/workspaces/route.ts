import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  createWorkspace,
  listUserWorkspaces,
} from "@/lib/tenant-repository";
import { assertSameOrigin } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    return NextResponse.json({
      workspaces: await listUserWorkspaces(access.userId),
      activeWorkspaceId: access.workspaceId,
    });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to load workspaces." }, { status: 503 })
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("admin");
    const parsed = z
      .object({ name: z.string().trim().min(2).max(80) })
      .safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Workspace name must be between 2 and 80 characters." },
        { status: 400 },
      );
    }
    const workspace = await createWorkspace({
      organizationId: access.organizationId,
      userId: access.userId,
      name: parsed.data.name,
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to create workspace." }, { status: 503 })
    );
  }
}
