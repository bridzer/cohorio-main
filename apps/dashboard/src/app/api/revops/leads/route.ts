import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  LEAD_STAGES,
  listLeads,
  upsertLead,
} from "@/lib/workspace-records/revops";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const leadSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  stage: z.enum(LEAD_STAGES),
  score: z.number().int().min(0).max(100),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to load leads.", 503);
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    return NextResponse.json({ leads: await listLeads(workspaceId) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return errorResponse("Unable to load leads.", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save leads.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const parsed = leadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(
        `Lead needs an email, a stage (${LEAD_STAGES.join(", ")}), and a score from 0 to 100.`,
        400,
      );
    }
    return NextResponse.json(
      { lead: await upsertLead(workspaceId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    return errorResponse("Unable to save this lead.", 503);
  }
}
