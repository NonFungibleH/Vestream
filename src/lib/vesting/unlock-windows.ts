// src/lib/vesting/unlock-windows.ts
// ─────────────────────────────────────────────────────────────────────────────
// Date-windowed unlock queries powering the /unlocks/[range] SEO landing pages.
//
// Designed parallel to `getUpcomingUnlockGroupsAcross()` in protocol-stats.ts –
// same grouping logic (collapse mass distributions to one row per (proto,
// chain, token, hour-bucket)) but:
//   - bounded by an explicit [startSec, endSec] window instead of "next N"
//   - no per-protocol cap (we want every unlock in the window for SEO)
//   - higher pool ceiling so we can comfortably surface 200+ rows
// ─────────────────────────────────────────────────────────────────────────────

import { and, asc, eq, gt, ilike, inArray, lte, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";
// Ecosystem-aware: lowercases EVM hex, preserves case-SENSITIVE Solana
// base58 mints. Plain .toLowerCase() here corrupted every Solana token
// address flowing into explorer links (Streamflow/Jupiter 404s, 2026-06-12).
import { normaliseAddress } from "../address-validation";
import type { VestingStream } from "./types";
import type { QuickPriceMap } from "./quick-prices";

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
 * unlock event – exactly what calendar pages need to surface.
 */
export interface WindowUnlockGroup {
  streamId:      string;
  protocol:      string;
  chainId:       number;
  tokenSymbol:   string | null;
  tokenAddress:  string;
  tokenDecimals: number;
  /** Unix seconds – time of the next discrete unlock event for this group. */
  eventTime:     number;
  /** Stringified bigint – sum of locked amount across the group, or null
   *  if no member contributed a parseable amount. */
  amount:        string | null;
  recipient:     string;
  /** Distinct recipients IN THIS unlock bucket, over the capped query pool –
   *  an undercount for big tokens. Prefer tokenWalletCount for display. */
  walletCount:   number;
  streamCount:   number;
  groupKey:      string;
  /** TRUE distinct-recipient count across ALL cached streams for this
   *  (chainId, tokenAddress) – uncapped. Attached from the token rollup
   *  (readTokenRollups) in the explorer page; undefined until enriched. Fixes
   *  the "24 wallets" on an 850-vesting token undercount caused by the
   *  calendar pool's 2000-row global cap. */
  tokenWalletCount?: number;
  /** TRUE distinct vesting-round count for this token (same key as
   *  rounds.ts groupIntoRounds: protocol|shape|cliffDays|durationDays). */
  tokenRoundCount?:  number;
  /** Whole-token active vesting span (unix sec) – earliest start, latest end.
   *  Drives the explorer "% vested" progress bar. Attached alongside the
   *  token counts from the token rollup; undefined until enriched. */
  vestStart?:        number;
  vestEnd?:          number;
  /** TRUE if any active stream has a meaningful cliff (lump unlock). From
   *  the token rollup; drives the ⚠️ cliff flag in the explorer. */
  hasCliff?:         boolean;
  /** Largest single recipient's share (0–1) of this token's total locked
   *  amount – concentration / "whale" signal. From the token rollup
   *  (token_vesting_rollups, cron-maintained); undefined until enriched. */
  topHolderShare?:   number | null;
  /** USD value of the group's `amount` at render time, or null when the
   *  token has no liquid DEX pair / we couldn't price it. Populated by
   *  enrichGroupsWithUsd(); base getUnlocksInWindow() leaves these null
   *  so callers that don't render USD don't pay the DexScreener cost. */
  usdValue?:     number | null;
  usdConfidence?: "high" | "medium" | "low" | null;

  // ── Risk-judgment metrics (populated by enrichGroupsWithUsd) ──────────
  // These let the UI render "is this risky to hold through?" without the
  // user having to do mental math. All are 0-or-positive; null = can't
  // compute (missing input).

  /** Share of group `amount` owned by the single largest recipient (0–1).
   *  1.0 = single recipient (a team grant); ≤0.1 = broad distribution. */
  recipientConcentration?: number | null;
  /** unlockValueUsd ÷ token's 24h trading volume. >1 = the unlock is
   *  larger than a full day's volume; the market would visibly struggle
   *  to absorb it without slippage. Null when usdValue or volume24h missing. */
  absorptionRatio?:        number | null;
  /** unlockValueUsd ÷ the token's market cap – "how much of the tradeable
   *  token hits the market at once" (0–1). 0.1 = this unlock is 10% of market
   *  cap. The primary unlock-risk signal. Null when we have no market cap.
   *  Replaced the old supplyShare (unlock ÷ LOCKED supply), which flagged
   *  every single-wallet token HIGH. */
  marketCapShare?:         number | null;
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
  /** Optional render-time enrichment. When set, the index page (and per-
   *  range pages) prefer this over `label`. Used by the windows whose
   *  scope shifts with the current date – "This week" is more useful as
   *  "This week – ends Sun 4 May" once you know what week you're in;
   *  "This month" reads better as "This month – April 2026". Both forms
   *  also feed cleaner SEO titles than the generic noun. */
  dynamicLabel?:       () => string;
  dynamicDescription?: () => string;
}

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;

function startOfDayUtc(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

function endOfDayUtc(d: Date): number {
  return startOfDayUtc(d) + SECONDS_PER_DAY - 1;
}

function fmtDayShort(d: Date): string {
  // "Sun 4 May" – short day name, day-of-month, short month. UTC-anchored
  // because all our windows are UTC-anchored.
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day:     "numeric",
    month:   "short",
    timeZone: "UTC",
  });
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    month: "long",
    year:  "numeric",
    timeZone: "UTC",
  });
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
    dynamicLabel: () => {
      const now = new Date();
      const day = now.getUTCDay();
      const daysToSunday = 7 - day;
      const endOfWeek = new Date(now);
      endOfWeek.setUTCDate(now.getUTCDate() + daysToSunday);
      return `This week – ends ${fmtDayShort(endOfWeek)}`;
    },
    dynamicDescription: () => {
      const now = new Date();
      const day = now.getUTCDay();
      const daysToSunday = 7 - day;
      const endOfWeek = new Date(now);
      endOfWeek.setUTCDate(now.getUTCDate() + daysToSunday);
      return `Token unlocks scheduled through ${fmtDayShort(endOfWeek)} (UTC).`;
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
    dynamicLabel: () => {
      const now = new Date();
      return `This month – ${fmtMonthYear(now)}`;
    },
    dynamicDescription: () => {
      const now = new Date();
      return `Token unlocks scheduled for the rest of ${fmtMonthYear(now)} (UTC).`;
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
  /** Sum of locked amounts (per-token-per-chain) – reported as a flat list
   *  because summing absolute amounts across different tokens would be
   *  meaningless. Keyed by (chainId, address) so a token deployed on
   *  multiple chains gets its own entry per chain (USD pricing differs
   *  by chain via DexScreener slug, and the dashboard links to a per-
   *  chain explorer). */
  byToken:       Array<{
    symbol:   string | null;
    address:  string;
    chainId:  number;
    decimals: number;
    amount:   bigint;
  }>;
}

// ── Window query – returns groups + aggregate stats ─────────────────────────

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
 * years out – but the *next discrete unlock event* is much closer. SQL-
 * filtering by endTime misses every intermediate event. So we pull all
 * active streams (capped at poolLimit), compute eventTime per row in JS
 * (= streamData.nextUnlockTime ?? endTime), and filter by that.
 *
 * **Two-pass pool (fix for 60-day = 90-day identical counts):**
 * A single `ORDER BY endTime ASC LIMIT N` always saturates with the
 * soonest-expiring streams. When >N streams expire within 60 days, the
 * pool fills entirely with ≤60-day endTimes – multi-year vesting contracts
 * with monthly drips (endTime years out, nextUnlockTime ≤ 90 days) never
 * enter the pool, so 60-day and 90-day windows return identical results.
 *
 * The two-pass fix runs two queries in parallel:
 *   Pass A – streams whose endTime falls *inside* the window
 *             (endTime > startSec AND endTime ≤ endSec)
 *   Pass B – long-lived streams ending *after* the window
 *             (endTime > endSec), ordered by endTime ASC so the ones
 *             soonest-to-expire come first – best proxy for near-term
 *             nextUnlockTime without reading JSONB in SQL
 *
 * Both passes apply the same protocol/chain filters. Results are merged
 * before the JS eventTime filter, so each pass is bounded by `poolLimit`
 * (default 5000), giving up to 10 000 candidate rows total.
 */
export const EMPTY_WINDOW_RESULT: WindowResult = {
  groups: [],
  stats:  { unlockCount: 0, tokenCount: 0, chainCount: 0, walletCount: 0, byToken: [] },
};

export async function getUnlocksInWindow(
  startSec: number,
  endSec:   number,
  poolLimit = 5000,
  /** Optional – if set, restrict to streams with one of these adapter IDs.
   *  Used by the per-protocol /protocols/[slug]/unlocks pages. Empty array
   *  is treated as "no filter" (same as undefined). */
  adapterIds?: readonly string[],
  /** Optional – if set, restrict to streams on one of these chain IDs.
   *  Used when a chain-filter UI is active (e.g. "Show only Ethereum
   *  unlocks"). Empty array → no filter. */
  chainIds?: readonly number[],
  /** Optional – if set, restrict to streams of this token symbol
   *  (case-insensitive exact match). MUST be applied here in SQL, not by
   *  the caller on the returned groups: the pool below is capped at
   *  `poolLimit` ACROSS ALL TOKENS (soonest-ending first), so a post-hoc
   *  filter only sees whichever slice of the token's streams happened to
   *  make the global pool. Real bug: the dashboard explorer's calendar
   *  mode post-filtered to PYME and showed "24 wallets" when the token
   *  had 850+ vestings (2026-06-12). */
  tokenSymbol?: string,
): Promise<WindowResult> {
  // Build-time short-circuit. Two cases:
  //  (a) CI runs `next build` with a dummy `postgres://ci:ci@localhost:...`
  //      URL – postgres burns 30-60s per page in connect-retry.
  //  (b) Vercel production builds use the real Supabase URL, BUT the
  //      pooler occasionally drops mid-build (XX000 FATAL). Once that
  //      happens every subsequent query CONNECTION_CLOSEDs and individual
  //      static pages still exhaust their 60s build-attempt budget on
  //      retries – observed May 2 2026, where /sitemap.xml and
  //      /unlocks/[range] timed out 3× and exited the build.
  // Both cases short-circuit here. ISR + revalidate fills with real data
  // on the first runtime request after deploy.
  const dbUrl = process.env.DATABASE_URL;
  if (
    !dbUrl ||
    /(\/\/|@)(localhost|127\.0\.0\.1)/.test(dbUrl) ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return EMPTY_WINDOW_RESULT;
  }

  const protocolFilter = adapterIds && adapterIds.length > 0
    ? inArray(vestingStreamsCache.protocol, [...adapterIds])
    : undefined;
  const chainFilter = chainIds && chainIds.length > 0
    ? inArray(vestingStreamsCache.chainId, [...chainIds])
    : undefined;
  // ilike with the wildcard characters escaped = case-insensitive exact
  // match. Symbols are user-supplied search input, so don't let a stray
  // `%`/`_` turn the equality into a pattern scan.
  const symbolFilter = tokenSymbol && tokenSymbol.trim().length > 0
    ? ilike(vestingStreamsCache.tokenSymbol, tokenSymbol.trim().replace(/([%_\\])/g, "\\$1"))
    : undefined;

  // Two-pass pool – see JSDoc above for the full rationale.
  //
  // Pass A: streams whose endTime falls inside the window.
  //   `endTime > startSec AND endTime ≤ endSec` – eventTime ≤ endTime,
  //   and endTime ≤ endSec, so every row here is a candidate.
  //
  // Pass B: long-lived streams ending after the window.
  //   `endTime > endSec` – their endTime alone would disqualify them,
  //   but nextUnlockTime (in JSONB) can be ≤ endSec. Ordering by
  //   endTime ASC gets the ones soonest-to-expire first – a reliable
  //   proxy for near-term nextUnlockTime without JSONB SQL access.
  //   The JS filter discards any whose nextUnlockTime is outside the window.
  //
  // No overlap: a row can't have endTime both ≤ endSec and > endSec.
  const selectFields = {
    streamId:     vestingStreamsCache.streamId,
    protocol:     vestingStreamsCache.protocol,
    chainId:      vestingStreamsCache.chainId,
    tokenSymbol:  vestingStreamsCache.tokenSymbol,
    tokenAddress: vestingStreamsCache.tokenAddress,
    endTime:      vestingStreamsCache.endTime,
    recipient:    vestingStreamsCache.recipient,
    streamData:   vestingStreamsCache.streamData,
  } as const;

  const sharedWhere = [
    eq(vestingStreamsCache.isFullyVested, false),
    excludeTestnets,
    ...(protocolFilter ? [protocolFilter] : []),
    ...(chainFilter ? [chainFilter] : []),
    ...(symbolFilter ? [symbolFilter] : []),
  ] as const;

  const [rowsA, rowsB] = await Promise.all([
    // Pass A – streams ending within the window
    db
      .select(selectFields)
      .from(vestingStreamsCache)
      .where(
        and(
          ...sharedWhere,
          gt(vestingStreamsCache.endTime, startSec),
          lte(vestingStreamsCache.endTime, endSec),
        ),
      )
      .orderBy(asc(vestingStreamsCache.endTime))
      .limit(poolLimit),

    // Pass B – long-lived streams ending after the window
    db
      .select(selectFields)
      .from(vestingStreamsCache)
      .where(
        and(
          ...sharedWhere,
          gt(vestingStreamsCache.endTime, endSec),
        ),
      )
      .orderBy(asc(vestingStreamsCache.endTime))
      .limit(poolLimit),
  ]);

  const rows = [...rowsA, ...rowsB];

  // ── Compute per-row eventTime + filter by window ───────────────────────
  // eventTime = next unlock event if one exists, else endTime. Streams
  // without either get a 0 eventTime and are dropped by the window filter.
  //
  // STALE-CACHE REPAIR (2026-06-12): the stored `nextUnlockTime` is a
  // snapshot from the last seeder/indexer run. Once that moment elapses,
  // the old `next > 0 ? next : end` logic produced a PAST eventTime and the
  // stream silently vanished from EVERY window – even though its future
  // steps are sitting right there in `unlockSteps`. Real-world impact:
  // 828 of PYME's 852 active vestings were invisible to the calendar.
  // When the stored value is behind the window start, re-derive the next
  // event from unlockSteps at query time; linear streams (no steps) fall
  // back to endTime as before.
  type EnrichedRow = typeof rows[number] & { eventTime: number };
  const enriched: EnrichedRow[] = rows.map((row) => {
    const sd = row.streamData as Partial<VestingStream>;
    let next = typeof sd.nextUnlockTime === "number" && sd.nextUnlockTime > 0
      ? sd.nextUnlockTime
      : 0;
    if (next < startSec && Array.isArray(sd.unlockSteps) && sd.unlockSteps.length > 0) {
      let derived = 0;
      for (const step of sd.unlockSteps) {
        const ts = typeof step?.timestamp === "number" ? step.timestamp : 0;
        if (ts >= startSec && (derived === 0 || ts < derived)) derived = ts;
      }
      if (derived > 0) next = derived;
    }
    const end = row.endTime ?? 0;
    const eventTime = next >= startSec ? next : end;
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
    /** Per-recipient amount totals – drives the risk column's
     *  "recipient concentration" metric (largest single share). Same
     *  bigint arithmetic as amountSum so the ratio is exact. */
    recipientAmount: Map<string, bigint>;
  }

  const groups = new Map<string, Group>();
  const allRecipients = new Set<string>();
  // Per-chain-per-token aggregator. Keyed on `${chainId}:${address}` so a
  // token contract that exists on multiple chains (e.g. USDC on ETH/Base/
  // Polygon) gets one row per chain – distinct prices, distinct explorer
  // links, distinct rendering rather than a misleading cross-chain sum.
  const tokenAmountMap = new Map<string, {
    symbol:   string | null;
    address:  string;
    chainId:  number;
    decimals: number;
    amount:   bigint;
  }>();

  for (const row of enriched) {
    const protoCanonical = row.protocol === "uncx-vm" ? "uncx" : row.protocol;
    const tokenKey       = normaliseAddress(row.tokenAddress ?? "");
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
        recipientAmount: new Map(),
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
        // Track per-recipient totals for concentration metric. A single
        // recipient can have multiple streams in the same group (e.g. a
        // team member's tranches all unlock the same hour); sum them.
        g.recipientAmount.set(row.recipient, (g.recipientAmount.get(row.recipient) ?? 0n) + amt);
        const tokenChainKey = `${row.chainId}:${tokenKey}`;
        const existing = tokenAmountMap.get(tokenChainKey);
        if (existing) {
          existing.amount += amt;
        } else {
          tokenAmountMap.set(tokenChainKey, {
            symbol:   row.tokenSymbol,
            address:  tokenKey,
            chainId:  row.chainId,
            decimals: typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
            amount:   amt,
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
    // Concentration: largest single recipient's share of the group amount.
    // Computed here (not in enrichGroupsWithUsd) because the per-recipient
    // breakdown only exists during the grouping loop.
    let concentration: number | null = null;
    if (g.hasAmount && g.amountSum > 0n && g.recipientAmount.size > 0) {
      let largest = 0n;
      for (const v of g.recipientAmount.values()) if (v > largest) largest = v;
      // Float division on bigints: scale up by 1e6 first, then back down,
      // so we preserve 6 decimal places without overflowing Number.
      const scale = 1_000_000n;
      const ratioScaled = Number((largest * scale) / g.amountSum);
      concentration = ratioScaled / 1_000_000;
    }
    return {
      streamId:      g.representative.streamId,
      protocol:      g.protoCanonical,
      chainId:       g.representative.chainId,
      tokenSymbol:   g.representative.tokenSymbol ?? null,
      tokenAddress:  normaliseAddress(g.representative.tokenAddress ?? ""),
      tokenDecimals: typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
      eventTime:     g.earliestEvent,
      amount:        g.hasAmount ? g.amountSum.toString() : null,
      recipient:    g.representative.recipient,
      walletCount:  g.recipients.size,
      streamCount:  g.streamCount,
      groupKey:     `${g.protoCanonical}-${g.representative.chainId}-${normaliseAddress(g.representative.tokenAddress ?? "")}-${g.hourBucket}`,
      recipientConcentration: concentration,
    };
  });

  const chainSet  = new Set(ordered.map((g) => g.representative.chainId));
  const tokenSet  = new Set(ordered.map((g) => normaliseAddress(g.representative.tokenAddress ?? "")));

  // Sort by-token aggregates by amount desc – used for "biggest unlocks" lists
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

/**
 * Enrich a window-result's groups with USD value via DexScreener.
 *
 * Kept OUT of getUnlocksInWindow() on purpose: half the callers
 * (homepage widget, mobile, several ISR pages) already do their own
 * pricing on a curated slice, or don't need USD at all. Charging
 * DexScreener for every WindowResult would 2-3× the request count on
 * those paths for nothing.
 *
 * Pricing batches over distinct (chainId, tokenAddress) pairs, so a
 * group of 200 PYME unlocks costs one priced pair, not 200. The
 * `redis` option mirrors quick-prices: pass `false` from ISR/build
 * render paths so the Upstash SDK's no-store fetch doesn't poison
 * the route (see quick-prices.ts comment).
 *
 * Returns a NEW array – does not mutate `groups`.
 */
export async function enrichGroupsWithUsd(
  groups: ReadonlyArray<WindowUnlockGroup>,
  opts?: { redis?: boolean; liveFallback?: boolean },
): Promise<WindowUnlockGroup[]> {
  if (groups.length === 0) return [...groups];
  const { getQuickUsdPrices, toUsdValue } = await import("./quick-prices");

  // Distinct (chainId, normalised address). Drop unpriceable rows
  // (no amount or no address) early – they can't get a USD value anyway.
  const pairs = new Map<string, { chainId: number; address: string }>();
  for (const g of groups) {
    if (!g.amount || !g.tokenAddress) continue;
    const key = `${g.chainId}:${g.tokenAddress.toLowerCase()}`;
    if (!pairs.has(key)) {
      pairs.set(key, { chainId: g.chainId, address: g.tokenAddress });
    }
  }
  if (pairs.size === 0) return groups.map((g) => ({ ...g, usdValue: null, usdConfidence: null }));

  // Pricing – read the persistent token_prices_cache FIRST (a fast local DB
  // read the hourly cron keeps warm), and only hit the live DexScreener path
  // (getQuickUsdPrices) for tokens the cache doesn't cover. This keeps every
  // filter/sort re-render snappy instead of doing a live price batch each time.
  // Cache rows carry liquidity (→ confidence band) + market cap (→ unlock-risk
  // metric) but no 24h volume, so the absorption metric is computed only for
  // live-priced tokens; the risk chip works off the unlock's share of market
  // cap for cache-priced ones.
  const { readPriceCache } = await import("./token-price-cache");
  const allPairs = [...pairs.values()];
  const EXPLORER_PRICE_MAX_AGE_SEC = 24 * 60 * 60; // browse tool – day-old prices are fine

  // Fail-safe: a cache-read error degrades to an empty map → all tokens
  // become "misses" → live-priced, exactly the pre-change behaviour.
  const cached = await readPriceCache(
    allPairs.map((p) => ({ chainId: p.chainId, tokenAddress: p.address })),
    EXPLORER_PRICE_MAX_AGE_SEC,
  ).catch(() => new Map<string, { priceUsd: number; liquidityUsd: number | null; marketCap: number | null }>());

  const priceMap: QuickPriceMap = new Map();
  for (const [key, c] of cached) {
    const liq = c.liquidityUsd;
    const confidence: "high" | "medium" | "low" =
      liq == null    ? "medium"   // CoinGecko-sourced rows have no liquidity → treat as medium
      : liq >= 10_000 ? "high"
      : liq >= 1_000  ? "medium"
      :                 "low";
    priceMap.set(key, { priceUsd: c.priceUsd, confidence, volume24hUsd: null, marketCap: c.marketCap });
  }
  // Live-price the cache misses – UNLESS the caller opts out. The explorer
  // passes liveFallback:false so its render is pure-DB (no DexScreener/Redis
  // round-trip on the request path): cache misses simply show "–" and the
  // hourly refresh-prices cron fills them in. This is the fix for the explorer
  // timeouts – with ~7k active tokens and a still-warming cache, live-pricing
  // the per-render miss set added unbounded network latency on a user-facing
  // synchronous render. Other callers (API routes) keep the live fallback.
  if (opts?.liveFallback !== false) {
    const misses = allPairs.filter((p) => !priceMap.has(`${p.chainId}:${p.address.toLowerCase()}`));
    if (misses.length > 0) {
      const live = await getQuickUsdPrices(misses, opts);
      for (const [key, qp] of live) priceMap.set(key, qp);
    }
  }

  return groups.map((g) => {
    if (!g.amount) return { ...g, usdValue: null, usdConfidence: null };
    const priceKey = `${g.chainId}:${g.tokenAddress.toLowerCase()}`;
    const price       = priceMap.get(priceKey);
    const usdValue    = toUsdValue(g.amount, g.tokenDecimals, price);
    const usdConfidence = price?.confidence ?? null;

    // Absorption: unlockValueUsd / volume24hUsd. >1 = unlock exceeds a
    // full day's volume; price would move visibly to clear it.
    let absorptionRatio: number | null = null;
    const vol = price?.volume24hUsd;
    if (usdValue != null && typeof vol === "number" && vol > 0) {
      absorptionRatio = usdValue / vol;
    }

    // Market-cap share: this unlock's USD value / the token's market cap –
    // "how much of the tradeable token is hitting the market at once". This
    // REPLACES the old supplyShare (unlock ÷ LOCKED supply), which flagged
    // every single-wallet token as HIGH (its one unlock = ~100% of its own
    // lock). Null when we have no market cap for the token (→ no risk badge).
    let marketCapShare: number | null = null;
    const mc = price?.marketCap;
    if (usdValue != null && typeof mc === "number" && mc > 0) {
      marketCapShare = usdValue / mc;
    }

    return { ...g, usdValue, usdConfidence, absorptionRatio, marketCapShare };
  });
}
