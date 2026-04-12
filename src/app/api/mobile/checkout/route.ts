import { NextResponse } from "next/server";
import { stripe, PLANS, getOrCreateStripeCustomer, type PlanKey } from "@/lib/stripe";
import { validateMobileToken, extractBearerToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { users, notificationPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// POST /api/mobile/checkout
// Headers: Authorization: Bearer <mobile_token>
// Body: { plan: "pro" | "fund" }
// Returns: { url: string }
export async function POST(req: Request) {
  // Authenticate via Bearer token
  const token = extractBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  }

  const userId = await validateMobileToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  let body: { plan: PlanKey };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { plan } = body;

  if (!plan || !(plan in PLANS)) {
    return NextResponse.json(
      { error: 'plan must be "pro" or "fund"' },
      { status: 400 }
    );
  }

  // Look up user + their email from notificationPreferences
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

  const [prefs] = await db
    .select({ email: notificationPreferences.email })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  const email = prefs?.email;
  if (!email) {
    return NextResponse.json(
      { error: "No email on file — please add an email in notification settings before subscribing" },
      { status: 422 }
    );
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

  const selectedPlan = PLANS[plan];

  // Create Stripe Checkout session
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: selectedPlan.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `https://vestr.xyz/pricing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://vestr.xyz/pricing`,
    metadata: {
      userId,
      plan,
    },
    subscription_data: {
      metadata: {
        userId,
        plan,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
