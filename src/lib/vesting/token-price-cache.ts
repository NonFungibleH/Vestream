// src/lib/vesting/token-price-cache.ts
// ─────────────────────────────────────────────────────────────────────────────
// Read-through cache for token USD prices (token_prices_cache table).
//
// The TVL snapshot cron used to fan out thousands of DexScreener / CoinGecko
// requests every night; both free-tier APIs would rate-limit, and the
// resulting near-zero-priced rows would overwrite yesterday's good headline.
//
// With this cache in front:
//   • priceAggregates() reads cache first, only calls external APIs for misses
//     or stale entries
//   • After every successful API call we write back to the cache
//   • A separate hourly cron (/api/cron/refresh-prices) keeps the working
//     set warm by refreshing the stalest N entries — distributes API load
//     across the day instead of cramming it into one 5-min cron window
//
// Failure semantics: every helper here SWALLOWS its own errors. If the cache
// table doesn't exist (migration not yet applied), reads return empty +
// writes no-op. The caller's pricing pipeline degrades gracefully to the
// pre-cache behaviour (direct API fetches every time).
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { tokenPricesCache } from "../db/schema";
import type { PriceInfo, PriceSource } from "./tvl";

/** Default freshness window — 6 hours. Most callers use this. */
export const DEFAULT_PRICE_CACHE_TTL_SEC = 6 * 60 * 60;

/** Hourly refresh-cron upper bound — anything older than this is "stale" and
 *  becomes a candidate for refresh. Slightly tighter than the read-side TTL
 *  so consumers always see fresh data even if the refresh cron is briefly
 *  behind. */
export const REFRESH_AFTER_SEC = 5 * 60 * 60;

export interface CachedPrice {
  chainId:      number;
  tokenAddress: string;
  priceUsd:     number;
  liquidityUsd: number | null;
  source:       PriceSource;
  fetchedAt:    Date;
  /** Seconds since fetchedAt. Computed at read time. */
  ageSec:       number;
}

/**
 * Bulk-read prices for a list of (chainId, tokenAddress) pairs. Returns a
 * Map keyed by `${chainId}:${tokenAddressLower}` so the caller can do O(1)
 * lookups in the pricing loop.
 *
 * `maxAgeSec` lets the caller decide what's "fresh enough". The default
 * (6 hours) is appropriate for the TVL snapshot cron; the refresh cron
 * uses a different threshold to pick candidates for re-fetching.
 *
 * On DB error (e.g. table missing pre-migration), returns an empty map.
 * The caller's pricing pipeline then runs as if the cache didn't exist.
 */
export async function readPriceCache(
  keys: Array<{ chainId: number; tokenAddress: string }>,
  maxAgeSec: number = DEFAULT_PRICE_CACHE_TTL_SEC,
): Promise<Map<string, CachedPrice>> {
  if (keys.length === 0) return new Map();

  // Normalise addresses + de-duplicate.
  const wantSet = new Set<string>();
  for (const k of keys) {
    wantSet.add(`${k.chainId}:${k.tokenAddress.toLowerCase()}`);
  }

  // Build a UNION ALL-style WHERE: for big batches, splitting per-chain is
  // cleaner than IN (....) with a million params.
  const byChain = new Map<number, string[]>();
  // Defensive format check — the SQL builder below interpolates each address
  // into a literal `ARRAY['..','..']::text[]` via sql.raw. Today's callers
  // feed on-chain data, but a future refactor could pass user input here
  // and turn this into SQL injection. Reject anything that isn't a valid
  // EVM hex address or a Solana base58 pubkey so the interpolation has
  // mathematical safety regardless of upstream assumptions.
  const EVM_RE = /^0x[0-9a-f]{40}$/i;
  const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  for (const k of keys) {
    const t = k.tokenAddress;
    if (!EVM_RE.test(t) && !SOL_RE.test(t)) continue;
    const list = byChain.get(k.chainId) ?? [];
    list.push(t.toLowerCase());
    byChain.set(k.chainId, list);
  }

  const out = new Map<string, CachedPrice>();
  const cutoffMs = Date.now() - maxAgeSec * 1000;

  try {
    for (const [chainId, addrs] of byChain.entries()) {
      const rows = await db
        .select({
          chainId:      tokenPricesCache.chainId,
          tokenAddress: tokenPricesCache.tokenAddress,
          priceUsd:     tokenPricesCache.priceUsd,
          liquidityUsd: tokenPricesCache.liquidityUsd,
          source:       tokenPricesCache.source,
          fetchedAt:    tokenPricesCache.fetchedAt,
        })
        .from(tokenPricesCache)
        .where(and(
          eq(tokenPricesCache.chainId, chainId),
          // Drizzle's `inArray()` would be ideal but for very long lists
          // postgres-js complains about parameter count. Build a literal
          // ANY array — addresses are already lowercased + 0x-validated
          // upstream, so it's safe to interpolate.
          sql`${tokenPricesCache.tokenAddress} = ANY(${sql.raw(`ARRAY[${addrs.map((a) => `'${a}'`).join(",")}]::text[]`)})`,
        ));

      for (const r of rows) {
        const key = `${r.chainId}:${r.tokenAddress.toLowerCase()}`;
        if (!wantSet.has(key)) continue;
        const fetchedAtMs = r.fetchedAt.getTime();
        if (fetchedAtMs < cutoffMs) continue;  // stale — skip
        const priceUsd     = Number(r.priceUsd);
        const liquidityUsd = r.liquidityUsd === null ? null : Number(r.liquidityUsd);
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;
        out.set(key, {
          chainId:      r.chainId,
          tokenAddress: r.tokenAddress.toLowerCase(),
          priceUsd,
          liquidityUsd,
          source:       (r.source as PriceSource),
          fetchedAt:    r.fetchedAt,
          ageSec:       Math.floor((Date.now() - fetchedAtMs) / 1000),
        });
      }
    }
  } catch (err) {
    console.warn("[token-price-cache] read failed (likely table missing pre-migration):", err);
    return new Map();
  }

  return out;
}

