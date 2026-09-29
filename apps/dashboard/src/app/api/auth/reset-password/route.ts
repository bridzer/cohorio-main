import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeRateLimit,
  resetPassword,
} from "@/lib/auth/repository";
import { assertSameOrigin, clientIp } from "@/lib/auth/request";
import {
  hashPassword,
  hashToken,
  validatePassword,
} from "@/lib/auth/security";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().max(200),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid reset request." }, { status: 400 });
    }
    const passwordError = validatePassword(parsed.data.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }
    const allowed = await consumeRateLimit({
      key: clientIp(request),
      action: "reset_password",
      limit: 10,
      windowMinutes: 60,
      blockMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 },
      );
    }
    const changed = await resetPassword(
      hashToken(parsed.data.token),
      await hashPassword(parsed.data.password),
    );
    if (!changed) {
      return NextResponse.json(
        { error: "This reset link is invalid or expired." },
        { status: 400 },
      );
    }
    return NextResponse.json({ changed: true });
  } catch {
    return NextResponse.json(
      { error: "Password reset is temporarily unavailable." },
      { status: 503 },
    );
  }
}
