import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeRateLimit,
  renewEmailVerificationToken,
} from "@/lib/auth/repository";
import { assertSameOrigin, clientIp } from "@/lib/auth/request";
import {
  createActionToken,
  normalizeEmail,
} from "@/lib/auth/security";
import {
  authEmailConfigured,
  sendVerificationEmail,
  verificationUrl,
} from "@/lib/auth/email";
import { readWorkspaceId } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const parsed = z
      .object({ email: z.string().email().max(320) })
      .safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }
    if (process.env.NODE_ENV === "production" && !authEmailConfigured()) {
      return NextResponse.json(
        { error: "Email verification delivery is not configured." },
        { status: 503 },
      );
    }
    const email = normalizeEmail(parsed.data.email);
    const allowed = await consumeRateLimit({
      key: `${clientIp(request)}:${email}`,
      action: "resend_verification",
      limit: 3,
      windowMinutes: 60,
      blockMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many verification requests. Try again later." },
        { status: 429 },
      );
    }
    const { token, tokenHash } = createActionToken();
    const user = await renewEmailVerificationToken({
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      workspaceId: await readWorkspaceId(),
    });
    let delivered = false;
    if (user) {
      ({ delivered } = await sendVerificationEmail(email, token));
    }
    return NextResponse.json({
      message:
        "If this account is awaiting verification, a new email is on its way.",
      delivered,
      ...(process.env.NODE_ENV !== "production" && user && !delivered
        ? { developmentUrl: verificationUrl(token) }
        : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to resend verification right now." },
      { status: 503 },
    );
  }
}
