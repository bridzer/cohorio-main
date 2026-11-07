import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { query } from "@/lib/database";

export const PLAN_PRICES = {
  pro: 4900,
  team: 14900,
} as const;

export type PaidPlan = keyof typeof PLAN_PRICES;

function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return key;
}

function appUrl() {
  return (process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export async function createCheckoutSession(input: {
  workspaceId: string;
  plan: PaidPlan;
}) {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", `${appUrl()}/settings?billing=success`);
  params.set("cancel_url", `${appUrl()}/settings?billing=cancel`);
  params.set("client_reference_id", input.workspaceId);
  params.set("metadata[plan]", input.plan);
  params.set("metadata[workspace_id]", input.workspaceId);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set(
    "line_items[0][price_data][unit_amount]",
    String(PLAN_PRICES[input.plan]),
  );
  params.set("line_items[0][price_data][recurring][interval]", "month");
  params.set(
    "line_items[0][price_data][product_data][name]",
    input.plan === "pro" ? "Cohorio Pro" : "Cohorio Team",
  );
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeKey()}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const payload = (await response.json()) as {
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error?.message || "Unable to start checkout.");
  }
  return payload.url;
}

/** Lookup key for webhook events; the customer id itself stays encrypted. */
export function stripeCustomerRef(customerId: string) {
  return createHash("sha256").update(customerId).digest("hex");
}

function idOf(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || "";
}

export async function applyCheckoutSession(session: {
  metadata?: Record<string, string> | null;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
}) {
  const plan = session.metadata?.plan;
  const workspaceId = session.metadata?.workspace_id;
  if ((plan !== "pro" && plan !== "team") || !workspaceId) {
    throw new Error("Checkout metadata is incomplete.");
  }
  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);
  await query(
    `INSERT INTO workspace_plans (
       workspace_id, plan, status, stripe_customer_id, stripe_subscription_id, stripe_customer_ref
     )
     VALUES ($1, $2, 'active', $3, $4, $5)
     ON CONFLICT (workspace_id) DO UPDATE
        SET plan = EXCLUDED.plan,
            status = 'active',
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            stripe_customer_ref = EXCLUDED.stripe_customer_ref`,
    [
      workspaceId,
      plan,
      customerId ? encryptSecret(customerId) : null,
      subscriptionId ? encryptSecret(subscriptionId) : null,
      customerId ? stripeCustomerRef(customerId) : null,
    ],
  );
}

type SubscriptionLike = {
  id?: string;
  customer?: string | { id?: string } | null;
  status?: string;
  items?: { data?: { price?: { unit_amount?: number | null; currency?: string } }[] };
};

function planForSubscription(subscription: SubscriptionLike) {
  const amount = subscription.items?.data?.[0]?.price?.unit_amount;
  if (amount === PLAN_PRICES.pro) return "pro" as const;
  if (amount === PLAN_PRICES.team) return "team" as const;
  return null;
}

/**
 * Keeps workspace_plans in sync with the subscription lifecycle. Returns
 * false when the customer is unknown (a workspace that checked out before
 * customer refs were recorded); the event is acknowledged either way.
 */
export async function applySubscriptionEvent(subscription: SubscriptionLike) {
  const customerId = idOf(subscription.customer);
  if (!customerId) return false;
  const ref = stripeCustomerRef(customerId);
  const status = subscription.status ?? "";
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    const result = await query(
      `UPDATE workspace_plans
          SET plan = 'free', status = 'canceled'
        WHERE stripe_customer_ref = $1`,
      [ref],
    );
    return (result.rowCount ?? 0) > 0;
  }
  if (status === "past_due") {
    const result = await query(
      `UPDATE workspace_plans SET status = 'past_due' WHERE stripe_customer_ref = $1`,
      [ref],
    );
    return (result.rowCount ?? 0) > 0;
  }
  if (status === "active" || status === "trialing") {
    const plan = planForSubscription(subscription);
    const result = await query(
      plan
        ? `UPDATE workspace_plans
              SET plan = $2, status = 'active', stripe_subscription_id = $3
            WHERE stripe_customer_ref = $1`
        : `UPDATE workspace_plans SET status = 'active' WHERE stripe_customer_ref = $1`,
      plan
        ? [ref, plan, subscription.id ? encryptSecret(subscription.id) : null]
        : [ref],
    );
    return (result.rowCount ?? 0) > 0;
  }
  return false;
}

export async function applyPaymentFailed(invoice: {
  customer?: string | { id?: string } | null;
}) {
  const customerId = idOf(invoice.customer);
  if (!customerId) return false;
  const result = await query(
    `UPDATE workspace_plans SET status = 'past_due' WHERE stripe_customer_ref = $1`,
    [stripeCustomerRef(customerId)],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function createPortalSession(workspaceId: string) {
  const result = await query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM workspace_plans WHERE workspace_id = $1`,
    [workspaceId],
  );
  const encrypted = result.rows[0]?.stripe_customer_id;
  if (!encrypted) {
    throw new Error("No billing account exists for this workspace yet.");
  }
  let customerId: string;
  try {
    customerId = decryptSecret(encrypted);
  } catch {
    throw new Error("No billing account exists for this workspace yet.");
  }
  const params = new URLSearchParams();
  params.set("customer", customerId);
  params.set("return_url", `${appUrl()}/settings`);
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeKey()}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const payload = (await response.json()) as {
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error?.message || "Unable to open the billing portal.");
  }
  return payload.url;
}
