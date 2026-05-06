// src/lib/vesting/tvl-walker/sablier.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive Sablier (Lockup) walker — paginates the Envio HyperIndex's
// LockupStream entity per chain, aggregating remaining locked amounts
// by asset address. Self-indexed replacement for the DefiLlama
// `chainTvls.vesting` passthrough we used previously.
//
// Why self-index instead of DefiLlama:
//   - DefiLlama sums TVL across EVERY chain Sablier deploys on, including
//     chains TokenVest doesn't index (Avalanche, Linea, Scroll, Mantle,
//     etc). That makes our /protocols card show "global Sablier TVL"
//     while the underlying app only watches our 7 chains — apples to
//     oranges next to the protocols we self-index (UNCX, Unvest, etc).
//   - Self-indexing gives us coverage transparency: "TokenVest Sablier TVL
//     = X across {TokenVest-supported chains}" — the same figure a user
//     could derive by adding their own wallet across our app.
//   - Removes the silent DefiLlama outage failure mode where their API
//     drops and our headline zeroes out.
//
// Endpoint: same Envio HyperIndex URL the per-wallet adapter already uses
// (SABLIER_ENVIO_URL). The walker just queries WITHOUT a recipient filter
// and paginates the full result set.
//
// Vesting math: mirrors `computeLinearVesting` and `computeStepVesting`
// from src/lib/vesting/types.ts. Locked = total - vested - withdrawn,
// floored at 0 (a stream that's "over-claimed" relative to its schedule
// is a contract-level oddity but shouldn't credit negative locked).
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";

const SABLIER_ENVIO_URL =
  process.env.SABLIER_ENVIO_URL ?? "https://indexer.hyperindex.xyz/53b7e25/v1/graphql";

const SUPPORTED_CHAINS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.OPTIMISM,
];

const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // 200k streams cap per chain

// Walker query — minimal field set vs the per-wallet adapter (we only
// need amount + schedule fields to compute locked). No recipient filter,
// no actions/withdrawals subarray (we use withdrawnAmount directly).
const STREAMS_QUERY = /* GraphQL */ `
  query WalkSablierLockup($chainId: numeric!, $offset: Int!, $limit: Int!) {
    LockupStream(
      where: {
        chainId:  { _eq: $chainId }
        canceled: { _eq: false }
      }
      order_by: { id: asc }
      limit: $limit
      offset: $offset
    ) {
      asset { address symbol decimals }
      depositAmount
      withdrawnAmount
      startTime
      endTime
      cliffTime
      category
      tranches { amount endTime }
    }
  }
`;

interface RawLockupStream {
  asset:           { address: string; symbol: string | null; decimals: string };
  depositAmount:   string;
  withdrawnAmount: string;
  startTime:       string;
  endTime:         string;
  cliffTime:       string | null;
  category:        string | null; // "LockupLinear" | "LockupTranched" | "LockupDynamic"
  tranches:        Array<{ amount: string; endTime: string }> | null;
}

// ─── Vesting math (inlined; walker is self-contained) ────────────────────────

function computeLinearLocked(
  total:          bigint,
  withdrawn:      bigint,
  startTime:      number,
  cliffTime:      number | null,
  endTime:        number,
  nowSec:         number,
): bigint {
  // Cliff hasn't hit → entirety still locked (less anything erroneously
  // withdrawn — guard against contract anomalies with max(0, …)).
  if (cliffTime !== null && nowSec < cliffTime) {
    return total > withdrawn ? total - withdrawn : 0n;
  }
  if (nowSec >= endTime) return 0n;
  if (nowSec <= startTime) {
    return total > withdrawn ? total - withdrawn : 0n;
  }
  const elapsed  = BigInt(nowSec - startTime);
  const duration = BigInt(endTime - startTime);
  if (duration <= 0n) return 0n;
  const vested   = (total * elapsed) / duration;
  const remaining = vested > withdrawn ? vested - withdrawn : 0n;
  // Locked = total - vested (regardless of how much was withdrawn from
  // the vested portion). What's "locked" is what hasn't yet vested.
  void remaining;
  return total > vested ? total - vested : 0n;
}

