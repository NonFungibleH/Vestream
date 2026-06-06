// /api/cron/ingest-claims
// ─────────────────────────────────────────────────────────────────────────────
// Populates `claim_events` (the table behind the Tax Reports feature) for paid
// users. Previously the ONLY path that wrote claim_events was the manual
// "Refresh claims" button on /dashboard/exports — so unless a user clicked it,
// the table stayed empty and the tax exports produced nothing. This cron makes
// it self-populating.
//
// For each paid user with tracked wallets, runs ingestAllClaimsForUser() —
// which fans out to every protocol's claim ingestor (Sablier, Hedgey, UNCX,
// Unvest, PinkSale, Superfluid, Streamflow, Jupiter Lock; Team Finance paused).
// Writes are idempotent (unique index per ingestor), so re-runs are safe.
//
// Manual / targeted runs:
//   ?userId=<uuid>  — ingest just that user (verification)
//   ?limit=<n>      — cap users processed this run (default 100)
// Auth: Bearer CRON_SECRET (same as every other cron).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, wallets } from "@/lib/db/schema";
import { ingestAllClaimsForUser } from "@/lib/vesting/ingestors";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";
import type { SupportedChainId } from "@/lib/vesting/types";

export const runtime     = "nodejs";
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

// Tiers that get the tax/claims feature — mirrors canAccessDashboard()'s set
// (legacy "mobile"/"fund" are Pro aliases).
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
      .select({
        userId:  wallets.userId,
        address: wallets.address,
        chains:  wallets.chains,
        tier:    users.tier,
      })
      .from(wallets)
      .innerJoin(users, eq(users.id, wallets.userId))
      .where(onlyUserId ? eq(wallets.userId, onlyUserId) : inArray(users.tier, PAID_TIERS));

    // Group wallets + any per-wallet chain narrowing per user.
    const byUser = new Map<string, { wallets: string[]; chains: Set<SupportedChainId> }>();
    for (const r of rows) {
      const e = byUser.get(r.userId) ?? { wallets: [], chains: new Set<SupportedChainId>() };
      e.wallets.push(r.address);
      for (const c of r.chains ?? []) {
        const n = Number.parseInt(c, 10);
        if (Number.isFinite(n)) e.chains.add(n as SupportedChainId);
      }
      byUser.set(r.userId, e);
    }

    const userIds = [...byUser.keys()].slice(0, limit);

    let totalInserted = 0;
    const perUser: Array<{ userId: string; inserted: number; errors: string[] }> = [];
    // Sequential per user: each ingestAllClaimsForUser already fans out across
    // ~10 protocol ingestors in parallel, so doing users sequentially keeps the
    // subgraph/RPC load (and pooler connections) bounded.
    for (const userId of userIds) {
      const u = byUser.get(userId)!;
      const chainIds = u.chains.size > 0 ? [...u.chains] : undefined; // undefined = adapter defaults
      const results = await ingestAllClaimsForUser(userId, u.wallets, chainIds);
      const inserted = results.reduce((a, r) => a + r.inserted, 0);
      const errors = results.filter((r) => r.error).map((r) => `${r.protocol}: ${r.error}`);
      totalInserted += inserted;
      perUser.push({ userId, inserted, errors });
    }

    return NextResponse.json({
      ok: true,
      usersProcessed: userIds.length,
      usersEligible:  byUser.size,
      totalInserted,
      perUser,
    });
  } catch (err) {
    console.error("[cron/ingest-claims] failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
