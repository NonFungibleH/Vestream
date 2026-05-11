// src/app/api/cron/cleanup-pending-links/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Daily cron — sweeps expired unclaimed rows from pending_wallet_links.
//
// Rule: delete any row where expires_at < NOW() AND claimed_at IS NULL.
// Claimed rows are KEPT regardless of age — they're a tiny analytics trail
// for the search → install → claim conversion funnel, and the unique index
// on (email, wallet_address) means an unbounded backlog can't pile up
// (re-saving the same pair just updates the existing row).
//
// Why server-side cleanup and not a TTL-style row trigger: Supabase
// Postgres doesn't ship pg_cron in the free tier connection, and pg_jobs
// is overkill for a "once a day, delete-where-X" task. A Vercel cron is
// the lighter solution.
//
// Auth: same Bearer-token pattern as the other crons.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";
import { db } from "@/lib/db";
import { pendingWalletLinks } from "@/lib/db/schema";
import { and, isNull, lt } from "drizzle-orm";

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
  // returning() lets us count what we actually removed without a separate
  // SELECT roundtrip. The id is the cheapest column to return.
  const deleted = await db
    .delete(pendingWalletLinks)
    .where(and(
      lt(pendingWalletLinks.expiresAt, now),
      isNull(pendingWalletLinks.claimedAt),
    ))
    .returning({ id: pendingWalletLinks.id });

  return NextResponse.json({
    ok: true,
    deleted: deleted.length,
    sweptAt: now.toISOString(),
  });
}
