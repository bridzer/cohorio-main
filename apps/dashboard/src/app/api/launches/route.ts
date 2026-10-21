import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createLaunch, listLaunches } from "@/lib/workspace-records/launches";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const launchSchema = z.object({ name: z.string().trim().min(1).max(160) });

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to load launches.", 503);
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    return NextResponse.json({ launches: await listLaunches(workspaceId) });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return errorResponse("Unable to load launches.", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse("DATABASE_URL is required to save launches.", 503);
  }
  try {
    assertSameOrigin(request);
    const workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    const parsed = launchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Launch name must contain 1 to 160 characters.", 400);
    }
    return NextResponse.json(
      { launch: await createLaunch(workspaceId, parsed.data.name) },
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
    return errorResponse("Unable to create this launch.", 503);
  }
}
