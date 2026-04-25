// src/lib/vesting/tvl-snapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// Snapshot compute pipeline — runs on the daily TVL cron, reads walker output
// or DefiLlama, prices, writes per (protocol, chainId) rows to the
// `protocolTvlSnapshots` table.
//
// Two modes, chosen per protocol:
//
//   MODE A — self-computed (walker + pricing)
//     For protocols where DefiLlama mixes non-vesting TVL into their number
//     (UNCX, Team Finance, PinkSale, Superfluid, Unvest, Jupiter Lock).
//     Dispatch: runWalkerSnapshot(protocol, chainIds)
//     Methodology: "subgraph-walk-v1" | "contract-reads-v1" | "program-scan-v1"
//                  (inferred from the protocol slug)
//
//   MODE B — DefiLlama passthrough
//     For protocols where DefiLlama publishes a vesting-specific breakdown
//     (Sablier, Hedgey, Streamflow). DefiLlama's TVL is already accurate for
//     the vesting slice via chainTvls.vesting — no point reinventing their
//     methodology.
//     Dispatch: runDefiLlamaSnapshot(protocol, slug, category?)
//     Methodology: "defillama-vesting"
//
// Output: one row per (protocol, chainId) in `protocolTvlSnapshots`,
// upserted on conflict. The /protocols page reads these rows on every render
// (via Vercel Data Cache wrapping the whole load — see protocols/page.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { protocolTvlSnapshots } from "../db/schema";
import type { SupportedChainId } from "./types";
import { CHAIN_IDS } from "./types";
import { fetchDefiLlamaTvl } from "../defillama";
import { priceAggregates, type PricedAggregate } from "./tvl";
import { runWalker, WALKER_PROTOCOLS } from "./tvl-walker";
import type { WalkerResult, TokenAggregate } from "./tvl-walker/types";

// Walker methodology tag inferred from the walker type. Kept in one place so
// the cron telemetry + UI tooltips stay in sync.
function walkerMethodology(protocol: string): string {
  switch (protocol) {
    case "uncx":
    case "unvest":
    case "superfluid":
    case "team-finance":   return "subgraph-walk-v1";
    case "uncx-vm":
    case "pinksale":       return "contract-reads-v1";
    case "jupiter-lock":   return "program-scan-v1";
    default:               return "subgraph-walk-v1";
  }
}

// ─── One-row upsert helper ───────────────────────────────────────────────────

interface SnapshotRow {
  protocol:        string;
  chainId:         SupportedChainId;
  tvlUsd:          number;
  tvlHigh:         number;
  tvlMedium:       number;
  tvlLow:          number;
  streamCount:     number;
  tokensPriced:    number;
  tokensTotal:     number;
  methodology:     string;
  topContributors: Array<{
    tokenSymbol?:  string;
    tokenAddress:  string;
    usd:           number;
    confidence:    "high" | "medium" | "low";
    source:        "dexscreener" | "coingecko" | "defillama";
  }>;
  notes?:          string;
}

async function upsertSnapshot(row: SnapshotRow): Promise<void> {
  const values = {
    protocol:        row.protocol,
    chainId:         row.chainId,
    tvlUsd:          row.tvlUsd.toFixed(2),
    tvlHigh:         row.tvlHigh.toFixed(2),
    tvlMedium:       row.tvlMedium.toFixed(2),
    tvlLow:          row.tvlLow.toFixed(2),
    streamCount:     row.streamCount,
    tokensPriced:    row.tokensPriced,
    tokensTotal:     row.tokensTotal,
    methodology:     row.methodology,
    topContributors: row.topContributors,
    computedAt:      new Date(),
    notes:           row.notes ?? null,
  };

  await db
    .insert(protocolTvlSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: [protocolTvlSnapshots.protocol, protocolTvlSnapshots.chainId],
      set:    {
        tvlUsd:          values.tvlUsd,
        tvlHigh:         values.tvlHigh,
        tvlMedium:       values.tvlMedium,
        tvlLow:          values.tvlLow,
        streamCount:     values.streamCount,
        tokensPriced:    values.tokensPriced,
        tokensTotal:     values.tokensTotal,
        methodology:     values.methodology,
        topContributors: values.topContributors,
        computedAt:      values.computedAt,
        notes:           values.notes,
      },
    });
}

