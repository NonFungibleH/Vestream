// src/lib/server-analytics.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-side analytics — fires events to GA4 via the Measurement Protocol so
// they land even when the user has an ad blocker, runs Brave/Safari with ITP,
// or never accepts the cookie banner.
//
// We use this for events the SERVER is the source of truth for:
//   - subscription_started      (Stripe checkout.session.completed webhook)
//   - subscription_canceled     (Stripe customer.subscription.deleted webhook)
//   - subscription_renewed      (Stripe invoice.payment_succeeded webhook)
//   - api_key_created           (admin or self-serve key creation)
//   - push_alert_delivered      (notification scheduler success)
//
// Every event is fire-and-forget — never blocks the request flow. If GA is
// down or env vars are missing we silently swallow so production traffic
// continues normally.
//
// Setup:
//   1. In your GA4 property: Admin → Data Streams → Web stream → Measurement
//      Protocol API secrets → Create. Copy the secret.
//   2. Set on Vercel:
//        GA_MEASUREMENT_ID = G-XXXXXXXXXX  (same as NEXT_PUBLIC_GA_ID)
//        GA_API_SECRET     = (the secret you just created — server-only)
//   3. The same client_id is used for all server-side events from one user
//      session. We hash the user ID so PII never leaves our infrastructure.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

type ServerEvent =
  | "subscription_started"
  | "subscription_canceled"
  | "subscription_renewed"
  | "api_key_created"
  | "push_alert_delivered";

interface ServerEventParams {
  /** Stable per-user identifier so GA can group events into a session. */
  userId: string | null;
  /** Optional structured params — keys snake_case, values primitive. */
  [key: string]: string | number | boolean | null | undefined;
}

const GA_ID     = process.env.GA_MEASUREMENT_ID ?? process.env.NEXT_PUBLIC_GA_ID;
const GA_SECRET = process.env.GA_API_SECRET;

/**
 * Derive a stable, non-reversible client id from a user id. We salt with the
 * GA_API_SECRET so the same user id maps to the same client_id across runs,
 * but the mapping is opaque to GA (we never send the raw user id).
 */
function hashClientId(userId: string | null): string {
  if (!userId) return "anon";
  return createHash("sha256")
    .update(userId)
    .update(GA_SECRET ?? "no-secret")
    .digest("hex")
    .slice(0, 32);
}

/**
 * Fire a server-side event to GA4 via the Measurement Protocol. Always safe
 * to call — never throws, never blocks. Returns void; failures are silent
 * by design (analytics must never break a payment / webhook flow).
 */
export async function trackServerEvent(
  event: ServerEvent,
  { userId, ...params }: ServerEventParams,
): Promise<void> {
  if (!GA_ID || !GA_SECRET) return;

  // Strip null / undefined so they don't render as the literal string
  // "undefined" in GA reports.
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    cleaned[k] = v;
  }

  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_ID}&api_secret=${GA_SECRET}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: hashClientId(userId),
        events: [{ name: event, params: cleaned }],
      }),
      // Don't await long if GA is slow — drop after 2s
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Silent. Analytics must never break a webhook flow.
  }
}
