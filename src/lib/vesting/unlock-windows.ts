// src/lib/vesting/unlock-windows.ts
// ─────────────────────────────────────────────────────────────────────────────
// Date-windowed unlock queries powering the /unlocks/[range] SEO landing pages.
//
// Designed parallel to `getUpcomingUnlockGroupsAcross()` in protocol-stats.ts —
// same grouping logic (collapse mass distributions to one row per (proto,
// chain, token, hour-bucket)) but:
//   - bounded by an explicit [startSec, endSec] window instead of "next N"
//   - no per-protocol cap (we want every unlock in the window for SEO)
//   - higher pool ceiling so we can comfortably surface 200+ rows
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";
import type { VestingStream } from "./types";

/**
 * Per-group output for window queries. Distinct from UnlockGroupSummary in
 * protocol-stats.ts because the field semantics differ:
 *
 *   - UnlockGroupSummary.endTime  = the stream's full completion time
 *   - WindowUnlockGroup.eventTime = the next *discrete* unlock event
 *                                   (nextUnlockTime if available, else endTime)
 *
 * This matters because most real-world vests are multi-year schedules with
 * monthly drips. Filtering by stream-end-time misses every intermediate
 * unlock event — exactly what calendar pages need to surface.
 */
export interface WindowUnlockGroup {
  streamId:      string;
  protocol:      string;
  chainId:       number;
  tokenSymbol:   string | null;
  tokenAddress:  string;
  tokenDecimals: number;
  /** Unix seconds — time of the next discrete unlock event for this group. */
  eventTime:     number;
  /** Stringified bigint — sum of locked amount across the group, or null
   *  if no member contributed a parseable amount. */
  amount:        string | null;
  recipient:     string;
  walletCount:   number;
  streamCount:   number;
  groupKey:      string;
}

const PUBLIC_HIDDEN_CHAIN_IDS = [11155111, 84532] as const;
const excludeTestnets = notInArray(vestingStreamsCache.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]);

// ── Window definitions ──────────────────────────────────────────────────────

export type WindowSlug =
  | "today"
  | "tomorrow"
  | "this-week"
  | "next-7-days"
  | "this-month"
  | "30-days"
  | "60-days"
  | "90-days";

export interface WindowDef {
  slug:        WindowSlug;
  label:       string;
  description: string;
  /** Range in seconds (relative to now). Computed at query-time. */
  range: () => { startSec: number; endSec: number };
}

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;

