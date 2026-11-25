import { NextRequest, NextResponse } from "next/server";
import {
  listVersions,
  restoreVersion,
  snapshotVersion,
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

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    return NextResponse.json({
      versions: await listVersions(access.workspaceId),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load versions." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      note?: unknown;
      version?: unknown;
    } | null;
    if (body?.action === "snapshot") {
      const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
      const version = await snapshotVersion(access.workspaceId, note || "Manual snapshot");
      return NextResponse.json({ version });
    }
    if (body?.action === "restore") {
      const raw = body?.version;
      const version =
        typeof raw === "number"
          ? raw
          : typeof raw === "string" && /^\d+$/.test(raw.trim())
            ? Number(raw.trim())
            : NaN;
      if (!Number.isInteger(version) || version < 1) {
        return errorResponse("A valid version number is required.", 400);
      }
      return NextResponse.json(await restoreVersion(access.workspaceId, version));
    }
    return errorResponse("Action must be snapshot or restore.", 400);
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof RangeError) {
      return errorResponse(error.message, 404);
    }
    return NextResponse.json({ error: "Unable to manage versions." }, { status: 500 });
  }
}
