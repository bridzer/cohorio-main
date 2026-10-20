import { NextRequest, NextResponse } from "next/server";
import { applyCheckoutSession } from "@/lib/billing/stripe";
import { verifyStripeSignature } from "@/lib/billing/stripe-signature";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  try {
    verifyStripeSignature(
      payload,
      request.headers.get("stripe-signature"),
      process.env.STRIPE_WEBHOOK_SECRET ?? "",
    );
    const event = JSON.parse(payload) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    if (event.type === "checkout.session.completed" && event.data?.object) {
      await applyCheckoutSession(
        event.data.object as {
          metadata?: Record<string, string> | null;
          customer?: string | { id?: string } | null;
          subscription?: string | { id?: string } | null;
        },
      );
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }
    const message =
      error instanceof Error ? error.message : "Unable to process webhook.";
    const status = message.includes("signature") ? 400 : 503;
    return errorResponse(message, status);
  }
}
