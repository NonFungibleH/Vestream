// src/lib/vesting/explorer-queries.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight stream-level queries powering the /dashboard/explorer Stream
// and Wallet modes. Distinct from getUnlocksInWindow() (which collapses into
// event-grouped buckets for the calendar) — this one returns one row per
// stream so the UI can show individual schedules with detail.
//
// Returns the same VestingStream-ish shape we use everywhere else, but
// reading directly from vestingStreamsCache rather than re-running adapter
// fetches. The cache is the source of truth for the "everything we've ever
// indexed" view; per-user re-fetches happen elsewhere via dbcache.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { and, asc, count, desc, eq, gt, ilike, inArray, lte, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";
import { normaliseAddress } from "../address-validation";
import { PROTOCOL_DEFAULT_CATEGORY } from "@vestream/shared";
import type { VestingStream } from "./types";

// Continuous-flow protocols (per-second streaming, no discrete unlocks) —
// derived from the shared category map so a future stream protocol is picked
// up automatically. These are EXCLUDED from the unlock-centric rollup/explorer
// and surfaced via the dedicated "Streaming" view instead.
export const CONTINUOUS_PROTOCOL_IDS: string[] = Object.entries(PROTOCOL_DEFAULT_CATEGORY)
  .filter(([, c]) => c === "stream")
  .map(([id]) => id);

const PUBLIC_HIDDEN_CHAIN_IDS = [11155111, 84532] as const;
const excludeTestnets = notInArray(vestingStreamsCache.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]);

function isDbUnreachable(): boolean {
  const dbUrl = process.env.DATABASE_URL;
  return !dbUrl || /(\/\/|@)(localhost|127\.0\.0\.1)/.test(dbUrl);
}

// Shared column set + row mapper so the three stream queries below stay in
// lockstep (one place to change the shape).
const STREAM_SELECT = {
  streamId:      vestingStreamsCache.streamId,
  protocol:      vestingStreamsCache.protocol,
  chainId:       vestingStreamsCache.chainId,
  recipient:     vestingStreamsCache.recipient,
  tokenSymbol:   vestingStreamsCache.tokenSymbol,
  tokenAddress:  vestingStreamsCache.tokenAddress,
  endTime:       vestingStreamsCache.endTime,
  isFullyVested: vestingStreamsCache.isFullyVested,
  streamData:    vestingStreamsCache.streamData,
} as const;

type StreamSelectRow = {
  streamId: string; protocol: string; chainId: number; recipient: string;
  tokenSymbol: string | null; tokenAddress: string | null; endTime: number | null;
  isFullyVested: boolean; streamData: unknown;
};

function mapStreamRow(r: StreamSelectRow): StreamRow {
  const sd = r.streamData as Partial<VestingStream>;
  const next = typeof sd.nextUnlockTime === "number" && sd.nextUnlockTime > 0 ? sd.nextUnlockTime : null;
  return {
    streamId:       r.streamId,
    protocol:       r.protocol === "uncx-vm" ? "uncx" : r.protocol,
    chainId:        r.chainId,
    recipient:      r.recipient,
    tokenSymbol:    r.tokenSymbol,
    tokenAddress:   normaliseAddress(r.tokenAddress ?? ""),
    tokenDecimals:  typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
    endTime:        r.endTime ?? 0,
    nextUnlockTime: next,
    amount:         sd.lockedAmount ?? sd.totalAmount ?? null,
    status:         r.isFullyVested ? ("vested" as const) : ("active" as const),
  };
}

// ── Paginated stream/wallet query ──────────────────────────────────────────
// Powers the explorer's Schedules (stream) + Wallet modes server-side, so they
// browse the FULL set 25-at-a-time instead of the old ~1000-row cap. Pass
// `recipient` for wallet mode. Symbol filter is applied in SQL (not JS) so the
// page count is accurate. Returns the page + the true total for the pager.
export type StreamSortKey = "date" | "amount" | "next";

const STREAM_SORT_SQL: Record<StreamSortKey, ReturnType<typeof sql> | typeof vestingStreamsCache.endTime> = {
  date:   vestingStreamsCache.endTime,
  amount: sql`((${vestingStreamsCache.streamData}->>'lockedAmount')::numeric)`,
  next:   sql`((${vestingStreamsCache.streamData}->>'nextUnlockTime')::numeric)`,
};