function computeStepLocked(
  total:          bigint,
  tranches:       Array<{ amount: string; endTime: string }>,
  nowSec:         number,
): bigint {
  let vested = 0n;
  for (const t of tranches) {
    if (Number(t.endTime) <= nowSec) vested += BigInt(t.amount);
  }
  return total > vested ? total - vested : 0n;
}

// ─── Walker ──────────────────────────────────────────────────────────────────

export async function walkSablier(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();

  if (!SUPPORTED_CHAINS.includes(chainId)) {
    return {
      protocol:    "sablier",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "chain not supported by Sablier walker",
      elapsedMs:   Date.now() - started,
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // Aggregate as we paginate — keyed by lowercase asset address. Saves a
  // second pass over the result set; map insertion is O(1) amortised.
  const byToken = new Map<
    string,
    { lockedAmount: bigint; streamCount: number; symbol: string | null; decimals: number }
  >();
  let totalStreams = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    let json: { data?: { LockupStream?: RawLockupStream[] }; errors?: unknown };

    try {
      const res = await fetch(SABLIER_ENVIO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "Mozilla/5.0 (compatible; TokenVest/1.0; +https://vestream.io)",
        },
        body: JSON.stringify({
          query:     STREAMS_QUERY,
          variables: { chainId, offset, limit: PAGE_SIZE },
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        return {
          protocol:    "sablier",
          chainId,
          tokens:      [],
          streamCount: totalStreams,
          error:       `Envio HTTP ${res.status} on page ${page}`,
          elapsedMs:   Date.now() - started,
        };
      }
      json = await res.json();
    } catch (err) {
      return {
        protocol:    "sablier",
        chainId,
        tokens:      [],
        streamCount: totalStreams,
        error:       `fetch error on page ${page}: ${err instanceof Error ? err.message : String(err)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    if (json.errors) {
      return {
        protocol:    "sablier",
        chainId,
        tokens:      [],
        streamCount: totalStreams,
        error:       `graphql errors on page ${page}: ${JSON.stringify(json.errors).slice(0, 200)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    const batch = json.data?.LockupStream ?? [];
    if (batch.length === 0) break;

    for (const raw of batch) {
      const total     = BigInt(raw.depositAmount   || "0");
      const withdrawn = BigInt(raw.withdrawnAmount || "0");
      if (total === 0n) continue;

      const startTime = Number(raw.startTime);
      const endTime   = Number(raw.endTime);
      const cliffTime = raw.cliffTime ? Number(raw.cliffTime) : null;

      let locked: bigint;
      if (raw.category === "LockupTranched" && Array.isArray(raw.tranches) && raw.tranches.length > 0) {
        locked = computeStepLocked(total, raw.tranches, nowSec);
      } else {
        locked = computeLinearLocked(total, withdrawn, startTime, cliffTime, endTime, nowSec);
      }
      if (locked === 0n) continue;

      const tokenKey = raw.asset.address.toLowerCase();
      const existing = byToken.get(tokenKey);
      if (existing) {
        existing.lockedAmount += locked;
        existing.streamCount  += 1;
      } else {
        byToken.set(tokenKey, {
          lockedAmount: locked,
          streamCount:  1,
          symbol:       raw.asset.symbol,
          decimals:     Number(raw.asset.decimals) || 18,
        });
      }
    }

    totalStreams += batch.length;
    if (batch.length < PAGE_SIZE) break;
  }

  const tokens: TokenAggregate[] = Array.from(byToken.entries()).map(([addr, agg]) => ({
    chainId,
    tokenAddress:  addr,
    tokenSymbol:   agg.symbol,
    tokenDecimals: agg.decimals,
    lockedAmount:  agg.lockedAmount.toString(),
    streamCount:   agg.streamCount,
  }));

  return {
    protocol:    "sablier",
    chainId,
    tokens,
    streamCount: totalStreams,
    error:       null,
    elapsedMs:   Date.now() - started,
  };
}
