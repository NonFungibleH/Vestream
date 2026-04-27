// POST /api/billing/portal
// ─────────────────────────────────────────────────────────────────────────────
// Stripe Customer Portal session — lets a Pro user manage their
// subscription (update payment method, view invoices, cancel) without
// us building any of those screens. Returns a one-time URL the client
// browser-redirects to.
//
// Auth: portal cookie (same as /api/billing/checkout). Only the cookie
// holder can manage the cookie holder's subscription.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const cookieStore = await cookies();
  const keyId = cookieStore.get("vestr_api_access")?.value;
  if (!keyId) {
    return NextResponse.json({ error: "Sign in via /developer/portal first." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });
  }

  const [key] = await db
    .select({ stripeCustomerId: apiKeys.stripeCustomerId, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);

  if (!key || key.revokedAt) {
    return NextResponse.json({ error: "API key not found or revoked." }, { status: 404 });
  }
  if (!key.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Upgrade to Pro first to create one." },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vestream.io";
  const session = await stripe.billingPortal.sessions.create({
    customer:    key.stripeCustomerId,
    return_url:  `${appUrl}/developer/account`,
  });

  return NextResponse.json({ url: session.url });
}