export async function getStreamsPage(
  filter: StreamsFilter & { recipient?: string },
  opts: { page: number; pageSize: number; sort: StreamSortKey; dir: "asc" | "desc" },
): Promise<{ rows: StreamRow[]; total: number }> {
  if (isDbUnreachable()) return { rows: [], total: 0 };

  const status = filter.status ?? "active";
  const wheres = [excludeTestnets];
  if (status === "active") {
    wheres.push(eq(vestingStreamsCache.isFullyVested, false));
    wheres.push(gt(vestingStreamsCache.endTime, Math.floor(Date.now() / 1000) + 60));
  } else if (status === "vested") {
    wheres.push(eq(vestingStreamsCache.isFullyVested, true));
  }
  if (filter.recipient) {
    const r = filter.recipient.startsWith("0x") ? filter.recipient.toLowerCase() : filter.recipient;
    wheres.push(eq(vestingStreamsCache.recipient, r));
  }
  if (filter.chainIds && filter.chainIds.length > 0) {
    wheres.push(inArray(vestingStreamsCache.chainId, [...filter.chainIds]));
  }
  if (filter.adapterIds && filter.adapterIds.length > 0) {
    wheres.push(inArray(vestingStreamsCache.protocol, [...filter.adapterIds]));
  }
  if (filter.tokenAddress) {
    wheres.push(eq(vestingStreamsCache.tokenAddress, normaliseAddress(filter.tokenAddress)));
  }
  if (filter.tokenSymbol && filter.tokenSymbol.trim().length > 0) {
    // Escaped ilike = case-insensitive exact match, in SQL so the count is
    // accurate (the old getStreamsForExplorer filtered symbol in JS, which
    // would mis-count once paginated).
    wheres.push(ilike(vestingStreamsCache.tokenSymbol, filter.tokenSymbol.trim().replace(/([%_\\])/g, "\\$1")));
  }
  const whereClause = and(...wheres);

  const pageSize = Math.max(1, Math.min(100, opts.pageSize));
  const offset   = Math.max(0, (opts.page - 1) * pageSize);
  const sortExpr = STREAM_SORT_SQL[opts.sort] ?? vestingStreamsCache.endTime;
  const orderBy  = opts.dir === "desc" ? desc(sortExpr) : asc(sortExpr);

  try {
    const [rows, totalRes] = await Promise.all([
      db.select(STREAM_SELECT)
        .from(vestingStreamsCache)
        .where(whereClause)
        // Stable tiebreaker (streamId) so paging is deterministic when the
        // sort key ties (e.g. many streams ending the same day).
        .orderBy(orderBy, asc(vestingStreamsCache.streamId))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(vestingStreamsCache).where(whereClause),
    ]);
    return { rows: rows.map(mapStreamRow), total: Number(totalRes[0]?.total ?? 0) };
  } catch (err) {
    console.error("[explorer-queries] getStreamsPage failed:", err);
    return { rows: [], total: 0 };
  }
}

export interface StreamRow {
  streamId:       string;
  protocol:       string;
  chainId:        number;
  recipient:      string;
  tokenSymbol:    string | null;
  tokenAddress:   string;
  tokenDecimals:  number;
  endTime:        number;
  nextUnlockTime: number | null;
  amount:         string | null;
  status:         "active" | "vested";
}

// ── Continuous-stream query (the "Streaming" view) ──────────────────────────
// Continuous protocols (LlamaPay today) flow per-second with no discrete unlock
// and are modelled as fully-vested "streamed-so-far" snapshots, so they're
// absent from the rollup AND the Schedules tab (which filters active/unvested).
// This query surfaces them as ongoing flows: streamed-so-far + per-day rate,
// ordered most-recently-created first. No is_fully_vested filter (they're
// always flagged vested by design).
export interface StreamingRow {
  streamId:        string;
  protocol:        string;
  chainId:         number;
  recipient:       string;
  tokenSymbol:     string | null;
  tokenAddress:    string;
  tokenDecimals:   number;
  streamedAmount:  string;          // totalAmount streamed so far (raw bigint)
  amountPerSecRaw: string | null;   // LlamaPay 20-dec raw rate → tokens/day = /1e20*86400
  startTime:       number;          // stream creation (unix sec)
}

