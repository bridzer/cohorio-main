import { NextResponse } from "next/server";
import { listThreads } from "@/lib/agent/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    return NextResponse.json({ threads: await listThreads(access.workspaceId) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load conversations." }, { status: 503 });
  }
}
