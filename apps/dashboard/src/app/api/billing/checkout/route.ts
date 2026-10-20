import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession, PLAN_PRICES } from "@/lib/billing/stripe";
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
    const body = (await request.json()) as { plan?: unknown };
    if (body.plan !== "pro" && body.plan !== "team") {
      return errorResponse("Choose the Pro or Team plan.", 400);
    }
    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      return errorResponse("Billing is not configured.", 400);
    }
    void PLAN_PRICES[body.plan];
    const url = await createCheckoutSession({
      workspaceId: access.workspaceId,
      plan: body.plan,
    });
    return NextResponse.json({ url });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to start checkout.";
    const status =
      message === "STRIPE_SECRET_KEY is not configured." ||
      message === "Billing is not configured."
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
