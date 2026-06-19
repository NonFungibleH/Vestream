// src/app/api/cron/smart-money/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Daily cron — builds the smart-money leaderboard snapshot.
//
// Schedule (vercel.json): 30 3 * * *  — 03:30 UTC, after the seed-cache
// (03:00) finishes refreshing vestingStreamsCache and after tvl-snapshot
// (03:15) finishes its own work, so we're aggregating off the freshest
// possible cache without contending for the pool.
//
// Why a cron + snapshot table, not a live query: the source aggregation
// (GROUP BY recipient on a 189k-row table) takes ~22s in prod — fine for
// a cron, not for a page render. See smart-money-snapshot table comment
// in schema.ts.
//
// Pipeline:
//   1. TWO candidate pools, unioned (excluding denylist + fully-vested streams,
//      so we surface ACTIVE smart money): (a) by distinct (chain, token) count
//      — breadth; (b) by approximate locked USD via the price-cache join —
//      value. Pool (b) is essential: ranking by breadth alone buries the funds,
//      because a treasury vesting one big liquid position has a tiny token
//      count. Both pools are wider than the leaderboard so Phase 4 has room.
//   2. For the candidates, fetch per-wallet token totals + classify ecosystem.
//   3. Price each wallet's tokens via DexScreener (batched).
//   4. Re-rank by a USD-weighted composite (locked-value + token-breadth),
//      then cut to the leaderboard size.
//   5. DELETE existing snapshot, bulk INSERT new rows in a transaction.
//
// Auth: same Bearer-token gate as the other crons.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";
import { db } from "@/lib/db";
import { smartMoneySnapshot, vestingStreamsCache, tokenPricesCache } from "@/lib/db/schema";
import { sql, eq, and, inArray, notInArray } from "drizzle-orm";
// (no extra import needed — inArray covers the protocol filter)
import { isSmartMoneyDenied, SMART_MONEY_DENYLIST } from "@/lib/vesting/smart-money-denylist";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5min ceiling — the aggregate alone is ~22s

const LEADERBOARD_SIZE = 100;
const TOP_TOKENS_PER_WALLET = 3;

// Composite ranking — USD-weighted blend. A wallet's final rank is
//   0.6·(locked-USD percentile) + 0.4·(distinct-token-count percentile)
// computed within the candidate pool. USD leads because real locked value is
// the stronger "smart money" signal, but token-count keeps broad-but-unpriced
// wallets visible — only ~12% of vesting tokens carry a DEX price, so a
// pure-USD sort would bury most of the board.
const USD_WEIGHT = 0.6;
const COUNT_WEIGHT = 0.4;

// Pull a wider candidate net than the leaderboard size. Phase 1 can only
// prefilter by token-count (USD isn't known until pricing in Phase 3), so a
// high-value / moderate-breadth wallet could sit below a pure top-100 cut by
// count. 4× headroom lets the composite promote it. (A pure single-token whale
// below this count cutoff still won't appear — acceptable: real funds vest
// more than one or two tokens.)
const CANDIDATE_POOL = LEADERBOARD_SIZE * 4;