function startOfDayUtc(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

function endOfDayUtc(d: Date): number {
  return startOfDayUtc(d) + SECONDS_PER_DAY - 1;
}

export const WINDOWS: Record<WindowSlug, WindowDef> = {
  "today": {
    slug:        "today",
    label:       "Today",
    description: "Token unlocks happening in the next 24 hours.",
    range: () => {
      const now = Math.floor(Date.now() / 1000);
      return { startSec: now, endSec: now + SECONDS_PER_DAY };
    },
  },
  "tomorrow": {
    slug:        "tomorrow",
    label:       "Tomorrow",
    description: "Token unlocks happening 24–48 hours from now.",
    range: () => {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return { startSec: startOfDayUtc(tomorrow), endSec: endOfDayUtc(tomorrow) };
    },
  },
  "this-week": {
    slug:        "this-week",
    label:       "This week",
    description: "Token unlocks scheduled for the rest of this calendar week (UTC).",
    range: () => {
      const now    = new Date();
      const day    = now.getUTCDay(); // 0 = Sun
      const daysToSunday = 7 - day;   // Mon = 6, Tue = 5 … Sun = 7
      const endOfWeek = new Date(now);
      endOfWeek.setUTCDate(now.getUTCDate() + daysToSunday);
      return { startSec: Math.floor(now.getTime() / 1000), endSec: endOfDayUtc(endOfWeek) };
    },
  },
  "next-7-days": {
    slug:        "next-7-days",
    label:       "Next 7 days",
    description: "Rolling 7-day window of upcoming token unlocks.",
    range: () => {
      const now = Math.floor(Date.now() / 1000);
      return { startSec: now, endSec: now + 7 * SECONDS_PER_DAY };
    },
  },
  "this-month": {
    slug:        "this-month",
    label:       "This month",
    description: "Token unlocks scheduled for the rest of this calendar month (UTC).",
    range: () => {
      const now = new Date();
      const lastDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      return { startSec: Math.floor(now.getTime() / 1000), endSec: endOfDayUtc(lastDayOfMonth) };
    },
  },
  "30-days": {
    slug:        "30-days",
    label:       "Next 30 days",
    description: "Rolling 30-day window of upcoming token unlocks.",
    range: () => {
      const now = Math.floor(Date.now() / 1000);
      return { startSec: now, endSec: now + 30 * SECONDS_PER_DAY };
    },
  },
  "60-days": {
    slug:        "60-days",
    label:       "Next 60 days",
    description: "Rolling 60-day window of upcoming token unlocks.",
    range: () => {
      const now = Math.floor(Date.now() / 1000);
      return { startSec: now, endSec: now + 60 * SECONDS_PER_DAY };
    },
  },
  "90-days": {
    slug:        "90-days",
    label:       "Next 90 days",
    description: "Rolling 90-day window of upcoming token unlocks.",
    range: () => {
      const now = Math.floor(Date.now() / 1000);
      return { startSec: now, endSec: now + 90 * SECONDS_PER_DAY };
    },
  },
};

export const ALL_WINDOW_SLUGS: WindowSlug[] = Object.keys(WINDOWS) as WindowSlug[];

// ── Aggregate stats over the window ─────────────────────────────────────────

export interface WindowAggregateStats {
  /** Number of distinct unlock-groups in the window (post-collapse). */
  unlockCount:   number;
  /** Distinct token symbols affected. */
  tokenCount:    number;
  /** Distinct chains seen. */
  chainCount:    number;
  /** Distinct recipient wallets across all groups. */
  walletCount:   number;
  /** Sum of locked amounts (per-token) — reported as a per-token map because
   *  summing absolute amounts across different tokens would be meaningless. */
  byToken:       Array<{ symbol: string | null; address: string; amount: bigint }>;
}

// ── Window query — returns groups + aggregate stats ─────────────────────────

export interface WindowResult {
  groups: WindowUnlockGroup[];
  stats:  WindowAggregateStats;
}

/**
 * Fetch all unlock groups in [startSec, endSec], grouped by
 * (proto, chain, token, eventTime hour-bucket).
 *
 * **Filtering happens in app code, not SQL.** Background: most real-world
 * vests are multi-year schedules with periodic unlocks (monthly drips,
 * cliff steps). The stream's `endTime` (when vesting fully completes) is
 * years out — but the *next discrete unlock event* is much closer. SQL-
 * filtering by endTime misses every intermediate event. So we pull all
 * active streams (capped at poolLimit), compute eventTime per row in JS
 * (= streamData.nextUnlockTime ?? endTime), and filter by that.
 *
 * `poolLimit` defaults to 5000 — large enough that a multi-protocol query
 * captures essentially every active stream we have indexed, while staying
 * under a few-MB transfer budget.
 */
const EMPTY_WINDOW_RESULT: WindowResult = {
  groups: [],
  stats:  { unlockCount: 0, tokenCount: 0, chainCount: 0, walletCount: 0, byToken: [] },
};

export async function getUnlocksInWindow(
  startSec: number,
  endSec:   number,
  poolLimit = 5000,
  /** Optional — if set, restrict to streams with one of these adapter IDs.
   *  Used by the per-protocol /protocols/[slug]/unlocks pages. Empty array
   *  is treated as "no filter" (same as undefined). */
  adapterIds?: readonly string[],
  /** Optional — if set, restrict to streams on one of these chain IDs.
   *  Used when a chain-filter UI is active (e.g. "Show only Ethereum
   *  unlocks"). Empty array → no filter. */
  chainIds?: readonly number[],
): Promise<WindowResult> {
  // Build-time short-circuit (CI runs `next build` without DATABASE_URL).
  if (!process.env.DATABASE_URL) {
    return EMPTY_WINDOW_RESULT;
  }

  const protocolFilter = adapterIds && adapterIds.length > 0
    ? inArray(vestingStreamsCache.protocol, [...adapterIds])
    : undefined;
  const chainFilter = chainIds && chainIds.length > 0
    ? inArray(vestingStreamsCache.chainId, [...chainIds])
    : undefined;

  // Pull every ACTIVE stream (isFullyVested = false) for the protocol(s).
  // No endTime filter at SQL level — eventTime filtering happens in JS.
  const rows = await db
    .select({
      streamId:     vestingStreamsCache.streamId,
      protocol:     vestingStreamsCache.protocol,
      chainId:      vestingStreamsCache.chainId,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      tokenAddress: vestingStreamsCache.tokenAddress,
      endTime:      vestingStreamsCache.endTime,
      recipient:    vestingStreamsCache.recipient,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        eq(vestingStreamsCache.isFullyVested, false),
        excludeTestnets,
        ...(protocolFilter ? [protocolFilter] : []),
        ...(chainFilter ? [chainFilter] : []),
      ),
    )
    .limit(poolLimit);

  // ── Compute per-row eventTime + filter by window ───────────────────────
  // eventTime = nextUnlockTime if positive, else endTime. Streams without
  // either get a 0 eventTime and are dropped by the window filter.
  type EnrichedRow = typeof rows[number] & { eventTime: number };
  const enriched: EnrichedRow[] = rows.map((row) => {
    const sd = row.streamData as Partial<VestingStream>;
    const next = typeof sd.nextUnlockTime === "number" && sd.nextUnlockTime > 0
      ? sd.nextUnlockTime
      : 0;
    const end = row.endTime ?? 0;
    const eventTime = next > 0 ? next : end;
    return { ...row, eventTime };
  }).filter((r) => r.eventTime >= startSec && r.eventTime <= endSec);

  // ── Group by (protocolCanonical, chainId, tokenAddress, hourBucket) ─────
  // Hour-bucket is derived from eventTime (the next discrete unlock time)
  // rather than endTime, so mass distributions to many wallets at the same
  // event time collapse correctly.
  interface Group {
    representative: EnrichedRow;
    protoCanonical: string;
    hourBucket:     number;
    recipients:     Set<string>;
    streamCount:    number;
    amountSum:      bigint;
    hasAmount:      boolean;
    earliestEvent:  number;
  }

  const groups = new Map<string, Group>();
  const allRecipients = new Set<string>();
  const tokenAmountMap = new Map<string, { symbol: string | null; address: string; amount: bigint }>();

  for (const row of enriched) {
    const protoCanonical = row.protocol === "uncx-vm" ? "uncx" : row.protocol;
    const tokenKey       = (row.tokenAddress ?? "").toLowerCase();
    const eventTime      = row.eventTime;
    const hourBucket     = Math.floor(eventTime / SECONDS_PER_HOUR);
    const key            = `${protoCanonical}-${row.chainId}-${tokenKey}-${hourBucket}`;

    let g = groups.get(key);
    if (!g) {
      g = {
        representative: row,
        protoCanonical,
        hourBucket,
        recipients:     new Set(),
        streamCount:    0,
        amountSum:      0n,
        hasAmount:      false,
        earliestEvent:  eventTime,
      };
      groups.set(key, g);
    } else if (eventTime > 0 && eventTime < g.earliestEvent) {
      g.representative = row;
      g.earliestEvent  = eventTime;
    }

    g.recipients.add(row.recipient);
    allRecipients.add(row.recipient);
    g.streamCount += 1;

    const sd = row.streamData as Partial<VestingStream>;
    const rawAmount = sd.lockedAmount ?? sd.totalAmount ?? null;
    if (rawAmount) {
      try {
        const amt = BigInt(rawAmount);
        g.amountSum += amt;
        g.hasAmount  = true;
        const existing = tokenAmountMap.get(tokenKey);
        if (existing) {
          existing.amount += amt;
        } else {
          tokenAmountMap.set(tokenKey, {
            symbol:  row.tokenSymbol,
            address: tokenKey,
            amount:  amt,
          });
        }
      } catch {
        // Ignore unparseable amount.
      }
    }
  }

  const ordered = Array.from(groups.values()).sort(
    (a, b) => (a.earliestEvent || Number.MAX_SAFE_INTEGER) - (b.earliestEvent || Number.MAX_SAFE_INTEGER),
  );

  const groupSummaries: WindowUnlockGroup[] = ordered.map((g) => {
    const sd = g.representative.streamData as Partial<VestingStream>;
    return {
      streamId:      g.representative.streamId,
      protocol:      g.protoCanonical,
      chainId:       g.representative.chainId,
      tokenSymbol:   g.representative.tokenSymbol ?? null,
      tokenAddress:  (g.representative.tokenAddress ?? "").toLowerCase(),
      tokenDecimals: typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
      eventTime:     g.earliestEvent,
      amount:        g.hasAmount ? g.amountSum.toString() : null,
      recipient:    g.representative.recipient,
      walletCount:  g.recipients.size,
      streamCount:  g.streamCount,
      groupKey:     `${g.protoCanonical}-${g.representative.chainId}-${(g.representative.tokenAddress ?? "").toLowerCase()}-${g.hourBucket}`,
    };
  });

  const chainSet  = new Set(ordered.map((g) => g.representative.chainId));
  const tokenSet  = new Set(ordered.map((g) => (g.representative.tokenAddress ?? "").toLowerCase()));

  // Sort by-token aggregates by amount desc — used for "biggest unlocks" lists
  const byToken = Array.from(tokenAmountMap.values())
    .sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0))
    .slice(0, 20);

  return {
    groups: groupSummaries,
    stats:  {
      unlockCount: groupSummaries.length,
      tokenCount:  tokenSet.size,
      chainCount:  chainSet.size,
      walletCount: allRecipients.size,
      byToken,
    },
  };
}
