import { encryptSecret } from "@/lib/secret-box";
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
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || "";
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || "";
  await query(
    `INSERT INTO workspace_plans (
       workspace_id, plan, stripe_customer_id, stripe_subscription_id
     )
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id) DO UPDATE
        SET plan = EXCLUDED.plan,
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id`,
    [
      workspaceId,
      plan,
      customerId ? encryptSecret(customerId) : null,
      subscriptionId ? encryptSecret(subscriptionId) : null,
    ],
  );
}
