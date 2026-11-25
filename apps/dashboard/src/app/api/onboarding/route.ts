import { NextRequest, NextResponse } from "next/server";
import { sessionPatchSchema } from "@/lib/onboarding";
import {
  getOnboardingSession,
  saveOnboardingSession,
} from "@/lib/onboarding-repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    return NextResponse.json({
      session: await getOnboardingSession(access.workspaceId),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json(
      { error: "Unable to load onboarding progress." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const parsed = sessionPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid onboarding update." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      session: await saveOnboardingSession(access.workspaceId, parsed.data),
    });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to save onboarding progress.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
