// src/lib/vesting/token-aggregates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-token aggregates for the DexTools-style token explorer at
// /token/[chainId]/[address].
//
// All queries scope to `vestingStreamsCache` + one DexScreener call for
// price/FDV. This keeps the page cheap enough to be a public, indexable,
// server-rendered SEO surface for every token we've ever seen vested.
//
// Functions:
//   getTokenOverview(chainId, address)   — hero-row stats + protocol mix
//   getTokenUnlockCalendar(...)           — 12-month stacked buckets
//   getTokenRecipients(...)               — top N beneficiaries
//   getTokenUpcomingEvents(...)           — next N scheduled unlocks
//
// These helpers deliberately accept a raw `tokenAddress` string and lowercase
// it internally — callers can pass any casing. Chain IDs are validated
// against a small allowlist (ETH, BSC, Polygon, Base) matching the rest of
// the public surface.
// ─────────────────────────────────────────────────────────────────────────────

import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache, smartMoneySnapshot } from "../db/schema";
import type { VestingStream } from "./types";
import { fetchWithRetry } from "../fetch-with-retry";
import { normaliseAddress } from "../address-validation";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TokenOverview {
  chainId:            number;
  tokenAddress:       string;
  tokenSymbol:        string | null;
  tokenDecimals:      number;

  // Vesting-derived
  streamCount:        number;
  activeStreamCount:  number;
  recipientCount:     number;
  lockedTokensWhole:  number;  // sum of active lockedAmount / 10^decimals
  protocolMix: Array<{
    protocol:          string;
    streams:           number;
    lockedTokensWhole: number;
  }>;

  // Upcoming unlock windows (in whole tokens)
  upcoming7dTokens:   number;
  upcoming30dTokens:  number;
  upcoming90dTokens:  number;
}

export interface UnlockCalendarBucket {
  /** Unix seconds for the first day of the bucket's month. */
  timestamp:         number;
  /** "Nov 2026" — ready for display. */
  label:             string;
  /** Whole tokens unlocking in this month, by protocol. */
  byProtocol: Array<{
    protocol:         string;
    tokensWhole:      number;
  }>;
  /** Sum of all protocols for this bucket — INCLUDES events that already
   *  fired earlier in this calendar month. The chart renders this so
   *  monthly bar heights reflect the actual schedule. */
  totalTokensWhole:  number;
  /** Sum of events whose individual timestamp is in the future (>nowSec).
   *  Equal to `totalTokensWhole` for past + future-only buckets; LESS
   *  than `totalTokensWhole` for the current-month bucket when any of
   *  its tranches have already fired earlier in the month. KPIs that
   *  measure "what's still to come" (12-mo total, peak month, % of
   *  locked supply hitting market) should sum THIS, not totalTokensWhole.
   *  Added 2026-05-15 to fix the "12-MO TOTAL 393M > LOCKED 278M"
   *  presentation bug. */
  futureTokensWhole: number;
  /** True when this bucket's month is strictly before the current month.
   *  The UI uses this to render past unlocks in a muted style while keeping
   *  future unlocks in full protocol colours. */
  isPast:            boolean;
}

export interface TokenRecipient {
  recipient:          string;     // lowercase address
  streamCount:        number;
  lockedTokensWhole:  number;
  nextUnlockTime:     number | null;
  protocols:          string[];
}

export interface TokenUpcomingEvent {
  streamId:           string;
  protocol:           string;
  recipient:          string;
  timestamp:          number;     // unix seconds
  tokensWhole:        number;     // amount unlocking at this event
  /** Originating on-chain tx hash for the stream this event belongs to.
   *  Null when the adapter couldn't surface it (PinkSale, Solana
   *  adapters). Surfaced as a tap-to-explorer link next to each event.
   *  Added 2026-05-14 for the public-transparency push. */
  lockTxHash?:        string | null;
  chainId?:           number;     // duplicated from query context so consumers can build explorer URLs without re-passing chainId
}

// ─── Internal: fetch all active streams for a token ─────────────────────────

interface Row {
  streamId:      string;
  protocol:      string;
  recipient:     string;
  tokenSymbol:   string | null;
  endTime:       number | null;
  streamData:    Record<string, unknown>;
}

