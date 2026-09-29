import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeRateLimit,
  createPendingRegistration,
} from "@/lib/auth/repository";
import { assertSameOrigin, clientIp } from "@/lib/auth/request";
import {
  createActionToken,
  hashPassword,
  normalizeEmail,
  validatePassword,
} from "@/lib/auth/security";
import {
  authEmailConfigured,
  sendVerificationEmail,
  verificationUrl,
} from "@/lib/auth/email";
import {
  createWorkspaceId,
  ensureAnonymousWorkspace,
  readWorkspaceId,
  setWorkspaceCookie,
} from "@/lib/workspace";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(320),
  password: z.string().max(200),
  consent: z.literal(true),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid name, email, password, and consent." },
        { status: 400 },
      );
    }
    const passwordError = validatePassword(parsed.data.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
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
      action: "register",
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

    const passwordHash = await hashPassword(parsed.data.password);
    const { token, tokenHash } = createActionToken();
    let workspaceId = await readWorkspaceId();
    if (!workspaceId) {
      workspaceId = createWorkspaceId();
      await ensureAnonymousWorkspace(workspaceId);
    }
    const user = await createPendingRegistration({
      name: parsed.data.name,
      email,
      passwordHash,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      workspaceId,
    });
    let delivered = false;
    if (user) {
      ({ delivered } = await sendVerificationEmail(email, token));
    }
    const response = NextResponse.json(
      {
        message:
          "If this address can be registered, a verification email is on its way.",
        delivered,
        ...(process.env.NODE_ENV !== "production" && user && !delivered
          ? { developmentUrl: verificationUrl(token) }
          : {}),
      },
      { status: 202 },
    );
    setWorkspaceCookie(response, workspaceId);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Registration is temporarily unavailable." },
      { status: 503 },
    );
  }
}
