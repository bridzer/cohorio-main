import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeRateLimit,
  createPasswordResetToken,
} from "@/lib/auth/repository";
import { sendPasswordResetEmail, passwordResetUrl, authEmailConfigured } from "@/lib/auth/email";
import { assertSameOrigin, clientIp } from "@/lib/auth/request";
import {
  createActionToken,
  normalizeEmail,
} from "@/lib/auth/security";

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
        { error: "Password recovery email delivery is not configured." },
        { status: 503 },
      );
    }
    const email = normalizeEmail(parsed.data.email);
    const allowed = await consumeRateLimit({
      key: `${clientIp(request)}:${email}`,
      action: "forgot_password",
      limit: 5,
      windowMinutes: 60,
      blockMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 },
      );
    }
    const { token, tokenHash } = createActionToken();
    const user = await createPasswordResetToken({
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    let delivered = false;
    if (user) {
      ({ delivered } = await sendPasswordResetEmail(email, token));
    }
    return NextResponse.json({
      message: "If the account exists, a reset email is on its way.",
      delivered,
      ...(process.env.NODE_ENV !== "production" && user && !delivered
        ? { developmentUrl: passwordResetUrl(token) }
        : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Password recovery is temporarily unavailable." },
      { status: 503 },
    );
  }
}
