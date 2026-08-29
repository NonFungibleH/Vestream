// src/lib/vesting/platform-stats.ts
// ─────────────────────────────────────────────────────────────────────────────
// Platform-wide vesting statistics — the numbers behind /methodology and
// /research/vesting-statistics (and citable "State of Token Vesting" data).
//
// Composes existing, already-defensible sources:
//   - readAllSnapshots()  → per-(protocol, chain) TVL (headline `tvlUsd` already
//     excludes the THIN dust band and caps single-token >$200M to high-confidence,
//     so the aggregate is the conservative headline, not an inflated one).
//   - getCacheStats()     → total streams + distinct recipient wallets.
//   - token_vesting_rollups count → distinct tokens with active vesting.
//
// Build-phase guarded (no reliable DB during `next build`) → ISR fills on first
// runtime request, same pattern as every other DB helper.
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import { db } from "../db";
import { readAllSnapshots, type ProtocolSnapshotRow } from "./tvl-snapshot";
import { listProtocols } from "../protocol-constants";
import { CHAIN_NAMES } from "./types";
import { withTimeout } from "../with-timeout";

export interface PlatformStats {
  protocolCount: number;
  chainCount:    number;
  tokenCount:    number;
  streamCount:   number;
  walletCount:   number;
  tvlUsd:        number;   // conservative headline (THIN excluded, per-token capped)
  byChain:       Array<{ chainId: number; chainName: string; tvlUsd: number }>;
  byProtocol:    Array<{ slug: string; name: string; tvlUsd: number }>;
  computedAt:    string;   // ISO — the freshest snapshot timestamp
  isEmpty:       boolean;
}

const EMPTY: PlatformStats = {
  protocolCount: 0, chainCount: 0, tokenCount: 0, streamCount: 0, walletCount: 0,
  tvlUsd: 0, byChain: [], byProtocol: [], computedAt: new Date(0).toISOString(), isEmpty: true,
};

// Distinct tokens with active vesting = one row per token in the rollup table.
// Retry once — a transient pooler blip here previously cached "0 tokens".
// Returns 0 only on genuine repeated failure (caller then falls back).
async function getRollupTokenCount(): Promise<number> {
  for (let i = 0; i < 2; i++) {
    try {
      const rows = (await db.execute(
        sql`SELECT count(*)::int AS "count" FROM token_vesting_rollups`,
      )) as unknown as Array<{ count: number }>;
      const c = rows?.[0]?.count;
      if (typeof c === "number" && c > 0) return c;
    } catch { /* retry */ }
    if (i === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return 0;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  if (process.env.NEXT_PHASE === "phase-production-build") return EMPTY;

  // Only two CHEAP queries, run concurrently + bounded. We deliberately do NOT
  // call getCacheStats here: its COUNT(DISTINCT recipient) over ~192k stream
  // rows is slow enough to (a) hang the ISR render and (b) starve these two of
  // a pooler connection (which showed up as "0 tokens"). Wallet count is
  // dropped for now — re-add later from a cheap precomputed source.
  const [snapshots, rollupTokens] = await Promise.all([
    withTimeout(readAllSnapshots(), 8_000, [] as ProtocolSnapshotRow[], "platform:snapshots"),
    withTimeout(getRollupTokenCount(), 10_000, 0, "platform:tokens"),
  ]);

  // Stream count from the cheap per-protocol snapshot rows (already fetched),
  // NOT a full stream-cache scan.
  const streamCount = snapshots.reduce((a, r) => a + (r.streamCount || 0), 0);
  // Prefer the accurate distinct-token rollup count; if that query failed
  // (returned 0), fall back to the snapshot token totals (already fetched, a
  // slight over-count) so the page NEVER renders "0 tokens".
  const snapshotTokens = snapshots.reduce((a, r) => a + (r.tokensTotal || 0), 0);
  const tokenCount = rollupTokens > 0 ? rollupTokens : snapshotTokens;
  const walletCount = 0; // best-effort stat dropped; pages hide it when 0

  if (snapshots.length === 0 && streamCount === 0) return EMPTY;

  // readAllSnapshots() rows key `protocol` on the protocol SLUG.
  const protoBySlug = new Map(listProtocols().map((p) => [p.slug, p]));

  // Aggregate TVL by chain and by protocol.
  const chainTvl = new Map<number, number>();
  const protoTvl = new Map<string, number>();
  let tvlUsd = 0;
  let freshest = 0;
  for (const r of snapshots) {
    tvlUsd += r.tvlUsd;
    chainTvl.set(r.chainId, (chainTvl.get(r.chainId) ?? 0) + r.tvlUsd);
    protoTvl.set(r.protocol, (protoTvl.get(r.protocol) ?? 0) + r.tvlUsd);
    const t = r.computedAt instanceof Date ? r.computedAt.getTime() : 0;
    if (t > freshest) freshest = t;
  }

  const byChain = [...chainTvl.entries()]
    .map(([chainId, v]) => ({ chainId, chainName: CHAIN_NAMES[chainId as keyof typeof CHAIN_NAMES] ?? `Chain ${chainId}`, tvlUsd: v }))
    .filter((c) => c.tvlUsd > 0)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  const byProtocol = [...protoTvl.entries()]
    .map(([slug, v]) => {
      const meta = protoBySlug.get(slug);
      return { slug: meta?.slug ?? slug, name: meta?.name ?? slug, tvlUsd: v };
    })
    .filter((p) => p.tvlUsd > 0)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  const protocols = listProtocols();
  const chainCount = new Set(protocols.flatMap((p) => p.chainIds)).size;

  return {
    protocolCount: protocols.length,
    chainCount,
    tokenCount,
    streamCount,
    walletCount,
    tvlUsd,
    byChain,
    byProtocol,
    computedAt: freshest ? new Date(freshest).toISOString() : new Date().toISOString(),
    isEmpty: false,
  };
}