function mapStreamingRow(r: StreamSelectRow): StreamingRow {
  const sd = r.streamData as Partial<VestingStream> & { claimArgs?: { amountPerSec?: string } };
  return {
    streamId:        r.streamId,
    protocol:        r.protocol,
    chainId:         r.chainId,
    recipient:       r.recipient,
    tokenSymbol:     r.tokenSymbol,
    tokenAddress:    normaliseAddress(r.tokenAddress ?? ""),
    tokenDecimals:   typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
    streamedAmount:  sd.totalAmount ?? "0",
    amountPerSecRaw: sd.claimArgs?.amountPerSec ?? null,
    startTime:       typeof sd.startTime === "number" ? sd.startTime : 0,
  };
}

export async function getStreamingStreams(
  filter: { chainIds?: readonly number[]; protocolIds?: readonly string[] },
  opts: { page: number; pageSize: number },
): Promise<{ rows: StreamingRow[]; total: number }> {
  if (process.env.NEXT_PHASE === "phase-production-build" || isDbUnreachable()) return { rows: [], total: 0 };

  // Restrict to continuous protocols. If the caller passed a protocol filter,
  // intersect with it; otherwise show all continuous protocols.
  const ids = (filter.protocolIds && filter.protocolIds.length > 0)
    ? filter.protocolIds.filter((p) => CONTINUOUS_PROTOCOL_IDS.includes(p))
    : CONTINUOUS_PROTOCOL_IDS;
  if (ids.length === 0) return { rows: [], total: 0 };

  const wheres = [excludeTestnets, inArray(vestingStreamsCache.protocol, ids)];
  if (filter.chainIds && filter.chainIds.length > 0) {
    wheres.push(inArray(vestingStreamsCache.chainId, [...filter.chainIds]));
  }
  const whereClause = and(...wheres);
  const pageSize = Math.max(1, Math.min(100, opts.pageSize));
  const offset   = Math.max(0, (opts.page - 1) * pageSize);
  const startExpr = sql`((${vestingStreamsCache.streamData}->>'startTime')::numeric)`;

  try {
    const [rows, totalRes] = await Promise.all([
      db.select(STREAM_SELECT)
        .from(vestingStreamsCache)
        .where(whereClause)
        .orderBy(desc(startExpr), asc(vestingStreamsCache.streamId))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(vestingStreamsCache).where(whereClause),
    ]);
    return { rows: rows.map(mapStreamingRow), total: Number(totalRes[0]?.total ?? 0) };
  } catch (err) {
    console.error("[explorer-queries] getStreamingStreams failed:", err);
    return { rows: [], total: 0 };
  }
}

export interface StreamsFilter {
  chainIds?:    readonly number[];
  /** Adapter ids — pass uncx-vm separately if the caller has expanded slugs. */
  adapterIds?:  readonly string[];
  /** Lower-cased token contract address. */
  tokenAddress?: string;
  /** Symbol filter — case-insensitive exact match against tokenSymbol. */
  tokenSymbol?:  string;
  /** "active" only (default), or "vested" for completed schedules. */
  status?:      "active" | "vested" | "any";
  /** Result cap. Defaults to 200 — bound to keep transfer modest. */
  limit?:       number;
}

/**
 * Query individual streams with optional filters. Sorted by endTime ASC so
 * the soonest-to-complete schedules surface first.
 *
 * No JS-side grouping — this is the per-row view. For calendar grouping use
 * getUnlocksInWindow() instead.
 */
