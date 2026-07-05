// /api/cron/generate-unlocks
// ─────────────────────────────────────────────────────────────────────────────
// Populates `vesting_unlock_events` (the accrual-basis half of the Tax tool)
// for paid users. Unlocks are NOT on-chain events — they're computed from each
// stream's vesting schedule (computeUnlockTranches) — so this cron is what makes
// the unlock-basis tax data exist at all.
//
// For each paid user with tracked wallets: read their cached streams, generate
// unlock-event rows (discrete tranches only; linear deferred to Phase 2), then
// price the still-"missing" rows at each unlock timestamp. Both steps are
// idempotent — generation dedups on (userId, trancheKey), pricing skips already-
// priced + manual-FMV rows — so re-runs are safe.
//
// Work is SYNCHRONOUS/awaited (Vercel kills after() — a hard-won lesson in this
// codebase). Each user is wrapped in try/catch so one bad user can't sink the run.
//
// Manual / targeted runs:
//   ?userId=<uuid>  — just that user (verification)
//   ?limit=<n>      — cap users processed this run (default 100)
// Auth: Bearer CRON_SECRET (same as every other cron).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, wallets } from "@/lib/db/schema";
import { readAllStreamsForWallets } from "@/lib/vesting/dbcache";
import { generateUnlockEventsForUser, priceUnlockEvents } from "@/lib/vesting/unlock-events";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

export const runtime     = "nodejs";
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

// Tiers that get the tax feature — mirrors ingest-claims (legacy aliases → Pro).
const PAID_TIERS = ["pro", "mobile", "fund"];

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const onlyUserId = req.nextUrl.searchParams.get("userId");
  const limitRaw   = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);
  const limit      = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100;

  try {
    // One row per (paid user, wallet). Scoped to one user for targeted runs.
    const rows = await db
      .select({ userId: wallets.userId, address: wallets.address })
      .from(wallets)
      .innerJoin(users, eq(users.id, wallets.userId))
      .where(onlyUserId ? eq(wallets.userId, onlyUserId) : inArray(users.tier, PAID_TIERS));

    // Group wallets per user.
    const byUser = new Map<string, string[]>();
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? [];
      list.push(r.address);
      byUser.set(r.userId, list);
    }

    const userIds = [...byUser.keys()].slice(0, limit);

    let totalGenerated = 0;
    let totalPriced = 0;
    const perUser: Array<{ userId: string; generated: number; priced: number; error?: string }> = [];

    for (const userId of userIds) {
      try {
        const streams   = await readAllStreamsForWallets(byUser.get(userId)!);
        const generated = await generateUnlockEventsForUser(userId, streams);
        const priced    = await priceUnlockEvents(userId);
        totalGenerated += generated;
        totalPriced    += priced;
        perUser.push({ userId, generated, priced });
      } catch (err) {
        console.error(`[cron/generate-unlocks] user ${userId} failed:`, err);
        perUser.push({ userId, generated: 0, priced: 0, error: String(err) });
      }
    }

    return NextResponse.json({
      ok: true,
      usersProcessed: userIds.length,
      usersEligible:  byUser.size,
      totalGenerated,
      totalPriced,
      perUser,
    });
  } catch (err) {
    console.error("[cron/generate-unlocks] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
