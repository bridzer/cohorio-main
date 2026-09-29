import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  incrementSessionVersion,
  listOrganizationMembers,
  listUserWorkspaces,
  updateUserProfile,
} from "@/lib/tenant-repository";
import { assertSameOrigin } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const session = await auth();
    const [workspaces, members] = await Promise.all([
      listUserWorkspaces(access.userId),
      listOrganizationMembers(access.organizationId),
    ]);
    return NextResponse.json({
      user: session?.user,
      access,
      workspaces,
      members,
    });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to load account." }, { status: 503 })
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("viewer");
    const parsed = z
      .object({ name: z.string().trim().min(2).max(100) })
      .safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid name." }, { status: 400 });
    }
    const user = await updateUserProfile(access.userId, parsed.data.name);
    return NextResponse.json({ user });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to update account." }, { status: 503 })
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("viewer");
    const parsed = z
      .object({ action: z.literal("revoke-sessions") })
      .safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    await incrementSessionVersion(access.userId);
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to revoke sessions." }, { status: 503 })
    );
  }
}
