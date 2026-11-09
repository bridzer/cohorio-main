import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditAgentEvent } from "@/lib/agent/audit";
import { validationMessage } from "@/lib/agent/automations";
import {
  addMemory,
  listMemories,
  MEMORY_LIMIT,
  MEMORY_MAX_LENGTH,
} from "@/lib/agent/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const memoryInput = z.object({
  content: z.string().trim().min(3).max(MEMORY_MAX_LENGTH),
});

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

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { workspaceId, userId } = await requireWorkspaceAccess("member");
    const parsed = memoryInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }
    const memory = await addMemory({
      workspaceId,
      userId,
      content: parsed.data.content,
    });
    if (!memory) {
      return NextResponse.json(
        { error: `This workspace already has ${MEMORY_LIMIT} memories. Delete one before adding another.` },
        { status: 400 },
      );
    }
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.memory_added",
      targetType: "memory",
      targetId: memory.id,
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save this memory." }, { status: 503 });
  }
}
