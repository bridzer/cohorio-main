import { NextRequest, NextResponse } from "next/server";
import {
  getMarketingContext,
  saveMarketingContextSection,
} from "@/lib/marketing-context-repository";
import {
  CONTEXT_SECTIONS,
  contextProgress,
  contextToMarkdown,
  isContextSectionId,
  type ContextSectionValues,
} from "@/lib/marketing-context";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return errorResponse(
      "DATABASE_URL is required to save product context.",
      503,
    );
  }

  try {
    const access = await requireWorkspaceAccess("viewer");
    const stored = await getMarketingContext(access.workspaceId);
    const sections = stored?.sections ?? {};
    const progress = contextProgress(sections);
    return NextResponse.json({
      context: sections,
      progress,
      updatedAt: stored?.updatedAt ?? null,
      markdown: contextToMarkdown(sections, stored?.updatedAt),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load product marketing context.";
    return errorResponse(message, 503);
  }
}

export async function PUT(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return errorResponse(
      "DATABASE_URL is required to save product context.",
      503,
    );
  }

  let workspaceId = "";
  let payload: unknown;
  try {
    workspaceId = (await requireWorkspaceAccess("member")).workspaceId;
    payload = await request.json();
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (!payload || typeof payload !== "object") {
    return errorResponse("Invalid product context payload.", 400);
  }
  const body = payload as { sectionId?: unknown; values?: unknown };
  if (
    typeof body.sectionId !== "string" ||
    !isContextSectionId(body.sectionId)
  ) {
    return errorResponse("Unknown context section.", 400);
  }
  if (!body.values || typeof body.values !== "object" || Array.isArray(body.values)) {
    return errorResponse("Section values must be an object.", 400);
  }

  const definition = CONTEXT_SECTIONS.find(
    (section) => section.id === body.sectionId,
  );
  const allowedFields = new Set([
    ...(definition?.fields.map((field) => field.id) ?? []),
    "_notApplicable",
  ]);
  const values: ContextSectionValues = {};
  for (const [key, value] of Object.entries(body.values)) {
    if (!allowedFields.has(key) || typeof value !== "string") continue;
    if (value.length > 20_000) {
      return errorResponse(
        `The ${key} field exceeds the 20,000 character limit.`,
        400,
      );
    }
    values[key] = value.trim();
  }

  try {
    const stored = await saveMarketingContextSection(
      workspaceId,
      body.sectionId,
      values,
    );
    const progress = contextProgress(stored.sections);
    return NextResponse.json({
      context: stored.sections,
      progress,
      updatedAt: stored.updatedAt,
      markdown: contextToMarkdown(stored.sections, stored.updatedAt),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to save product marketing context.";
    return errorResponse(message, 503);
  }
}
