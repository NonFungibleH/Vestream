// src/lib/vesting/upcoming-unlocks.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared "next N upcoming unlock groups, USD-enriched" loader.
//
// Extracted so BOTH consumers run identical logic:
//   • /api/unlocks/upcoming  (the route the client ticker polls every 30s)
//   • /protocols page render  (server-renders the FIRST paint so the
//     UpcomingUnlockTicker shows data instantly instead of a client
//     fetch-after-mount skeleton — the "not instant" report, 2026-06).
//
// ISR-safety: the /protocols render path is ISR (revalidate=300). Pricing
// MUST pass { redis: false } there — the Upstash SDK hardcodes
// cache:"no-store" which hard-errors inside an ISR render (see CLAUDE.md
// landmine + quick-prices.ts docstring). The route handler keeps the
// default (redis:true).
// ─────────────────────────────────────────────────────────────────────────────

import { getUpcomingUnlockGroupsAcross, type UnlockGroupSummary } from "./protocol-stats";
import { getQuickUsdPrices, toUsdValue } from "./quick-prices";

/**
 * Fetch the next `limit` upcoming unlock groups across all protocols and
 * attach a USD-equivalent to each (best-effort — tokens without a liquid
 * DEX pair come back with usdValue undefined and the UI falls back to the
 * raw token amount). Build-guarded via getUpcomingUnlockGroupsAcross.
 *
 * @param opts.redis pass `false` on ISR render paths; omit on route handlers.
 */
export async function getUpcomingUnlocksEnriched(
  limit = 10,
  opts?: { redis?: boolean },
): Promise<UnlockGroupSummary[]> {
  const unlocks = await getUpcomingUnlockGroupsAcross(limit);
  if (unlocks.length === 0) return [];

  const priceMap = await getQuickUsdPrices(
    unlocks.map((u) => ({ chainId: u.chainId, address: u.tokenAddress })),
    opts,
  );

  return unlocks.map((u) => ({
    ...u,
    usdValue: toUsdValue(
      u.amount,
      u.tokenDecimals,
      priceMap.get(`${u.chainId}:${u.tokenAddress.toLowerCase()}`),
    ),
  }));
}
