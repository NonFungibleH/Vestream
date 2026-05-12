// src/lib/webhook-dedup.ts
// ─────────────────────────────────────────────────────────────────────────────
// Idempotency / replay protection for external webhooks.
//
// Used by /api/mobile/revenuecat-webhook and /api/stripe/webhook to defend
// against at-least-once delivery: a network hiccup, a signature-verify
// retry, or an operator clicking "resend event" in the provider dashboard
// can each cause the same payload to land at our endpoint twice. Without
// dedup, a CANCELLATION-then-UNCANCELLATION sequence redelivered out of
// order would silently downgrade a paying user.
//
// API:
//   claimWebhookEvent(eventId, source)
//     → true  : first time seeing this event — caller should process it
//     → false : already processed (idempotent retry / replay) — caller
//                should return 200 OK without side effects
//
// Implementation: INSERT ... ON CONFLICT DO NOTHING with RETURNING.
// Postgres handles the race entirely — concurrent inserts for the same
// (event_id, source) race for the primary key; the loser sees empty
// RETURNING. No application-level locking needed.
//
// Why returning `boolean` and not throwing: dedup is a control-flow
// decision, not an error path. Callers branch on the result.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { webhookEventDedup } from "@/lib/db/schema";

/**
 * Atomically claim a webhook event ID for processing. Returns true if
 * this is the first time we've seen it (caller should process and apply
 * side effects), false if it's already been processed (caller should
 * return 200 OK without doing anything).
 *
 * Best-effort: if the DB is unreachable (table missing pre-migration,
 * Supabase outage, etc) we fail OPEN and return true so the caller still
 * processes the event. The trade-off here is that during a DB outage,
 * we might double-process a redelivered webhook — but the alternative
 * (failing closed = rejecting every webhook during an outage) would
 * silently drop legitimate subscription events. Webhooks are a
 * billing-correctness signal; better to risk a duplicate than a miss.
 */
export async function claimWebhookEvent(
  eventId: string,
  source: "revenuecat" | "stripe",
): Promise<boolean> {
  if (!eventId || typeof eventId !== "string" || eventId.length === 0) {
    // No event ID supplied — caller must process (we can't dedup what we
    // can't identify). This branch fires for providers that don't include
    // a stable ID in their payload; RC + Stripe both do, so seeing this
    // in practice is a payload-shape regression worth investigating.
    return true;
  }
  try {
    const inserted = await db
      .insert(webhookEventDedup)
      .values({ eventId, source })
      .onConflictDoNothing()
      .returning({ eventId: webhookEventDedup.eventId });
    return inserted.length > 0;
  } catch (err) {
    // DB write failed — fail-open per the policy above.
    console.error(`[webhook-dedup] claim failed for ${source}:${eventId}:`, err);
    return true;
  }
}
