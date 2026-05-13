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
    /** Post-cap (credited) USD — matches what fed the headline. */
    usd:           number;
    /** Pre-cap raw USD — kept for forensic audit when cap binds. Optional
     *  because DefiLlama-passthrough rows don't go through capping. */
    usdRaw?:       number;
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
  //
  // CRITICAL — write each chain's snapshot as soon as IT completes, not after
  // Promise.all settles. If we wait for all chains, a single slow/hanging
  // chain will block ALL writes — and when Vercel kills the function at the
  // 300s maxDuration, we lose every successful chain's result. Confirmed in
  // production: UNCX-VM ETH (20s) + BSC (>300s with retries) caused ETH's
  // good result to never reach the database.
  //
  // Pattern below: each chain mapper does walker → price → upsert inline,
  // then returns its summary contribution. Promise.allSettled (not Promise.all)
  // ensures one chain throwing doesn't reject the whole batch.
  interface CreditedToken {
    chainId:      number;
    tokenAddress: string;
    tokenSymbol:  string | null;
    usdRaw:       number;
    usdCredited:  number;
    confidence:   "high" | "medium" | "low";
    source:       "dexscreener" | "defillama" | "coingecko";
  }

  const chainSettled = await Promise.allSettled(
    chainIds.map(async (chainId): Promise<{
      chainId:           SupportedChainId;
      walker:            WalkerResult | null;
      priced:            PricedAggregate[];
      skipped:           number;
      perChain:          { tvl: number; high: number; medium: number; low: number };
      creditedByToken:   CreditedToken[];
      error:             string | null;
      committed:         boolean;
    }> => {
      const walker = await runWalker(protocol, chainId);
      if (!walker) {
        return {
          chainId,
          walker: null,
          priced: [],
          skipped: 0,
          perChain: { tvl: 0, high: 0, medium: 0, low: 0 },
          creditedByToken: [],
          error: `no walker for ${protocol}`,
          committed: false,
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
      //    Multiplier 10x — empirically tuned in production (April 2026):
      //    100x left memecoin locks claiming hundreds of millions because
      //    their pool quotes were nominally HIGH-confidence (≥$10k liq) but
      //    the underlying token supply was 1T+. 10x is conservative against
      //    this failure mode while still letting properly-deep tokens (USDC,
      //    ETH, well-traded governance tokens) credit at face value.
      //
      //    Concrete numbers at 10x:
      //      - Token with $10k liquidity → cap = $1M (the floor)
      //      - Token with $100k liquidity → cap = $1M (still floor — 10x = $1M)
      //      - Token with $1M liquidity → cap = $10M
      //      - Token with $10M liquidity → cap = $100M
      //      - Token with $100M+ liquidity → cap = $1B+ (rarely binds)
      //    Capped contributions get reclassified into the THIN bucket, so
      //    they're visible in breakdown but don't pollute the headline.
      //
      //    For CoinGecko-priced tokens (no liquidity field), we fall back to
      //    a conservative $20M cap — CG inclusion is a quality signal but
      //    not a depth signal, and most CG-only tokens are early/thin.
      //
      // 3. ABSOLUTE per-token ceiling: no single token may contribute more
      //    than $500M to ANY protocol's headline TVL, regardless of confidence
      //    band or liquidity depth. Real-world legitimate single-token locks
      //    above $500M (e.g. major DAO treasury allocations) are rare and can
      //    be whitelisted later if needed; below the ceiling, real locks pass
      //    through unaffected.
      //
      //    This caught Jupiter Lock pre-fix: a Solana memecoin with $300M+
      //    DEX liquidity and a 65T-unit lock was claiming $3.24B credited
      //    even after the 10x rule (because $300M × 10 = $3B headroom).
      //    Empirical: dropped Jupiter Lock from $3.65B → ~$700M-$1B with no
      //    impact on any of the other 8 protocols.
      const LIQUIDITY_MULTIPLIER             = 10;
      const MIN_PER_TOKEN_CEILING_USD        = 1_000_000;        // $1M floor
      const COINGECKO_PER_TOKEN_CEILING      = 20_000_000;       // $20M for CG-priced tokens
      const ABSOLUTE_PER_TOKEN_CEILING_USD   = 500_000_000;      // $500M hard ceiling

      // ── Band-specific per-token ceilings (May 10 2026) ────────────────
      //
      // Rationale: launchpad-category protocols (PinkSale, etc.) lock
      // thousands of small-cap project tokens whose individual liquidity
      // is in the $100-$1k DEX-pool range. Most of those tokens are real
      // — small projects with thin pools — but the previous "exclude LOW
      // band entirely" rule erased their value from the headline.
      //
      // Inverse failure mode: a single phantom dust token with massive
      // locked-unit count × tiny price could ride the liquidity-multiplier
      // cap up to $500M and dominate the headline. Symbol verification +
      // absolute ceiling catch the worst cases but a quieter $50M phantom
      // can still slip through.
      //
      // Both failures reduce to "one cap fits all bands"; the fix is to
      // apply BAND-SPECIFIC ceilings so individual contributions can't
      // dominate but aggregate small-token value still shows up:
      //
      //   HIGH   ($10k+ liquidity):  cap $200M per token. Real DAO/team
      //                              allocations rarely cross this; if they
      //                              do they're probably worth a manual
      //                              whitelist (not silent inflation).
      //   MEDIUM ($1k-$10k):         cap $10M per token. Genuine projects
      //                              with $1k-$10k liquidity rarely have
      //                              single-token locks worth more than
      //                              this. Above this is almost certainly
      //                              a thin-pair phantom.
      //   LOW    ($100-$1k):         cap $500K per token. Real micro-cap
      //                              project locks individually small;
      //                              aggregating across hundreds of them
      //                              still produces meaningful $millions
      //                              of headline TVL. Phantoms get
      //                              clipped hard.
      //
      // Combined with this change: LOW band now feeds headline at 100%
      // (was 50%). The 50% discount existed because the OLD cap let
      // single tokens contribute up to $500M to LOW, so we discounted
      // the entire LOW pool to dampen phantom risk. With the new $500K
      // per-token cap on LOW, the per-token risk is bounded directly,
      // so no further discount needed.
      //
      // Net effect: launchpad protocols (PinkSale particularly) move from
      // "feels too low" to "looks reasonable" without opening any path
      // for phantom inflation. The Polygon $233M LOW pool gets sifted
      // — real long tail of $1-$50K-each tokens contributes its true
      // sum, the trillion-unit memecoins get clipped at $500K each.
      const HIGH_BAND_CEILING_USD   = 200_000_000;   // $200M per HIGH-band token
      const MEDIUM_BAND_CEILING_USD = 10_000_000;    // $10M per MEDIUM-band token
      const LOW_BAND_CEILING_USD    = 500_000;       // $500K per LOW-band token

      function perTokenCeiling(p: typeof priced[number]): number {
        let cap: number;
        // CoinGecko + DefiLlama both expose price WITHOUT liquidity, so the
        // liquidity-multiplier-based cap can't apply. Use the CoinGecko
        // ceiling for both — same conservative band, same defence against
        // memecoin price-times-quantity inflation when we can't verify
        // depth on a DEX.
        if (p.source === "coingecko" || p.source === "defillama") {
          cap = COINGECKO_PER_TOKEN_CEILING;
        } else {
          const liquidityBased = (p.liquidityUsd ?? 0) * LIQUIDITY_MULTIPLIER;
          cap = Math.max(MIN_PER_TOKEN_CEILING_USD, liquidityBased);
        }
        // Apply band-specific ceiling — tighter than the absolute $500M for
        // medium and low bands. See comment block above for rationale.
        const bandCeiling =
          p.confidence === "high"   ? HIGH_BAND_CEILING_USD
          : p.confidence === "medium" ? MEDIUM_BAND_CEILING_USD
          : LOW_BAND_CEILING_USD;
        cap = Math.min(cap, bandCeiling);
        // Apply absolute ceiling — defence in depth in case any band
        // ceiling is later raised above the absolute. Currently redundant
        // with HIGH_BAND_CEILING ≤ ABSOLUTE.
        return Math.min(cap, ABSOLUTE_PER_TOKEN_CEILING_USD);
      }

      // Per-token after-cap totals, used for both the per-band sums AND for
      // the top-contributors list — so the audit trail shows what was
      // actually credited rather than misleadingly large raw values.
      const creditedByToken: Array<{
        chainId:      number;
        tokenAddress: string;
        tokenSymbol:  string | null;
        usdRaw:       number;   // pre-cap value (kept for forensic audit)
        usdCredited:  number;   // post-cap value (what fed the headline)
        confidence:   "high" | "medium" | "low";
        source:       "dexscreener" | "defillama" | "coingecko";
      }> = [];

      // ── Symbol-verification guard (May 5 2026) ────────────────────────
      //
      // Defends against Jupiter Lock-shape failures: Solana memecoin
      // escrows where billions/trillions of token units sit locked,
      // priced via DexScreener at a fraction of a cent each. The token
      // has thin DEX liquidity (often $50–$500k), but enough that the
      // multiplier × liquidity rule lets it ride to the $500M absolute
      // ceiling. Multiple such tokens can each ride the ceiling and
      // sum to multi-billion-dollar headlines.
      //
      // Empirical signal: those tokens never have a real symbol. They
      // surface as the address-fragment fallback (e.g. "5US2…",
      // "CkWg…") because token-list resolution failed. Real, indexable
      // tokens have human-readable symbols (3–10 chars, alpha-heavy).
      //
      // Rule: a token without a real-shaped symbol cannot enter the
      // HIGH band. Demote to LOW (still visible in breakdown for
      // forensic audit, never in headline). Doesn't affect well-known
      // tokens (JUP, SOL, USDC, NOVA, etc.) — they all pass.
      //
      // Pattern: 2–10 chars, mostly alphanumeric, with at least one
      // letter (excludes pure numbers and ellipsis fragments). Rejects
      // "5US2…" (has "…"), "0x1234abcd" (10+ chars, hex-shaped),
      // null/empty, and "???" (the walker's failure marker).
      const REAL_SYMBOL_RE = /^[A-Za-z][A-Za-z0-9$.-]{1,9}$/;
      function hasRealSymbol(symbol: string | null): boolean {
        if (!symbol) return false;
        if (symbol === "???") return false;
        return REAL_SYMBOL_RE.test(symbol);
      }

      // ── LOW band headline credit (May 10 2026 update) ────────────────
      //
      // History:
      //  • Originally: LOW band excluded from headline entirely.
      //  • May 5 2026: credited at 50% discount (LOW_BAND_HEADLINE_DISCOUNT
      //    = 0.5) so launchpad protocols stopped looking artificially small,
      //    while damping phantom risk (one bad token couldn't fully
      //    inflate the headline because half of its credited value was
      //    excluded).
      //  • May 10 2026: credited at 100% — see the band-specific per-token
      //    ceilings above. With LOW_BAND_CEILING_USD = $500K per token,
      //    the per-token phantom risk is bounded directly. The aggregate
      //    discount was a coarse damping signal that no longer adds value
      //    once the per-token cap is tight; keeping it would just
      //    suppress real long-tail value pointlessly.
      const LOW_BAND_HEADLINE_DISCOUNT = 1.0;

      const perChain = { tvl: 0, high: 0, medium: 0, low: 0 };
      for (const p of priced) {
        const cap = perTokenCeiling(p);
        const credited = Math.min(p.usd, cap);
        const overflow = Math.max(0, p.usd - cap);

        // Demote unverified-symbol tokens before bucketing. Their
        // pricing remains visible in tvl_low for transparency, but
        // they never feed the headline regardless of liquidity depth.
        const effectiveConfidence: "high" | "medium" | "low" =
          (p.confidence === "high" && !hasRealSymbol(p.tokenSymbol))
            ? "low"
            : p.confidence;

        // Bucket the credited (capped) portion by confidence.
        if      (effectiveConfidence === "high")   { perChain.high   += credited; perChain.tvl += credited; }
        else if (effectiveConfidence === "medium") { perChain.medium += credited; perChain.tvl += credited; }
        else {
          // LOW band: full value in tvl_low for audit, half value in
          // headline so thin-pool dollars still show up but at a
          // realistic discount.
          perChain.low += credited;
          perChain.tvl += credited * LOW_BAND_HEADLINE_DISCOUNT;
        }

        // Anything above the cap goes into the LOW bucket as "excess" —
        // visible in breakdown for auditability, never in headline.
        if (overflow > 0) perChain.low += overflow;

        creditedByToken.push({
          chainId:      p.chainId,
          tokenAddress: p.tokenAddress,
          tokenSymbol:  p.tokenSymbol,
          usdRaw:       p.usd,
          usdCredited:  credited,
          confidence:   effectiveConfidence,
          source:       p.source,
        });
      }

      // Top-5 contributors by USD CREDITED (post-cap) — matches what actually
      // fed the headline. The pre-cap raw value is kept in topContributors
      // alongside the credited amount for forensic audit, but the sort is on
      // the credited contribution so the row reflects real impact.
      const topContributors = creditedByToken
        .slice()
        .sort((a, b) => b.usdCredited - a.usdCredited)
        .slice(0, 5)
        .map((p) => ({
          tokenSymbol:  p.tokenSymbol ?? undefined,
          tokenAddress: p.tokenAddress,
          usd:          p.usdCredited,         // post-cap, matches headline
          usdRaw:       p.usdRaw,              // pre-cap, for audit
          confidence:   p.confidence,
          source:       p.source,
        }));

      // ── Pricing-failure guard (May 11 2026) ──────────────────────────
      //
      // When DexScreener + CoinGecko both rate-limit us (HTTP 429), priced[]
      // comes back near-empty and perChain.tvl collapses to near-zero. If we
      // blindly upsert that, we OVERWRITE yesterday's good row with today's
      // broken-pricing row — the headline TVL degrades every night the
      // pricing APIs misbehave. Observed empirically: PinkSale went from
      // $44.6M → $34.9M overnight (May 10 → 11) because pricing rate-limited.
      //
      // Rule: if the walker discovered a meaningful population of tokens
      // (>= MIN_TOKENS) but we managed to price less than MIN_RATIO of them,
      // assume the pricing pipeline is broken and KEEP THE EXISTING ROW.
      //
      // We deliberately don't gate on "tvl crashed by X%" because legitimate
      // sudden drops (a major DAO unlocked, a token went to zero) shouldn't
      // be hidden. The pricing-coverage signal is upstream-pipeline-health,
      // not market-data, so it's the right thing to gate on.
      //
      // First-time snapshots (no prior row) skip the guard — preserving a
      // non-existent row is meaningless. The guard kicks in once we have
      // historical data to protect.
      const PRICING_GUARD_MIN_TOKENS    = 50;
      const PRICING_GUARD_MIN_RATIO     = 0.05;
      // Smarter guard tier added 2026-05-11. Catches the failure mode where
      // 5-15% of tokens get priced (so coverage looks "ok") but they happen
      // to be the smallest ones — headline drops dramatically vs prior row.
      // Observed empirically: PinkSale $44.6M → $34.9M overnight when partial
      // pricing succeeded but the largest contributors weren't among the
      // priced subset. A "tvlUsd dropped >50% vs prior" check would have
      // preserved the prior row and waited for the next cron to retry.
      const PRICING_GUARD_DROP_RATIO    = 0.50;  // preserve if new < 50% of prior
      const PRICING_GUARD_MIN_PRIOR_USD = 1_000; // skip the drop check for tiny protocols
      const tokensTotal  = walker.tokens.length;
      const tokensPriced = priced.length;
      const coverageOk =
        tokensTotal < PRICING_GUARD_MIN_TOKENS ||
        tokensPriced / tokensTotal >= PRICING_GUARD_MIN_RATIO;

      // Fetch prior row once for both guard tiers (cheap; one indexed row).
      const priorRow = await readSnapshotRow(protocol, chainId).catch(() => null);
      const newTvl   = perChain.tvl;
      const priorTvl = priorRow?.tvlUsd ?? 0;

      // Tier 2 guard: TVL dropped >50% vs prior, and prior was meaningful.
      // We DON'T also require low coverage here — a partial-pricing-but-
      // looks-ok-on-coverage scenario is the exact case this catches.
      const tvlCrashed =
        priorTvl > PRICING_GUARD_MIN_PRIOR_USD &&
        newTvl   < priorTvl * PRICING_GUARD_DROP_RATIO;

      let committed = false;
      let skipped   = false;
      if (priorRow && (!coverageOk || tvlCrashed)) {
        // We keep the prior row. If no prior exists, we let the row write
        // through — a partial number beats no row at all for first-time
        // snapshots.
        const reason = !coverageOk
          ? `pricing coverage ${tokensPriced}/${tokensTotal} ` +
            `(${(100 * tokensPriced / tokensTotal).toFixed(1)}%) below ${100 * PRICING_GUARD_MIN_RATIO}% threshold`
          : `new TVL $${newTvl.toFixed(0)} dropped >${100 * (1 - PRICING_GUARD_DROP_RATIO)}% vs prior $${priorTvl.toFixed(0)}`;
        console.warn(
          `[snapshot] ${protocol}/${chainId}: ${reason} — keeping prior row ` +
          `(computedAt=${priorRow.computedAt.toISOString()}, tvlUsd=$${priorTvl.toFixed(0)})`,
        );
        skipped = true;
      }

      // Commit IMMEDIATELY so this chain's result survives even if a sibling
      // chain hangs and Vercel kills the function. See note above the
      // Promise.allSettled call.
      if (!skipped) {
        try {
          await upsertSnapshot({
            protocol,
            chainId,
            tvlUsd:          perChain.tvl,
            tvlHigh:         perChain.high,
            tvlMedium:       perChain.medium,
            tvlLow:          perChain.low,
            streamCount:     walker.streamCount,
            tokensPriced,
            tokensTotal,
            methodology:     walkerMethodology(protocol),
            topContributors,
            notes:           walker.error
              ? `partial walk (${walker.elapsedMs}ms): ${walker.error}`
              : `full walk ${walker.elapsedMs}ms`,
          });
          committed = true;
        } catch (dbErr) {
          console.error(`[snapshot] upsert failed for ${protocol}/${chainId}:`, dbErr);
        }
      }

      return {
        chainId,
        walker,
        priced,
        skipped: tokensSkipped,
        perChain,
        creditedByToken,
        error: walker.error,
        committed,
      };
    }),
  );

  // Aggregate the summary from settled results — Promise.allSettled means
  // one chain rejecting (e.g. timeout) doesn't poison the others. Each
  // fulfilled result has already had its row committed inline above.
  for (const settled of chainSettled) {
    if (settled.status === "rejected") {
      const reason = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      summary.errors.push(`chain rejected: ${reason}`);
      continue;
    }
    const r = settled.value;
    if (!r.walker) {
      if (r.error) summary.errors.push(`chain ${r.chainId}: ${r.error}`);
      continue;
    }
    if (r.committed) summary.chainsOk++;
    summary.totalUsd    += r.perChain.tvl;
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
    ethereum:     CHAIN_IDS.ETHEREUM,
    binance:      CHAIN_IDS.BSC,
    bsc:          CHAIN_IDS.BSC,
    polygon:      CHAIN_IDS.POLYGON,
    base:         CHAIN_IDS.BASE,
    arbitrum:     CHAIN_IDS.ARBITRUM,
    "arbitrum one": CHAIN_IDS.ARBITRUM,
    optimism:     CHAIN_IDS.OPTIMISM,
    "op mainnet": CHAIN_IDS.OPTIMISM,
    solana:       CHAIN_IDS.SOLANA,
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

  // Intentionally NO leftover-on-Ethereum catch-all. Sablier/Hedgey deploy
  // on 30+ chains; Vestream only indexes 6. Dumping the unaccounted USD onto
  // the ETH row would inflate it by ~$300M (Linea, Avalanche, Scroll, etc.)
  // and misrepresent which chains we actually cover. The headline is now
  // explicitly "Vestream-scope TVL = sum of chains we index" — apples-to-
  // apples with our self-indexed protocols (UNCX, Unvest, etc.).
  //
  // The summary.totalUsd below reflects that scoped sum, not DefiLlama's
  // global figure.
  summary.totalUsd = accountedUsd;

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
/**
 * Read the single (protocol, chainId) snapshot row, if it exists.
 *
 * Used by the pricing-failure guard in runWalkerSnapshot — when today's
 * pricing fetch fails too many tokens, we check whether a prior row
 * exists for this cell; if yes, we keep it (don't overwrite with broken
 * data). If no prior row exists, we let the partial write through so
 * first-time snapshots aren't blocked.
 *
 * Build-time guard intentionally omitted — this is only called from the
 * cron path (server-only), never during page render / build.
 */
async function readSnapshotRow(
  protocol: string,
  chainId:  number,
): Promise<ProtocolSnapshotRow | null> {
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
    .where(and(
      eq(protocolTvlSnapshots.protocol, protocol),
      eq(protocolTvlSnapshots.chainId,  chainId),
    ))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
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
  };
}

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
  // Build-time guard — see CLAUDE.md landmine. /protocols (cached) and
  // /status (revalidate=60) both call this; transient pooler drops mid-
  // build have killed builds before. ISR fills with real data on the
  // first runtime request.
  if (process.env.NEXT_PHASE === "phase-production-build") return [];

  // 2026-05-13: hard 2s timeout. Caller is loadStatusData via Promise.all;
  // a hang here would block the page past Cloudflare's gateway timeout.
  // Empty array on either timeout or query rejection — TVL columns blank
  // out while the rest of the matrix renders.
  const queryPromise = db
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
    .then((rows): ProtocolSnapshotRow[] => rows.map((r) => ({
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
    })))
    .catch((err): ProtocolSnapshotRow[] => {
      console.warn(
        `[tvl-snapshot] readAllSnapshots failed: ${err instanceof Error ? err.message : err}`,
      );
      return [];
    });

  return Promise.race([
    queryPromise,
    new Promise<ProtocolSnapshotRow[]>((resolve) =>
      setTimeout(() => {
        console.warn("[tvl-snapshot] readAllSnapshots exceeded 2s — returning []");
        resolve([]);
      }, 2000),
    ),
  ]);
}