async function fetchActiveStreams(chainId: number, tokenAddress: string): Promise<Row[]> {
  const lowerAddr = tokenAddress.toLowerCase();
  const rows = await db
    .select({
      streamId:    vestingStreamsCache.streamId,
      protocol:    vestingStreamsCache.protocol,
      recipient:   vestingStreamsCache.recipient,
      tokenSymbol: vestingStreamsCache.tokenSymbol,
      endTime:     vestingStreamsCache.endTime,
      streamData:  vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        eq(vestingStreamsCache.chainId, chainId),
        sql`lower(${vestingStreamsCache.tokenAddress}) = ${lowerAddr}`,
        eq(vestingStreamsCache.isFullyVested, false),
      ),
    );
  return rows;
}

/**
 * Raw active streams for a token, straight from the cache — the un-aggregated
 * VestingStream[] needed to group into vesting rounds. (getTokenRecipients
 * aggregates per recipient and loses per-stream terms; this keeps them.)
 * Build-phase guard per CLAUDE.md (Supabase pooler can drop mid-build).
 */
export async function getTokenStreams(
  chainId: number,
  tokenAddress: string,
): Promise<VestingStream[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  const rows = await fetchActiveStreams(chainId, tokenAddress);
  return rows
    .map((r) => r.streamData as unknown as VestingStream)
    .filter((s): s is VestingStream => !!s && typeof s.id === "string");
}

/**
 * Smart-money wallets that vest this token — reverse lookup over the daily
 * smart_money_snapshot. Each snapshot row carries the wallet's TOP tokens by
 * USD (topTokensJson), so this surfaces wallets where this token is among
 * their largest vesting positions — a "the smart money is in this" signal on
 * the token page. Filtered in JS (≤100 wallets × top-N tokens = trivial); no
 * jsonb query needed. Token addresses compared case-insensitively so EVM and
 * Solana mints both match without mangling stored values.
 */
export async function getSmartMoneyHoldersOfToken(
  chainId: number,
  tokenAddress: string,
): Promise<Array<{ rank: number; recipient: string; usdValue: number | null }>> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  const addrLower = tokenAddress.toLowerCase();
  try {
    const rows = await db
      .select({
        rank:          smartMoneySnapshot.rank,
        recipient:     smartMoneySnapshot.recipient,
        topTokensJson: smartMoneySnapshot.topTokensJson,
      })
      .from(smartMoneySnapshot)
      .orderBy(asc(smartMoneySnapshot.rank));

    const out: Array<{ rank: number; recipient: string; usdValue: number | null }> = [];
    for (const r of rows) {
      const hit = (r.topTokensJson ?? []).find(
        (t) => t.chainId === chainId && (t.tokenAddress ?? "").toLowerCase() === addrLower,
      );
      if (hit) out.push({ rank: r.rank, recipient: r.recipient, usdValue: hit.usdValue ?? null });
    }
    return out;
  } catch (err) {
    console.warn("[token-aggregates] getSmartMoneyHoldersOfToken failed:", err);
    return [];
  }
}

/**
 * All streams for a token — active AND fully-vested. Used by the unlock
 * calendar when we want historical buckets too (past unlock events live on
 * both active-but-partial streams, via their past tranches, and on
 * fully-vested streams whose entire schedule is already in history).
 */
async function fetchAllStreams(chainId: number, tokenAddress: string): Promise<Row[]> {
  const lowerAddr = tokenAddress.toLowerCase();
  const rows = await db
    .select({
      streamId:    vestingStreamsCache.streamId,
      protocol:    vestingStreamsCache.protocol,
      recipient:   vestingStreamsCache.recipient,
      tokenSymbol: vestingStreamsCache.tokenSymbol,
      endTime:     vestingStreamsCache.endTime,
      streamData:  vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        eq(vestingStreamsCache.chainId, chainId),
        sql`lower(${vestingStreamsCache.tokenAddress}) = ${lowerAddr}`,
      ),
    );
  return rows;
}

/** Convert a stringified bigint to whole tokens (lossy above 2^53 but fine for display). */
function toWhole(raw: string | undefined, decimals: number): number {
  if (!raw) return 0;
  try {
    return Number(BigInt(raw.split(".")[0] ?? "0")) / 10 ** decimals;
  } catch {
    const asNum = Number(raw);
    return Number.isFinite(asNum) ? asNum / 10 ** decimals : 0;
  }
}

