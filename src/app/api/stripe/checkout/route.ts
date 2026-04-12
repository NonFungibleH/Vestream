import { NextResponse } from "next/server";
import { stripe, PLANS, getOrCreateStripeCustomer, type PlanKey } from "@/lib/stripe";
import { validateMobileToken, extractBearerToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// POST /api/stripe/checkout
// Body: { priceId: string; userId?: string; email?: string }
// Returns: { url: string }
// userId and email are optional — if omitted a guest checkout session is created.
export async function POST(req: Request) {
  // Authenticate via Bearer token
  const token = extractBearerToken(req);
  let authenticatedUserId: string | null = null;

  if (token) {
    authenticatedUserId = await validateMobileToken(token);
  }

  let body: { priceId: string; userId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { priceId, userId, email } = body;

  if (!priceId) {
    return NextResponse.json(
      { error: "priceId is required" },
      { status: 400 }
    );
  }

  // If a bearer token was provided, ensure it belongs to the same userId
  if (authenticatedUserId && userId && authenticatedUserId !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Validate priceId is one of our known plans
  const validPriceIds = Object.values(PLANS).map((p) => p.priceId);
  if (!validPriceIds.includes(priceId)) {
    return NextResponse.json({ error: "Invalid priceId" }, { status: 400 });
  }

  // Determine plan name for metadata
  const planEntry = Object.entries(PLANS).find(
    ([, plan]) => plan.priceId === priceId
  );
  const planName = planEntry ? (planEntry[0] as PlanKey) : "pro";

  // Build session params — attach a customer only when we have a known user
  type SessionParams = Parameters<typeof stripe.checkout.sessions.create>[0];
  const sessionParams: SessionParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `https://vestr.xyz/pricing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://vestr.xyz/pricing`,
    metadata: { plan: planName },
    subscription_data: { metadata: { plan: planName } },
  };

  if (userId && email) {
    // Look up user record
    const [user] = await db
      .select({
        id: users.id,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Look up or create Stripe customer
    const { customerId, created } = await getOrCreateStripeCustomer({
      stripeCustomerId: user.stripeCustomerId,
      email,
      userId,
    });

    // Persist the new customerId if it was just created
    if (created) {
      await db
        .update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, userId));
    }

    sessionParams.customer = customerId;
    sessionParams.metadata = { userId, plan: planName };
    sessionParams.subscription_data = { metadata: { userId, plan: planName } };
  }

  // Create Stripe Checkout session
  const session = await stripe.checkout.sessions.create(sessionParams);

  return NextResponse.json({ url: session.url });
}
