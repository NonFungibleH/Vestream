// src/app/api/unlocks/upcoming/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Returns the N most imminent upcoming unlock GROUPS across all indexed
// protocols. Powers the /protocols "Upcoming unlocks" widget so the page
// feels forward-looking, not just a history log.
//
// ─── Why groups instead of individual streams ────────────────────────────────
//
// A team distribution that pays out to 50 wallets at the same hour produces
// 50 streams in the cache — but it's one *event*. Pre-grouping, the widget
// rendered 50 visually-identical rows; users complained the feed looked
// like it was "stuck on one event" and we were leaking information about
// the aggregate size of the unlock. Grouping by
//   `(protocol, chainId, tokenAddress, ROUND(endTime, 3600))`
// (1-hour bucket) collapses that to one row showing "50 wallets · 500K USDC
// · in 8h 41m". The deep-link target is the token-explorer page, which
// already lists every recipient.
//
// Limit bounded to [1, 20] to prevent query abuse — default 10.
//
// ─── Coverage caveat ─────────────────────────────────────────────────────────
//
// The underlying query reads `vestingStreamsCache`, which is per-user-seeded
// (a stream lands in the cache when SOMEONE searches the recipient wallet).
// TVL was solved by exhaustive token-level walkers in
// `src/lib/vesting/tvl-walker/`, but those walkers don't currently write
// individual streams back to the cache — so this endpoint sees only the
// "actively-searched" subset of vesting events on-chain. The grouping fix
// is orthogonal to coverage; the walker→cache backfill is a separate
// larger workstream (Path A in the original ticket).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import {
  getUpcomingUnlockGroupsAcross,
  type UnlockGroupSummary,
} from "@/lib/vesting/protocol-stats";

export const dynamic = "force-dynamic";

export interface UpcomingUnlocksResponse {
  ok:    true;
  nowMs: number;
  /** Each entry is a *group* — one or more streams that share
   *  protocol/chain/token and unlock within the same 1-hour window.
   *  See `UnlockGroupSummary.walletCount` to render "N wallets · X TOKEN"
   *  vs the legacy single-wallet phrasing. */
  unlocks: UnlockGroupSummary[];
}

export async function GET(req: NextRequest) {
  const rawLimit = Number(new URL(req.url).searchParams.get("limit") ?? "10");
  const limit    = Math.max(1, Math.min(20, Number.isFinite(rawLimit) ? rawLimit : 10));

  try {
    const unlocks = await getUpcomingUnlockGroupsAcross(limit);
    return NextResponse.json(
      {
        ok:    true,
        nowMs: Date.now(),
        unlocks,
      } satisfies UpcomingUnlocksResponse,
      {
        // Edge-cache lightly so we don't hit the DB on every visitor
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      },
    );
  } catch (err) {
    console.error("[upcoming] failed:", err);
    return NextResponse.json({ error: "Failed to load upcoming unlocks" }, { status: 500 });
  }
}