/**
 * Expand a stream into one or more (timestamp, tokens) entries representing
 * moments where material value unlocks. Linear streams collapse to a single
 * entry at `endTime` with the full lockedAmount — imperfect but fine as a
 * "when does the biggest chunk of value hit" signal for the calendar.
 */
function expandUnlockEvents(
  streamData: Partial<VestingStream>,
  endTimeFromRow: number | null,
  nowSec: number,
): Array<{ timestamp: number; tokensWhole: number }> {
  const decimals = streamData.tokenDecimals ?? 18;

  // Tranched / stepped: each step is a discrete unlock event
  if (streamData.shape === "steps" && streamData.unlockSteps?.length) {
    return streamData.unlockSteps
      .filter((s) => s.timestamp > nowSec)
      .map((s) => ({
        timestamp:    s.timestamp,
        tokensWhole:  toWhole(s.amount, decimals),
      }))
      .filter((e) => e.tokensWhole > 0);
  }

  // Linear / unknown: treat as one event at endTime
  const ts      = streamData.endTime ?? endTimeFromRow ?? null;
  const locked  = streamData.lockedAmount;
  if (!ts || ts <= nowSec || !locked) return [];
  const tokens  = toWhole(locked, decimals);
  if (tokens <= 0) return [];
  return [{ timestamp: ts, tokensWhole: tokens }];
}

/**
 * Like expandUnlockEvents but includes past events too. Only returns
 * discrete tranches — linear streams are deliberately skipped because
 * there's no meaningful "X tokens unlocked in month N" for a continuous
 * flow. Used by the calendar's historical view.
 *
 * For fully-vested streams, `totalAmount` is the right denominator (whole
 * stream has released). For partially-vested streams, `totalAmount` still
 * works since each tranche's amount sums to it.
 */
function expandAllTranches(
  streamData: Partial<VestingStream>,
): Array<{ timestamp: number; tokensWhole: number }> {
  if (streamData.shape !== "steps" || !streamData.unlockSteps?.length) return [];
  const decimals = streamData.tokenDecimals ?? 18;
  return streamData.unlockSteps
    .map((s) => ({
      timestamp:    s.timestamp,
      tokensWhole:  toWhole(s.amount, decimals),
    }))
    .filter((e) => e.tokensWhole > 0);
}

// ─── Public: overview ───────────────────────────────────────────────────────

export async function getTokenOverview(
  chainId: number,
  tokenAddress: string,
): Promise<TokenOverview | null> {
  const rows   = await fetchActiveStreams(chainId, tokenAddress);
  if (rows.length === 0) return null;

  const nowSec   = Math.floor(Date.now() / 1000);
  const seconds  = {
    d7:  7   * 86400,
    d30: 30  * 86400,
    d90: 90  * 86400,
  };

  let lockedWhole      = 0;
  let tokenSymbol:  string | null = null;
  let tokenDecimals              = 18;

  const recipients = new Set<string>();
  const perProtocol = new Map<string, { streams: number; locked: number }>();
  let upcoming7  = 0;
  let upcoming30 = 0;
  let upcoming90 = 0;

  for (const r of rows) {
    const sd = r.streamData as Partial<VestingStream>;
    if (!tokenSymbol && (sd.tokenSymbol || r.tokenSymbol)) tokenSymbol = sd.tokenSymbol ?? r.tokenSymbol ?? null;
    if (sd.tokenDecimals) tokenDecimals = sd.tokenDecimals;

    const locked = toWhole(sd.lockedAmount, sd.tokenDecimals ?? 18);
    lockedWhole += locked;

    recipients.add(r.recipient.toLowerCase());

    const prev = perProtocol.get(r.protocol) ?? { streams: 0, locked: 0 };
    perProtocol.set(r.protocol, { streams: prev.streams + 1, locked: prev.locked + locked });

    // Upcoming windows — expand each stream's event series
    for (const ev of expandUnlockEvents(sd, r.endTime, nowSec)) {
      const delta = ev.timestamp - nowSec;
      if (delta <= seconds.d7)  upcoming7  += ev.tokensWhole;
      if (delta <= seconds.d30) upcoming30 += ev.tokensWhole;
      if (delta <= seconds.d90) upcoming90 += ev.tokensWhole;
    }
  }

  const protocolMix = Array.from(perProtocol.entries())
    .map(([protocol, agg]) => ({ protocol, streams: agg.streams, lockedTokensWhole: agg.locked }))
    .sort((a, b) => b.lockedTokensWhole - a.lockedTokensWhole);

  return {
    chainId,
    tokenAddress:       tokenAddress.toLowerCase(),
    tokenSymbol,
    tokenDecimals,
    streamCount:        rows.length,
    activeStreamCount:  rows.length, // by query — fully-vested rows are excluded
    recipientCount:     recipients.size,
    lockedTokensWhole:  lockedWhole,
    protocolMix,
    upcoming7dTokens:   upcoming7,
    upcoming30dTokens:  upcoming30,
    upcoming90dTokens:  upcoming90,
  };
}

