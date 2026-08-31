// src/lib/vesting/chain-stats.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-chain vesting stats for the /chains/<slug> pages. Composes existing,
// already-defensible sources:
//   - readAllSnapshots()   → TVL + stream/token totals for this chain
//   - getUnlocksInWindow() → upcoming unlocks on this chain (chainId-filtered)
//   - listProtocols()      → which protocols are integrated on this chain
//
// Build-phase guarded (no reliable DB during `next build`) so ISR fills on the
// first runtime request, same pattern as every other DB helper.
// ─────────────────────────────────────────────────────────────────────────────

import { getUnlocksInWindow, enrichGroupsWithUsd, type WindowUnlockGroup } from "./unlock-windows";
import { readAllSnapshots, type ProtocolSnapshotRow } from "./tvl-snapshot";
import { listProtocols } from "../protocol-constants";
import { withTimeout } from "../with-timeout";

export interface ChainUnlock {
  symbol:    string | null;
  address:   string;
  chainId:   number;
  protocol:  string;
  eventTime: number;      // unix sec
  amount:    string | null;
  decimals:  number;
  usdValue:  number | null;
}

export interface ChainStats {
  chainId:        number;
  tvlUsd:         number;
  streamCount:    number;
  tokenCount:     number;
  protocolSlugs:  string[];       // enabled protocols integrated on this chain
  upcoming:       ChainUnlock[];  // ranked upcoming unlocks (priced desc)
  upcomingCount:  number;         // total upcoming unlocks in the window
  totalUpcomingUsd: number;
  computedAt:     string;         // ISO of the freshest snapshot
  isEmpty:        boolean;
}

const EMPTY = (chainId: number): ChainStats => ({
  chainId, tvlUsd: 0, streamCount: 0, tokenCount: 0, protocolSlugs: [],
  upcoming: [], upcomingCount: 0, totalUpcomingUsd: 0,
  computedAt: new Date(0).toISOString(), isEmpty: true,
});

// Same ranking intent as the monthly report: priced desc, then unpriced by amount.
function rankEvents(a: WindowUnlockGroup, b: WindowUnlockGroup): number {
  const au = a.usdValue ?? null, bu = b.usdValue ?? null;
  if (au !== null && bu !== null) return bu - au;
  if (au !== null) return -1;
  if (bu !== null) return 1;
  const aa = a.amount ? BigInt(a.amount) : 0n;
  const ba = b.amount ? BigInt(b.amount) : 0n;
  return aa > ba ? -1 : aa < ba ? 1 : 0;
}

export async function getChainStats(
  chainId: number,
  opts: { days?: number; topN?: number } = {},
): Promise<ChainStats> {
  if (process.env.NEXT_PHASE === "phase-production-build") return EMPTY(chainId);

  const days = opts.days ?? 90;
  const topN = opts.topN ?? 25;

  // Protocols integrated on this chain (enabled only).
  const protocolSlugs = listProtocols()
    .filter((p) => p.chainIds.includes(chainId as never))
    .map((p) => p.slug);

  // TVL + totals from the snapshot rows for this chain.
  const snapshots = await withTimeout(readAllSnapshots(), 8_000, [] as ProtocolSnapshotRow[], "chain:snapshots");
  const chainRows = snapshots.filter((r) => r.chainId === chainId);
  let tvlUsd = 0, streamCount = 0, tokenCount = 0, freshest = 0;
  for (const r of chainRows) {
    tvlUsd += r.tvlUsd;
    streamCount += r.streamCount || 0;
    tokenCount += r.tokensTotal || 0;
    const t = r.computedAt instanceof Date ? r.computedAt.getTime() : 0;
    if (t > freshest) freshest = t;
  }

  // Upcoming unlocks on this chain over the window. Note getUnlocksInWindow's
  // 4th arg is adapterIds (string[]); chainIds is the 5th arg.
  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = nowSec + days * 86_400;
  let groups: WindowUnlockGroup[] = [];
  let upcomingCount = 0;
  try {
    const win = await getUnlocksInWindow(nowSec, endSec, 5000, undefined, [chainId]);
    groups = win.groups;
    upcomingCount = win.stats.unlockCount || win.groups.length;
  } catch (err) {
    console.error(`[chain-stats/${chainId}] unlocks:`, err);
  }

  let upcoming: ChainUnlock[] = [];
  let totalUpcomingUsd = 0;
  if (groups.length > 0) {
    // redis:false — ISR-safe (see monthly-report.ts for the rationale).
    const priced = await enrichGroupsWithUsd(groups, { redis: false });
    totalUpcomingUsd = priced.reduce((s, g) => s + (g.usdValue ?? 0), 0);
    upcoming = [...priced].sort(rankEvents).slice(0, topN).map((g) => ({
      symbol: g.tokenSymbol, address: g.tokenAddress, chainId: g.chainId,
      protocol: g.protocol, eventTime: g.eventTime, amount: g.amount,
      decimals: g.tokenDecimals, usdValue: g.usdValue ?? null,
    }));
  }

  const isEmpty = chainRows.length === 0 && groups.length === 0 && protocolSlugs.length === 0;

  return {
    chainId,
    tvlUsd,
    streamCount,
    tokenCount,
    protocolSlugs,
    upcoming,
    upcomingCount,
    totalUpcomingUsd,
    computedAt: freshest ? new Date(freshest).toISOString() : new Date().toISOString(),
    isEmpty,
  };
}
