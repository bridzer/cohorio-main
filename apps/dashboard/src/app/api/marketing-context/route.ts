import { NextRequest, NextResponse } from "next/server";
import {
  getMarketingContext,
  saveMarketingContextSection,
} from "@/lib/marketing-context-repository";
import { markFieldsUserConfirmed } from "@/lib/brand-brain/provenance";
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
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

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

  let access: { workspaceId: string; organizationId: string; userId: string } | null = null;
  let workspaceId = "";
  let payload: unknown;
  try {
    assertSameOrigin(request);
    access = (await requireWorkspaceAccess("member")) as {
      workspaceId: string;
      organizationId: string;
      userId: string;
    };
    workspaceId = access.workspaceId;
    payload = await request.json();
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
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
    // Capture pre-save snapshot for learning event diff (correction detection)
    const beforeCtx = await getMarketingContext(workspaceId);
    const beforeSection = beforeCtx?.sections[body.sectionId as keyof typeof beforeCtx.sections] as
      | Record<string, string>
      | undefined;

    const stored = await saveMarketingContextSection(
      workspaceId,
      body.sectionId,
      values,
    );
    // Best-effort trust stamp: the save already succeeded, so a provenance
    // failure must not fail the request — it only affects review display.
    markFieldsUserConfirmed(
      workspaceId,
      body.sectionId,
      Object.entries(values)
        .filter(([key, value]) => key !== "_notApplicable" && value.trim())
        .map(([key]) => key),
    ).catch((stampError: unknown) => {
      console.error("Brand Brain provenance stamp failed.", stampError);
    });

    // Best-effort Learning Loop: capture brand knowledge approved/corrected
    // (§3.A, §12 Step 1-2). Never blocks the happy path; idempotent via dedup.
    if (access) {
      const afterSection = stored.sections[body.sectionId as keyof typeof stored.sections] as
        | Record<string, string>
        | undefined;
      const isCorrection = Boolean(beforeSection && Object.keys(beforeSection).some((k) => beforeSection[k]?.trim() && afterSection?.[k]?.trim() && beforeSection[k] !== afterSection?.[k]));
      const { brandBrainLearningService } = await import("@/lib/brand-brain/learning/service");
      brandBrainLearningService
        .captureEvent(
          { organizationId: access.organizationId, workspaceId, userId: access.userId },
          {
            eventType: isCorrection ? "brand_knowledge_corrected" : "brand_knowledge_approved",
            sourceModule: "marketing-context",
            entityType: "brand_section",
            entityId: body.sectionId,
            originalValue: beforeSection ?? null,
            resultingValue: values,
            feedback: { action: isCorrection ? "corrected" : "approved", reason: `${body.sectionId} ${isCorrection ? "corrected" : "saved"}` },
            context: { sectionId: body.sectionId, progress: contextProgress(stored.sections).percentage },
          },
        )
        .catch((e: unknown) => console.error("Learning event capture failed (marketing-context)", e));
    }

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