// ─── Public: 12-month unlock calendar ───────────────────────────────────────

/**
 * Monthly unlock calendar spanning `monthsBack` months of history plus
 * `monthsForward` months of upcoming unlocks. The two halves are stitched
 * into one continuous array — past buckets flagged `isPast: true`, the
 * current month onwards flagged `isPast: false`.
 *
 * Historical buckets are populated only from `shape === "steps"` tranche
 * timestamps (active streams + fully-vested streams). Linear streams are
 * skipped for history because there's no discrete "X tokens unlocked in
 * month N" for continuous flow — same reason we skip them in the
 * Upcoming Unlocks widget.
 *
 * Callers that don't care about history can pass `monthsBack: 0` to get
 * the original forward-only behaviour. The UI falls back to
 * forward-only rendering automatically when all historical buckets come
 * back empty (fresh tokens with no history to show).
 */
export async function getTokenUnlockCalendar(
  chainId:      number,
  tokenAddress: string,
  opts: { monthsBack?: number; monthsForward?: number } = {},
): Promise<UnlockCalendarBucket[]> {
  const monthsBack    = opts.monthsBack    ?? 12;
  const monthsForward = opts.monthsForward ?? 12;

  // Use fetchAllStreams so fully-vested streams contribute their past
  // tranches. Active streams' past tranches come along for free since we
  // expand the whole unlockSteps array for steps-shape streams.
  const rows = (monthsBack > 0)
    ? await fetchAllStreams(chainId, tokenAddress)
    : await fetchActiveStreams(chainId, tokenAddress);
  if (rows.length === 0) return [];

  const now    = new Date();
  const nowSec = Math.floor(Date.now() / 1000);
  // First-of-current-month in UTC — the divider between past and future.
  const currentMonthStart = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000,
  );

  // Build empty buckets from (now - monthsBack) through (now + monthsForward - 1).
  // The current month is always index `monthsBack` in the final array — the
  // boundary between past and future.
  const buckets: Array<{
    timestamp: number;
    label:     string;
    byProtocol: Map<string, number>;
    total:     number;
    futureTotal: number;
    isPast:    boolean;
  }> = [];
  for (let i = -monthsBack; i < monthsForward; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const ts = Math.floor(d.getTime() / 1000);
    buckets.push({
      timestamp:   ts,
      label:       d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      byProtocol:  new Map(),
      total:       0,
      futureTotal: 0,
      isPast:      ts < currentMonthStart,
    });
  }
  // Exclusive upper bound of the window (first-of-month for the bucket AFTER
  // the last one) — we use this to skip events that fall past the window.
  const windowEndSec = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsForward, 1) / 1000,
  );
  const windowStartSec = buckets[0]?.timestamp ?? currentMonthStart;

  // Assign every relevant unlock event to its bucket.
  for (const r of rows) {
    const sd = r.streamData as Partial<VestingStream>;
    // For tranched streams we iterate ALL tranches — past events included
    // so historical buckets can be populated. For linear streams we only
    // care about the future endTime event (via expandUnlockEvents), and
    // only when monthsForward > 0.
    const isSteps = sd.shape === "steps" && sd.unlockSteps?.length;
    const events = isSteps
      ? expandAllTranches(sd)
      : (monthsForward > 0 ? expandUnlockEvents(sd, r.endTime, nowSec) : []);
    for (const ev of events) {
      if (ev.timestamp < windowStartSec) continue;
      if (ev.timestamp >= windowEndSec)  continue;
      const d = new Date(ev.timestamp * 1000);
      const ym = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
      const bkt = buckets.find((b) => b.timestamp === ym);
      if (!bkt) continue;
      bkt.byProtocol.set(r.protocol, (bkt.byProtocol.get(r.protocol) ?? 0) + ev.tokensWhole);
      bkt.total += ev.tokensWhole;
      // Track future-only sum separately so KPIs that measure "what's
      // still to come" don't accidentally count earlier-this-month
      // events that have already fired. See UnlockCalendarBucket
      // docstring for the bug this fixes.
      if (ev.timestamp > nowSec) {
        bkt.futureTotal += ev.tokensWhole;
      }
    }
  }

  return buckets.map((b) => ({
    timestamp:         b.timestamp,
    label:             b.label,
    byProtocol:        Array.from(b.byProtocol.entries())
      .map(([protocol, tokensWhole]) => ({ protocol, tokensWhole }))
      .sort((a, b2) => b2.tokensWhole - a.tokensWhole),
    totalTokensWhole:  b.total,
    futureTokensWhole: b.futureTotal,
    isPast:            b.isPast,
  }));
}

