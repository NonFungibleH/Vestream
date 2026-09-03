// src/lib/notifications/web-alerts.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unlock alerts for people who have NOT installed the app.
//
// This is the consumer-layer promise delivered on the web: someone scans a
// wallet on /find-vestings, gives an email, and gets told before their next
// unlock. No account, no wallet connection, no install.
//
// Runs alongside runNotificationJob (registered users) from the same 15-minute
// cron. Kept in its own module because the two have genuinely different shapes:
// registered users have wallets, preferences, tiers, push tokens and a
// FK-backed dedup table; a web subscriber is one row with an email and one
// wallet, and dedups against its own last-fired event.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { readFromCache, NOTIFIER_MAX_AGE_SECONDS } from "@/lib/vesting/dbcache";
import { sendEmailNotification } from "./email";
import { mapBounded } from "@/lib/vesting/rpc";
import type { VestingStream } from "@/lib/vesting/types";

interface SubRow {
  id: string;
  email: string;
  wallet_address: string;
  hours_before: number;
  unsubscribe_token: string;
  last_stream_id: string | null;
  last_unlock_at: Date | null;
}

/**
 * Send "your tokens unlock soon" to web subscribers whose next unlock falls
 * inside their chosen lead time.
 *
 * Returns the number of emails sent.
 */
export async function runWebAlertJob(): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);
  // Same slop as the user job: a tick can land up to an hour late and still
  // fire, and up to 5 minutes early.
  const PAST_GRACE_SEC  = 3600;
  const FUTURE_SLOP_SEC = 300;

  let subs: SubRow[];
  try {
    const res = await db.execute(sql`
      SELECT id, email, wallet_address, hours_before, unsubscribe_token,
             last_stream_id, last_unlock_at
        FROM wallet_alert_subscriptions
       WHERE unsubscribed_at IS NULL
       LIMIT 5000
    `);
    subs = (res as unknown as { rows?: SubRow[] }).rows ?? (res as unknown as SubRow[]);
  } catch (err) {
    console.error("[web-alerts] subscription read failed:", err);
    return 0;
  }
  if (subs.length === 0) return 0;

  const counts = await mapBounded(subs, 6, async (sub) => {
    let streams: VestingStream[];
    try {
      // Same pre-seeded cache the user job reads. Never a live adapter fan-out:
      // that is what used to push the notify cron past its limit.
      const cached = await readFromCache([sub.wallet_address], { maxAgeSeconds: NOTIFIER_MAX_AGE_SECONDS });
      streams = cached.streams;
    } catch (err) {
      console.error(`[web-alerts] cache read failed for ${sub.id}:`, err);
      return 0;
    }
    if (streams.length === 0) return 0;

    const leadSec = sub.hours_before * 3600;

    // Soonest upcoming unlock that is inside the lead window.
    const due = streams
      .filter((s) => s.nextUnlockTime != null && s.nextUnlockTime > 0)
      .filter((s) => {
        const fireAt = s.nextUnlockTime! - leadSec;
        return fireAt <= nowSec + FUTURE_SLOP_SEC && fireAt >= nowSec - PAST_GRACE_SEC;
      })
      .sort((a, b) => (a.nextUnlockTime ?? 0) - (b.nextUnlockTime ?? 0))[0];

    if (!due) return 0;

    // One alert per unlock event. Cheaper and simpler than a dedup table, and
    // correct because a subscription watches exactly one wallet.
    const unlockAt = new Date(due.nextUnlockTime! * 1000);
    if (sub.last_stream_id === due.id &&
        sub.last_unlock_at != null &&
        Math.abs(new Date(sub.last_unlock_at).getTime() - unlockAt.getTime()) < 60 * 60 * 1000) {
      return 0;
    }

    try {
      await sendEmailNotification(sub.email, due, unlockAt, {
        trigger: "before-unlock",
        unsubscribeToken: sub.unsubscribe_token,
      });
    } catch (err) {
      console.error(`[web-alerts] send failed for ${sub.id}:`, err);
      return 0;
    }

    try {
      await db.execute(sql`
        UPDATE wallet_alert_subscriptions
           SET last_sent_at = now(), sent_count = sent_count + 1,
               last_stream_id = ${due.id}, last_unlock_at = ${unlockAt.toISOString()}
         WHERE id = ${sub.id}
      `);
    } catch (err) {
      // Sent but not recorded: the worst case is one duplicate on the next
      // tick, which is better than dropping the alert entirely.
      console.error(`[web-alerts] dedup write failed for ${sub.id}:`, err);
    }
    return 1;
  });

  return counts.reduce<number>((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0);
}
