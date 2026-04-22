// src/app/api/cron/demo-push/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fires web-push notifications for the 15-minute demo vesting schedule.
//
// Why a cron: the demo's state lives in the visitor's iron-session cookie, so
// the server has no way to enumerate "active demos" mid-session. On subscribe
// we mirror the minimal session snapshot (startMs, total, durationSec) into
// the `demoPushSubscriptions` table, and this job scans that table every
// minute to fire milestone pings.
//
// Milestones: 25% / 50% / 75% / 100% of the 15-minute schedule. Each is
// recorded in `milestonesFired` so re-runs don't double-send.
//
// Cleanup: rows older than 30 minutes are deleted (the demo itself lasts 15).
//
// Called by Vercel Cron with `Authorization: Bearer ${CRON_SECRET}`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { demoPushSubscriptions } from "@/lib/db/schema";
import { sendWebPush } from "@/lib/notifications/webpush";

/** The percentages at which we ping. Ordered ascending, values in [0,1]. */
const MILESTONES = [0.25, 0.5, 0.75, 1.0] as const;

/**
 * Rows older than this at cron-run time are deleted.
 *
 * Visitors can now pick a duration up to 3600 s (1 hr), so we keep rows for
 * 90 minutes — that's (max duration) + (15-min buffer) to ensure the final
 * 100% milestone ping has ample retry runway before the row is swept.
 */
const CLEANUP_MS = 90 * 60 * 1000;

function humanAmount(rawBase: bigint, symbol: string, decimals = 18): string {
  const whole = Number(rawBase) / 10 ** decimals;
  if (whole >= 1_000_000) return `${(whole / 1_000_000).toFixed(2)}M ${symbol}`;
  if (whole >= 1_000)     return `${(whole / 1_000).toFixed(1)}K ${symbol}`;
  if (whole >= 1)         return `${whole.toFixed(2)} ${symbol}`;
  return `${whole.toFixed(4)} ${symbol}`;
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function buildPayload(milestone: number, total: bigint, symbol: string): { title: string; body: string; tag: string } {
  const unlocked = (total * BigInt(Math.round(milestone * 1000))) / 1000n;
  const amountStr = humanAmount(unlocked, symbol);
  const fully = milestone >= 1.0;

  return {
    tag:   `demo-milestone-${Math.round(milestone * 100)}`,
    title: fully ? "Fully unlocked — claim now" : `${pct(milestone)} unlocked`,
    body:  fully
      ? `All ${humanAmount(total, symbol)} has vested. Tap to claim.`
      : `${amountStr} is now claimable in your demo schedule.`,
  };
}

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowMs = Date.now();

  // Housekeeping: drop stale rows before we scan
  try {
    const cutoff = new Date(nowMs - CLEANUP_MS);
    await db.delete(demoPushSubscriptions).where(lt(demoPushSubscriptions.createdAt, cutoff));
  } catch (err) {
    console.error("[cron/demo-push] cleanup failed:", err);
  }

  let pushed = 0;
  let removed = 0;
  let errors = 0;

  try {
    const rows = await db.select().from(demoPushSubscriptions);

    for (const row of rows) {
      const startMs     = Number(row.startMs);
      if (!Number.isFinite(startMs)) continue;
      const durationMs  = row.durationSec * 1000;
      const elapsed     = Math.max(0, Math.min(nowMs - startMs, durationMs));
      const progress    = durationMs > 0 ? elapsed / durationMs : 0;
      const alreadyFired = new Set(row.milestonesFired ?? []);

      let rowChanged = false;
      let total: bigint;
      try { total = BigInt(row.total); }
      catch { continue; }

      for (const m of MILESTONES) {
        if (alreadyFired.has(m)) continue;
        if (progress < m) break; // ordered — no later milestone can have crossed

        const payload = buildPayload(m, total, row.tokenSymbol);
        const result = await sendWebPush(row.subscription, {
          title: payload.title,
          body:  payload.body,
          url:   "/demo",
          icon:  "/icons/icon-192.png",
          data:  { tag: payload.tag, milestone: m },
        });

        if (result.ok) {
          pushed += 1;
          alreadyFired.add(m);
          rowChanged = true;
        } else if (result.gone) {
          // Subscription is dead — drop the row entirely
          await db.delete(demoPushSubscriptions).where(eq(demoPushSubscriptions.id, row.id));
          removed += 1;
          rowChanged = false;
          break;
        } else {
          errors += 1;
          // Don't mark as fired so we retry next minute
          break;
        }
      }

      if (rowChanged) {
        await db
          .update(demoPushSubscriptions)
          .set({ milestonesFired: Array.from(alreadyFired).sort() })
          .where(eq(demoPushSubscriptions.id, row.id));
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: rows.length,
      pushed,
      removed,
      errors,
    });
  } catch (err) {
    console.error("[cron/demo-push] job failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
