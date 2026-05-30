// src/app/api/cron/cleanup-pending-links/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Daily cron — sweeps short-lived rows from three tables in one pass:
//
//   pending_wallet_links   — expired unclaimed rows
//                            (expires_at < NOW() AND claimed_at IS NULL)
//                            Claimed rows are KEPT for the search→install
//                            conversion funnel.
//
//   webhook_event_dedup    — rows older than 30 days
//                            Once we're 30 days past delivery, no provider
//                            will ever redeliver the same event — Stripe's
//                            replay window is ≤3 days, RC's is similar.
//                            Keeping rows beyond that is pure storage tax.
//
//   mobile_otps            — expired or used OTPs (expires_at < NOW() OR used=true)
//                            OTPs are single-use 10-min codes. Without cleanup,
//                            failed auth attempts pile up as dead tuples and
//                            inflate table bloat. Keeping them 0 days past
//                            expiry is safe — a used/expired OTP has no value.
//
// All three sweeps live in the same cron because they have identical traits:
// daily, deterministic WHERE clause, no external API calls, small write
// volume. Easier to operate than separate routes.
//
// Auth: same Bearer-token pattern as the other crons.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";
import { db } from "@/lib/db";
import { mobileOtps, pendingWalletLinks, webhookEventDedup } from "@/lib/db/schema";
import { and, isNull, lt, or, eq } from "drizzle-orm";

const WEBHOOK_DEDUP_TTL_DAYS = 30;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // 1. pending_wallet_links — expired unclaimed.
  // returning() lets us count what we actually removed without a separate
  // SELECT roundtrip. The id is the cheapest column to return.
  const deletedPending = await db
    .delete(pendingWalletLinks)
    .where(and(
      lt(pendingWalletLinks.expiresAt, now),
      isNull(pendingWalletLinks.claimedAt),
    ))
    .returning({ id: pendingWalletLinks.id });

  // 2. webhook_event_dedup — older than 30 days.
  const dedupCutoff = new Date(Date.now() - WEBHOOK_DEDUP_TTL_DAYS * 24 * 60 * 60 * 1000);
  const deletedDedup = await db
    .delete(webhookEventDedup)
    .where(lt(webhookEventDedup.receivedAt, dedupCutoff))
    .returning({ eventId: webhookEventDedup.eventId });

  // 3. mobile_otps — expired or already used.
  // OTPs are 10-minute single-use codes. Without cleanup the table accumulates
  // dead rows on every failed auth attempt, inflating bloat and slowing the
  // `db.delete(mobileOtps).where(eq(email))` call that runs on every OTP send.
  const deletedOtps = await db
    .delete(mobileOtps)
    .where(or(
      lt(mobileOtps.expiresAt, now),
      eq(mobileOtps.used, true),
    ))
    .returning({ id: mobileOtps.id });

  return NextResponse.json({
    ok: true,
    pending_wallet_links_deleted: deletedPending.length,
    webhook_event_dedup_deleted:  deletedDedup.length,
    mobile_otps_deleted:          deletedOtps.length,
    sweptAt: now.toISOString(),
  });
}
