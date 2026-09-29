import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getUserById } from "@/lib/auth/repository";
import { assertSameOrigin } from "@/lib/auth/request";
import { hashToken } from "@/lib/auth/security";
import { acceptInvitation } from "@/lib/tenant-repository";
import { setWorkspaceCookie } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const parsed = z
      .object({ token: z.string().min(20).max(200) })
      .safeParse(await request.json());
    const user = await getUserById(session.user.id);
    if (!parsed.success || !user || user.status !== "active") {
      return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
    }
    const accepted = await acceptInvitation({
      tokenHash: hashToken(parsed.data.token),
      userId: user.id,
      userEmail: user.email,
    });
    if (!accepted) {
      return NextResponse.json(
        { error: "This invitation is invalid, expired, or for another email." },
        { status: 400 },
      );
    }
    const response = NextResponse.json({ accepted: true });
    if (accepted.workspaceId) {
      setWorkspaceCookie(response, accepted.workspaceId);
    }
    return response;
  } catch {
    return NextResponse.json(
      { error: "Unable to accept invitation." },
      { status: 503 },
    );
  }
}
