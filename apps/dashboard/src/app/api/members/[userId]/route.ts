import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import { assertSameOrigin } from "@/lib/auth/request";
import {
  listOrganizationMembers,
  removeMember,
  updateMember,
} from "@/lib/tenant-repository";

export const runtime = "nodejs";

async function canManageTarget(
  organizationId: string,
  actorRole: "owner" | "admin" | "member" | "viewer",
  targetUserId: string,
  nextRole?: string,
) {
  if (actorRole === "owner") return true;
  if (actorRole !== "admin" || nextRole === "owner" || nextRole === "admin") {
    return false;
  }
  const target = (await listOrganizationMembers(organizationId)).find(
    (member) => member.userId === targetUserId,
  );
  return target?.role === "member" || target?.role === "viewer";
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("admin");
    const { userId } = await context.params;
    const parsed = z
      .object({
        role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
        status: z.enum(["active", "suspended"]).optional(),
      })
      .refine((value) => value.role || value.status)
      .safeParse(await request.json());
    if (
      !parsed.success ||
      !(await canManageTarget(
        access.organizationId,
        access.role,
        userId,
        parsed.success ? parsed.data.role : undefined,
      ))
    ) {
      return NextResponse.json({ error: "Role change is not allowed." }, { status: 403 });
    }
    const updated = await updateMember({
      organizationId: access.organizationId,
      actorUserId: access.userId,
      targetUserId: userId,
      role: parsed.data.role,
      status: parsed.data.status,
    });
    return NextResponse.json({ updated });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to update member." }, { status: 503 })
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("admin");
    const { userId } = await context.params;
    if (
      userId === access.userId ||
      !(await canManageTarget(access.organizationId, access.role, userId))
    ) {
      return NextResponse.json({ error: "Member removal is not allowed." }, { status: 403 });
    }
    return NextResponse.json({
      removed: await removeMember(access.organizationId, userId),
    });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to remove member." }, { status: 503 })
    );
  }
}