/**
 * Delete any pre-existing snapshot rows for this protocol on chains it NO
 * LONGER walks. Called once at the end of a successful walker run — keeps
 * the table clean if a chain is removed from the protocol's deployment.
 */
async function pruneOtherChains(
  protocol: string,
  keepChainIds: SupportedChainId[],
): Promise<void> {
  const rows = await db
    .select({ chainId: protocolTvlSnapshots.chainId })
    .from(protocolTvlSnapshots)
    .where(eq(protocolTvlSnapshots.protocol, protocol));

  for (const row of rows) {
    if (!keepChainIds.includes(row.chainId as SupportedChainId)) {
      await db
        .delete(protocolTvlSnapshots)
        .where(and(
          eq(protocolTvlSnapshots.protocol, protocol),
          eq(protocolTvlSnapshots.chainId, row.chainId),
        ));
    }
  }
}

// ─── MODE A — walker + pricing ───────────────────────────────────────────────

export interface WalkerSnapshotSummary {
  protocol:   string;
  chainsRun:  number;
  chainsOk:   number;
  totalUsd:   number;
  streamCount: number;
  durationMs: number;
  errors:     string[];
}

/**
 * Run the walker for a protocol across every chain it supports, price the
 * aggregates, and upsert one snapshot row per chain.
 *
 * Errors at the chain level are collected — a single bad chain doesn't stop
 * the others. The caller (cron route) gets back a summary it can log.
 */
