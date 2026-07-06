// src/lib/vesting/token-supply.ts
// ─────────────────────────────────────────────────────────────────────────────
// On-chain ERC-20 total supply, for the public token page's "% of total supply"
// context (how much of the whole token is locked / unlocking). Works even for
// tokens with no DEX price (where FDV/marketCap are unavailable), which is the
// only way to answer "16.72M locked out of how many?" for an unpriced token.
//
// Nice-to-have only: every failure path returns null so it can never break or
// slow the render. Runs through the shared quarantine-aware multi-RPC pool.
// Non-EVM chains (Solana) have no EVM totalSupply → makeFallbackClient returns
// undefined → null. Callers should wrap in a timeout (it's an eth_call).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupportedChainId } from "./types";
import { makeFallbackClient } from "./rpc";

const ERC20_TOTAL_SUPPLY_ABI = [
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

/** Raw on-chain total supply (base units), or null on any failure. The caller
 *  divides by the token's decimals — kept raw so this can run in the page's
 *  parallel fetch batch, before `decimals` (from the vesting overview) is known. */
export async function getTokenTotalSupplyRaw(
  chainId: number,
  address: string,
): Promise<bigint | null> {
  try {
    if (!address.startsWith("0x")) return null; // EVM only
    // makeFallbackClient returns undefined for non-EVM / unknown chains, so the
    // SupportedChainId cast is safe (unknown chains just yield null below).
    const client = makeFallbackClient(chainId as SupportedChainId);
    if (!client) return null;
    const raw = (await client.readContract({
      address: address as `0x${string}`,
      abi: ERC20_TOTAL_SUPPLY_ABI,
      functionName: "totalSupply",
    })) as bigint;
    return raw > 0n ? raw : null;
  } catch {
    return null;
  }
}

/** Convert a raw total supply to whole tokens (÷ 10^decimals), null-safe. */
export function totalSupplyWhole(raw: bigint | null, decimals: number): number | null {
  if (raw == null || raw <= 0n) return null;
  const whole = Number(raw) / 10 ** Math.min(Math.max(decimals, 0), 36);
  return Number.isFinite(whole) && whole > 0 ? whole : null;
}
