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

import { and, asc, eq, gt, gte, lte, notInArray } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";
import type { VestingStream } from "./types";
import type { UnlockGroupSummary } from "./protocol-stats";

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
  groups: UnlockGroupSummary[];
  stats:  WindowAggregateStats;
}

/**
 * Fetch all unlock groups in [startSec, endSec], grouped by (proto, chain,
 * token, hour-bucket). Same collapse logic as getUpcomingUnlockGroupsAcross
 * but bounded by date window instead of count, and without the
 * per-protocol cap that would distort SEO listings.
 *
 * Pool size is capped at 500 — beyond that we'd be surfacing too many rows
 * for a useful page anyway, and the DB query stays cheap.
 */
export async function getUnlocksInWindow(
  startSec: number,
  endSec:   number,
  poolLimit = 500,
): Promise<WindowResult> {
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
        gte(vestingStreamsCache.endTime, startSec),
        lte(vestingStreamsCache.endTime, endSec),
        gt(vestingStreamsCache.endTime, 0),
        excludeTestnets,
      ),
    )
    .orderBy(asc(vestingStreamsCache.endTime))
    .limit(poolLimit);

  // ── Group by (protocolCanonical, chainId, tokenAddress, hourBucket) ─────
  interface Group {
    representative: typeof rows[number];
    protoCanonical: string;
    hourBucket:     number;
    recipients:     Set<string>;
    streamCount:    number;
    amountSum:      bigint;
    hasAmount:      boolean;
    earliestEnd:    number;
  }

  const groups = new Map<string, Group>();
  const allRecipients = new Set<string>();
  const tokenAmountMap = new Map<string, { symbol: string | null; address: string; amount: bigint }>();

  for (const row of rows) {
    const protoCanonical = row.protocol === "uncx-vm" ? "uncx" : row.protocol;
    const tokenKey       = (row.tokenAddress ?? "").toLowerCase();
    const end            = row.endTime ?? 0;
    const hourBucket     = Math.floor(end / SECONDS_PER_HOUR);
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
        earliestEnd:    end,
      };
      groups.set(key, g);
    } else if (end > 0 && end < g.earliestEnd) {
      g.representative = row;
      g.earliestEnd    = end;
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
        // Per-token aggregate (across the entire window)
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
    (a, b) => (a.earliestEnd || Number.MAX_SAFE_INTEGER) - (b.earliestEnd || Number.MAX_SAFE_INTEGER),
  );

  const groupSummaries: UnlockGroupSummary[] = ordered.map((g) => {
    const sd = g.representative.streamData as Partial<VestingStream>;
    return {
      streamId:     g.representative.streamId,
      protocol:     g.protoCanonical,
      chainId:      g.representative.chainId,
      tokenSymbol:  g.representative.tokenSymbol ?? null,
      tokenAddress: (g.representative.tokenAddress ?? "").toLowerCase(),
      tokenDecimals: typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
      endTime:      g.representative.endTime ?? null,
      amount:       g.hasAmount ? g.amountSum.toString() : null,
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
