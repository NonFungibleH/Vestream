// src/lib/vesting/chain-stats.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-chain vesting stats for the /chains/<slug> pages. Composes existing,
// already-defensible sources:
//   - readAllSnapshots()   → TVL + stream/token totals for this chain
//   - getUnlocksInWindow() → upcoming unlocks on this chain (chainId-filtered)
//   - listProtocols()      → which protocols are integrated on this chain
//
// "Never empty" UX, same as /protocols: readAllSnapshots short-circuits to []
// during `next build` (no reliable DB), which would prerender an empty page
// until ISR backfilled it. So on a good render we persist the result to the
// durable last-good store (page-data-fallback), and on an empty/degraded
// render (build phase, or a snapshot-read timeout) we serve that last-good
// instead of all-dashes. The store's READ deliberately runs at build too, so
// the build bakes real data from the previous deploy's last-good.
// ─────────────────────────────────────────────────────────────────────────────

import { after } from "next/server";
import { getUnlocksInWindow, enrichGroupsWithUsd, type WindowUnlockGroup } from "./unlock-windows";
import { readAllSnapshots, type ProtocolSnapshotRow } from "./tvl-snapshot";
import { listProtocols, publicChainIds, chainSlug } from "../protocol-constants";
import { withTimeout } from "../with-timeout";
import {
  getLastGoodChainData, setLastGoodChainData,
  getLastGoodChainsData, setLastGoodChainsData,
} from "./page-data-fallback";

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
  // NOTE: no build-phase EMPTY guard. readAllSnapshots (via withTimeout) and the
  // unlock query both fall back gracefully instead of throwing, so we let the
  // build prerender REAL data (TVL, streams, per-protocol) rather than serving
  // an empty page until ISR regenerates. Only the expensive unlock pricing is
  // skipped at build (below) to keep build times sane; it fills via ISR.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
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
  // Skip the (heavy) unlock-window pricing at build time only; it fills via ISR.
  if (!isBuild) {
    try {
      const win = await getUnlocksInWindow(nowSec, endSec, 5000, undefined, [chainId]);
      groups = win.groups;
      upcomingCount = win.stats.unlockCount || win.groups.length;
    } catch (err) {
      console.error(`[chain-stats/${chainId}] unlocks:`, err);
    }
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

  // "Has data" = the snapshot read actually returned rows for this chain. The
  // static protocol list is always populated, so it can't be the signal.
  const hasData = chainRows.length > 0;
  const isEmpty = chainRows.length === 0 && groups.length === 0 && protocolSlugs.length === 0;

  const result: ChainStats = {
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

  const slug = chainSlug(chainId);
  // No slug (unknown chain) → no stable last-good key; just return what we have.
  if (!slug) return result;
  if (hasData) {
    // Good render — keep the durable last-good fresh. In after() so the
    // fire-and-forget write can't flip this ISR render dynamic.
    after(() => setLastGoodChainData(slug, result));
    return result;
  }
  // Empty/degraded (build phase or snapshot timeout) — serve last-good if we
  // have one, else the genuinely-empty result (only until the first good
  // render populates the store).
  const lastGood = await getLastGoodChainData<ChainStats>(slug);
  return lastGood ?? result;
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

  // No build-phase guard: readAllSnapshots falls back to [] via withTimeout
  // rather than throwing, so the build prerenders the real leaderboard instead
  // of an empty page that ISR has to backfill.
  const snapshots = await withTimeout(readAllSnapshots(), 8_000, [] as ProtocolSnapshotRow[], "chains:snapshots");

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

  const result: ChainsOverview = {
    chains,
    protocolCols,
    totalTvl,
    totalStreams,
    computedAt: freshest ? new Date(freshest).toISOString() : new Date().toISOString(),
  };

  // Same last-good net as getChainStats: persist good renders, serve last-good
  // on an empty snapshot read (build phase / timeout) so the index is never
  // all-dashes on landing.
  if (snapshots.length > 0) {
    after(() => setLastGoodChainsData(result));
    return result;
  }
  const lastGood = await getLastGoodChainsData<ChainsOverview>();
  return lastGood ?? result;
}