// ─── Public: top recipients ─────────────────────────────────────────────────

export async function getTokenRecipients(
  chainId:      number,
  tokenAddress: string,
  limit       = 10,
): Promise<TokenRecipient[]> {
  const rows = await fetchActiveStreams(chainId, tokenAddress);
  if (rows.length === 0) return [];

  type Agg = { locked: number; streams: number; nextUnlock: number | null; protocols: Set<string> };
  const byRecipient = new Map<string, Agg>();

  for (const r of rows) {
    const sd       = r.streamData as Partial<VestingStream>;
    const decimals = sd.tokenDecimals ?? 18;
    const locked   = toWhole(sd.lockedAmount, decimals);
    const addr     = r.recipient.toLowerCase();
    const next     = sd.nextUnlockTime ?? sd.endTime ?? r.endTime ?? null;

    const prev = byRecipient.get(addr) ?? {
      locked: 0, streams: 0, nextUnlock: null, protocols: new Set<string>(),
    };
    prev.locked   += locked;
    prev.streams  += 1;
    prev.protocols.add(r.protocol);
    // Keep the EARLIEST upcoming unlock time
    if (next != null && (prev.nextUnlock == null || next < prev.nextUnlock)) {
      prev.nextUnlock = next;
    }
    byRecipient.set(addr, prev);
  }

  return Array.from(byRecipient.entries())
    .map(([recipient, a]) => ({
      recipient,
      streamCount:       a.streams,
      lockedTokensWhole: a.locked,
      nextUnlockTime:    a.nextUnlock,
      protocols:         Array.from(a.protocols).sort(),
    }))
    .sort((a, b) => b.lockedTokensWhole - a.lockedTokensWhole)
    .slice(0, limit);
}

// ─── Public: chronological upcoming events ──────────────────────────────────

