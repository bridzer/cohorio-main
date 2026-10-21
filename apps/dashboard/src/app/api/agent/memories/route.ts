import { NextResponse } from "next/server";
import { listMemories, MEMORY_LIMIT } from "@/lib/agent/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspaceAccess("viewer");
    return NextResponse.json({
      memories: await listMemories(workspaceId),
      limit: MEMORY_LIMIT,
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load memories." }, { status: 503 });
  }
}
