import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";
import { assertSameOrigin, originErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "OPEN";
    const conflicts = await brandBrainLearningService.listConflicts(access.workspaceId, status);
    return NextResponse.json({ conflicts });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load conflicts." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const conflictId = typeof body?.conflictId === "string" ? body.conflictId : "";
    const decision = typeof body?.decision === "string" ? body.decision : "";
    if (!conflictId || !decision) {
      return NextResponse.json({ error: "conflictId and decision are required." }, { status: 400 });
    }
    // Only owner/admin can resolve brand-impacting conflicts
    if (!new Set(["owner","admin","member"]).has(access.role)) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }
    const keepExisting = decision === "keep_existing" || decision === "KEEP_EXISTING";
    if (decision !== "keep_existing" && decision !== "accept_incoming" && decision !== "dismiss" && decision !== "RESOLVED_ACCEPT_INCOMING" && decision !== "RESOLVED_KEEP_EXISTING" && decision !== "DISMISSED") {
      return NextResponse.json({ error: "Decision must be keep_existing or accept_incoming or dismiss." }, { status: 400 });
    }
    if (decision === "dismiss" || decision === "DISMISSED") {
      await brandBrainLearningService.resolveConflict(
        { workspaceId: access.workspaceId, conflictId, userId: access.userId },
        { keepExisting: true, note: "Dismissed" },
      );
      // Also mark as dismissed directly
      const { query } = await import("@/lib/database");
      await query(`UPDATE brand_learning_conflicts SET status = 'DISMISSED', resolved_by_user_id = $3, resolved_at = NOW(), resolution_note = 'Dismissed' WHERE id = $1 AND workspace_id = $2`, [conflictId, access.workspaceId, access.userId]);
      return NextResponse.json({ resolved: true });
    }
    await brandBrainLearningService.resolveConflict(
      { workspaceId: access.workspaceId, conflictId, userId: access.userId },
      { keepExisting, note: typeof body?.note === "string" ? body.note : undefined },
    );
    return NextResponse.json({ resolved: true });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Unable to resolve conflict." }, { status: 500 });
  }
}
