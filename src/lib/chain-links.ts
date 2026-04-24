// src/lib/chain-links.ts
// ─────────────────────────────────────────────────────────────────────────────
// External-link URL builders for the token explorer.
//
// Pure functions, no I/O. All returns are fully-qualified `https://` URLs so
// callers can put them straight into <a href> without further handling.
//
// Returns null for unsupported chains or malformed inputs — render logic
// should hide the link in that case instead of rendering a broken "#" anchor.
//
// Ecosystem scope: EVM only as of this module. Solana explorer links
// (Solscan, SolanaFM) get their own builders in a follow-up commit; callers
// that handle Solana must branch on chainId before calling these helpers.
// ─────────────────────────────────────────────────────────────────────────────

import { isValidEvmAddress } from "@/lib/address-validation";

/**
 * Block-explorer URL for a contract on a given EVM chain.
 * Uses the canonical explorer per chain (Etherscan, BscScan, etc.).
 */
export function blockExplorerUrl(chainId: number, address: string): string | null {
  if (!isValidEvmAddress(address)) return null;
  const addr = address.toLowerCase();
  switch (chainId) {
    case 1:        return `https://etherscan.io/token/${addr}`;
    case 56:       return `https://bscscan.com/token/${addr}`;
    case 137:      return `https://polygonscan.com/token/${addr}`;
    case 8453:     return `https://basescan.org/token/${addr}`;
    case 11155111: return `https://sepolia.etherscan.io/token/${addr}`;
    case 84532:    return `https://sepolia.basescan.org/token/${addr}`;
    default:       return null;
  }
}

/**
 * TokenSniffer scan URL — a third-party safety / honeypot scanner. Uses
 * different slugs per chain than DexScreener (no 'bnb', just 'bsc').
 * Docs: https://tokensniffer.com/
 */
export function tokenSnifferUrl(chainId: number, address: string): string | null {
  if (!isValidEvmAddress(address)) return null;
  const addr = address.toLowerCase();
  const chain = (() => {
    switch (chainId) {
      case 1:    return "ethereum";
      case 56:   return "bsc";
      case 137:  return "polygon";
      case 8453: return "base";
      // TokenSniffer doesn't cover testnets — fall through.
      default:   return null;
    }
  })();
  if (!chain) return null;
  return `https://tokensniffer.com/token/${chain}/${addr}`;
}

/**
 * X / Twitter search URL for the token.
 *
 * Strategy: search for `$SYMBOL <truncatedAddress>` because 3-letter symbols
 * are too ambiguous to find the project on their own (`$UNI` hits thousands
 * of irrelevant posts). Including the truncated contract narrows to real
 * discussion of the token while still catching casual "$UNI just pumped"
 * posts that include the address.
 *
 * Caller passes `null` for symbol — we fall back to the full address which
 * is a clean but narrower search.
 */
export function xSearchUrl(symbol: string | null, address: string): string | null {
  if (!isValidEvmAddress(address)) return null;
  const addr = address.toLowerCase();
  const truncated = `${addr.slice(0, 6)}`;       // "0xabc1" — narrow enough
  const q = symbol
    ? encodeURIComponent(`$${symbol} ${truncated}`)
    : encodeURIComponent(addr);
  return `https://x.com/search?q=${q}&src=typed_query`;
}

/**
 * Human-readable short name for the block explorer. Useful for the button
 * label — "View on Etherscan" beats "View on block explorer".
 */
export function blockExplorerName(chainId: number): string | null {
  switch (chainId) {
    case 1:        return "Etherscan";
    case 56:       return "BscScan";
    case 137:      return "PolygonScan";
    case 8453:     return "BaseScan";
    case 11155111: return "Sepolia Etherscan";
    case 84532:    return "Sepolia BaseScan";
    default:       return null;
  }
}