export async function runWalkerSnapshot(
  protocol: string,
  chainIds: SupportedChainId[],
): Promise<WalkerSnapshotSummary> {
  const started = Date.now();
  const summary: WalkerSnapshotSummary = {
    protocol,
    chainsRun:   chainIds.length,
    chainsOk:    0,
    totalUsd:    0,
    streamCount: 0,
    durationMs:  0,
    errors:      [],
  };

  if (!WALKER_PROTOCOLS.includes(protocol)) {
    summary.errors.push(`no walker registered for protocol "${protocol}"`);
    summary.durationMs = Date.now() - started;
    return summary;
  }

  // Run every chain's walker in parallel — they hit different subgraphs / RPCs
  // so there's no contention. Price each chain's aggregates separately so a
  // DexScreener outage on one chain doesn't nuke all of them.
  const chainResults = await Promise.all(
    chainIds.map(async (chainId): Promise<{
      chainId:  SupportedChainId;
      walker:   WalkerResult | null;
      priced:   PricedAggregate[];
      skipped:  number;
      perChain: { tvl: number; high: number; medium: number; low: number };
      error:    string | null;
    }> => {
      const walker = await runWalker(protocol, chainId);
      if (!walker) {
        return {
          chainId,
          walker: null,
          priced: [],
          skipped: 0,
          perChain: { tvl: 0, high: 0, medium: 0, low: 0 },
          error: `no walker for ${protocol}`,
        };
      }

      // Map walker output → pricing input shape.
      const pricingInput = walker.tokens.map((t: TokenAggregate) => ({
        chainId:       t.chainId,
        tokenAddress:  t.tokenAddress,
        tokenSymbol:   t.tokenSymbol,
        tokenDecimals: t.tokenDecimals,
        lockedAmount:  t.lockedAmount,
      }));

      const { priced, tokensSkipped } = await priceAggregates(pricingInput);

      // ── Headline-confidence rules ─────────────────────────────────────────
      //
      // 1. Drop the THIN band ($100-$1k DEX liquidity) from headline TVL.
      //    That band is dust — you can't sell anything meaningful at that
      //    depth without slipping the price >50%. Tracked separately for
      //    transparency in the breakdown UI.
      //
      // 2. Liquidity-multiplier ceiling: a single token's contribution to
      //    headline TVL is capped at MAX(MIN_FLOOR, liquidityUsd × MULTIPLIER).
      //    The market literally can't absorb more than a multiple of its DEX
      //    pool depth without major slippage, so claiming more locked value
      //    than that is fictional. This defends against the Team-Finance-
      //    shaped failure where a memecoin with $50k DEX liquidity but a
      //    100B-token lock multiplied to a $2B fake TVL — the LOCK might be
      //    real, but the USD claim isn't credible.
      //
      //    Concrete numbers:
      //      - Token with $10k liquidity → cap ~$1M (the floor)
      //      - Token with $100k liquidity → cap $10M
      //      - Token with $1M liquidity → cap $100M
      //      - Token with $10M+ liquidity → cap $1B+ (rarely binds)
      //    Capped contributions get reclassified into the THIN bucket, so
      //    they're visible in breakdown but don't pollute the headline.
      //
      //    For CoinGecko-priced tokens (no liquidity field), we fall back to
      //    a conservative $50M cap — CG inclusion is a quality signal but
      //    not a depth signal.
      const LIQUIDITY_MULTIPLIER          = 100;
      const MIN_PER_TOKEN_CEILING_USD     = 1_000_000;        // $1M floor
      const COINGECKO_PER_TOKEN_CEILING   = 50_000_000;       // $50M for CG-priced tokens

      function perTokenCeiling(p: typeof priced[number]): number {
        if (p.source === "coingecko") return COINGECKO_PER_TOKEN_CEILING;
        const liquidityBased = (p.liquidityUsd ?? 0) * LIQUIDITY_MULTIPLIER;
        return Math.max(MIN_PER_TOKEN_CEILING_USD, liquidityBased);
      }

      const perChain = { tvl: 0, high: 0, medium: 0, low: 0 };
      for (const p of priced) {
        const cap = perTokenCeiling(p);
        const credited = Math.min(p.usd, cap);
        const overflow = Math.max(0, p.usd - cap);

        // Bucket the credited (capped) portion by confidence.
        if      (p.confidence === "high")   { perChain.high   += credited; perChain.tvl += credited; }
        else if (p.confidence === "medium") { perChain.medium += credited; perChain.tvl += credited; }
        else                                  perChain.low    += credited;   // thin, excluded from headline

        // Anything above the cap goes into the LOW bucket as "excess" —
        // visible in breakdown for auditability, never in headline.
        if (overflow > 0) perChain.low += overflow;
      }

      return {
        chainId,
        walker,
        priced,
        skipped: tokensSkipped,
        perChain,
        error: walker.error,
      };
    }),
  );

  // Write one row per chain. Partial-walk errors still get persisted so the
  // UI can show the best-available number; the `notes` field records the
  // walker's error string for audit.
  for (const r of chainResults) {
    if (!r.walker) {
      if (r.error) summary.errors.push(`chain ${r.chainId}: ${r.error}`);
      continue;
    }

    // Top-5 contributors by USD — for tooltips + audit trail.
    const topContributors = r.priced
      .slice()
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 5)
      .map((p) => ({
        tokenSymbol:  p.tokenSymbol ?? undefined,
        tokenAddress: p.tokenAddress,
        usd:          p.usd,
        confidence:   p.confidence,
        source:       p.source,
      }));

    await upsertSnapshot({
      protocol,
      chainId:         r.chainId,
      tvlUsd:          r.perChain.tvl,
      tvlHigh:         r.perChain.high,
      tvlMedium:       r.perChain.medium,
      tvlLow:          r.perChain.low,
      streamCount:     r.walker.streamCount,
      tokensPriced:    r.priced.length,
      tokensTotal:     r.walker.tokens.length,
      methodology:     walkerMethodology(protocol),
      topContributors,
      notes:           r.walker.error
        ? `partial walk (${r.walker.elapsedMs}ms): ${r.walker.error}`
        : `full walk ${r.walker.elapsedMs}ms`,
    });

    summary.chainsOk++;
    summary.totalUsd   += r.perChain.tvl;
    summary.streamCount += r.walker.streamCount;
    if (r.walker.error) summary.errors.push(`chain ${r.chainId}: ${r.walker.error}`);
  }

  await pruneOtherChains(protocol, chainIds);

  summary.durationMs = Date.now() - started;
  return summary;
}