/**
 * Bulk-write prices to the cache. Idempotent upsert keyed on
 * (chainId, tokenAddress). Errors are swallowed — the caller's pricing
 * pipeline succeeded externally; we don't want a cache write blip to
 * mark the run as failed.
 *
 * Pass `now` to control the timestamp (used by tests + refresh cron when
 * batching writes that conceptually happened at the same instant).
 */
export async function writePriceCache(
  entries: Array<{
    chainId:      number;
    tokenAddress: string;
    priceUsd:     number;
    liquidityUsd: number | null;
    source:       PriceSource;
  }>,
  now: Date = new Date(),
): Promise<void> {
  if (entries.length === 0) return;

  // De-duplicate by primary key — multiple sources could have come back
  // for the same token in one run; keep the LAST one (latest API response).
  const dedup = new Map<string, typeof entries[number]>();
  for (const e of entries) {
    dedup.set(`${e.chainId}:${e.tokenAddress.toLowerCase()}`, {
      ...e,
      tokenAddress: e.tokenAddress.toLowerCase(),
    });
  }

  // Per-row sanity check before INSERT. The PG side has tight NUMERIC
  // bounds + NOT NULL constraints; one bad row in an atomic INSERT
  // poisons the whole batch ("invalid input syntax for type numeric"
  // → 0 rows written, every successful row in the same batch lost). We
  // saw this in production as silent cache emptiness — every snapshot
  // run fought CoinGecko's rate limit from scratch because nothing
  // ever cached. Filter unsafe entries here and let the rest land.
  const EVM_RE = /^0x[0-9a-f]{40}$/i;
  const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const validRows: Array<{ chainId: number; tokenAddress: string; priceUsd: string; liquidityUsd: string | null; source: PriceSource; fetchedAt: Date }> = [];
  let droppedInvalid = 0;
  for (const e of dedup.values()) {
    if (!EVM_RE.test(e.tokenAddress) && !SOL_RE.test(e.tokenAddress)) { droppedInvalid++; continue; }
    if (!Number.isFinite(e.priceUsd) || e.priceUsd <= 0) { droppedInvalid++; continue; }
    if (e.liquidityUsd !== null && !Number.isFinite(e.liquidityUsd)) { droppedInvalid++; continue; }
    if (e.source !== "dexscreener" && e.source !== "coingecko") { droppedInvalid++; continue; }
    validRows.push({
      chainId:      e.chainId,
      tokenAddress: e.tokenAddress,
      // NUMERIC columns take string values via drizzle — explicit toString
      // avoids any "1e-12 → '1e-12'" stringification surprises with very
      // tiny memecoin prices. toFixed(scale) keeps full precision.
      priceUsd:     formatNumeric(e.priceUsd, 18),
      liquidityUsd: e.liquidityUsd === null ? null : formatNumeric(e.liquidityUsd, 2),
      source:       e.source,
      fetchedAt:    now,
    });
  }
  if (droppedInvalid > 0) {
    console.warn(`[token-price-cache] dropped ${droppedInvalid} malformed rows before insert (NaN price, invalid address, unknown source, etc)`);
  }
  if (validRows.length === 0) return;

  // Chunked inserts. One huge batch was failing as an atomic unit on the
  // ~5000-token PinkSale BSC pricing pass; smaller chunks keep most rows
  // landing even if one chunk hits a constraint we missed in the row-level
  // validation above. 100 rows ≈ 800 bytes per row × 100 = ~80KB payload,
  // well under any limit. Per-chunk try/catch logs FULL error details so
  // a future failure mode produces actionable info instead of the prior
  // generic "table missing pre-migration" guess.
  const CHUNK_SIZE = 100;
  let chunkErrors = 0;
  for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
    const chunk = validRows.slice(i, i + CHUNK_SIZE);
    try {
      await db
        .insert(tokenPricesCache)
        .values(chunk)
        .onConflictDoUpdate({
          target: [tokenPricesCache.chainId, tokenPricesCache.tokenAddress],
          set: {
            priceUsd:     sql`excluded.price_usd`,
            liquidityUsd: sql`excluded.liquidity_usd`,
            source:       sql`excluded.source`,
            fetchedAt:    sql`excluded.fetched_at`,
          },
        });
    } catch (err) {
      chunkErrors++;
      // Log the actual error verbatim plus a small sample of what was
      // being inserted, so we can see exactly which constraint fired.
      const sample = chunk.slice(0, 2).map(r => ({
        chainId: r.chainId,
        addr:    r.tokenAddress.slice(0, 10) + "…",
        price:   r.priceUsd,
        liq:     r.liquidityUsd,
        source:  r.source,
      }));
      console.error(
        `[token-price-cache] chunk insert failed (rows ${i}-${i + chunk.length}):`,
        err,
        "sample:", JSON.stringify(sample),
      );
    }
  }
  if (chunkErrors > 0) {
    console.warn(`[token-price-cache] ${chunkErrors}/${Math.ceil(validRows.length / CHUNK_SIZE)} chunks failed; partial cache write completed`);
  }
  return;
}

