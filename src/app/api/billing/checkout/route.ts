// POST /api/billing/checkout
// ─────────────────────────────────────────────────────────────────────────────
// Creates a Stripe Checkout Session that upgrades the caller's free-tier
// API key to Pro. The cookie-authed user pays through Stripe; on success
// the webhook (`/api/stripe/webhook`) bumps `apiKeys.tier` to "pro" and
// raises monthlyLimit.
//
// Flow:
//   1. Resolve the API key from the `vestr_api_access` cookie (same gate
//      as /developer/account).
//   2. Reject if the key is already Pro.
//   3. Get-or-create a Stripe Customer for this key. The customer ID is
//      stored on the apiKeys row so the same Customer is reused across
//      subscription cycles.
//   4. Create a Checkout Session in subscription mode targeting the
//      Pro monthly OR annual price (caller picks via `?plan=monthly|annual`).
//   5. Embed the apiKey id + tier target in `metadata` so the webhook can
//      look up the right row when fulfilment fires.
//   6. Return the Checkout URL — the client browser-redirects to Stripe.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { getStripe, getProMonthlyPriceId, getProAnnualPriceId } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const keyId = cookieStore.get("vestr_api_access")?.value;
  if (!keyId) {
    return NextResponse.json({ error: "Sign in via /developer/portal first." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Billing isn't configured. Contact support." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const plan = url.searchParams.get("plan") === "annual" ? "annual" : "monthly";
  const priceId = plan === "annual" ? getProAnnualPriceId() : getProMonthlyPriceId();
  if (!priceId) {
    return NextResponse.json(
      { error: `Pro ${plan} pricing not configured.` },
      { status: 503 },
    );
  }

  const [key] = await db
    .select({
      id:               apiKeys.id,
      tier:             apiKeys.tier,
      ownerEmail:       apiKeys.ownerEmail,
      ownerName:        apiKeys.ownerName,
      stripeCustomerId: apiKeys.stripeCustomerId,
      revokedAt:        apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);

  if (!key || key.revokedAt) {
    return NextResponse.json({ error: "API key not found or revoked." }, { status: 404 });
  }
  if (key.tier === "pro") {
    return NextResponse.json(
      { error: "Already on Pro. Use /api/billing/portal to manage your subscription." },
      { status: 400 },
    );
  }

  // ── Get-or-create customer ─────────────────────────────────────────────
  let customerId = key.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: key.ownerEmail,
      name:  key.ownerName ?? undefined,
      metadata: { apiKeyId: key.id },
    });
    customerId = customer.id;
    await db
      .update(apiKeys)
      .set({ stripeCustomerId: customerId })
      .where(eq(apiKeys.id, key.id));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vestream.io";

  const session = await stripe.checkout.sessions.create({
    mode:                  "subscription",
    customer:              customerId,
    line_items:            [{ price: priceId, quantity: 1 }],
    // 14-day trial mirrors the consumer Pro plan policy on /pricing so
    // dev-API and consumer Pro feel like the same product family.
    subscription_data: {
      trial_period_days: 14,
      metadata: { apiKeyId: key.id, target: "api_key" },
    },
    success_url:           `${appUrl}/developer/account?upgrade=success`,
    cancel_url:            `${appUrl}/developer/account?upgrade=cancelled`,
    allow_promotion_codes: true,
    // Mirror metadata at the session level so we can pick it up early
    // (checkout.session.completed) before the subscription is fully
    // provisioned.
    metadata: { apiKeyId: key.id, target: "api_key", plan },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe didn't return a Checkout URL." }, { status: 502 });
  }
  return NextResponse.json({ url: session.url });
}