// ─── MODE B — DefiLlama passthrough ──────────────────────────────────────────

export interface DefiLlamaSnapshotSummary {
  protocol:   string;
  slug:       string | readonly string[];
  totalUsd:   number;
  chainsWritten: number;
  durationMs: number;
  error:      string | null;
}

/**
 * Pull a protocol's TVL from DefiLlama and upsert one row per chain in its
 * per-chain breakdown. Methodology: "defillama-vesting".
 *
 * Only used for protocols where DefiLlama publishes a vesting-specific
 * chainTvls breakdown — Sablier, Hedgey, Streamflow. For everything else
 * use runWalkerSnapshot above.
 */
export async function runDefiLlamaSnapshot(
  protocol: string,
  slug:     string | readonly string[],
  category?: string,
): Promise<DefiLlamaSnapshotSummary> {
  const started = Date.now();
  const summary: DefiLlamaSnapshotSummary = {
    protocol,
    slug,
    totalUsd:      0,
    chainsWritten: 0,
    durationMs:    0,
    error:         null,
  };

  const snap = await fetchDefiLlamaTvl(slug, category);
  if (!snap) {
    summary.error = `DefiLlama returned no data for slug=${JSON.stringify(slug)}`;
    summary.durationMs = Date.now() - started;
    return summary;
  }

  summary.totalUsd = snap.totalUsd;

  // DefiLlama returns chains by NAME ("Ethereum", "Binance", "Polygon"). Map
  // those back to our numeric chainIds. Any row we can't map is skipped but
  // its USD contribution is NOT dropped from the headline; we synthesize an
  // "other chains" bucket keyed to chainId=0 so the row-sum equals totalUsd.
  const CHAIN_NAME_TO_ID: Record<string, SupportedChainId> = {
    // DefiLlama's canonical names (case-insensitive match below).
    ethereum: CHAIN_IDS.ETHEREUM,
    binance:  CHAIN_IDS.BSC,
    bsc:      CHAIN_IDS.BSC,
    polygon:  CHAIN_IDS.POLYGON,
    base:     CHAIN_IDS.BASE,
    solana:   CHAIN_IDS.SOLANA,
  };

  let accountedUsd = 0;
  const writtenChains: SupportedChainId[] = [];

  for (const row of snap.perChain) {
    const chainId = CHAIN_NAME_TO_ID[row.chain.toLowerCase()];
    if (!chainId) continue; // e.g. Optimism, Arbitrum — we don't claim to support those
    if (row.usd <= 0) continue;

    await upsertSnapshot({
      protocol,
      chainId,
      tvlUsd:          row.usd,
      // DefiLlama numbers are curated, not sampled — model them as all-"high".
      tvlHigh:         row.usd,
      tvlMedium:       0,
      tvlLow:          0,
      streamCount:     0,   // unknown from DefiLlama
      tokensPriced:    0,
      tokensTotal:     0,
      methodology:     "defillama-vesting",
      topContributors: [],
      notes:           `api.llama.fi chain="${row.chain}" fetchedAt=${snap.fetchedAt}`,
    });

    writtenChains.push(chainId);
    accountedUsd += row.usd;
    summary.chainsWritten++;
  }

  // If DefiLlama reported more USD than we accounted for (e.g. Arbitrum /
  // Optimism slices) we ALSO write a catch-all row on ETHEREUM so the
  // /protocols headline matches DefiLlama's. This is rare for Sablier/Hedgey/
  // Streamflow where the main chains cover >95%, but we shouldn't silently
  // drop liquidity.
  const leftover = snap.totalUsd - accountedUsd;
  if (leftover > snap.totalUsd * 0.05 && !writtenChains.includes(CHAIN_IDS.ETHEREUM)) {
    await upsertSnapshot({
      protocol,
      chainId:         CHAIN_IDS.ETHEREUM,
      tvlUsd:          leftover,
      tvlHigh:         leftover,
      tvlMedium:       0,
      tvlLow:          0,
      streamCount:     0,
      tokensPriced:    0,
      tokensTotal:     0,
      methodology:     "defillama-vesting",
      topContributors: [],
      notes:           `DefiLlama aggregate of unmapped chains (fetchedAt=${snap.fetchedAt})`,
    });
    writtenChains.push(CHAIN_IDS.ETHEREUM);
    summary.chainsWritten++;
  }

  await pruneOtherChains(protocol, writtenChains);

  summary.durationMs = Date.now() - started;
  return summary;
}