/**
 * Pick the N stalest entries from the cache. Used by the hourly refresh
 * cron — those entries become the candidates for re-pricing this hour.
 *
 * Tokens that aren't in the cache yet are NOT returned here — they get
 * picked up by the daily TVL snapshot cron's walker output instead. This
 * keeps the hourly cron's job scoped to "freshen what we already know
 * about" rather than "discover new tokens", which would re-walk the
 * whole protocol set.
 */
export async function pickStalestCachedTokens(
  limit: number,
): Promise<Array<{ chainId: number; tokenAddress: string; ageSec: number }>> {
  try {
    const rows = await db
      .select({
        chainId:      tokenPricesCache.chainId,
        tokenAddress: tokenPricesCache.tokenAddress,
        fetchedAt:    tokenPricesCache.fetchedAt,
      })
      .from(tokenPricesCache)
      .orderBy(tokenPricesCache.fetchedAt)  // ASC — oldest first
      .limit(limit);

    const nowMs = Date.now();
    return rows.map((r) => ({
      chainId:      r.chainId,
      tokenAddress: r.tokenAddress,
      ageSec:       Math.floor((nowMs - r.fetchedAt.getTime()) / 1000),
    }));
  } catch (err) {
    console.warn("[token-price-cache] pickStalest failed:", err);
    return [];
  }
}

/**
 * Convert a PriceInfo (used by priceAggregates) ↔ cache entry. Centralised
 * so callers don't have to remember which fields map to what.
 */
export function priceInfoFromCached(c: CachedPrice): PriceInfo {
  return {
    priceUsd:     c.priceUsd,
    source:       c.source,
    liquidityUsd: c.liquidityUsd,
    // Confidence is derived from liquidity at read time (mirrors the
    // logic in tvl.ts:confidenceFromLiquidity). Coingecko-sourced prices
    // have null liquidity and are conventionally tagged "medium".
    confidence:   c.source === "coingecko"
      ? "medium"
      : c.liquidityUsd === null
        ? "medium"
        : c.liquidityUsd >= 10_000
          ? "high"
          : c.liquidityUsd >= 1_000
            ? "medium"
            : "low",
  };
}

/**
 * NUMERIC-safe stringification. Postgres rejects scientific-notation
 * numerics like "1e-15"; force fixed-point. Caps at the requested
 * scale (18 decimal places for prices, 2 for liquidity).
 */
function formatNumeric(value: number, scale: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  // toFixed handles negative exponents correctly: (1e-15).toFixed(18) = "0.000000000000001000"
  return value.toFixed(scale);
}
