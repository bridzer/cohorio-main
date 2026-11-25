import { NextRequest, NextResponse } from "next/server";
import {
  approveProposal,
  getProvenance,
  rejectProposal,
} from "@/lib/brand-brain/provenance";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function queueOf(entries: Record<string, { status: string } & Record<string, unknown>>) {
  return Object.values(entries).filter((entry) => entry.status === "NEEDS_REVIEW");
}

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const entries = await getProvenance(access.workspaceId);
    return NextResponse.json({ proposals: queueOf(entries) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load suggestions." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      section?: unknown;
      field?: unknown;
      value?: unknown;
    } | null;
    const section = typeof body?.section === "string" ? body.section.trim() : "";
    const field = typeof body?.field === "string" ? body.field.trim() : "";
    if (!section || !field) {
      return errorResponse("A Brain section and field are required.", 400);
    }
    if (body?.action === "approve") {
      const value = typeof body?.value === "string" ? body.value : undefined;
      const decided = await approveProposal(access.workspaceId, section, field, value);
      return NextResponse.json({ decided });
    }
    if (body?.action === "reject") {
      const rejected = await rejectProposal(access.workspaceId, section, field);
      if (!rejected) return errorResponse("That suggestion is no longer pending.", 404);
      return NextResponse.json({ rejected: true });
    }
    return errorResponse("Action must be approve or reject.", 400);
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) {
      return errorResponse(error.message, 400);
    }
    return NextResponse.json({ error: "Unable to decide this suggestion." }, { status: 500 });
  }
}
