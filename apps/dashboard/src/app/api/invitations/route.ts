import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  createInvitation,
  listPendingInvitations,
} from "@/lib/tenant-repository";
import { assertSameOrigin } from "@/lib/auth/request";
import { createActionToken } from "@/lib/auth/security";
import {
  invitationUrl,
  sendInvitationEmail,
} from "@/lib/auth/email";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("admin");
    return NextResponse.json({
      invitations: await listPendingInvitations(access.organizationId),
    });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to load invitations." }, { status: 503 })
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("admin");
    const parsed = z
      .object({
        email: z.string().email().max(320),
        role: z.enum(["admin", "member", "viewer"]),
      })
      .safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid email and role." },
        { status: 400 },
      );
    }
    const { token, tokenHash } = createActionToken();
    const invitation = await createInvitation({
      organizationId: access.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash,
      invitedByUserId: access.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const { delivered } = await sendInvitationEmail(
      parsed.data.email,
      token,
      access.organizationName,
    );
    return NextResponse.json(
      {
        invitation,
        delivered,
        ...(process.env.NODE_ENV !== "production" && !delivered
          ? { developmentUrl: invitationUrl(token) }
          : {}),
      },
      { status: 201 },
    );
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      NextResponse.json({ error: "Unable to send invitation." }, { status: 503 })
    );
  }
}
