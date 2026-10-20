import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { workspaceContextMarkdown } from "@/lib/marketing-context-prompt";
import {
  insertCopilotRun,
  listCopilotRuns,
} from "@/lib/copilot-repository";
import { completeChat } from "@/lib/llm/client";
import { brandBrainMessages } from "@/lib/brand-brain-messages";
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
import {
  assertTaskQuota,
  quotaErrorResponse,
  recordTaskEvent,
} from "@/lib/billing/quota";

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
    const runs = (await listCopilotRuns(workspaceId)).map((run) => {
      const firstLine = run.prompt.split("\n")[0] ?? "";
      const title = firstLine.startsWith("Workspace: ")
        ? firstLine.slice("Workspace: ".length).trim() || "Brand Brain"
        : "Brand Brain";
      return {
        id: run.id,
        title,
        output: run.output,
        created_at: run.created_at,
      };
    });
    return NextResponse.json({ runs });
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
    const playbook = await resolvePlaybook(parsed.data.skillId);
    await assertTaskQuota(access.workspaceId);
    const [skillMarkdown, brandMarkdown] = await Promise.all([
      readSkillMarkdown(playbook.directory),
      workspaceContextMarkdown(access.workspaceId),
    ]);
    const output = await completeChat(
      brandBrainMessages({
        skillMarkdown,
        brandMarkdown,
        prompt: parsed.data.prompt,
      }),
    );
    const run = await insertCopilotRun({
      workspaceId: access.workspaceId,
      userId: access.userId,
      skillId: parsed.data.skillId,
      prompt: parsed.data.prompt,
      output,
    });
    await recordTaskEvent(access.workspaceId, "copilot");
    return NextResponse.json(
      {
        run: {
          id: run.id,
          title: "Brand Brain",
          output: run.output,
          created_at: run.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const quotaResponse = quotaErrorResponse(error);
    if (quotaResponse) return quotaResponse;
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
