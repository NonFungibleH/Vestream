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
import { listProtocols, publicChainIds } from "../protocol-constants";
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
  byProtocol:     Array<{ slug: string; name: string; tvlUsd: number; streamCount: number }>; // per-protocol stats, TVL desc
  nextUnlocks:    ChainUnlock[];  // soonest first (chronological)
  biggestUnlocks: ChainUnlock[];  // biggest by USD first
  upcomingCount:  number;         // total upcoming unlocks in the window
  totalUpcomingUsd: number;
  computedAt:     string;         // ISO of the freshest snapshot
  isEmpty:        boolean;
}

const EMPTY = (chainId: number): ChainStats => ({
  chainId, tvlUsd: 0, streamCount: 0, tokenCount: 0, protocolSlugs: [], byProtocol: [],
  nextUnlocks: [], biggestUnlocks: [], upcomingCount: 0, totalUpcomingUsd: 0,
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
  opts: { days?: number } = {},
): Promise<ChainStats> {
  if (process.env.NEXT_PHASE === "phase-production-build") return EMPTY(chainId);

  const days = opts.days ?? 90;

  // Protocols integrated on this chain (enabled only).
  const protocolSlugs = listProtocols()
    .filter((p) => p.chainIds.includes(chainId as never))
    .map((p) => p.slug);

  // TVL + totals from the snapshot rows for this chain.
  const snapshots = await withTimeout(readAllSnapshots(), 8_000, [] as ProtocolSnapshotRow[], "chain:snapshots");
  const chainRows = snapshots.filter((r) => r.chainId === chainId);
  const protoMeta = new Map(listProtocols().map((p) => [p.slug, p.name]));
  const protoTvl = new Map<string, number>();
  const protoStream = new Map<string, number>();
  let tvlUsd = 0, streamCount = 0, tokenCount = 0, freshest = 0;
  for (const r of chainRows) {
    tvlUsd += r.tvlUsd;
    streamCount += r.streamCount || 0;
    tokenCount += r.tokensTotal || 0;
    protoTvl.set(r.protocol, (protoTvl.get(r.protocol) ?? 0) + r.tvlUsd);
    protoStream.set(r.protocol, (protoStream.get(r.protocol) ?? 0) + (r.streamCount || 0));
    const t = r.computedAt instanceof Date ? r.computedAt.getTime() : 0;
    if (t > freshest) freshest = t;
  }
  // One entry per protocol that has a snapshot row on this chain (TVL and/or
  // streams), so the page can show per-protocol TVL + stream counts.
  const byProtocol = [...new Set([...protoTvl.keys(), ...protoStream.keys()])]
    .map((slug) => ({ slug, name: protoMeta.get(slug) ?? slug, tvlUsd: protoTvl.get(slug) ?? 0, streamCount: protoStream.get(slug) ?? 0 }))
    .sort((a, b) => b.tvlUsd - a.tvlUsd || b.streamCount - a.streamCount);

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

  const mapU = (g: WindowUnlockGroup): ChainUnlock => ({
    symbol: g.tokenSymbol, address: g.tokenAddress, chainId: g.chainId,
    protocol: g.protocol, eventTime: g.eventTime, amount: g.amount,
    decimals: g.tokenDecimals, usdValue: g.usdValue ?? null,
  });
  let nextUnlocks: ChainUnlock[] = [];
  let biggestUnlocks: ChainUnlock[] = [];
  let totalUpcomingUsd = 0;
  if (groups.length > 0) {
    // redis:false — ISR-safe (see monthly-report.ts for the rationale).
    const priced = await enrichGroupsWithUsd(groups, { redis: false });
    totalUpcomingUsd = priced.reduce((s, g) => s + (g.usdValue ?? 0), 0);
    nextUnlocks    = [...priced].sort((a, b) => a.eventTime - b.eventTime).slice(0, 15).map(mapU);
    biggestUnlocks = [...priced].sort(rankEvents).slice(0, 10).map(mapU);
  }

  const isEmpty = chainRows.length === 0 && groups.length === 0 && protocolSlugs.length === 0;

  return {
    chainId,
    tvlUsd,
    streamCount,
    tokenCount,
    protocolSlugs,
    byProtocol,
    nextUnlocks,
    biggestUnlocks,
    upcomingCount,
    totalUpcomingUsd,
    computedAt: freshest ? new Date(freshest).toISOString() : new Date().toISOString(),
    isEmpty,
  };
}

// ── Chains index overview ────────────────────────────────────────────────────

export interface ChainOverview {
  chainId:       number;
  tvlUsd:        number;
  streamCount:   number;
  protocolCount: number;  // enabled protocols integrated on this chain (static)
  byProtocol:    Record<string, number>;  // protocol slug -> TVL on this chain
}
export interface ChainsOverview {
  chains:       ChainOverview[];  // public chains, sorted by TVL desc
  /** Protocol columns for the chain×protocol matrix, sorted by total TVL desc
   *  (only protocols with any TVL). */
  protocolCols: Array<{ slug: string; name: string; tvlUsd: number }>;
  totalTvl:     number;
  totalStreams: number;
  computedAt:   string;
}

/** Per-chain TVL + protocol/stream counts for the /chains index leaderboard.
 *  Protocol counts are static (listProtocols); TVL/streams come from the
 *  snapshot table and fill via ISR (build-phase returns zeros for those). */
export async function getChainsOverview(): Promise<ChainsOverview> {
  const publics = publicChainIds();
  const publicSet = new Set(publics);

  const protoCount = new Map<number, number>();
  const protoName  = new Map<string, string>();
  for (const p of listProtocols()) {
    protoName.set(p.slug, p.name);
    for (const c of p.chainIds) {
      if (publicSet.has(c as number)) protoCount.set(c as number, (protoCount.get(c as number) ?? 0) + 1);
    }
  }

  const build = process.env.NEXT_PHASE === "phase-production-build";
  const snapshots = build
    ? [] as ProtocolSnapshotRow[]
    : await withTimeout(readAllSnapshots(), 8_000, [] as ProtocolSnapshotRow[], "chains:snapshots");

  const tvl = new Map<number, number>();
  const streams = new Map<number, number>();
  const cell = new Map<number, Record<string, number>>();   // chainId -> {slug: tvl}
  const protoTotal = new Map<string, number>();             // slug -> total tvl across chains
  let totalTvl = 0, totalStreams = 0, freshest = 0;
  for (const r of snapshots) {
    if (!publicSet.has(r.chainId)) continue;
    tvl.set(r.chainId, (tvl.get(r.chainId) ?? 0) + r.tvlUsd);
    streams.set(r.chainId, (streams.get(r.chainId) ?? 0) + (r.streamCount || 0));
    totalTvl += r.tvlUsd;
    totalStreams += r.streamCount || 0;
    if (r.tvlUsd > 0) {
      const row = cell.get(r.chainId) ?? {};
      row[r.protocol] = (row[r.protocol] ?? 0) + r.tvlUsd;
      cell.set(r.chainId, row);
      protoTotal.set(r.protocol, (protoTotal.get(r.protocol) ?? 0) + r.tvlUsd);
    }
    const t = r.computedAt instanceof Date ? r.computedAt.getTime() : 0;
    if (t > freshest) freshest = t;
  }

  const protocolCols = [...protoTotal.entries()]
    .map(([slug, v]) => ({ slug, name: protoName.get(slug) ?? slug, tvlUsd: v }))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  const chains = publics
    .map((id) => ({
      chainId: id,
      tvlUsd: tvl.get(id) ?? 0,
      streamCount: streams.get(id) ?? 0,
      protocolCount: protoCount.get(id) ?? 0,
      byProtocol: cell.get(id) ?? {},
    }))
    .sort((a, b) => b.tvlUsd - a.tvlUsd || b.protocolCount - a.protocolCount);

  return {
    chains,
    protocolCols,
    totalTvl,
    totalStreams,
    computedAt: freshest ? new Date(freshest).toISOString() : new Date().toISOString(),
  };
}
