// src/lib/vesting/tvl-walker/hoodlock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive HoodLock (RobinhoodLocker) walker — Robinhood Chain (4663).
//
// No subgraph and no log-scan needed: the locker exposes nextLockId() and
// getLock(id), so we enumerate ids 0..nextLockId-1 and batch-read via multicall
// (reusing the adapter's readLocks/fetchTokenMeta). Locked amount uses the same
// "value not yet unlocked" convention as the other walkers (uncx-vm counts only
// future tranches): a cliff lock counts while `now < unlockTime` and unwithdrawn,
// and drops to 0 once unlocked (vested → claimable, no longer locked TVL).
// ─────────────────────────────────────────────────────────────────────────────

import { type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";
import { makeFallbackClient } from "../rpc";
import {
  HOODLOCK_CONTRACTS,
  HOODLOCK_ABI,
  readLocks,
  fetchTokenMeta,
} from "../adapters/hoodlock";

function empty(chainId: SupportedChainId, started: number, error: string | null = null): WalkerResult {
  return { protocol: "hoodlock", chainId, tokens: [], streamCount: 0, error, elapsedMs: Date.now() - started };
}

export async function walkHoodLock(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();

  const contractAddress = HOODLOCK_CONTRACTS[chainId];
  if (!contractAddress) return empty(chainId, started); // not deployed on this chain

  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) return empty(chainId, started, "no RPC pool configured");

  // How many locks exist? ids are dense: 0 .. nextLockId-1.
  let count: number;
  try {
    const n = await client.readContract({
      address:      contractAddress,
      abi:          HOODLOCK_ABI,
      functionName: "nextLockId",
    });
    count = Number(n);
  } catch (err) {
    return empty(chainId, started, `nextLockId: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (count === 0) return empty(chainId, started);

  const ids = Array.from({ length: count }, (_, i) => BigInt(i));
  const raw = await readLocks(ids, chainId);
  if (raw.length === 0) return empty(chainId, started, "readLocks returned nothing");

  const nowSec = Math.floor(Date.now() / 1000);
  const meta   = await fetchTokenMeta(raw.map((l) => l.token), chainId);

  const byToken = new Map<string, TokenAggregate>();
  let streamCount = 0;
  for (const l of raw) {
    // Still-locked = not withdrawn AND not yet past unlockTime.
    if (l.withdrawn || Number(l.unlockTime) <= nowSec) continue;
    const token = l.token.toLowerCase();
    streamCount += 1;
    const existing = byToken.get(token);
    if (existing) {
      existing.lockedAmount = (BigInt(existing.lockedAmount) + l.amount).toString();
      existing.streamCount += 1;
    } else {
      const m = meta.get(token) ?? { symbol: "???", decimals: 18 };
      byToken.set(token, {
        chainId,
        tokenAddress:  token,
        tokenSymbol:   m.symbol,
        tokenDecimals: m.decimals,
        lockedAmount:  l.amount.toString(),
        streamCount:   1,
      });
    }
  }

  return {
    protocol:    "hoodlock",
    chainId,
    tokens:      [...byToken.values()],
    streamCount,
    error:       null,
    elapsedMs:   Date.now() - started,
  };
}
