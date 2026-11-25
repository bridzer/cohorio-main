import { NextResponse } from "next/server";
import { detectGaps } from "@/lib/brand-brain/gaps";
import { getProvenance } from "@/lib/brand-brain/provenance";
import { getMarketingContext } from "@/lib/marketing-context-repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    const [stored, provenance] = await Promise.all([
      getMarketingContext(access.workspaceId),
      getProvenance(access.workspaceId),
    ]);
    const proposals = Object.values(provenance)
      .filter((entry) => entry.status === "NEEDS_REVIEW" && entry.proposedValue)
      .map((entry) => ({
        section: entry.section,
        field: entry.field,
        value: entry.proposedValue as string,
        source: entry.source,
      }));
    return NextResponse.json(detectGaps({ context: stored?.sections ?? {}, proposals }));
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to compute gaps." }, { status: 500 });
  }
}
