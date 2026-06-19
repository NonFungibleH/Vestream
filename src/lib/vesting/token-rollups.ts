// src/lib/vesting/token-rollups.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-token vesting rollup — the durable fix for the explorer's recurring
// Cloudflare 524s. The explorer used to compute, LIVE on every render:
//   - getTotalLockedByToken  (a per-recipient nested aggregate → top-holder %)
//   - getTokenScaleCounts    (wallet/round counts + vest span + cliff)
// Both are heavy GROUP BYs over vesting_streams_cache that ballooned under
// Supabase pooler contention. `refreshTokenRollups()` computes them ONCE in
// the background (cron) for every active-vesting token and upserts into
// token_vesting_rollups; `readTokenRollups()` is a single indexed read the
// explorer uses instead. No live aggregation on the request path.
// ─────────────────────────────────────────────────────────────────────────────

import { and, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { tokenVestingRollups } from "../db/schema";
import { withTimeout } from "../with-timeout";

export interface TokenRollup {
  totalLocked:    bigint;
  topHolderShare: number | null;
  walletCount:    number;
  roundCount:     number;
  streamCount:    number;
  firstStart:     number | null;
  lastEnd:        number | null;
  hasCliff:       boolean;
}

const TESTNET_CHAIN_IDS = [11155111, 84532];
// Solana is the only case-SENSITIVE address ecosystem we index (base58 mints).
// EVM addresses are canonicalised to lowercase; Solana addresses must keep
// their original case or every token deep-link 404s / lands on a blank page
// (the rollup is the explorer's only address source). See the `addr` column
// in the meta query below.
const SOLANA_CHAIN_ID = 101;

/**
 * Recompute the whole rollup from vesting_streams_cache (active rows only) and
 * upsert. One background pass; the per-recipient nested aggregate that the
 * request path could not afford runs here, once. Returns the row count.
 */
export async function refreshTokenRollups(): Promise<{ rows: number }> {
  if (process.env.NEXT_PHASE === "phase-production-build") return { rows: 0 };

  // Pass 1 — per-recipient → per-token: total locked, largest holder, wallets.
  const concentration = await db.execute(sql`
    SELECT chain_id AS "chainId",
           tok      AS "tok",
           SUM(rl)::text  AS "total",
           MAX(rl)::text  AS "top",
           count(*)::int  AS "wallets"
    FROM (
      SELECT chain_id,
             lower(token_address) AS tok,
             lower(recipient)     AS r,
             COALESCE(SUM((stream_data->>'lockedAmount')::numeric), 0) AS rl
      FROM vesting_streams_cache
      WHERE is_fully_vested = false
        AND chain_id NOT IN (${sql.join(TESTNET_CHAIN_IDS, sql`, `)})
      GROUP BY chain_id, lower(token_address), lower(recipient)
    ) s
    GROUP BY chain_id, tok
  `);

  // Pass 2 — per-token: symbol, stream/round counts, span, cliff. roundKey
  // mirrors rounds.ts groupIntoRounds (protocol|shape|cliffDays|durationDays).
  const meta = await db.execute(sql`
    SELECT chain_id AS "chainId",
           lower(token_address) AS "tok",
           -- Canonical stored address: lowercase for EVM (case-insensitive),
           -- but ORIGINAL case for Solana — base58 is case-sensitive, so
           -- lowercasing corrupts the mint and breaks every token deep-link.
           CASE WHEN chain_id = ${SOLANA_CHAIN_ID} THEN max(token_address)
                ELSE lower(token_address) END AS "addr",
           max(token_symbol)    AS "symbol",
           count(*)::int        AS "streams",
           count(distinct (
             protocol || '|' ||
             CASE WHEN stream_data->>'shape' = 'steps' THEN 'steps' ELSE 'linear' END || '|' ||
             GREATEST(0, ROUND((COALESCE((stream_data->>'cliffTime')::numeric, (stream_data->>'startTime')::numeric) - (stream_data->>'startTime')::numeric) / 86400))::int || '|' ||
             GREATEST(0, ROUND((end_time - (stream_data->>'startTime')::numeric) / 86400))::int
           ))::int               AS "rounds",
           min((stream_data->>'startTime')::numeric)::bigint AS "firstStart",
           max(end_time)::bigint AS "lastEnd",
           bool_or((COALESCE((stream_data->>'cliffTime')::numeric, (stream_data->>'startTime')::numeric) - (stream_data->>'startTime')::numeric) > 86400) AS "hasCliff",
           -- Soonest FUTURE unlock across the token's streams. Each stream's
           -- next unlock = its nextUnlockTime (a tranche boundary) or, absent
           -- that, its end_time. We keep only those still in the future at
           -- compute time. Drives the explorer "Upcoming" list order + filter.
           min(
             CASE WHEN COALESCE((stream_data->>'nextUnlockTime')::numeric, end_time) >= EXTRACT(EPOCH FROM now())
                  THEN COALESCE((stream_data->>'nextUnlockTime')::numeric, end_time) END
           )::bigint AS "nextUnlock",
           array_agg(DISTINCT protocol) AS "protocols",
           max(COALESCE((stream_data->>'tokenDecimals')::int, 18))::int AS "decimals"
    FROM vesting_streams_cache
    WHERE is_fully_vested = false
      AND chain_id NOT IN (${sql.join(TESTNET_CHAIN_IDS, sql`, `)})
    GROUP BY chain_id, lower(token_address)
  `);

  // Merge by key. db.execute returns array-like rows (postgres-js driver) —
  // type as loose records and coerce each field explicitly below.
  type Row = Record<string, unknown>;
  const concRows = (concentration as unknown as Row[]) ?? [];
  const metaRows = (meta as unknown as Row[]) ?? [];
  const byKey = new Map<string, Row>();
  for (const r of metaRows) byKey.set(`${r.chainId}:${r.tok}`, { ...r });
  for (const r of concRows) {
    const k = `${r.chainId}:${r.tok}`;
    byKey.set(k, { ...(byKey.get(k) ?? { chainId: r.chainId, tok: r.tok }), ...r });
  }

  // Prices — one batch read of the whole price cache for the tokens we rolled
  // up, so locked_value_usd + market_cap can be precomputed into the rollup
  // (the explorer's $-amount filter, USD sort, and risk all read them from
  // here instead of pricing live on render). Keyed `${chainId}:${lowerAddr}`.
  const priceByKey = new Map<string, { price: number; mcap: number | null }>();
  try {
    const priceRows = (await db.execute(sql`
      SELECT chain_id AS "chainId", lower(token_address) AS "tok",
             price_usd::double precision AS "price",
             market_cap::double precision AS "mcap"
      FROM token_prices_cache
      WHERE price_usd > 0
    `) as unknown as Row[]) ?? [];
    for (const p of priceRows) {
      priceByKey.set(`${p.chainId}:${p.tok}`, {
        price: Number(p.price),
        mcap:  p.mcap != null ? Number(p.mcap) : null,
      });
    }
  } catch (err) {
    console.warn("[token-rollups] price batch read failed (locked_value_usd left null):", err);
  }

  const now = new Date();
  const values = [...byKey.values()].map((r) => {
    let total = 0n, top = 0n;
    try { total = BigInt(String(r.total ?? "0")); } catch { /* 0 */ }
    try { top   = BigInt(String(r.top   ?? "0")); } catch { /* 0 */ }
    const topHolderShare = total > 0n ? Number((top * 1_000_000n) / total) / 1_000_000 : null;
    const decimals = Number(r.decimals ?? 18) || 18;
    const px = priceByKey.get(`${r.chainId}:${r.tok}`);
    let lockedValueUsd: number | null = null;
    if (px && total > 0n) {
      const whole = Number(total) / 10 ** Math.min(decimals, 30);
      lockedValueUsd = Number.isFinite(whole) ? whole * px.price : null;
    }
    // postgres-js returns text[] as a JS array already.
    const protocols = Array.isArray(r.protocols) ? (r.protocols as string[]).filter(Boolean) : [];
    return {
      chainId:        Number(r.chainId),
      // `addr` preserves Solana case; falls back to the lowercased key for any
      // row that somehow lacks it (e.g. a concentration-only merge).
      tokenAddress:   String(r.addr ?? r.tok),
      tokenSymbol:    (r.symbol as string | null) ?? null,
      totalLocked:    total.toString(),
      topHolderShare,
      walletCount:    Number(r.wallets ?? 0),
      roundCount:     Number(r.rounds ?? 0),
      streamCount:    Number(r.streams ?? 0),
      firstStart:     r.firstStart != null ? Number(r.firstStart) : null,
      lastEnd:        r.lastEnd != null ? Number(r.lastEnd) : null,
      hasCliff:       Boolean(r.hasCliff),
      nextUnlock:     r.nextUnlock != null ? Number(r.nextUnlock) : null,
      protocols,
      tokenDecimals:  decimals,
      lockedValueUsd,
      marketCap:      px?.mcap ?? null,
      computedAt:     now,
    };
  });

  if (values.length === 0) return { rows: 0 };

  // Chunked upsert (PK = chain_id + token_address). Stale rows for tokens that
  // went fully-vested since last run are left in place — harmless; readers key
  // on the explorer's live token set.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    try {
      await db.insert(tokenVestingRollups).values(chunk).onConflictDoUpdate({
        target: [tokenVestingRollups.chainId, tokenVestingRollups.tokenAddress],
        set: {
          tokenSymbol:    sql`excluded.token_symbol`,
          totalLocked:    sql`excluded.total_locked`,
          topHolderShare: sql`excluded.top_holder_share`,
          walletCount:    sql`excluded.wallet_count`,
          roundCount:     sql`excluded.round_count`,
          streamCount:    sql`excluded.stream_count`,
          firstStart:     sql`excluded.first_start`,
          lastEnd:        sql`excluded.last_end`,
          hasCliff:       sql`excluded.has_cliff`,
          nextUnlock:     sql`excluded.next_unlock`,
          protocols:      sql`excluded.protocols`,
          tokenDecimals:  sql`excluded.token_decimals`,
          lockedValueUsd: sql`excluded.locked_value_usd`,
          marketCap:      sql`excluded.market_cap`,
          computedAt:     sql`excluded.computed_at`,
        },
      });
      written += chunk.length;
    } catch (err) {
      console.error(`[token-rollups] chunk upsert failed (rows ${i}-${i + chunk.length}):`, err);
    }
  }

  // Unlock-curve pass — 12-point cumulative vested fraction (0–100) across each
  // token's span, comma-joined, for the explorer row sparkline. Near-static
  // (the SCHEDULE shape only changes when streams are added/removed), so a
  // single UPDATE here on the 12h cron is plenty. Runs after the upsert so
  // every current token has a row to update.
  try {
    await db.execute(sql`
      WITH spans AS (
        SELECT chain_id, lower(token_address) AS tok,
               min((stream_data->>'startTime')::numeric) AS fs, max(end_time)::numeric AS le
        FROM vesting_streams_cache
        WHERE is_fully_vested = false AND chain_id NOT IN (${sql.join(TESTNET_CHAIN_IDS, sql`, `)})
        GROUP BY 1, 2
      ),
      curve AS (
        SELECT s.chain_id, s.tok, p.k,
          round(100 * SUM(
            (v.stream_data->>'totalAmount')::numeric *
            CASE WHEN (s.fs + (s.le - s.fs) * p.k / 11.0) < COALESCE((v.stream_data->>'cliffTime')::numeric, (v.stream_data->>'startTime')::numeric) THEN 0
                 ELSE GREATEST(0, LEAST(1, ((s.fs + (s.le - s.fs) * p.k / 11.0) - (v.stream_data->>'startTime')::numeric) / NULLIF(v.end_time - (v.stream_data->>'startTime')::numeric, 0))) END
          ) / NULLIF(SUM((v.stream_data->>'totalAmount')::numeric), 0)) AS frac
        FROM spans s
        JOIN vesting_streams_cache v ON v.chain_id = s.chain_id AND lower(v.token_address) = s.tok AND v.is_fully_vested = false
        CROSS JOIN generate_series(0, 11) AS p(k)
        GROUP BY s.chain_id, s.tok, p.k, s.fs, s.le
      ),
      agg AS (
        SELECT chain_id, tok, string_agg(COALESCE(frac, 0)::text, ',' ORDER BY k) AS curve
        FROM curve GROUP BY chain_id, tok
      )
      UPDATE token_vesting_rollups r SET unlock_curve = agg.curve
      FROM agg WHERE r.chain_id = agg.chain_id AND lower(r.token_address) = agg.tok
    `);
  } catch (err) {
    console.error("[token-rollups] unlock-curve pass failed:", err);
  }

  return { rows: written };
}

