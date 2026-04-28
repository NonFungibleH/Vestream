// /api/claims/history
// ─────────────────────────────────────────────────────────────────────────────
// Returns the authenticated user's claim history, optionally filtered by
// date range or protocol. Foundation endpoint for the Tax-ready claim
// history feature — UI / CSV / Koinly / TurboTax exports all consume this.
//
// GET /api/claims/history?since=2024-01-01&until=2024-12-31&protocol=sablier
//   → { events: ClaimEvent[], summary: { totalRows, totalUsd, byYear } }
//
// POST /api/claims/history?action=refresh
//   → triggers ingestion across all the user's tracked wallets. Pulls
//     fresh withdrawal events from each adapter's data source and upserts
//     into claim_events. Idempotent — re-runs no-op on dedup index.
//
// Phase 1 ships Sablier ingestion only. Phase 2 adds the other adapters.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, wallets } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  ingestSablierClaimsForUser,
  getClaimHistoryForUser,
} from "@/lib/vesting/ingestors/sablier-claims";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import type { SupportedChainId } from "@/lib/vesting/types";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel — refresh can take a while across adapters

async function getAuthedUser(): Promise<{ userId: string; address: string } | null> {
  const session = await getSession();
  if (!session.address) return null;
  const [u] = await db
    .select({ id: users.id, address: users.address })
    .from(users)
    .where(eq(users.address, session.address.toLowerCase()))
    .limit(1);
  if (!u) return null;
  return { userId: u.id, address: u.address };
}

// ── GET — list events ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await getAuthedUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const since    = sp.get("since");
  const until    = sp.get("until");
  const protocol = sp.get("protocol") ?? undefined;

  const events = await getClaimHistoryForUser(auth.userId, {
    since:    since ? new Date(since) : undefined,
    until:    until ? new Date(until) : undefined,
    protocol,
  });

  // Summary: totals + per-year breakdown for the UI's "year switcher".
  const summary = events.reduce<{
    totalRows: number;
    totalUsd:  number;
    byYear:    Record<string, { rows: number; usd: number }>;
  }>(
    (acc, e) => {
      acc.totalRows += 1;
      const usd = e.usdValueAtClaim ? Number(e.usdValueAtClaim) : 0;
      acc.totalUsd += usd;
      const year = String(e.claimedAt.getUTCFullYear());
      if (!acc.byYear[year]) acc.byYear[year] = { rows: 0, usd: 0 };
      acc.byYear[year].rows += 1;
      acc.byYear[year].usd  += usd;
      return acc;
    },
    { totalRows: 0, totalUsd: 0, byYear: {} },
  );

  return NextResponse.json({ events, summary });
}

// ── POST — ingest (manual refresh) ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await getAuthedUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const action = req.nextUrl.searchParams.get("action");
  if (action !== "refresh") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Heavy operation — 2 refreshes / 5 min per IP. Most users won't hit
  // this; the cron will keep things fresh. Manual button is for "I just
  // claimed and want my dashboard to reflect it now".
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("claims:refresh", `${ip}:${auth.userId}`, 2, "5 m");
  const blocked = rateLimitResponse(rl, "Refresh limit hit. Try again in a few minutes.");
  if (blocked) return blocked;

  const userWallets = await db
    .select({ address: wallets.address, chains: wallets.chains })
    .from(wallets)
    .where(eq(wallets.userId, auth.userId));

  if (userWallets.length === 0) {
    return NextResponse.json({ inserted: 0, message: "No wallets tracked." });
  }

  const allWallets = userWallets.map((w) => w.address);
  // Honour per-wallet chain narrowing where set; otherwise default chains
  // come from the Sablier adapter itself.
  const allChainsRequested = new Set<SupportedChainId>();
  for (const w of userWallets) {
    if (w.chains?.length) {
      for (const c of w.chains) {
        const n = Number.parseInt(c, 10);
        if (Number.isFinite(n)) allChainsRequested.add(n as SupportedChainId);
      }
    }
  }
  const chainIds = allChainsRequested.size > 0
    ? [...allChainsRequested]
    : undefined; // adapter default

  // Phase 1: Sablier only. Phase 2 fan-out:
  //   const [sab, hed, unc, ...] = await Promise.all([
  //     ingestSablierClaimsForUser(...),
  //     ingestHedgeyClaimsForUser(...),
  //     ingestUncxClaimsForUser(...),
  //     ...
  //   ]);
  const inserted = await ingestSablierClaimsForUser(
    auth.userId,
    allWallets,
    chainIds,
  );

  return NextResponse.json({
    inserted,
    message: inserted === 0
      ? "Already up to date."
      : `Indexed ${inserted} new claim event${inserted === 1 ? "" : "s"}.`,
    coverage: ["sablier"],     // documents what's currently indexed
    pending:  ["hedgey", "uncx", "team-finance", "superfluid", "pinksale", "streamflow", "jupiter-lock"],
  });
}
