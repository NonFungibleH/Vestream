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
import { vestingStreamsCache } from "../db/schema";
import type { VestingStream } from "./types";
import { fetchWithRetry } from "../fetch-with-retry";

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
  /** Sum of all protocols for this bucket. */
  totalTokensWhole:  number;
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

export async function getTokenUnlockCalendar(
  chainId:    number,
  tokenAddress: string,
  months = 12,
): Promise<UnlockCalendarBucket[]> {
  const rows = await fetchActiveStreams(chainId, tokenAddress);
  if (rows.length === 0) return [];

  const now      = new Date();
  const nowSec   = Math.floor(Date.now() / 1000);

  // Build empty buckets for the next `months` months (including current month)
  const buckets: Array<{
    timestamp: number;
    label:     string;
    byProtocol: Map<string, number>;
    total:     number;
  }> = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    buckets.push({
      timestamp:   Math.floor(d.getTime() / 1000),
      label:       d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      byProtocol:  new Map(),
      total:       0,
    });
  }
  const bucketEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1));
  const bucketEndSec = Math.floor(bucketEnd.getTime() / 1000);

  // Assign every unlock event to its bucket
  for (const r of rows) {
    const sd = r.streamData as Partial<VestingStream>;
    const events = expandUnlockEvents(sd, r.endTime, nowSec);
    for (const ev of events) {
      if (ev.timestamp >= bucketEndSec) continue;
      // Find bucket: year/month of event
      const d = new Date(ev.timestamp * 1000);
      const ym = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
      const bkt = buckets.find((b) => b.timestamp === ym);
      if (!bkt) continue;
      bkt.byProtocol.set(r.protocol, (bkt.byProtocol.get(r.protocol) ?? 0) + ev.tokensWhole);
      bkt.total += ev.tokensWhole;
    }
  }

  return buckets.map((b) => ({
    timestamp: b.timestamp,
    label:     b.label,
    byProtocol: Array.from(b.byProtocol.entries())
      .map(([protocol, tokensWhole]) => ({ protocol, tokensWhole }))
      .sort((a, b2) => b2.tokensWhole - a.tokensWhole),
    totalTokensWhole: b.total,
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
  };
}

export async function getTokenMarketData(
  chainId:      number,
  tokenAddress: string,
): Promise<TokenMarketData> {
  const empty: TokenMarketData = {
    priceUsd:   null, fdv: null, marketCap: null, change24h: null,
    liquidity:  null, volume24h: null, tokenName: null, imageUrl: null, website: null,
    dexScreenerUrl: DS_CHAIN_SLUG[chainId]
      ? `https://dexscreener.com/${DS_CHAIN_SLUG[chainId]}/${tokenAddress.toLowerCase()}` : null,
    dexToolsUrl:    DEXTOOLS_CHAIN_SLUG[chainId]
      ? `https://www.dextools.io/app/en/${DEXTOOLS_CHAIN_SLUG[chainId]}/pair-explorer/${tokenAddress.toLowerCase()}` : null,
  };

  try {
    const res = await fetchWithRetry(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress.toLowerCase()}`,
      { next: { revalidate: 300 }, headers: { Accept: "application/json" } },
      { tag: "dexscreener-token-page", retries: 2 },
    );
    if (!res || !res.ok) return empty;
    const data = (await res.json()) as { pairs?: DexPair[] };
    const dsChain = DS_CHAIN_SLUG[chainId];
    const onChain = (data.pairs ?? []).filter((p) => !dsChain || p.chainId === dsChain);
    const withPrice = onChain.filter((p) => p.priceUsd && parseFloat(p.priceUsd) > 0 && (p.liquidity?.usd ?? 0) >= 1000);
    if (withPrice.length === 0) return empty;

    const best = withPrice.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0];
    const website = best.info?.websites?.find((w) => w.label?.toLowerCase() === "website")?.url
      ?? best.info?.websites?.[0]?.url
      ?? null;

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
      website,
      dexScreenerUrl: best.url ?? empty.dexScreenerUrl,
    };
  } catch (err) {
    console.error("[token-aggregates] DexScreener fetch failed:", err);
    return empty;
  }
}
