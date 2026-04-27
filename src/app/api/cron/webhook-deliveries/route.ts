// Cron: deliver upcoming-unlock events to webhook subscribers.
// ─────────────────────────────────────────────────────────────────────────────
// For every active webhook_subscriptions row:
//   1. Find unlock groups whose `endTime` falls in the
//      (now, now + sub.hoursBefore × 3600) window
//   2. Apply the subscription's filters (wallet / protocol / chain) JS-side
//   3. POST each matching event to sub.url with an HMAC signature
//   4. Update lastFiredAt + failureCount on the row
//   5. After 10 consecutive failures, set disabledAt (receiver must
//      delete + recreate to re-enable)
//
// Designed to run alongside the existing notify cron — different audience
// (developers integrating webhooks, vs end-users getting email alerts) so
// kept in its own route for clean operational separation.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookSubscriptions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getUpcomingUnlockGroupsAcross } from "@/lib/vesting/protocol-stats";

export const maxDuration = 300;
export const dynamic     = "force-dynamic";

const FAILURE_DISABLE_THRESHOLD = 10;
const DELIVERY_TIMEOUT_MS       = 10_000;

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Pull active subscriptions ─────────────────────────────────────────
  const subs = await db
    .select()
    .from(webhookSubscriptions)
    .where(isNull(webhookSubscriptions.disabledAt));

  if (subs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, delivered: 0 });
  }

  // Pull a generous slice of upcoming groups once and filter per-sub in JS
  // — cheaper than running per-sub queries when most subs share a similar
  // window. 200 groups gives us ~7 days of typical event volume.
  let allGroups;
  try {
    allGroups = await getUpcomingUnlockGroupsAcross(200);
  } catch (err) {
    console.error("[webhook-cron] failed to load upcoming groups:", err);
    return NextResponse.json({ error: "Failed to load upcoming unlocks" }, { status: 500 });
  }

  let processed = 0;
  let delivered = 0;
  let disabled  = 0;
  const nowSec  = Math.floor(Date.now() / 1000);

  for (const sub of subs) {
    processed++;
    const cutoff = nowSec + sub.hoursBefore * 3600;
    const lastFiredSec = sub.lastFiredAt ? Math.floor(sub.lastFiredAt.getTime() / 1000) : 0;

    const matches = allGroups.filter((g) => {
      // Only consider events that are inside the lookahead window AND
      // either we've never fired (lastFiredAt = null) or this event's
      // endTime is later than the previous lastFiredAt — prevents
      // re-delivery of the same event on every cron tick.
      if (!g.endTime || g.endTime > cutoff) return false;
      if (g.endTime <= lastFiredSec)        return false;
      if (sub.walletFilter && sub.walletFilter.length > 0) {
        if (!sub.walletFilter.includes(g.recipient.toLowerCase())) return false;
      }
      if (sub.protocolFilter && sub.protocolFilter.length > 0) {
        if (!sub.protocolFilter.includes(g.protocol)) return false;
      }
      if (sub.chainFilter && sub.chainFilter.length > 0) {
        if (!sub.chainFilter.includes(g.chainId)) return false;
      }
      return true;
    });

    if (matches.length === 0) continue;

    let successCount = 0;
    let failureCount = sub.failureCount;

    for (const g of matches) {
      const payload = {
        event:        "upcoming_unlock",
        subscription: sub.id,
        delivered_at: new Date().toISOString(),
        data: {
          group_key:     g.groupKey,
          protocol:      g.protocol,
          chain_id:      g.chainId,
          token_symbol:  g.tokenSymbol,
          token_address: g.tokenAddress,
          end_time:      g.endTime,
          amount:        g.amount,
          wallet_count:  g.walletCount,
          stream_count:  g.streamCount,
          first_recipient: g.recipient,
        },
      };
      const body = JSON.stringify(payload);
      const signature = crypto.createHmac("sha256", sub.secret).update(body).digest("hex");

      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS);
        const r = await fetch(sub.url, {
          method:  "POST",
          headers: {
            "Content-Type":          "application/json",
            "X-Vestream-Signature":  `sha256=${signature}`,
            "X-Vestream-Event":      "upcoming_unlock",
            "User-Agent":            "Vestream-Webhook/1.0",
          },
          body,
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (r.ok) {
          successCount++;
          delivered++;
        } else {
          failureCount++;
          console.warn(`[webhook-cron] sub ${sub.id} → ${r.status}`);
        }
      } catch (err) {
        failureCount++;
        console.warn(`[webhook-cron] sub ${sub.id} delivery threw:`, err);
      }
    }

    // Update the subscription row.
    const update: Partial<typeof webhookSubscriptions.$inferInsert> = {
      failureCount,
    };
    if (successCount > 0) {
      update.lastFiredAt = new Date();
      // Reset failure count on any success — sticky failures only count
      // when no delivery in the batch lands.
      update.failureCount = 0;
    }
    if (failureCount >= FAILURE_DISABLE_THRESHOLD) {
      update.disabledAt = new Date();
      disabled++;
    }
    await db
      .update(webhookSubscriptions)
      .set(update)
      .where(eq(webhookSubscriptions.id, sub.id));
  }

  return NextResponse.json({ ok: true, processed, delivered, disabled });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