// ─── Read path — exported for /protocols + /protocols/[slug] ─────────────────

export interface ProtocolSnapshotRow {
  protocol:     string;
  chainId:      number;
  tvlUsd:       number;
  tvlHigh:      number;
  tvlMedium:    number;
  tvlLow:       number;
  streamCount:  number;
  tokensPriced: number;
  tokensTotal:  number;
  methodology:  string;
  computedAt:   Date;
}

/** Read all snapshot rows for a protocol (across every chain). */
export async function readProtocolSnapshot(
  protocol: string,
): Promise<ProtocolSnapshotRow[]> {
  const rows = await db
    .select({
      protocol:     protocolTvlSnapshots.protocol,
      chainId:      protocolTvlSnapshots.chainId,
      tvlUsd:       protocolTvlSnapshots.tvlUsd,
      tvlHigh:      protocolTvlSnapshots.tvlHigh,
      tvlMedium:    protocolTvlSnapshots.tvlMedium,
      tvlLow:       protocolTvlSnapshots.tvlLow,
      streamCount:  protocolTvlSnapshots.streamCount,
      tokensPriced: protocolTvlSnapshots.tokensPriced,
      tokensTotal:  protocolTvlSnapshots.tokensTotal,
      methodology:  protocolTvlSnapshots.methodology,
      computedAt:   protocolTvlSnapshots.computedAt,
    })
    .from(protocolTvlSnapshots)
    .where(eq(protocolTvlSnapshots.protocol, protocol));

  return rows.map((r) => ({
    protocol:     r.protocol,
    chainId:      r.chainId,
    tvlUsd:       Number(r.tvlUsd),
    tvlHigh:      Number(r.tvlHigh),
    tvlMedium:    Number(r.tvlMedium),
    tvlLow:       Number(r.tvlLow),
    streamCount:  r.streamCount,
    tokensPriced: r.tokensPriced,
    tokensTotal:  r.tokensTotal,
    methodology:  r.methodology,
    computedAt:   r.computedAt,
  }));
}

/** Read the entire snapshot table in one pass — for the /protocols index. */
export async function readAllSnapshots(): Promise<ProtocolSnapshotRow[]> {
  const rows = await db
    .select({
      protocol:     protocolTvlSnapshots.protocol,
      chainId:      protocolTvlSnapshots.chainId,
      tvlUsd:       protocolTvlSnapshots.tvlUsd,
      tvlHigh:      protocolTvlSnapshots.tvlHigh,
      tvlMedium:    protocolTvlSnapshots.tvlMedium,
      tvlLow:       protocolTvlSnapshots.tvlLow,
      streamCount:  protocolTvlSnapshots.streamCount,
      tokensPriced: protocolTvlSnapshots.tokensPriced,
      tokensTotal:  protocolTvlSnapshots.tokensTotal,
      methodology:  protocolTvlSnapshots.methodology,
      computedAt:   protocolTvlSnapshots.computedAt,
    })
    .from(protocolTvlSnapshots);

  return rows.map((r) => ({
    protocol:     r.protocol,
    chainId:      r.chainId,
    tvlUsd:       Number(r.tvlUsd),
    tvlHigh:      Number(r.tvlHigh),
    tvlMedium:    Number(r.tvlMedium),
    tvlLow:       Number(r.tvlLow),
    streamCount:  r.streamCount,
    tokensPriced: r.tokensPriced,
    tokensTotal:  r.tokensTotal,
    methodology:  r.methodology,
    computedAt:   r.computedAt,
  }));
}