// Protocols included in the leaderboard. Investor-vesting / streaming
// protocols only — UNCX, UNCX-VM, PinkSale, and LlamaPay are EXCLUDED
// because their dominant use case is liquidity-pair lockers (UNI-V2 / PCS
// LP tokens being locked by launchpad creators). Verified on the seed
// run 2026-06-12: when those protocols were included, the top 5 EVM
// wallets all surfaced "UNI-V2" token vestings — clearly liquidity-lock
// plumbing, not fund/whale activity. The cleanly-vesting protocols
// (Sablier, Hedgey, Unvest, Superfluid, Streamflow, Jupiter Lock) all
// deal with real project tokens, which is what the "smart money" signal
// is about. Re-add if/when those protocols expose a way to tell vesting
// from LP-lock at the row level.
const SMART_MONEY_PROTOCOLS = [
  "sablier", "hedgey", "unvest", "superfluid", "streamflow", "jupiter-lock",
] as const;

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const denyArr = [...SMART_MONEY_DENYLIST];

  // ── Phase 1: candidate pool by distinct token count ──────────────────────
  // active streams only (isFullyVested = false). Filter denylist in SQL so
  // we don't waste a slot on noise that we'd just drop in Phase 2. This is a
  // wide net (CANDIDATE_POOL) — the real ranking happens in Phase 4 once we
  // have USD values.
  const aggregateRows = await db
    .select({
      recipient:          vestingStreamsCache.recipient,
      distinctTokenCount: sql<number>`COUNT(DISTINCT (${vestingStreamsCache.chainId}::text || ':' || lower(${vestingStreamsCache.tokenAddress})))`.as("distinct_token_count"),
      streamCount:        sql<number>`COUNT(*)`.as("stream_count"),
    })
    .from(vestingStreamsCache)
    .where(
      and(
        eq(vestingStreamsCache.isFullyVested, false),
        inArray(vestingStreamsCache.protocol, [...SMART_MONEY_PROTOCOLS]),
        // Defensive — Solana addresses won't match this EVM-string set,
        // but EVM ones will.
        denyArr.length > 0 ? notInArray(vestingStreamsCache.recipient, denyArr) : undefined,
      ),
    )
    .groupBy(vestingStreamsCache.recipient)
    .orderBy(sql`distinct_token_count DESC`)
    .limit(CANDIDATE_POOL); // Wide net — Phase 4 composite re-rank trims to LEADERBOARD_SIZE.

  const aggregateMs = Date.now() - t0;
  console.log(`[smart-money] phase 1 done: ${aggregateRows.length} rows in ${aggregateMs}ms`);

  // Belt-and-suspenders denylist trim (in case the Solana side surfaces
  // anything we want to skip later).
  const countRecipients = aggregateRows
    .map((r) => r.recipient)
    .filter((r): r is string => !!r && !isSmartMoneyDenied(r));

  // ── Phase 1b: value-seeded candidate pool ────────────────────────────────
  // The count pool above is selected purely by token breadth, which skews hard
  // toward Solana pump.fun-style dust aggregators (hundreds of unpriceable
  // memecoins). That STRUCTURALLY EXCLUDES the funds we actually want: a
  // treasury vesting one or two large, liquid positions has a tiny token count
  // and never makes the top-N-by-count cut, so its real USD never enters the
  // ranking (observed: only ~48/100 of the count-pool board had any priced
  // value, and the single biggest wallet by USD sat outside the top 10).
  //
  // So we add a second pool ranked by approximate locked USD, joining the price
  // cache. The liquidity floor keeps thin-pair memecoins — whose trillion-unit
  // balances × a dust price inflate to fake millions — out of the value seed
  // (the fake-TVL failure mode documented in CLAUDE.md's TVL methodology). We
  // only take the recipient list here; the DISPLAYED USD is recomputed in
  // Phase 4 from the same priceMap as every other wallet (single source of
  // truth — this SQL sum is candidate-selection only).
  const VALUE_SEED_LIQUIDITY_FLOOR = 1000;
  // Realizable USD per position = LEAST(price × amount, pool liquidity), summed
  // per wallet — same cap Phase 4 applies, so the seed and the display agree.
  const lockedUsdExpr = sql`SUM( LEAST(
    (${vestingStreamsCache.streamData}->>'lockedAmount')::numeric
      / power(10, COALESCE(NULLIF(${vestingStreamsCache.streamData}->>'tokenDecimals', '')::int, 18))
      * ${tokenPricesCache.priceUsd},
    COALESCE(${tokenPricesCache.liquidityUsd}, 0)
  ) )`;
  const valueRows = await db
    .select({ recipient: vestingStreamsCache.recipient })
    .from(vestingStreamsCache)
    .innerJoin(
      tokenPricesCache,
      sql`${tokenPricesCache.chainId} = ${vestingStreamsCache.chainId} AND ${tokenPricesCache.tokenAddress} = lower(${vestingStreamsCache.tokenAddress})`,
    )
    .where(
      and(
        eq(vestingStreamsCache.isFullyVested, false),
        inArray(vestingStreamsCache.protocol, [...SMART_MONEY_PROTOCOLS]),
        sql`${tokenPricesCache.priceUsd} > 0`,
        sql`COALESCE(${tokenPricesCache.liquidityUsd}, 0) >= ${VALUE_SEED_LIQUIDITY_FLOOR}`,
        // Guard the ::numeric cast — only sum rows whose lockedAmount is digits.
        sql`${vestingStreamsCache.streamData}->>'lockedAmount' ~ '^[0-9]+$'`,
        denyArr.length > 0 ? notInArray(vestingStreamsCache.recipient, denyArr) : undefined,
      ),
    )
    .groupBy(vestingStreamsCache.recipient)
    .orderBy(sql`${lockedUsdExpr} DESC`)
    .limit(CANDIDATE_POOL);
  const valueRecipients = valueRows
    .map((r) => r.recipient)
    .filter((r): r is string => !!r && !isSmartMoneyDenied(r));

  console.log(`[smart-money] candidate pools: ${countRecipients.length} by-count, ${valueRecipients.length} by-value`);

  // ── Phase 2: per-wallet token breakdown + ecosystem classification ───────
  // Union the two pools (dedup), then pull all token rows for the lot so we
  // can price + composite-rank them together.
  const recipients = [...new Set([...countRecipients, ...valueRecipients])];
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, message: "no candidates", durationMs: Date.now() - t0 });
  }

  const tokenRows = await db
    .select({
      recipient:    vestingStreamsCache.recipient,
      chainId:      vestingStreamsCache.chainId,
      tokenAddress: vestingStreamsCache.tokenAddress,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        eq(vestingStreamsCache.isFullyVested, false),
        inArray(vestingStreamsCache.protocol, [...SMART_MONEY_PROTOCOLS]),
        inArray(vestingStreamsCache.recipient, recipients),
      ),
    );

  // Aggregate locked amount + collect decimals/symbol per (recipient, chain, token).
  type TokenAgg = {
    recipient:    string;
    chainId:      number;
    tokenAddress: string;
    symbol:       string | null;
    decimals:     number;
    lockedRaw:    bigint;
  };
  const aggMap = new Map<string, TokenAgg>();
  // Raw stream (row) count per recipient — the "Streams" column. Counted
  // before the tokenAddress guard so it matches Phase 1's COUNT(*) semantics.
  const streamCountByRecipient = new Map<string, number>();
  for (const r of tokenRows) {
    streamCountByRecipient.set(r.recipient, (streamCountByRecipient.get(r.recipient) ?? 0) + 1);
    if (!r.tokenAddress) continue;
    const sd = r.streamData as { lockedAmount?: string; totalAmount?: string; tokenDecimals?: number };
    const rawAmount = sd.lockedAmount ?? sd.totalAmount ?? "0";
    let amt = 0n;
    try { amt = BigInt(rawAmount); } catch { /* keep 0 */ }
    const key = `${r.recipient}|${r.chainId}|${r.tokenAddress.toLowerCase()}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.lockedRaw += amt;
    } else {
      aggMap.set(key, {
        recipient:    r.recipient,
        chainId:      r.chainId,
        tokenAddress: r.tokenAddress,
        symbol:       r.tokenSymbol ?? null,
        decimals:     typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
        lockedRaw:    amt,
      });
    }
  }

  // ── Phase 3: value every position from the price cache ───────────────────
  // We read token_prices_cache (the durable, cron-maintained price table) in
  // one shot rather than calling the live DexScreener path. Two reasons:
  //   1. Consistency — the value-seeded candidate pool (Phase 1b) already
  //      ranks off this table; Phase 4's displayed USD must agree with it.
  //   2. The live path was throttling to ~1% coverage on this token volume,
  //      and a single indexed read of ~1.5k cached rows is both faster and
  //      complete. Tokens absent from the cache are dust (the refresh cron
  //      skips anything under ~$100 liquidity) → treated as unpriced.
  // The whole priced table is tiny (~1.5k rows), so we load it all and map it.
  const priceRows = await db
    .select({
      chainId:      tokenPricesCache.chainId,
      tokenAddress: tokenPricesCache.tokenAddress, // stored lowercased
      priceUsd:     tokenPricesCache.priceUsd,
      liquidityUsd: tokenPricesCache.liquidityUsd,
    })
    .from(tokenPricesCache)
    .where(sql`${tokenPricesCache.priceUsd} > 0`);
  type PriceInfo = { price: number; liquidity: number };
  const priceInfo = new Map<string, PriceInfo>();
  for (const r of priceRows) {
    priceInfo.set(`${r.chainId}:${r.tokenAddress.toLowerCase()}`, {
      price:     Number(r.priceUsd),
      liquidity: r.liquidityUsd != null ? Number(r.liquidityUsd) : 0,
    });
  }
  console.log(`[smart-money] loaded ${priceInfo.size} cached token prices`);

  // Realizable USD: a vesting position can't be exited for more than the
  // token's pool depth, so we cap price×amount at the DEX liquidity. This is
  // the honest valuation — without it, thin-pair memecoins (e.g. a token with
  // $26k liquidity quoting a $22.96 price) inflate a position to billions of
  // unrealizable dollars. Mirrors CLAUDE.md's TVL realizable-value rule.
  const realizableUsd = (lockedRaw: bigint, decimals: number, info: PriceInfo | undefined): number | null => {
    if (!info) return null;
    const tokens = Number(lockedRaw) / 10 ** decimals;
    const gross = tokens * info.price;
    if (!isFinite(gross) || gross <= 0) return null;
    return info.liquidity > 0 ? Math.min(gross, info.liquidity) : null;
  };

  // ── Phase 4: build per-wallet bundles → top tokens + totals ──────────────
  type WalletBundle = {
    recipient:          string;
    distinctTokenCount: number;
    streamCount:        number;
    chainEcosystem:     "evm" | "solana";
    totalLockedUsd:     number | null;
    topTokens:          Array<{ chainId: number; tokenAddress: string; symbol: string | null; usdValue: number | null }>;
  };

  // Group aggMap entries by recipient.
  const tokensByRecipient = new Map<string, TokenAgg[]>();
  for (const agg of aggMap.values()) {
    const list = tokensByRecipient.get(agg.recipient) ?? [];
    list.push(agg);
    tokensByRecipient.set(agg.recipient, list);
  }

  const bundles: WalletBundle[] = recipients.map((recipient) => {
    const tokens = tokensByRecipient.get(recipient) ?? [];
    const pricedTokens = tokens.map((t) => {
      const info = priceInfo.get(`${t.chainId}:${t.tokenAddress.toLowerCase()}`);
      const usdValue = realizableUsd(t.lockedRaw, t.decimals, info);
      return {
        chainId:      t.chainId,
        tokenAddress: t.tokenAddress,
        symbol:       t.symbol,
        usdValue,
      };
    });
    // Sort by USD value desc; unpriced fall to the end.
    pricedTokens.sort((a, b) => {
      if (a.usdValue != null && b.usdValue != null) return b.usdValue - a.usdValue;
      if (a.usdValue != null) return -1;
      if (b.usdValue != null) return 1;
      return 0;
    });
    const topTokens = pricedTokens.slice(0, TOP_TOKENS_PER_WALLET);
    const totalLockedUsd = pricedTokens.reduce<number | null>((acc, t) => {
      if (t.usdValue == null) return acc;
      return (acc ?? 0) + t.usdValue;
    }, null);
    // EVM heuristic: 0x prefix. Solana is base58, no 0x. (Our recipient
    // column carries the normalised form — no cleanup needed.)
    const chainEcosystem: "evm" | "solana" = recipient.startsWith("0x") ? "evm" : "solana";
    // Counts derived from the pulled token rows — uniform across both candidate
    // pools (the value-seeded wallets aren't in the Phase-1 count aggregate).
    return {
      recipient,
      distinctTokenCount: tokens.length,
      streamCount:        streamCountByRecipient.get(recipient) ?? tokens.length,
      chainEcosystem,
      totalLockedUsd,
      topTokens,
    };
  }).filter((b) => b.distinctTokenCount > 0);

  // ── Composite re-rank: USD-weighted blend ────────────────────────────────
  // Normalize each axis to [0,1], then blend 0.6/0.4.
  //
  // USD is LOG-scaled: locked values span many orders of magnitude ($1 →
  // $600k+), and a linear scale would let one whale flatten everyone else to
  // ~0. Token-count is linear (it spans a single order, ~1–30).
  //
  // We deliberately do NOT percentile-rank here. With ~half the board unpriced
  // (USD = 0), a percentile hands a $26 wallet roughly the same USD score as a
  // $400k one — both "above all the zeros" — which lets breadth dominate and
  // buries the genuine whales (observed: the single highest-value wallet
  // landed at rank 11 behind ten sub-$100 wallets). Magnitude-normalization
  // preserves the gap, so real locked value leads as intended.
  const maxUsd = Math.max(1, ...bundles.map((b) => b.totalLockedUsd ?? 0));
  const maxCount = Math.max(1, ...bundles.map((b) => b.distinctTokenCount));
  const logMaxUsd = Math.log10(1 + maxUsd);
  const usdNorm = (usd: number): number =>
    logMaxUsd > 0 ? Math.log10(1 + usd) / logMaxUsd : 0;
  const countNorm = (c: number): number => c / maxCount;
  const scored = bundles.map((b) => ({
    bundle: b,
    score:
      USD_WEIGHT * usdNorm(b.totalLockedUsd ?? 0) +
      COUNT_WEIGHT * countNorm(b.distinctTokenCount),
  }));
  scored.sort((a, z) => z.score - a.score);
  const final = scored.slice(0, LEADERBOARD_SIZE).map((s) => s.bundle);

  // ── Phase 5: replace the snapshot atomically ─────────────────────────────
  // DELETE + INSERT in one transaction so the page never sees an empty or
  // half-built snapshot (the previous one stays valid until the new one is
  // committed).
  await db.transaction(async (tx) => {
    await tx.delete(smartMoneySnapshot);
    if (final.length === 0) return;
    await tx.insert(smartMoneySnapshot).values(
      final.map((b, i) => ({
        rank:               i + 1,
        recipient:          b.recipient,
        chainEcosystem:     b.chainEcosystem,
        distinctTokenCount: b.distinctTokenCount,
        streamCount:        b.streamCount,
        // numeric column wants a string (drizzle quirk for arbitrary-precision).
        totalLockedUsd:     b.totalLockedUsd != null ? b.totalLockedUsd.toFixed(2) : null,
        topTokensJson:      b.topTokens,
        computedAt:         new Date(),
      })),
    );
  });

  // Bust the page's unstable_cache (tag "smart-money", 1h revalidate) so the
  // freshly-ranked board shows on the next visit instead of up to an hour
  // later. The page read is the only consumer of this tag. Non-fatal — a
  // revalidation hiccup just means the page self-heals on its 1h cycle.
  try {
    revalidateTag("smart-money", "max");
  } catch (err) {
    console.warn("[smart-money] revalidateTag failed (non-fatal):", err);
  }

  const durationMs = Date.now() - t0;
  console.log(`[smart-money] wrote ${final.length} rows in ${durationMs}ms (aggregate alone: ${aggregateMs}ms)`);

  return NextResponse.json({
    ok:               true,
    rowsWritten:      final.length,
    durationMs,
    aggregateMs,
    candidatesByCount: countRecipients.length,
    candidatesByValue: valueRecipients.length,
    candidatesUnion:   recipients.length,
    cachedPrices:      priceInfo.size,
  });
}
