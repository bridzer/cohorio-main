import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listRetentionSteps,
  replaceRetentionSteps,
  RETENTION_KINDS,
} from "@/lib/workspace-records/retention";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const DUPLICATE_POSITION = "Each step needs a unique position.";

const stepsSchema = z
  .array(
    z.object({
      position: z.number().int().min(0).max(1_000),
      kind: z.enum(RETENTION_KINDS),
      body: z.string().trim().min(1).max(4_000),
    }),
  )
  .max(50)
  .refine(
    (steps) => new Set(steps.map((step) => step.position)).size === steps.length,
    DUPLICATE_POSITION,
  );

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to load retention steps.", 503);
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    return NextResponse.json({ steps: await listRetentionSteps(workspaceId) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return errorResponse("Unable to load retention steps.", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save retention steps.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const payload = (await request.json()) as unknown;
    const raw =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as { steps?: unknown }).steps
        : payload;
    const parsed = stepsSchema.safeParse(raw);
    if (!parsed.success) {
      const duplicate = parsed.error.issues.some(
        (issue) => issue.message === DUPLICATE_POSITION,
      );
      return errorResponse(
        duplicate
          ? DUPLICATE_POSITION
          : "Each step needs a position, a kind (survey, offer, confirm), and text.",
        400,
      );
    }
    return NextResponse.json({
      steps: await replaceRetentionSteps(workspaceId, parsed.data),
    });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    return errorResponse("Unable to save retention steps.", 503);
  }
}
