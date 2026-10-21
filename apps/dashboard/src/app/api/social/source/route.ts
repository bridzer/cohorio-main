import { NextRequest, NextResponse } from "next/server";
import { fetchPublicText, PublicUrlError } from "@/lib/http/public-url";
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

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireWorkspaceAccess("member");
    const payload = (await request.json()) as { url?: unknown };
    if (typeof payload?.url !== "string" || payload.url.length > 2_000) {
      return errorResponse("That URL is not allowed.", 400);
    }
    const text = await fetchPublicText(payload.url.trim());
    if (!text) {
      return errorResponse("That page has no readable text.", 422);
    }
    return NextResponse.json({ text });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof PublicUrlError) {
      return errorResponse("That URL is not allowed.", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse("That page took too long to respond.", 504);
    }
    const message =
      error instanceof Error && error.message.startsWith("That page returned")
        ? error.message
        : "Unable to read that page.";
    return errorResponse(message, 502);
  }
}
