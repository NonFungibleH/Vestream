// POST /api/stripe/webhook
// ─────────────────────────────────────────────────────────────────────────────
// Stripe webhook receiver. Handles the subscription lifecycle for the
// developer-API Pro upgrade flow:
//
//   customer.subscription.created    → free → pro (welcome to Pro)
//   customer.subscription.updated    → status flip (active/trialing/past_due)
//   customer.subscription.deleted    → cancellation → back to free
//
// We additionally listen for `checkout.session.completed` so newly-paid
// customers get tier-bumped IMMEDIATELY rather than waiting for Stripe's
// follow-up `subscription.created` event (which can lag by several
// seconds, leaving the user staring at "Free" on the success page).
//
// Signature verification uses STRIPE_WEBHOOK_SECRET; without it we reject
// every request. Body must be read as raw text — `req.json()` would
// canonicalise the JSON and break the signature check.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { getStripe, statusToTier, STRIPE_TIER_LIMITS } from "@/lib/stripe";
import { trackServerEvent } from "@/lib/server-analytics";
import { claimWebhookEvent } from "@/lib/webhook-dedup";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET missing — refusing event");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Raw body — Stripe's signature is computed against the exact bytes,
  // so we cannot let Next.js or our code re-serialise the JSON.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.warn("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Replay protection: Stripe redelivers on operator click + on retry.
  // Stripe's signature has a timestamp (mitigates pure replay) BUT a
  // legitimate "resend event" from the dashboard still produces a
  // freshly-signed payload with the same event.id — which without dedup
  // would re-run our handlers and (e.g.) re-emit subscription_started
  // analytics on every replay. Skip on dedup hit, return 200 OK.
  const isFirstTime = await claimWebhookEvent(event.id, "stripe");
  if (!isFirstTime) {
    console.log(`[stripe-webhook] dedup hit — event ${event.id} already processed`);
    return NextResponse.json({ received: true, dedup: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
        break;
      default:
        // Ignore everything else — Stripe sends a lot of noise events
        // (invoice.created, charge.succeeded etc.) that we don't act on.
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler ${event.type} threw:`, err);
    // Return 200 anyway — Stripe retries 5xx, and we don't want the same
    // event redelivered on every cron tick if the failure is permanent.
    // We log and move on; manual recovery via Stripe dashboard if needed.
  }

  return NextResponse.json({ received: true });
}

// ─── Event handlers ─────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Prefer the metadata.apiKeyId we attached at session-create time;
  // fall back to a customer lookup for any session that lost it.
  const apiKeyId = session.metadata?.apiKeyId
    ?? await resolveApiKeyIdFromSession(session);
  if (!apiKeyId) return;

  // Subscription is referenced on the session but not yet a full object;
  // bump tier to Pro optimistically here. The follow-up
  // subscription.created event will refine status to trialing/active and
  // confirm the subscription ID.
  if (typeof session.subscription === "string") {
    await db
      .update(apiKeys)
      .set({
        tier:                 "pro",
        monthlyLimit:         STRIPE_TIER_LIMITS.pro,
        stripeSubscriptionId: session.subscription,
      })
      .where(eq(apiKeys.id, apiKeyId));

    // Server-side GA4 fire — captures the subscription even if the client
    // had an ad blocker on or never accepted analytics cookies. The Stripe
    // dashboard remains the source of truth for $; this just lights up
    // GA's funnel reports so we can see where subscribers came from.
    trackServerEvent("subscription_started", {
      userId: apiKeyId,
      tier: "pro",
      currency: session.currency ?? "usd",
      // amount in major units (e.g. dollars, not cents) so GA reports read naturally
      amount: typeof session.amount_total === "number" ? session.amount_total / 100 : undefined,
      mode: session.mode ?? "subscription",
    });
  }
}

async function resolveApiKeyIdFromSession(session: Stripe.Checkout.Session): Promise<string | null> {
  // Fallback for sessions that lost the metadata for any reason — look
  // up by stripeCustomerId.
  if (typeof session.customer !== "string") return null;
  const [row] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.stripeCustomerId, session.customer))
    .limit(1);
  return row?.id ?? null;
}

async function handleSubscriptionEvent(sub: Stripe.Subscription) {
  const apiKeyId = (sub.metadata?.apiKeyId ?? null)
    || await resolveApiKeyIdFromCustomer(typeof sub.customer === "string" ? sub.customer : null);
  if (!apiKeyId) return;

  const tier = statusToTier(sub.status);
  await db
    .update(apiKeys)
    .set({
      tier,
      monthlyLimit:         STRIPE_TIER_LIMITS[tier],
      stripeSubscriptionId: sub.id,
    })
    .where(eq(apiKeys.id, apiKeyId));
}

async function handleSubscriptionCancelled(sub: Stripe.Subscription) {
  const apiKeyId = (sub.metadata?.apiKeyId ?? null)
    || await resolveApiKeyIdFromCustomer(typeof sub.customer === "string" ? sub.customer : null);
  if (!apiKeyId) return;
  await db
    .update(apiKeys)
    .set({
      tier:                 "free",
      monthlyLimit:         STRIPE_TIER_LIMITS.free,
      stripeSubscriptionId: null,
    })
    .where(eq(apiKeys.id, apiKeyId));

  trackServerEvent("subscription_canceled", {
    userId: apiKeyId,
    cancel_reason: sub.cancellation_details?.reason ?? "unknown",
    cancel_feedback: sub.cancellation_details?.feedback ?? null,
  });
}

async function resolveApiKeyIdFromCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const [row] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.stripeCustomerId, customerId))
    .limit(1);
  return row?.id ?? null;
}
