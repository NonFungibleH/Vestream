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
           bool_or((COALESCE((stream_data->>'cliffTime')::numeric, (stream_data->>'startTime')::numeric) - (stream_data->>'startTime')::numeric) > 86400) AS "hasCliff"
    FROM vesting_streams_cache
    WHERE is_fully_vested = false
      AND chain_id NOT IN (${sql.join(TESTNET_CHAIN_IDS, sql`, `)})
    GROUP BY chain_id, lower(token_address)
  `);

  // Merge by key. db.execute returns array-like rows (postgres-js driver).
  const concRows = (concentration as unknown as any[]) ?? [];
  const metaRows = (meta as unknown as any[]) ?? [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of metaRows) byKey.set(`${r.chainId}:${r.tok}`, { ...r });
  for (const r of concRows) {
    const k = `${r.chainId}:${r.tok}`;
    byKey.set(k, { ...(byKey.get(k) ?? { chainId: r.chainId, tok: r.tok }), ...r });
  }

  const now = new Date();
  const values = [...byKey.values()].map((r: any) => {
    let total = 0n, top = 0n;
    try { total = BigInt(r.total ?? "0"); } catch { /* 0 */ }
    try { top   = BigInt(r.top   ?? "0"); } catch { /* 0 */ }
    const topHolderShare = total > 0n ? Number((top * 1_000_000n) / total) / 1_000_000 : null;
    return {
      chainId:        Number(r.chainId),
      tokenAddress:   String(r.tok),
      tokenSymbol:    r.symbol ?? null,
      totalLocked:    total.toString(),
      topHolderShare,
      walletCount:    Number(r.wallets ?? 0),
      roundCount:     Number(r.rounds ?? 0),
      streamCount:    Number(r.streams ?? 0),
      firstStart:     r.firstStart != null ? Number(r.firstStart) : null,
      lastEnd:        r.lastEnd != null ? Number(r.lastEnd) : null,
      hasCliff:       Boolean(r.hasCliff),
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
          computedAt:     sql`excluded.computed_at`,
        },
      });
      written += chunk.length;
    } catch (err) {
      console.error(`[token-rollups] chunk upsert failed (rows ${i}-${i + chunk.length}):`, err);
    }
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