export async function getStreamsForExplorer(filter: StreamsFilter = {}): Promise<StreamRow[]> {
  if (isDbUnreachable()) return [];

  const limit = filter.limit ?? 200;
  const status = filter.status ?? "active";

  const wheres = [excludeTestnets];
  if (status === "active") {
    wheres.push(eq(vestingStreamsCache.isFullyVested, false));
    wheres.push(gt(vestingStreamsCache.endTime, Math.floor(Date.now() / 1000) + 60));
  } else if (status === "vested") {
    wheres.push(eq(vestingStreamsCache.isFullyVested, true));
  }
  if (filter.chainIds && filter.chainIds.length > 0) {
    wheres.push(inArray(vestingStreamsCache.chainId, [...filter.chainIds]));
  }
  if (filter.adapterIds && filter.adapterIds.length > 0) {
    wheres.push(inArray(vestingStreamsCache.protocol, [...filter.adapterIds]));
  }
  if (filter.tokenAddress) {
    wheres.push(eq(vestingStreamsCache.tokenAddress, normaliseAddress(filter.tokenAddress)));
  }
  // Symbol filter handled in JS — postgres lower() comparison without a
  // function index is a sequential scan; the JS filter on the result of an
  // already-bounded query is cheap enough.

  const rows = await db
    .select({
      streamId:     vestingStreamsCache.streamId,
      protocol:     vestingStreamsCache.protocol,
      chainId:      vestingStreamsCache.chainId,
      recipient:    vestingStreamsCache.recipient,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      tokenAddress: vestingStreamsCache.tokenAddress,
      endTime:      vestingStreamsCache.endTime,
      isFullyVested: vestingStreamsCache.isFullyVested,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(and(...wheres))
    .orderBy(asc(vestingStreamsCache.endTime))
    .limit(limit);

  let mapped = rows.map((r) => {
    const sd = r.streamData as Partial<VestingStream>;
    const next = typeof sd.nextUnlockTime === "number" && sd.nextUnlockTime > 0
      ? sd.nextUnlockTime
      : null;
    return {
      streamId:       r.streamId,
      protocol:       r.protocol === "uncx-vm" ? "uncx" : r.protocol,
      chainId:        r.chainId,
      recipient:      r.recipient,
      tokenSymbol:    r.tokenSymbol,
      tokenAddress:   normaliseAddress(r.tokenAddress ?? ""),
      tokenDecimals:  typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
      endTime:        r.endTime ?? 0,
      nextUnlockTime: next,
      amount:         sd.lockedAmount ?? sd.totalAmount ?? null,
      status:         r.isFullyVested ? ("vested" as const) : ("active" as const),
    };
  });

  if (filter.tokenSymbol) {
    const want = filter.tokenSymbol.toLowerCase();
    mapped = mapped.filter((s) => (s.tokenSymbol ?? "").toLowerCase() === want);
  }

  return mapped;
}

/**
 * Query streams for a specific recipient (wallet mode). Same shape as
 * getStreamsForExplorer but keyed on recipient — the cache is indexed on
 * recipient lookups for `/api/vesting`, so this is fast.
 */
export async function getStreamsByRecipient(
  recipient: string,
  filter: Omit<StreamsFilter, "tokenAddress"> = {},
): Promise<StreamRow[]> {
  if (isDbUnreachable()) return [];

  const normalised = recipient.startsWith("0x") ? recipient.toLowerCase() : recipient;
  const limit = filter.limit ?? 500;

  const wheres = [
    eq(vestingStreamsCache.recipient, normalised),
    excludeTestnets,
  ];
  const status = filter.status ?? "any";
  if (status === "active") {
    wheres.push(eq(vestingStreamsCache.isFullyVested, false));
  } else if (status === "vested") {
    wheres.push(eq(vestingStreamsCache.isFullyVested, true));
  }
  if (filter.chainIds && filter.chainIds.length > 0) {
    wheres.push(inArray(vestingStreamsCache.chainId, [...filter.chainIds]));
  }
  if (filter.adapterIds && filter.adapterIds.length > 0) {
    wheres.push(inArray(vestingStreamsCache.protocol, [...filter.adapterIds]));
  }

  const rows = await db
    .select({
      streamId:     vestingStreamsCache.streamId,
      protocol:     vestingStreamsCache.protocol,
      chainId:      vestingStreamsCache.chainId,
      recipient:    vestingStreamsCache.recipient,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      tokenAddress: vestingStreamsCache.tokenAddress,
      endTime:      vestingStreamsCache.endTime,
      isFullyVested: vestingStreamsCache.isFullyVested,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(and(...wheres))
    .orderBy(asc(vestingStreamsCache.endTime))
    .limit(limit);

  return rows.map((r) => {
    const sd = r.streamData as Partial<VestingStream>;
    const next = typeof sd.nextUnlockTime === "number" && sd.nextUnlockTime > 0
      ? sd.nextUnlockTime
      : null;
    return {
      streamId:       r.streamId,
      protocol:       r.protocol === "uncx-vm" ? "uncx" : r.protocol,
      chainId:        r.chainId,
      recipient:      r.recipient,
      tokenSymbol:    r.tokenSymbol,
      tokenAddress:   normaliseAddress(r.tokenAddress ?? ""),
      tokenDecimals:  typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
      endTime:        r.endTime ?? 0,
      nextUnlockTime: next,
      amount:         sd.lockedAmount ?? sd.totalAmount ?? null,
      status:         r.isFullyVested ? ("vested" as const) : ("active" as const),
    };
  });
}
