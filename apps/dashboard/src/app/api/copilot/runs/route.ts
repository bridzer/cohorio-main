import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { workspaceContextMarkdown } from "@/lib/marketing-context-prompt";
import {
  insertCopilotRun,
  listCopilotRuns,
} from "@/lib/copilot-repository";
import { completeChat } from "@/lib/llm/client";
import { resolvePlaybook } from "@/lib/skills/catalog";
import { readSkillMarkdown } from "@/lib/skills/load-skill";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const bodySchema = z.object({
  skillId: z.string(),
  prompt: z.string().min(1).max(8000),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to load copilot runs.", 503);
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    return NextResponse.json({ runs: await listCopilotRuns(workspaceId) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load copilot runs.";
    return errorResponse(message, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save copilot runs.", 503);
  }
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("A playbook and a prompt are required.", 400);
    }
    const playbook = resolvePlaybook(parsed.data.skillId);
    const [skillMarkdown, brandMarkdown] = await Promise.all([
      readSkillMarkdown(playbook.directory),
      workspaceContextMarkdown(access.workspaceId),
    ]);
    const output = await completeChat([
      {
        role: "system",
        content: `${skillMarkdown}\n\n${brandMarkdown}`,
      },
      { role: "user", content: parsed.data.prompt },
    ]);
    const run = await insertCopilotRun({
      workspaceId: access.workspaceId,
      userId: access.userId,
      skillId: parsed.data.skillId,
      prompt: parsed.data.prompt,
      output,
    });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const message =
      error instanceof Error ? error.message : "Unable to run this playbook.";
    const status =
      message === "COHORIO_LLM_API_KEY is not configured." ||
      message.startsWith("Unknown playbook:")
        ? 400
        : 503;
    return errorResponse(message, status);
  }
}