export async function getTokenUpcomingEvents(
  chainId:      number,
  tokenAddress: string,
  limit       = 10,
): Promise<TokenUpcomingEvent[]> {
  const nowSec = Math.floor(Date.now() / 1000);

  // This could be more efficient as a pure SQL query, but we need to expand
  // step-vesting events in Node, so we fetch rows and process in memory.
  const rows = await db
    .select({
      streamId:    vestingStreamsCache.streamId,
      protocol:    vestingStreamsCache.protocol,
      recipient:   vestingStreamsCache.recipient,
      endTime:     vestingStreamsCache.endTime,
      streamData:  vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        eq(vestingStreamsCache.chainId, chainId),
        sql`lower(${vestingStreamsCache.tokenAddress}) = ${tokenAddress.toLowerCase()}`,
        eq(vestingStreamsCache.isFullyVested, false),
        gt(vestingStreamsCache.endTime, nowSec),
      ),
    )
    .orderBy(asc(vestingStreamsCache.endTime))
    .limit(200);

  const events: TokenUpcomingEvent[] = [];
  for (const r of rows) {
    const sd = r.streamData as Partial<VestingStream>;
    for (const ev of expandUnlockEvents(sd, r.endTime, nowSec)) {
      events.push({
        streamId:    r.streamId,
        protocol:    r.protocol,
        recipient:   r.recipient.toLowerCase(),
        timestamp:   ev.timestamp,
        tokensWhole: ev.tokensWhole,
        lockTxHash:  (sd.lockTxHash as string | null | undefined) ?? null,
        chainId,
      });
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp).slice(0, limit);
}

// ─── Public: DexScreener price / FDV enrichment ─────────────────────────────
// Separate fetch because it's optional — the page still renders without price
// data. Cached at the edge by the caller (Server Component with `revalidate`).

export interface TokenMarketData {
  priceUsd:   number | null;
  fdv:        number | null;
  marketCap:  number | null;
  change24h:  number | null;
  liquidity:  number | null;
  volume24h:  number | null;
  tokenName:  string | null;
  imageUrl:   string | null;
  website:    string | null;
  /** Project's X / Twitter URL, pulled from DexScreener's info.socials[].
   *  Null when the token submission didn't include socials (common for
   *  tokens listed only by an automated pair scanner). */
  twitterUrl:  string | null;
  /** Project's Telegram channel/group URL. Same DexScreener socials feed
   *  as twitterUrl; type slug is "telegram". */
  telegramUrl: string | null;
  /** Project's Discord invite/server URL. Same source; type slug "discord". */
  discordUrl:  string | null;
  dexScreenerUrl: string | null;
  dexToolsUrl:    string | null;
}

const DS_CHAIN_SLUG: Record<number, string> = {
  1:    "ethereum",
  56:   "bsc",
  137:  "polygon",
  8453: "base",
};

const DEXTOOLS_CHAIN_SLUG: Record<number, string> = {
  1:    "ether",
  56:   "bnb",
  137:  "polygon",
  8453: "base",
};

// CoinGecko platform slugs — used by the socials FALLBACK below. Distinct
// from the DexScreener slug table because CG uses different names
// ("binance-smart-chain" vs "bsc"). Subset of the master list in tvl.ts;
// kept local to avoid a heavier import path.
const CG_PLATFORM_SLUG: Record<number, string> = {
  1:     "ethereum",
  56:    "binance-smart-chain",
  137:   "polygon-pos",
  8453:  "base",
  42161: "arbitrum-one",
  10:    "optimistic-ethereum",
  101:   "solana",
};

interface SocialLinks {
  website:     string | null;
  twitterUrl:  string | null;
  telegramUrl: string | null;
  discordUrl:  string | null;
}

interface CoinGeckoContractResponse {
  links?: {
    /** Array of project websites. We take the first non-empty entry. */
    homepage?: string[];
    /** Just the handle (e.g. "degentokenbase"), not a full URL. */
    twitter_screen_name?: string;
    /** Just the channel name (e.g. "degentokenbase"), not a full URL. */
    telegram_channel_identifier?: string;
    /** Mixed chat URLs (Discord, Slack, etc). We filter for discord.gg. */
    chat_url?: string[];
  };
}

/**
 * Fill in any missing socials from CoinGecko's contract endpoint.
 *
 * Triggered ONLY when DexScreener returned an incomplete set — most
 * tokens are fully covered by DexScreener (which sources its socials from
 * the project's pair submission) and the CG call doesn't fire at all.
 * The handful where DexScreener has gaps (auto-listed pairs without
 * project metadata) get filled in here.
 *
 * Endpoint: GET /api/v3/coins/{platform}/contract/{address}
 *   - Free tier, no auth, ~30 req/min from a Vercel region
 *   - Returns 404 for tokens CoinGecko doesn't index — we treat that
 *     as "no fallback available" and return the input unchanged
 *
 * Cached via Next.js fetch cache at 1h (socials don't change often) +
 * a 4s timeout so a slow CG response can't drag the whole page render.
 */
async function enrichSocialsFromCoinGecko(
  chainId: number,
  tokenAddress: string,
  existing: SocialLinks,
): Promise<SocialLinks> {
  // Already complete? Skip the call entirely.
  if (existing.website && existing.twitterUrl && existing.telegramUrl && existing.discordUrl) {
    return existing;
  }
  const platform = CG_PLATFORM_SLUG[chainId];
  if (!platform) return existing;

  try {
    // Query-param flags strip every field we don't need so CG returns a
    // smaller payload — links are the only thing we care about.
    const addrSegment = normaliseAddress(tokenAddress);
    const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${addrSegment}`
      + `?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    const res = await fetchWithRetry(
      url,
      { next: { revalidate: 3600 }, headers: { Accept: "application/json" } },
      { tag: "coingecko-socials", retries: 1, timeoutMs: 4000 },
    );
    if (!res || !res.ok) return existing;
    const data = (await res.json()) as CoinGeckoContractResponse;
    const links = data.links ?? {};

    // Homepage: first non-empty entry. CG sometimes returns 3 empty strings.
    const homepage = (links.homepage ?? []).find((u) => typeof u === "string" && u.trim().length > 0) ?? null;

    // CG gives us just the handle/identifier, never the full URL. Reconstruct.
    const twHandle = links.twitter_screen_name?.trim();
    const tgHandle = links.telegram_channel_identifier?.trim();
    const twitterFromCg  = twHandle ? `https://x.com/${twHandle}` : null;
    const telegramFromCg = tgHandle ? `https://t.me/${tgHandle}` : null;

    // chat_url is mixed — could be Discord, Slack, Matrix, etc. Filter for
    // anything that looks like Discord. (CG used to have a `discord` key
    // but moved to chat_url around 2023.)
    const discordFromCg = (links.chat_url ?? []).find(
      (u) => typeof u === "string" && /discord\.(gg|com)/i.test(u),
    ) ?? null;

    return {
      website:     existing.website     ?? homepage,
      twitterUrl:  existing.twitterUrl  ?? twitterFromCg,
      telegramUrl: existing.telegramUrl ?? telegramFromCg,
      discordUrl:  existing.discordUrl  ?? discordFromCg,
    };
  } catch (err) {
    // Failure here MUST NOT cascade — socials are decorative. Worst case
    // we render the DexScreener-only set, same as before this fallback.
    console.warn("[token-aggregates] CoinGecko socials fallback failed:", err);
    return existing;
  }
}

interface DexPair {
  chainId:     string;
  url?:        string;
  baseToken:   { address: string; symbol: string; name: string };
  priceUsd?:   string;
  volume?:     { h24?: number };
  priceChange?:{ h24?: number };
  liquidity?:  { usd?: number };
  fdv?:        number;
  marketCap?:  number;
  info?: {
    imageUrl?: string;
    websites?: Array<{ label: string; url: string }>;
    // DexScreener exposes socials as {type, url} where type is "twitter",
    // "telegram", "discord", "github", "medium", etc.
    socials?: Array<{ type: string; url: string }>;
  };
}

export async function getTokenMarketData(
  chainId:      number,
  tokenAddress: string,
): Promise<TokenMarketData> {
  const empty: TokenMarketData = {
    priceUsd:   null, fdv: null, marketCap: null, change24h: null,
    liquidity:  null, volume24h: null, tokenName: null, imageUrl: null,
    website: null, twitterUrl: null, telegramUrl: null, discordUrl: null,
    dexScreenerUrl: DS_CHAIN_SLUG[chainId]
      ? `https://dexscreener.com/${DS_CHAIN_SLUG[chainId]}/${normaliseAddress(tokenAddress)}` : null,
    dexToolsUrl:    DEXTOOLS_CHAIN_SLUG[chainId]
      ? `https://www.dextools.io/app/en/${DEXTOOLS_CHAIN_SLUG[chainId]}/pair-explorer/${tokenAddress.toLowerCase()}` : null,
  };

  let best: DexPair | null = null;
  try {
    const res = await fetchWithRetry(
      `https://api.dexscreener.com/latest/dex/tokens/${normaliseAddress(tokenAddress)}`,
      { next: { revalidate: 300 }, headers: { Accept: "application/json" } },
      // retries:1 + a 3s per-attempt cap. This is a RENDER-PATH enrichment
      // call: the default (retries:2, no timeoutMs → 8s × 3 = 24s worst
      // case) could hang the token page. Price/FDV is nice-to-have; the
      // vesting schedule is the real content and renders without it.
      { tag: "dexscreener-token-page", retries: 1, timeoutMs: 3000 },
    );
    if (res && res.ok) {
      const data = (await res.json()) as { pairs?: DexPair[] };
      const dsChain = DS_CHAIN_SLUG[chainId];
      const onChain = (data.pairs ?? []).filter((p) => !dsChain || p.chainId === dsChain);
      // No liquidity floor for a per-token DISPLAY — if DexScreener has a
      // price, show it (the page's thin-liquidity caveat flags low-confidence
      // ones). The old ≥$1k floor hid the price entirely for tokens like PYME
      // that DO trade, just thinly — users read the resulting "—" as missing
      // data, not "low liquidity". Pick the most-liquid priced pair (best
      // price signal), breaking ties by 24h volume. The TVL aggregate keeps
      // its own floor + per-token ceiling separately (tvl.ts).
      const withPrice = onChain.filter((p) => p.priceUsd && parseFloat(p.priceUsd) > 0);
      if (withPrice.length > 0) {
        best = withPrice.sort((a, b) =>
          (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
          || (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0),
        )[0];
      }
    }
  } catch (err) {
    console.warn("[token-aggregates] DexScreener fetch failed:", err);
  }

  // Build socials from DexScreener first. DexScreener uses "twitter" for
  // the X type slug even though the product is now X — accept both
  // defensively. Returns the FIRST match (tokens rarely have more than
  // one of each).
  const dsSocials = best?.info?.socials ?? [];
  const findSocial = (...types: string[]): string | null => {
    const wanted = new Set(types.map((t) => t.toLowerCase()));
    return dsSocials.find((s) => wanted.has(s.type?.toLowerCase()))?.url ?? null;
  };
  const dsWebsite = best?.info?.websites?.find((w) => w.label?.toLowerCase() === "website")?.url
    ?? best?.info?.websites?.[0]?.url
    ?? null;
  const fromDexScreener: SocialLinks = {
    website:     dsWebsite,
    twitterUrl:  findSocial("twitter", "x"),
    telegramUrl: findSocial("telegram"),
    discordUrl:  findSocial("discord"),
  };

  // Fill in any gaps from CoinGecko. Runs even when DexScreener returned
  // no pairs at all — many tokens DS doesn't know are indexed on CG, and
  // their socials are useful even when we can't render a price.
  //
  // BUT: socials are pure nice-to-have, and CoinGecko's free tier 429s on
  // unknown tokens — the retryable 429s used to drag this call (and the
  // whole token-page render) to 5-6s for low-liquidity tokens. Cap the
  // BLOCKING wait at 1.5s via Promise.race: if CG is slow, render with the
  // DexScreener socials we already have. The CG fetch keeps running and
  // warms Next's fetch cache (revalidate:3600), so the next ISR
  // revalidation picks up any extra socials for free. Not an AbortSignal —
  // that would poison Next's data cache (see fetch-with-retry.ts).
  const socials = await Promise.race([
    enrichSocialsFromCoinGecko(chainId, tokenAddress, fromDexScreener),
    new Promise<SocialLinks>((resolve) => setTimeout(() => resolve(fromDexScreener), 1500)),
  ]);

  // No DexScreener data at all → still return the empty shell with whatever
  // socials CG could give us. Worst case: pure-empty (unchanged from before).
  if (!best) {
    return { ...empty, ...socials };
  }

  return {
    ...empty,
    priceUsd:   parseFloat(best.priceUsd!),
    fdv:        best.fdv        ?? null,
    marketCap:  best.marketCap  ?? null,
    change24h:  best.priceChange?.h24 ?? null,
    liquidity:  best.liquidity?.usd   ?? null,
    volume24h:  best.volume?.h24      ?? null,
    tokenName:  best.baseToken?.name  ?? null,
    imageUrl:   best.info?.imageUrl   ?? null,
    ...socials,
    dexScreenerUrl: best.url ?? empty.dexScreenerUrl,
  };
}
