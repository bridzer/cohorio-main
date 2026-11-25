import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ASSET_ALLOWLIST,
  ASSET_MAX_BYTES,
  TEXT_MIMES,
  csvToText,
  sniffMime,
} from "@/lib/brand-discovery/assets";
import {
  deleteBrandAsset,
  listBrandAssets,
  saveBrandAsset,
} from "@/lib/brand-discovery/asset-repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

const MAX_FILES_PER_REQUEST = 10;
const MAX_TEXT_CHARS = 50_000;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function cleanFilename(name: string) {
  return name.replace(/[\\/]/g, "").trim().slice(0, 200);
}

function extractText(mime: string, bytes: Buffer) {
  if (mime === "text/csv") {
    const { text, rowCount } = csvToText(bytes.toString("utf8"));
    return { text: text.slice(0, MAX_TEXT_CHARS) || null, note: `${rowCount} rows` as const };
  }
  if (TEXT_MIMES.has(mime)) {
    const text = bytes.toString("utf8").slice(0, MAX_TEXT_CHARS);
    return { text: text.trim() ? text : null, note: null };
  }
  return { text: null, note: null };
}

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    return NextResponse.json({
      assets: await listBrandAssets(access.workspaceId),
      maxBytes: ASSET_MAX_BYTES,
      accepted: Object.keys(ASSET_ALLOWLIST).sort(),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load assets." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    if (!files.length) {
      return errorResponse("Choose at least one file to upload.", 400);
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return errorResponse(`Upload at most ${MAX_FILES_PER_REQUEST} files at once.`, 400);
    }

    const saved: unknown[] = [];
    const rejected: { filename: string; reason: string }[] = [];
    for (const file of files) {
      const filename = cleanFilename(file.name || "upload");
      if (!filename) {
        rejected.push({ filename: file.name || "upload", reason: "Missing filename." });
        continue;
      }
      if (file.size <= 0 || file.size > ASSET_MAX_BYTES) {
        rejected.push({
          filename,
          reason: `Must be between 1 byte and ${ASSET_MAX_BYTES / 1024 / 1024} MB.`,
        });
        continue;
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const mime = sniffMime(bytes, filename);
      if (!mime) {
        rejected.push({
          filename,
          reason: "Unsupported type, or the contents don't match the extension.",
        });
        continue;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const { text } = extractText(mime, bytes);
      try {
        saved.push(
          await saveBrandAsset({
            workspaceId: access.workspaceId,
            filename,
            mimeType: mime,
            sizeBytes: bytes.length,
            sha256,
            blob: bytes,
            extractedText: text,
          }),
        );
      } catch (saveError) {
        rejected.push({
          filename,
          reason:
            saveError instanceof RangeError
              ? saveError.message
              : "Unable to store this file.",
        });
      }
    }
    // New document text may unlock Brand Brain candidates — queue completion without blocking upload response.
    if (saved.length) {
      const { brandBrainService } = await import("@/lib/brand-brain/service");
      void brandBrainService
        .runCompletion(access.workspaceId, {
          organizationId: access.organizationId,
          trigger: "evidence",
        })
        .catch(() => undefined);
    }
    return NextResponse.json({ assets: saved, rejected });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to upload files." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return errorResponse("A valid asset id is required.", 400);
    }
    const deleted = await deleteBrandAsset(access.workspaceId, id);
    if (!deleted) return errorResponse("Asset not found.", 404);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to delete this asset." }, { status: 500 });
  }
}
