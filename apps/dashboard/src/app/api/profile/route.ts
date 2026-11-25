import { NextRequest, NextResponse } from "next/server";
import { profileSchema } from "@/lib/onboarding";
import {
  getUserProfile,
  saveUserProfile,
} from "@/lib/user-profile-repository";
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
    return NextResponse.json({ profile: await getUserProfile(access.userId) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load profile." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid profile." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      profile: await saveUserProfile(access.userId, parsed.data),
    });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message = error instanceof Error ? error.message : "Unable to save profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
