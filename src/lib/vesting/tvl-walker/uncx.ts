// src/lib/vesting/tvl-walker/uncx.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive UNCX walker — paginates the `locks` subgraph entity across every
// supported chain WITHOUT a recipient filter, aggregating locked amounts by
// token. The adapter equivalent at adapters/uncx.ts is wallet-scoped; this
// module exists specifically so the TVL snapshot cron can compute UNCX TVL
// directly from the underlying data rather than inheriting DefiLlama's
// total-locker figure (which folds in LP locks + vesting + team locks).
//
// Data source: same The Graph subgraphs as the adapter. See adapters/uncx.ts
// for the subgraph-ID rationale + the "Polygon deprecated" note.
//
// Schema (V3 TokenVesting):
//   locks(first, skip) {
//     lockID, releaseSchedule ("Linear"|"Cliff"),
//     token { id, symbol, decimals },
//     sharesDeposited, sharesWithdrawn,
//     startEmission, endEmission, lockDate,
//   }
//
// Locked-amount math per lock:
//   Cliff:  now < endEmission → remaining = deposited - withdrawn
//           now ≥ endEmission → 0 (fully vested)
//   Linear: proportional to elapsed time between startEmission..endEmission,
//           clamped to [0, deposited-withdrawn]
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "../types";
import { resolveSubgraphUrl } from "../graph";
import type { WalkerResult, TokenAggregate } from "./types";

// Same subgraph IDs as adapters/uncx.ts — duplicated intentionally (see note
// in seeder.ts about why we don't cross-import module-private consts).
const SUBGRAPH_URLS: Partial<Record<SupportedChainId, string | undefined>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_ETH,     "Dp7Nvr9EESRYJC1sVhVdrRiDU2bxPa8G1Zhqdh4vyHnE"),
  [CHAIN_IDS.BSC]:      resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_BSC,     "Bq3CVVspv1gunmEhYkAwfRZcMZK5QyaydyCRarCwgE8P"),
  [CHAIN_IDS.POLYGON]:  resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_POLYGON),
  [CHAIN_IDS.BASE]:     resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_BASE,    "CUQ2qwQcVfivLPF9TsoLaLnJGmPRb3sDYFVRXbtUy78z"),
};

const PAGE_SIZE = 1000;   // The Graph's hard cap
const MAX_PAGES = 200;    // 200 × 1000 = 200k locks — plenty of headroom
// Cursor-based pagination: The Graph rejects skip > 5000, so we walk by id_gt
// instead. Empty string is less-than every real id, so it correctly seeds page 0.
const LOCKS_QUERY = `
  query WalkLocks($lastId: String!, $first: Int!) {
    locks(
      orderBy: id
      orderDirection: asc
      first: $first
      where: { id_gt: $lastId }
    ) {
      id
      lockID
      releaseSchedule
      token { id symbol decimals }
      sharesDeposited
      sharesWithdrawn
      startEmission
      endEmission
      lockDate
    }
  }
`;

interface RawLock {
  id:              string;
  lockID:          string;
  releaseSchedule: "Linear" | "Cliff";
  token:           { id: string; symbol: string; decimals: number };
  sharesDeposited: string;
  sharesWithdrawn: string;
  startEmission:   string;
  endEmission:     string;
  lockDate:        string;
}

/** Compute remaining unvested amount for one lock, now. */
function remainingLocked(lock: RawLock, nowSec: number): bigint {
  const deposited = BigInt(lock.sharesDeposited);
  const withdrawn = BigInt(lock.sharesWithdrawn);
  const remaining = deposited > withdrawn ? deposited - withdrawn : 0n;

  const endEmission   = Number(lock.endEmission);
  const startEmission = Number(lock.startEmission) || Number(lock.lockDate);

  if (lock.releaseSchedule === "Cliff") {
    // Whole amount locked until endEmission; 0 after.
    return nowSec >= endEmission ? 0n : remaining;
  }

  // Linear schedule.
  if (nowSec >= endEmission || endEmission <= startEmission) return 0n;
  if (nowSec <= startEmission) return remaining;
  const elapsed  = BigInt(nowSec - startEmission);
  const duration = BigInt(endEmission - startEmission);
  // unlocked = deposited * elapsed/duration, but we only care about locked = deposited - unlocked
  // → locked = deposited * (duration - elapsed) / duration
  const lockedFraction = deposited * (duration - elapsed) / duration;
  // Respect outstanding withdrawals — can't lock more than what's still in the contract.
  return lockedFraction > remaining ? remaining : lockedFraction;
}

/** Walk one chain's UNCX subgraph and return per-token aggregates. */
export async function walkUncx(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();
  const url     = SUBGRAPH_URLS[chainId];
  if (!url) {
    return {
      protocol:    "uncx",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "no subgraph configured for this chain",
      elapsedMs:   Date.now() - started,
    };
  }

  const nowSec    = Math.floor(Date.now() / 1000);
  const byToken   = new Map<string, TokenAggregate>();
  let   totalLocks = 0;
  let   lastId    = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    let json: { data?: { locks?: RawLock[] }; errors?: unknown };

    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "Mozilla/5.0 (compatible; TokenVest/1.0; +https://vestream.io)",
        },
        body:    JSON.stringify({ query: LOCKS_QUERY, variables: { lastId, first: PAGE_SIZE } }),
        cache:   "no-store",
      });
      if (!res.ok) {
        return {
          protocol:    "uncx",
          chainId,
          tokens:      Array.from(byToken.values()),
          streamCount: totalLocks,
          error:       `subgraph HTTP ${res.status} on page ${page}`,
          elapsedMs:   Date.now() - started,
        };
      }
      json = await res.json();
    } catch (err) {
      return {
        protocol:    "uncx",
        chainId,
        tokens:      Array.from(byToken.values()),
        streamCount: totalLocks,
        error:       `fetch error on page ${page}: ${err instanceof Error ? err.message : String(err)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    if (json.errors) {
      return {
        protocol:    "uncx",
        chainId,
        tokens:      Array.from(byToken.values()),
        streamCount: totalLocks,
        error:       `graphql errors on page ${page}: ${JSON.stringify(json.errors).slice(0, 200)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    const batch = json.data?.locks ?? [];
    if (batch.length === 0) break;   // exhausted

    for (const raw of batch) {
      const locked = remainingLocked(raw, nowSec);
      if (locked === 0n) continue;

      const tokenKey = raw.token.id.toLowerCase();
      const existing = byToken.get(tokenKey);
      if (existing) {
        existing.lockedAmount = (BigInt(existing.lockedAmount) + locked).toString();
        existing.streamCount += 1;
      } else {
        byToken.set(tokenKey, {
          chainId,
          tokenAddress:  tokenKey,
          tokenSymbol:   raw.token.symbol ?? null,
          tokenDecimals: Number(raw.token.decimals) || 18,
          lockedAmount:  locked.toString(),
          streamCount:   1,
        });
      }
    }

    totalLocks += batch.length;
    if (batch.length < PAGE_SIZE) break;  // last page
    lastId = batch[batch.length - 1].id;  // advance cursor for next page
  }

  return {
    protocol:    "uncx",
    chainId,
    tokens:      Array.from(byToken.values()),
    streamCount: totalLocks,
    error:       null,
    elapsedMs:   Date.now() - started,
  };
}
