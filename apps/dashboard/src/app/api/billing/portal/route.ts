import { NextRequest, NextResponse } from "next/server";
import { createPortalSession } from "@/lib/billing/stripe";
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
    const access = await requireWorkspaceAccess("member");
    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      return errorResponse("Billing is not configured.", 400);
    }
    const url = await createPortalSession(access.workspaceId);
    return NextResponse.json({ url });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to open the billing portal.";
    const status =
      message === "STRIPE_SECRET_KEY is not configured." ||
      message === "Billing is not configured." ||
      message.startsWith("No billing account")
        ? 400
        : 503;
    return errorResponse(
      message === "STRIPE_SECRET_KEY is not configured."
        ? "Billing is not configured."
        : message,
      status,
    );
  }
}
