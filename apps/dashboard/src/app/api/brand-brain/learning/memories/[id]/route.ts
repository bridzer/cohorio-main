import { NextRequest, NextResponse } from "next/server";
import { brandBrainLearningService } from "@/lib/brand-brain/learning/service";
import { accessErrorResponse, requireWorkspaceAccess } from "@/lib/access-control";
import { assertSameOrigin, originErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

function canDecide(role: string, scope: string) {
  // ORGANIZATION scope requires owner/admin; BRAND requires member+; USER can be decided by owner or self
  if (scope === "ORGANIZATION") return role === "owner" || role === "admin";
  if (scope === "USER") return true; // any member can decide on own; approval path enforces later
  return role === "owner" || role === "admin" || role === "member";
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const { id } = await context.params;
    const memory = await brandBrainLearningService.getMemory(access.workspaceId, id);
    if (!memory) return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    // Private USER memories only visible to owner or same user
    if (memory.scope === "USER" && memory.scopeUserId && memory.scopeUserId !== access.userId && !new Set(["owner","admin"]).has(access.role)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const versions = await brandBrainLearningService.listMemoryVersions(access.workspaceId, id);
    return NextResponse.json({ memory, versions });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load memory." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") {
      return NextResponse.json({ error: "action is required." }, { status: 400 });
    }
    const existing = await brandBrainLearningService.getMemory(access.workspaceId, id);
    if (!existing) return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    if (!canDecide(access.role, existing.scope)) {
      return NextResponse.json({ error: "Insufficient permissions for this scope." }, { status: 403 });
    }

    switch (body.action) {
      case "confirm":
      case "approve": {
        const memory = await brandBrainLearningService.promoteMemory({
          workspaceId: access.workspaceId,
          memoryId: id,
          userId: access.userId,
          confidence: typeof body.confidence === "number" ? body.confidence : undefined,
        });
        return NextResponse.json({ memory });
      }
      case "reject": {
        const memory = await brandBrainLearningService.setMemoryStatus({
          workspaceId: access.workspaceId,
          memoryId: id,
          status: "REJECTED",
          userId: access.userId,
          note: typeof body.note === "string" ? body.note : "Rejected",
        });
        return NextResponse.json({ memory });
      }
      case "dismiss": {
        const memory = await brandBrainLearningService.setMemoryStatus({
          workspaceId: access.workspaceId,
          memoryId: id,
          status: "REJECTED",
          userId: access.userId,
          note: "Dismissed",
        });
        return NextResponse.json({ memory });
      }
      case "make_temporary":
      case "makeTemporary": {
        const memory = await brandBrainLearningService.setMemoryStatus({
          workspaceId: access.workspaceId,
          memoryId: id,
          status: "SUPERSEDED",
          userId: access.userId,
          note: "Marked as temporary — apply to this task only",
        });
        return NextResponse.json({ memory });
      }
      case "edit": {
        const patch: { subject?: string; learnedValue?: unknown; confidence?: number } = {};
        if (typeof body.subject === "string" && body.subject.trim()) patch.subject = body.subject;
        if ("learnedValue" in body || "value" in body) patch.learnedValue = (body.learnedValue ?? body.value) as unknown;
        if (typeof body.confidence === "number") patch.confidence = body.confidence;
        if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to edit." }, { status: 400 });
        const { updateMemory } = await import("@/lib/brand-brain/learning/memories");
        const memory = await updateMemory(
          access.workspaceId,
          id,
          patch,
          access.userId,
          typeof body.note === "string" ? body.note : "Edited via Learning Insights",
        );
        return NextResponse.json({ memory });
      }
      case "apply_to_user": {
        // Clone as USER-scoped preference for current user
        const clone = await brandBrainLearningService.createMemory({
          organizationId: access.organizationId,
          workspaceId: access.workspaceId,
          category: existing.category,
          subject: existing.subject,
          learnedValue: existing.learnedValue,
          sourceEventIds: existing.sourceEventIds,
          confidence: existing.confidence,
          scope: "USER",
          scopeUserId: access.userId,
          status: "ACTIVE",
        });
        return NextResponse.json({ memory: clone });
      }
      case "apply_to_organization": {
        if (!new Set(["owner","admin"]).has(access.role)) {
          return NextResponse.json({ error: "Organization scope requires owner or admin." }, { status: 403 });
        }
        const clone = await brandBrainLearningService.createMemory({
          organizationId: access.organizationId,
          workspaceId: access.workspaceId,
          category: existing.category,
          subject: existing.subject,
          learnedValue: existing.learnedValue,
          sourceEventIds: existing.sourceEventIds,
          confidence: existing.confidence,
          scope: "ORGANIZATION",
          status: "ACTIVE",
        });
        return NextResponse.json({ memory: clone });
      }
      case "deactivate": {
        const memory = await brandBrainLearningService.setMemoryStatus({
          workspaceId: access.workspaceId,
          memoryId: id,
          status: "REJECTED",
          userId: access.userId,
          note: typeof body.note === "string" ? body.note : "Deactivated",
        });
        return NextResponse.json({ memory });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = error instanceof Error ? error.message : "Unable to update memory.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