/**
 * Read rollups for a set of (chainId, tokenAddress) pairs. Single indexed
 * lookup keyed on the PK. Returns a Map keyed `${chainId}:${lowerAddr}`.
 * Missing tokens (not yet rolled up) are simply absent — callers fall back to
 * showing "—"/undefined, exactly like a cold price-cache row.
 */
export async function readTokenRollups(
  pairs: ReadonlyArray<{ chainId: number; tokenAddress: string }>,
): Promise<Map<string, TokenRollup>> {
  const out = new Map<string, TokenRollup>();
  if (process.env.NEXT_PHASE === "phase-production-build") return out;
  if (pairs.length === 0) return out;

  const lowerAddrs = [...new Set(pairs.map((p) => p.tokenAddress.toLowerCase()))];
  const chainIds   = [...new Set(pairs.map((p) => p.chainId))];

  let rows: Array<typeof tokenVestingRollups.$inferSelect>;
  try {
    rows = await db
      .select()
      .from(tokenVestingRollups)
      .where(and(
        inArray(tokenVestingRollups.chainId, chainIds),
        inArray(sql`lower(${tokenVestingRollups.tokenAddress})`, lowerAddrs),
      ));
  } catch (err) {
    console.warn("[token-rollups] read failed:", err);
    return out;
  }

  const wanted = new Set(pairs.map((p) => `${p.chainId}:${p.tokenAddress.toLowerCase()}`));
  for (const r of rows) {
    const key = `${r.chainId}:${r.tokenAddress.toLowerCase()}`;
    if (!wanted.has(key)) continue;
    let total = 0n;
    try { total = BigInt(r.totalLocked); } catch { /* 0 */ }
    out.set(key, {
      totalLocked:    total,
      topHolderShare: r.topHolderShare,
      walletCount:    r.walletCount,
      roundCount:     r.roundCount,
      streamCount:    r.streamCount,
      firstStart:     r.firstStart,
      lastEnd:        r.lastEnd,
      hasCliff:       r.hasCliff,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginated explorer list — reads ONE indexed page straight off the rollup
// (≈34ms for page 1, ≈130ms deep) instead of re-aggregating vesting_streams_cache
// per request (1.2s warm). This is what lets the explorer page through ALL
// ~5,000 tokens-with-upcoming-unlocks, 25 at a time, instead of the soonest
// ~923 the old 2,000-event pool cap allowed.
// ─────────────────────────────────────────────────────────────────────────────

export type ExplorerSortKey =
  | "date" | "usd" | "amount" | "wallets" | "concentration" | "rounds" | "cliff" | "risk" | "progress" | "token";

export interface ExplorerPageRow {
  chainId:        number;
  tokenAddress:   string;
  tokenSymbol:    string | null;
  totalLocked:    string;          // stringified bigint (raw)
  tokenDecimals:  number;
  lockedValueUsd: number | null;
  marketCap:      number | null;
  topHolderShare: number | null;
  walletCount:    number;
  roundCount:     number;
  hasCliff:       boolean;
  firstStart:     number | null;
  lastEnd:        number | null;
  nextUnlock:     number | null;
  protocols:      string[];
  unlockCurve:    number[] | null;   // 12 cumulative-% samples for the sparkline
}

// Whitelisted sort expressions (no user string ever reaches SQL — the key is
// matched against this map). NULLS LAST is applied by direction below.
const EXPLORER_SORT_SQL: Record<ExplorerSortKey, ReturnType<typeof sql>> = {
  date:          sql`next_unlock`,
  usd:           sql`locked_value_usd`,
  amount:        sql`(total_locked)::numeric`,
  wallets:       sql`wallet_count`,
  concentration: sql`top_holder_share`,
  rounds:        sql`round_count`,
  cliff:         sql`(has_cliff)::int`,
  risk:          sql`(locked_value_usd / NULLIF(market_cap, 0))`,
  progress:      sql`CASE WHEN last_end > first_start
                          THEN (EXTRACT(EPOCH FROM now()) - first_start)::float / (last_end - first_start)
                          ELSE NULL END`,
  token:         sql`lower(token_symbol)`,
};

export interface ExplorerPageOpts {
  windowStartSec: number;
  windowEndSec:   number;
  chainIds?:      readonly number[];
  adapterIds?:    readonly string[];
  symbol?:        string;
  // Range filters — min and/or max each (undefined = open on that side).
  amountUsdMin?:  number;
  amountUsdMax?:  number;
  minWallets?:    number;
  maxWallets?:    number;
  /** Distinct vesting rounds (schedules). */
  minRounds?:     number;
  maxRounds?:     number;
  /** Share of the vesting span elapsed (0–1). e.g. 0.8 = "80% vested". */
  minVestedPct?:  number;
  maxVestedPct?:  number;
  /** Top-holder concentration (0–1) — largest recipient's share of locked. */
  minTopHolder?:  number;
  maxTopHolder?:  number;
  /** Only tokens with a cliff (lump) unlock. */
  cliffOnly?:     boolean;
  sort:           ExplorerSortKey;
  dir:            "asc" | "desc";
  page:           number;   // 1-based
  pageSize:       number;
}

export async function getExplorerPage(
  opts: ExplorerPageOpts,
): Promise<{ rows: ExplorerPageRow[]; total: number }> {
  if (process.env.NEXT_PHASE === "phase-production-build") return { rows: [], total: 0 };

  // WHERE — only tokens with an upcoming unlock inside the requested window.
  const conds: ReturnType<typeof sql>[] = [
    sql`next_unlock IS NOT NULL`,
    sql`next_unlock >= ${Math.floor(opts.windowStartSec)}`,
    sql`next_unlock <= ${Math.floor(opts.windowEndSec)}`,
  ];
  if (opts.chainIds && opts.chainIds.length > 0) {
    conds.push(sql`chain_id IN (${sql.join(opts.chainIds.map((c) => sql`${c}`), sql`, `)})`);
  }
  if (opts.adapterIds && opts.adapterIds.length > 0) {
    // Array overlap: token's protocols intersect the requested adapters.
    conds.push(sql`protocols && ARRAY[${sql.join(opts.adapterIds.map((a) => sql`${a}`), sql`, `)}]::text[]`);
  }
  if (opts.symbol && opts.symbol.trim().length > 0) {
    const esc = opts.symbol.trim().replace(/([%_\\])/g, "\\$1");
    conds.push(sql`token_symbol ILIKE ${esc}`);
  }
  // USD range. When EITHER bound is set we require a known price (NULL can't
  // be "in range"); with no USD bound at all, unpriced tokens are kept.
  if (opts.amountUsdMin && opts.amountUsdMin > 0) {
    conds.push(sql`locked_value_usd >= ${opts.amountUsdMin}`);
  }
  if (opts.amountUsdMax && opts.amountUsdMax > 0) {
    conds.push(sql`locked_value_usd <= ${opts.amountUsdMax}`);
  }
  if (opts.minWallets && opts.minWallets > 0) conds.push(sql`wallet_count >= ${opts.minWallets}`);
  if (opts.maxWallets && opts.maxWallets > 0) conds.push(sql`wallet_count <= ${opts.maxWallets}`);
  if (opts.minRounds && opts.minRounds > 0)   conds.push(sql`round_count >= ${opts.minRounds}`);
  if (opts.maxRounds && opts.maxRounds > 0)   conds.push(sql`round_count <= ${opts.maxRounds}`);
  // % vested needs a valid span; tokens without one can't satisfy a vested
  // range, so they're excluded once either bound is set.
  const vestedExpr = sql`(EXTRACT(EPOCH FROM now()) - first_start)::float / NULLIF(last_end - first_start, 0)`;
  if (opts.minVestedPct && opts.minVestedPct > 0) {
    conds.push(sql`(last_end > first_start AND ${vestedExpr} >= ${opts.minVestedPct})`);
  }
  if (opts.maxVestedPct != null && opts.maxVestedPct < 1) {
    conds.push(sql`(last_end > first_start AND ${vestedExpr} <= ${opts.maxVestedPct})`);
  }
  // Top-holder concentration range (requires a known share).
  if (opts.minTopHolder && opts.minTopHolder > 0) {
    conds.push(sql`(top_holder_share IS NOT NULL AND top_holder_share >= ${opts.minTopHolder})`);
  }
  if (opts.maxTopHolder != null && opts.maxTopHolder < 1) {
    conds.push(sql`(top_holder_share IS NOT NULL AND top_holder_share <= ${opts.maxTopHolder})`);
  }
  if (opts.cliffOnly) {
    conds.push(sql`has_cliff = true`);
  }
  const where = sql.join(conds, sql` AND `);

  const sortExpr = EXPLORER_SORT_SQL[opts.sort] ?? EXPLORER_SORT_SQL.date;
  const dir = opts.dir === "asc" ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`;
  const pageSize = Math.max(1, Math.min(100, opts.pageSize));
  const offset = Math.max(0, (Math.max(1, opts.page) - 1) * pageSize);

  type R = Record<string, unknown>;
  let rows: R[] = [];
  let total = 0;
  try {
    const res = (await db.execute(sql`
      SELECT chain_id AS "chainId", token_address AS "tokenAddress", token_symbol AS "tokenSymbol",
             total_locked AS "totalLocked", token_decimals AS "tokenDecimals",
             locked_value_usd AS "lockedValueUsd", market_cap AS "marketCap",
             top_holder_share AS "topHolderShare", wallet_count AS "walletCount",
             round_count AS "roundCount", has_cliff AS "hasCliff",
             first_start AS "firstStart", last_end AS "lastEnd",
             next_unlock AS "nextUnlock", protocols AS "protocols",
             unlock_curve AS "unlockCurve"
      FROM token_vesting_rollups
      WHERE ${where}
      ORDER BY ${sortExpr} ${dir}, next_unlock ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `) as unknown as R[]) ?? [];
    rows = res;
    const cnt = (await db.execute(sql`SELECT count(*)::int AS "count" FROM token_vesting_rollups WHERE ${where}`) as unknown as R[]) ?? [];
    total = Number(cnt[0]?.count ?? 0);
  } catch (err) {
    console.error("[token-rollups] getExplorerPage failed:", err);
    return { rows: [], total: 0 };
  }

  const out: ExplorerPageRow[] = rows.map((r) => ({
    chainId:        Number(r.chainId),
    tokenAddress:   String(r.tokenAddress),
    tokenSymbol:    (r.tokenSymbol as string | null) ?? null,
    totalLocked:    String(r.totalLocked ?? "0"),
    tokenDecimals:  Number(r.tokenDecimals ?? 18),
    lockedValueUsd: r.lockedValueUsd != null ? Number(r.lockedValueUsd) : null,
    marketCap:      r.marketCap != null ? Number(r.marketCap) : null,
    topHolderShare: r.topHolderShare != null ? Number(r.topHolderShare) : null,
    walletCount:    Number(r.walletCount ?? 0),
    roundCount:     Number(r.roundCount ?? 0),
    hasCliff:       Boolean(r.hasCliff),
    firstStart:     r.firstStart != null ? Number(r.firstStart) : null,
    lastEnd:        r.lastEnd != null ? Number(r.lastEnd) : null,
    nextUnlock:     r.nextUnlock != null ? Number(r.nextUnlock) : null,
    protocols:      Array.isArray(r.protocols) ? (r.protocols as string[]) : [],
    unlockCurve:    typeof r.unlockCurve === "string" && r.unlockCurve.length > 0
      ? r.unlockCurve.split(",").map((s) => Number(s)).filter((n) => Number.isFinite(n))
      : null,
  }));
  return { rows: out, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Full-dataset projection for the CLIENT-SIDE explorer. Instead of one
// paginated server read per filter/sort/page change (a force-dynamic round-trip
// — the explorer reads searchParams, so it can never be CDN-cached), we ship
// the WHOLE upcoming-unlock universe ONCE (compact, ~0.4MB gzipped over ~6.7k
// rows) and let the browser filter/sort/paginate in-memory. Zero round-trips
// per interaction → genuinely instant. The shape uses short keys to keep the
// payload small; the client expands each to the table's ExplorerRow. Served by
// /api/dashboard/explorer/dataset (public, CDN-cached — it's the same per-token
// rollup data the public /explore pages already expose).
// ─────────────────────────────────────────────────────────────────────────────
export interface ExplorerDatasetRow {
  c:   number;          // chainId
  a:   string;          // tokenAddress
  s:   string | null;   // tokenSymbol
  d:   number;          // tokenDecimals
  amt: string;          // total_locked (raw stringified bigint)
  u:   number | null;   // locked value USD
  mc:  number | null;   // market cap
  t:   number | null;   // top-holder share (0–1)
  w:   number;          // wallet count
  r:   number;          // round (schedule) count
  cl:  0 | 1;           // has cliff
  fs:  number | null;   // first start (unix sec)
  le:  number | null;   // last end (unix sec)
  n:   number | null;   // next unlock (unix sec)
  p:   string[];        // protocols
  cv:  string | null;   // unlock curve — comma-joined cumulative-% samples (parsed client-side)
}

export async function getExplorerDataset(): Promise<ExplorerDatasetRow[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  const now = Math.floor(Date.now() / 1000);

  type R = Record<string, unknown>;
  let rows: R[] = [];
  try {
    // Bounded — this single full-scan feeds the explorer's only data fetch.
    // If it stalls on a saturated pooler connection, an unbounded await would
    // hang the route until Cloudflare's 100s cutoff and the explorer would sit
    // on a skeleton forever. withTimeout degrades to [] in 12s instead.
    rows = (await withTimeout(
      db.execute(sql`
        SELECT chain_id AS "c", token_address AS "a", token_symbol AS "s",
               token_decimals AS "d", total_locked AS "amt",
               locked_value_usd AS "u", market_cap AS "mc", top_holder_share AS "t",
               wallet_count AS "w", round_count AS "r", has_cliff AS "cl",
               first_start AS "fs", last_end AS "le", next_unlock AS "n",
               protocols AS "p", unlock_curve AS "cv"
        FROM token_vesting_rollups
        WHERE next_unlock IS NOT NULL AND next_unlock >= ${now}
      `) as unknown as Promise<R[]>,
      12000,
      [] as R[],
      "explorer-dataset",
    )) ?? [];
  } catch (err) {
    console.error("[token-rollups] getExplorerDataset failed:", err);
    return [];
  }

  return rows.map((r) => ({
    c:   Number(r.c),
    a:   String(r.a),
    s:   (r.s as string | null) ?? null,
    d:   Number(r.d ?? 18),
    amt: String(r.amt ?? "0"),
    u:   r.u != null ? Number(r.u) : null,
    mc:  r.mc != null ? Number(r.mc) : null,
    t:   r.t != null ? Number(r.t) : null,
    w:   Number(r.w ?? 0),
    r:   Number(r.r ?? 0),
    cl:  r.cl ? 1 : 0,
    fs:  r.fs != null ? Number(r.fs) : null,
    le:  r.le != null ? Number(r.le) : null,
    n:   r.n != null ? Number(r.n) : null,
    p:   Array.isArray(r.p) ? (r.p as string[]) : [],
    cv:  typeof r.cv === "string" && r.cv.length > 0 ? r.cv : null,
  }));
}
