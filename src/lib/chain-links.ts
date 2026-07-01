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
// Ecosystem dispatch:
//   Each helper takes a chainId and routes internally to the correct
//   ecosystem's canonical URL. EVM chains → Etherscan family / TokenSniffer.
//   Solana (chainId 101) → Solscan / RugCheck. Callers don't need to know
//   which ecosystem a chain belongs to; just pass the chainId.
// ─────────────────────────────────────────────────────────────────────────────

import { isValidEvmAddress, isValidSolanaAddress } from "@/lib/address-validation";

const SOLANA_CHAIN_ID = 101;

// EVM 0x-hex OR Solana base58 (32–44 chars, base58 alphabet). Regex-based so
// it's safe to use in client components without pulling in @solana/web3.js.
const EVM_ADDR_RE     = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDR_RE  = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * True when `addr` is a real on-chain token address we can build a
 * `/token/[chainId]/[address]` link to — EVM hex or Solana base58. Used to
 * gate token links so symbol-only / placeholder rows don't navigate to a dead
 * page. Previously callers hardcoded an EVM-only `/^0x…{40}$/` test, which made
 * every Solana (Streamflow / Jupiter Lock) token un-clickable.
 */
export function isLinkableTokenAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  return EVM_ADDR_RE.test(addr) || SOLANA_ADDR_RE.test(addr);
}

/**
 * Block-explorer URL for a contract on a given chain.
 * EVM chains: Etherscan family. Solana: Solscan.
 */
export function blockExplorerUrl(chainId: number, address: string): string | null {
  if (chainId === SOLANA_CHAIN_ID) {
    if (!isValidSolanaAddress(address)) return null;
    // Solscan uses the same URL shape for SPL mints and wallet accounts —
    // /token/ for mints, /account/ for holders. Since this helper is called
    // from the token-explorer context, /token/ is the right default.
    return `https://solscan.io/token/${address}`;
  }

  if (!isValidEvmAddress(address)) return null;
  const addr = address.toLowerCase();
  switch (chainId) {
    case 1:        return `https://etherscan.io/token/${addr}`;
    case 56:       return `https://bscscan.com/token/${addr}`;
    case 137:      return `https://polygonscan.com/token/${addr}`;
    case 8453:     return `https://basescan.org/token/${addr}`;
    case 42161:    return `https://arbiscan.io/token/${addr}`;
    case 10:       return `https://optimistic.etherscan.io/token/${addr}`;
    case 11155111: return `https://sepolia.etherscan.io/token/${addr}`;
    case 84532:    return `https://sepolia.basescan.org/token/${addr}`;
    default:       return null;
  }
}

/**
 * Block-explorer URL for a WALLET / account (not a token contract).
 * EVM: /address/. Solana: /account/. Use this for recipients/holders;
 * use `blockExplorerUrl` for the token contract itself.
 */
export function blockExplorerAddressUrl(chainId: number, address: string): string | null {
  if (chainId === SOLANA_CHAIN_ID) {
    if (!isValidSolanaAddress(address)) return null;
    return `https://solscan.io/account/${address}`;
  }

  if (!isValidEvmAddress(address)) return null;
  const addr = address.toLowerCase();
  switch (chainId) {
    case 1:        return `https://etherscan.io/address/${addr}`;
    case 56:       return `https://bscscan.com/address/${addr}`;
    case 137:      return `https://polygonscan.com/address/${addr}`;
    case 8453:     return `https://basescan.org/address/${addr}`;
    case 42161:    return `https://arbiscan.io/address/${addr}`;
    case 10:       return `https://optimistic.etherscan.io/address/${addr}`;
    case 11155111: return `https://sepolia.etherscan.io/address/${addr}`;
    case 84532:    return `https://sepolia.basescan.org/address/${addr}`;
    default:       return null;
  }
}

/**
 * Honeypot / safety scanner URL. EVM chains use TokenSniffer; Solana uses
 * RugCheck (the Solana-native equivalent — scans liquidity locks, mint
 * authority, top-holder concentration). Testnets are unsupported on either
 * side.
 */
export function tokenSnifferUrl(chainId: number, address: string): string | null {
  if (chainId === SOLANA_CHAIN_ID) {
    if (!isValidSolanaAddress(address)) return null;
    return `https://rugcheck.xyz/tokens/${address}`;
  }

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
  // Works for any ecosystem — the query is just free-form text. Validate
  // both ecosystems so a bogus string doesn't leak into the URL.
  if (!isValidEvmAddress(address) && !isValidSolanaAddress(address)) return null;
  // For Solana preserve case; for EVM lowercase is fine (both render in X search).
  const isSolana = isValidSolanaAddress(address);
  const addr = isSolana ? address : address.toLowerCase();
  const truncated = addr.slice(0, 6);
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
    case 42161:    return "Arbiscan";
    case 10:       return "Optimistic Etherscan";
    case 11155111: return "Sepolia Etherscan";
    case 84532:    return "Sepolia BaseScan";
    case 101:      return "Solscan";
    default:       return null;
  }
}

/**
 * Human-readable short name for the safety-scanner link. Mirrors
 * blockExplorerName — callers render it as "Check on <name>".
 */
export function tokenSnifferName(chainId: number): string | null {
  switch (chainId) {
    case 1:
    case 56:
    case 137:
    case 8453:
      return "TokenSniffer";
    case 101:
      return "RugCheck";
    default:
      return null;
  }
}
