// src/lib/vesting/token-resolver.ts
// ─────────────────────────────────────────────────────────────────────────────
// On-chain ERC-20 symbol + decimals resolver with bytes32 fallback.
//
// Why this exists:
//   Some adapters surface `tokenSymbol = "UNKNOWN"` (Hedgey explicit
//   fallback) or `tokenSymbol = null/""` (Sablier Envio subgraph for
//   tokens whose `symbol()` getter returns an unparseable shape). The
//   most common root cause is the contract implementing `symbol()` as
//   `bytes32` instead of `string` — an older ERC-20 convention some
//   launchpad tokens (PEPE, FIAT, etc) still ship with. The Graph's
//   standard `IERC20.symbol()` ABI declares the return as string and
//   silently returns null when the decode fails.
//
// What it does:
//   1. Try `symbol() returns (string)` — the canonical ABI.
//   2. On failure, try `symbol() returns (bytes32)` — older convention.
//      Decode the bytes32 by trimming trailing zero bytes and UTF-8
//      decoding.
//   3. Same cascade for `decimals()` (uint8 — virtually all tokens
//      respect this; we just guard against contracts that don't expose
//      it at all).
//   4. On total failure, fall back to a truncated address ("0xabbc…6346")
//      and a defensive `decimals = 18`. Better than literal "UNKNOWN".
//
// Process-local cache:
//   Each (chainId, address) is resolved at most once per Lambda warm
//   period. Cold restarts re-resolve from chain, which is fine — the
//   adapter run amortises a few extra RPC calls vs the cost of writing
//   through to a persisted DB cache (which we may add in a v2 if the
//   warm-cache miss rate becomes a problem).
//
// 2026-05-20.
// ─────────────────────────────────────────────────────────────────────────────

import { erc20Abi, hexToString, type PublicClient } from "viem";
import { makeFallbackClient } from "./rpc";
import type { SupportedChainId } from "./types";

export interface ResolvedTokenMeta {
  symbol:   string;
  decimals: number;
}

interface CacheEntry extends ResolvedTokenMeta {
  resolvedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — token symbols don't change
const cache = new Map<string, CacheEntry>();

function cacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

/** Truncate an address to "0xabbc…6346" form for display fallback. */
function shortAddress(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, "");
  if (clean.length < 8) return `0x${clean}`;
  return `0x${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

/** Decode a bytes32 symbol — common older-ERC-20 convention. Trims the
 *  trailing zero bytes and UTF-8 decodes the prefix. Returns null when
 *  the bytes contain no printable content. */
function decodeBytes32Symbol(hex: string): string | null {
  try {
    const decoded = hexToString(hex as `0x${string}`, { size: 32 });
    const trimmed = decoded.replace(/\0+$/, "").trim();
    // Reject empty / unprintable / control-char-only results.
    if (!trimmed) return null;
    // Most ERC-20 symbols are < 12 ASCII chars. Be lenient — some
    // exotic tokens use Unicode (老板娘 etc) and should still pass.
    if (!/[\p{L}\p{N}]/u.test(trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

const bytes32SymbolAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;

async function callStringSymbol(client: PublicClient, address: `0x${string}`): Promise<string | null> {
  try {
    const result = await client.readContract({
      address,
      abi: erc20Abi,
      functionName: "symbol",
    });
    const trimmed = String(result).trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function callBytes32Symbol(client: PublicClient, address: `0x${string}`): Promise<string | null> {
  try {
    const result = await client.readContract({
      address,
      abi: bytes32SymbolAbi,
      functionName: "symbol",
    });
    return decodeBytes32Symbol(result as string);
  } catch {
    return null;
  }
}

async function callDecimals(client: PublicClient, address: `0x${string}`): Promise<number | null> {
  try {
    const result = await client.readContract({
      address,
      abi: erc20Abi,
      functionName: "decimals",
    });
    const n = Number(result);
    if (!Number.isFinite(n) || n < 0 || n > 36) return null;
    return n;
  } catch {
    return null;
  }
}

/**
 * Resolve ERC-20 symbol + decimals for a token, with on-chain bytes32
 * fallback and a 24h in-process cache. Always returns *something* —
 * never throws, never returns "UNKNOWN" — so adapter callers can drop
 * their own UNKNOWN-string fallbacks.
 *
 * Pass `existingSymbol` when the adapter already has a usable symbol
 * from upstream (e.g. Sablier subgraph populated `asset.symbol`).
 * We'll skip the on-chain call and only resolve decimals if needed.
 */
export async function resolveTokenMeta(
  chainId: SupportedChainId,
  address: string,
  hints?: { existingSymbol?: string | null; existingDecimals?: number | null },
): Promise<ResolvedTokenMeta> {
  const lowered = address.toLowerCase();
  const key = cacheKey(chainId, lowered);

  // Cache hit — return immediately. TTL is 24h since symbols don't
  // change but we still want to recover from a transient RPC outage
  // that wrote a bad value into the cache.
  const cached = cache.get(key);
  if (cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS) {
    return { symbol: cached.symbol, decimals: cached.decimals };
  }

  // Fast path: the adapter already has both. No RPC call needed.
  const hintSymbol = hints?.existingSymbol?.trim();
  const hintDecimals = hints?.existingDecimals;
  const symbolIsUsable = hintSymbol && hintSymbol.toLowerCase() !== "unknown";
  const decimalsIsUsable = typeof hintDecimals === "number" && Number.isFinite(hintDecimals);

  if (symbolIsUsable && decimalsIsUsable) {
    const meta = { symbol: hintSymbol!, decimals: hintDecimals! };
    cache.set(key, { ...meta, resolvedAt: Date.now() });
    return meta;
  }

  // On-chain cascade. makeFallbackClient gives us a client that walks
  // the multi-RPC pool with quarantine + retry built in.
  const client = makeFallbackClient(chainId);
  if (!client) {
    // No RPC for this chain (Solana / Sepolia w/o env, etc) — fall back
    // entirely to hints + shortAddress.
    const meta = {
      symbol:   symbolIsUsable ? hintSymbol! : shortAddress(lowered),
      decimals: decimalsIsUsable ? hintDecimals! : 18,
    };
    cache.set(key, { ...meta, resolvedAt: Date.now() });
    return meta;
  }

  const checksummed = lowered as `0x${string}`;

  // Resolve symbol — string first, then bytes32, then fall back to short
  // address. The hint wins if it's usable, but we still try chain when
  // the hint is "UNKNOWN" or empty.
  let symbol: string;
  if (symbolIsUsable) {
    symbol = hintSymbol!;
  } else {
    const onChainString = await callStringSymbol(client, checksummed);
    if (onChainString) {
      symbol = onChainString;
    } else {
      const onChainBytes32 = await callBytes32Symbol(client, checksummed);
      symbol = onChainBytes32 ?? shortAddress(lowered);
    }
  }

  // Resolve decimals — usually present, defensive fallback otherwise.
  let decimals: number;
  if (decimalsIsUsable) {
    decimals = hintDecimals!;
  } else {
    const onChain = await callDecimals(client, checksummed);
    decimals = onChain ?? 18;
  }

  const meta = { symbol, decimals };
  cache.set(key, { ...meta, resolvedAt: Date.now() });
  return meta;
}

/** Test hook — clear the in-process cache. Not exported in prod paths. */
export function __resetTokenResolverCache(): void {
  cache.clear();
}
