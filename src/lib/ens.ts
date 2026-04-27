// src/lib/ens.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tiny ENS resolver. Used by the dashboard explorer to translate user-typed
// names like "vitalik.eth" into the underlying 0x address before querying
// vesting positions.
//
// Implementation:
//   - viem `createPublicClient` against ALCHEMY_RPC_URL_ETH (the same env
//     var the Hedgey adapter and others already use).
//   - 30s in-process cache so common names resolve instantly on repeat hits.
//   - Returns null on any error — caller should treat null as "no match".
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize as viemNormalize } from "viem/ens";

const cache = new Map<string, { addr: string | null; expiresAt: number }>();
const TTL_MS = 30_000;

function getClient() {
  const url = process.env.ALCHEMY_RPC_URL_ETH;
  if (!url) return null;
  return createPublicClient({ chain: mainnet, transport: http(url) });
}

/**
 * Resolve an ENS name to its lowercased 0x address.
 * Returns null if:
 *   - the name doesn't resolve
 *   - no ETH RPC is configured (build-time / dev without env)
 *   - the name fails ENS normalisation (invalid chars)
 *   - any RPC error
 */
export async function resolveEnsName(name: string): Promise<string | null> {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return null;

  const cached = cache.get(trimmed);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.addr;
  }

  let normalised: string;
  try {
    normalised = viemNormalize(trimmed);
  } catch {
    cache.set(trimmed, { addr: null, expiresAt: Date.now() + TTL_MS });
    return null;
  }

  const client = getClient();
  if (!client) return null;

  try {
    const addr = await client.getEnsAddress({ name: normalised });
    const result = addr ? addr.toLowerCase() : null;
    cache.set(trimmed, { addr: result, expiresAt: Date.now() + TTL_MS });
    return result;
  } catch {
    cache.set(trimmed, { addr: null, expiresAt: Date.now() + TTL_MS });
    return null;
  }
}
