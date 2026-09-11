// src/lib/vesting/token-page-data.ts
// ─────────────────────────────────────────────────────────────────────────────
// One loader for everything /token/[chainId]/[address] renders, shared by the
// page and by the warm cron's precompute.
//
// Why it exists: the page used to run its six loaders inline, so the ONLY way
// a token page got data was a visitor's request paying for them. On a
// low-traffic site that meant nearly every organic visit was a blocking cold
// render, and every deploy (which resets the ISR cache) put the whole long
// tail back to cold. Splitting "compute" from "load" lets:
//
//   - the warm cron compute rows in the background (computeTokenPageData →
//     page_fallback), so data exists before anyone asks;
//   - the build bake those rows into the prerender (loadTokenPageData reads
//     last-good during `next build`), so a deploy ships pages WITH data;
//   - the runtime render stay live (ISR regeneration runs in the background
//     behind a served page, so it never blocks a visitor), falling back to
//     last-good only when the live compute fails.
//
// The payload is plain JSON: the loaders return only numbers/strings/nulls
// except total supply, which is a bigint and travels as a string.
// ─────────────────────────────────────────────────────────────────────────────

import { after } from "next/server";
import {
  getTokenOverview, getTokenUnlockCalendar, getTokenRecipients,
  getTokenUpcomingEvents, getTokenMarketData,
  type TokenOverview, type UnlockCalendarBucket, type TokenRecipient,
  type TokenUpcomingEvent, type TokenMarketData,
} from "./token-aggregates";
import { getTokenTotalSupplyRaw } from "./token-supply";
import { withTimeout } from "../with-timeout";
import { getLastGoodTokenData, setLastGoodTokenData } from "./page-data-fallback";

export interface TokenPageData {
  overview:   TokenOverview | null;
  calendar:   UnlockCalendarBucket[];
  recipients: TokenRecipient[];
  upcoming:   TokenUpcomingEvent[];
  market:     TokenMarketData;
  /** On-chain total supply in raw base units, stringified bigint; null when unknown. */
  supplyRaw:  string | null;
  /** When this payload was computed (ISO). Lets a caller judge staleness. */
  computedAt: string;
}

export const EMPTY_MARKET: TokenMarketData = {
  priceUsd: null, fdv: null, marketCap: null, change24h: null,
  liquidity: null, volume24h: null, tokenName: null, tokenSymbol: null, imageUrl: null,
  website: null, twitterUrl: null, telegramUrl: null, discordUrl: null,
  dexScreenerUrl: null, dexToolsUrl: null, pairUrl: null,
};

/** Thrown when the overview (the gatekeeper) cannot be loaded. */
export class TokenOverviewUnavailable extends Error {}

/**
 * Live compute. Rejects with TokenOverviewUnavailable if the overview load
 * fails — the caller must not treat that as "no vesting" (the AITECH bug: a
 * cold-pooler timeout was cached as an empty page for 30 minutes). The other
 * loaders are soft: a token still renders usefully without a calendar.
 *
 * `overview` / `market` can be passed in already-memoised (the page wraps
 * them in React.cache so generateMetadata and the body share one call).
 */
export async function computeTokenPageData(
  cid: number,
  addr: string,
  loaders?: {
    overview?: (cid: number, addr: string) => Promise<TokenOverview | null>;
    market?:   (cid: number, addr: string) => Promise<TokenMarketData | null>;
  },
): Promise<TokenPageData> {
  const overviewFn = loaders?.overview ?? getTokenOverview;
  const marketFn   = loaders?.market   ?? getTokenMarketData;

  const settled = await Promise.allSettled([
    Promise.race([
      overviewFn(cid, addr),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TokenOverviewUnavailable("overview load exceeded 15s")), 15_000),
      ),
    ]),
    withTimeout(getTokenUnlockCalendar(cid, addr, { monthsBack: 12, monthsForward: 12 }), 12_000, [], "pubtoken:calendar"),
    withTimeout(getTokenRecipients(cid, addr, 10), 8_000, [], "pubtoken:recipients"),
    withTimeout(getTokenUpcomingEvents(cid, addr, 8), 8_000, [], "pubtoken:upcoming"),
    withTimeout(marketFn(cid, addr), 8_000, null, "pubtoken:market"),
    withTimeout(getTokenTotalSupplyRaw(cid, addr), 5_000, null, "pubtoken:supply"),
  ]);

  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      const stage = ["overview", "calendar", "recipients", "upcoming", "market", "supply"][i];
      console.error(`[token-page] ${stage} failed for ${cid}/${addr}:`, s.reason);
    }
  });

  if (settled[0].status === "rejected") {
    const r = settled[0].reason;
    throw r instanceof TokenOverviewUnavailable ? r
      : new TokenOverviewUnavailable(r instanceof Error ? r.message : String(r));
  }

  const supply = settled[5].status === "fulfilled" ? settled[5].value : null;
  return {
    overview:   settled[0].value,
    calendar:   settled[1].status === "fulfilled" ? settled[1].value : [],
    recipients: settled[2].status === "fulfilled" ? settled[2].value : [],
    upcoming:   settled[3].status === "fulfilled" ? settled[3].value : [],
    market:     (settled[4].status === "fulfilled" && settled[4].value) ? settled[4].value : EMPTY_MARKET,
    supplyRaw:  supply == null ? null : supply.toString(),
    computedAt: new Date().toISOString(),
  };
}

/**
 * What the page renders.
 *
 *   build phase → the last-good row (bake real data into the prerender), or
 *                 null when this token has never been computed;
 *   runtime     → live compute, persisted as the new last-good on success;
 *                 on failure the last-good row, and only if THAT is missing
 *                 too does it rethrow so ISR declines to cache an empty page.
 */
export async function loadTokenPageData(
  cid: number,
  addr: string,
  loaders?: Parameters<typeof computeTokenPageData>[2],
): Promise<TokenPageData | null> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return getLastGoodTokenData<TokenPageData>(cid, addr);
  }
  try {
    const data = await computeTokenPageData(cid, addr, loaders);
    // Only a token WITH vesting is worth persisting — an empty overview is a
    // legitimate "no vesting" answer, not something to serve as last-good.
    if (data.overview) after(() => setLastGoodTokenData(cid, addr, data));
    return data;
  } catch (err) {
    const lastGood = await getLastGoodTokenData<TokenPageData>(cid, addr);
    if (lastGood) {
      console.warn(`[token-page] live load failed for ${cid}/${addr}, serving last-good from ${lastGood.computedAt}`);
      return lastGood;
    }
    throw err;
  }
}
