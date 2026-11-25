import { NextRequest, NextResponse } from "next/server";
import { getCompletionStatus, runBrandCompletion } from "@/lib/brand-brain/completion";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

/** GET /api/brand-brain/completion — metrics + latest job for polling */
export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const status = await getCompletionStatus(access.workspaceId);
    return NextResponse.json(status);
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load completion status." }, { status: 500 });
  }
}

/** POST /api/brand-brain/completion — trigger background completion (idempotent) */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as { trigger?: unknown } | null;
    const trigger = typeof body?.trigger === "string" ? body.trigger.trim().slice(0, 40) : "manual";
    const report = await runBrandCompletion(access.workspaceId, {
      organizationId: access.organizationId ?? null,
      trigger,
    });
    return NextResponse.json(report);
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to run brand completion." }, { status: 500 });
  }
}
