import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionBootstrapToken,
  verifyEmailToken,
} from "@/lib/auth/repository";
import { assertSameOrigin } from "@/lib/auth/request";
import { hashToken } from "@/lib/auth/security";
import { setWorkspaceCookie } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const parsed = z
      .object({ token: z.string().min(20).max(200) })
      .safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid verification link." }, { status: 400 });
    }
    const verified = await verifyEmailToken(hashToken(parsed.data.token));
    if (!verified) {
      return NextResponse.json(
        { error: "This verification link is invalid or expired." },
        { status: 400 },
      );
    }
    const completionToken = verified.alreadyVerified
      ? null
      : await createSessionBootstrapToken(verified.user.id);
    const response = NextResponse.json({
      verified: true,
      alreadyVerified: verified.alreadyVerified,
      completionToken,
    });
    if ("workspaceId" in verified && verified.workspaceId) {
      setWorkspaceCookie(response, verified.workspaceId);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    console.error("Email verification failed.", error);
    return NextResponse.json(
      { error: "Email verification is temporarily unavailable." },
      { status: 503 },
    );
  }
}
