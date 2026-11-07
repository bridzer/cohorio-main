import { NextRequest, NextResponse } from "next/server";
import {
  applyCheckoutSession,
  applyPaymentFailed,
  applySubscriptionEvent,
} from "@/lib/billing/stripe";
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
    } else if (
      (event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted") &&
      event.data?.object
    ) {
      await applySubscriptionEvent(
        event.data.object as Parameters<typeof applySubscriptionEvent>[0],
      );
    } else if (event.type === "invoice.payment_failed" && event.data?.object) {
      await applyPaymentFailed(
        event.data.object as Parameters<typeof applyPaymentFailed>[0],
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
