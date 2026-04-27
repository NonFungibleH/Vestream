// src/lib/stripe.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single Stripe client + tier/price plumbing for the developer-API Pro
// upgrade flow.
//
// We intentionally hold the Stripe instance behind a `getStripe()` factory
// rather than a top-level `new Stripe(...)` so the Next.js build doesn't
// crash on missing env vars during static analysis. Every caller resolves
// the client lazily; if STRIPE_SECRET_KEY is missing, `getStripe()`
// returns null and the caller decides how to fail.
//
// Tier mapping reference:
//   Free  → 30 req/min · 150 req/day · monthlyLimit 4500
//   Pro   → 120 req/min · 5000 req/day · monthlyLimit 150_000
//
// The corresponding Stripe Price IDs are configured per environment via
// env vars. We don't hard-code them here so staging and prod can use
// different price objects without a redeploy.
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";

const PRO_MONTHLY_LIMIT = 150_000;
const FREE_MONTHLY_LIMIT = 4500;

export const STRIPE_TIER_LIMITS = {
  free: FREE_MONTHLY_LIMIT,
  pro:  PRO_MONTHLY_LIMIT,
} as const;

export type ApiKeyTier = keyof typeof STRIPE_TIER_LIMITS;

/**
 * Lazily-instantiated Stripe client. Returns null if STRIPE_SECRET_KEY
 * isn't set — callers must check before use.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    // Lock the API version so a Stripe-side upgrade can't break us silently.
    apiVersion: "2025-04-30.basil",
    // Identify our integration in Stripe's dashboard logs.
    appInfo: { name: "Vestream", url: "https://vestream.io" },
  });
}

export function getProMonthlyPriceId(): string | null {
  return process.env.STRIPE_PRO_MONTHLY_PRICE_ID || null;
}

export function getProAnnualPriceId(): string | null {
  return process.env.STRIPE_PRO_ANNUAL_PRICE_ID || null;
}

/**
 * Convert a Stripe subscription `status` into the corresponding internal
 * tier. Active and trialing → Pro; everything else → Free. We deliberately
 * downgrade past_due and unpaid customers immediately rather than running
 * a grace window — Stripe's own retry logic handles short blips, so anything
 * the webhook flags as past_due has been actively failing for a while.
 */
export function statusToTier(status: Stripe.Subscription.Status | string | null): ApiKeyTier {
  if (status === "active" || status === "trialing") return "pro";
  return "free";
}
