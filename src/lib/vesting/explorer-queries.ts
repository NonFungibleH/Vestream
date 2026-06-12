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

import { and, asc, eq, gt, inArray, lte, notInArray } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";
import { normaliseAddress } from "../address-validation";
import type { VestingStream } from "./types";

const PUBLIC_HIDDEN_CHAIN_IDS = [11155111, 84532] as const;
const excludeTestnets = notInArray(vestingStreamsCache.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]);

function isDbUnreachable(): boolean {
  const dbUrl = process.env.DATABASE_URL;
  return !dbUrl || /(\/\/|@)(localhost|127\.0\.0\.1)/.test(dbUrl);
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
