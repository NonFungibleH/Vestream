// src/lib/address-validation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Ecosystem-aware wallet/token address helpers.
//
// Vestream now tracks both EVM-compatible chains (Ethereum, BSC, Polygon,
// Base, + testnets) and Solana. That means every place the app previously
// called `viem.isAddress(x)` to validate a wallet address needs to accept
// either format:
//
//   - EVM:    0x-prefixed hex, 20 bytes, checksum-optional (we normalise
//             to lowercase for storage)
//   - Solana: base58-encoded ed25519 pubkey, 32 bytes, 32-44 chars long,
//             case-sensitive (lowercasing would corrupt it)
//
// This module centralises the ecosystem detection + validation + storage
// normalisation in one place so call sites don't have to know the rules.
// Call sites should use `isValidWalletAddress` in place of `viem.isAddress`,
// and `normaliseAddress` in place of raw `.toLowerCase()` on any address.
//
// Security note: `new PublicKey()` throws on invalid base58 OR on invalid
// byte-length. We catch and return false — never trust an unvalidated
// string against Solana RPC because malformed pubkeys can hang some
// clients.
// ─────────────────────────────────────────────────────────────────────────────

import { isAddress as isEvmAddress } from "viem";
import { PublicKey } from "@solana/web3.js";

export type AddressEcosystem = "evm" | "solana";

/**
 * Cheap prefix check before we spend the cost of a full validator call.
 * EVM addresses are always exactly 42 characters (0x + 40 hex); Solana
 * pubkeys are 32-44 base58 chars. The two ranges only overlap at 42 chars
 * — at which point the 0x prefix (not valid base58) disambiguates.
 */
function looksLikeEvm(s: string): boolean {
  return s.length === 42 && s.startsWith("0x");
}

function looksLikeSolana(s: string): boolean {
  // base58 alphabet excludes 0, O, I, l — cheap prefilter before PublicKey()
  // validates the length + curve properties.
  return s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

/**
 * Return the ecosystem an address belongs to, or null if it's not a valid
 * address on either supported ecosystem.
 */
export function detectEcosystem(address: string): AddressEcosystem | null {
  if (!address || typeof address !== "string") return null;
  if (looksLikeEvm(address) && isEvmAddress(address)) return "evm";
  if (looksLikeSolana(address) && isValidSolanaAddress(address)) return "solana";
  return null;
}

/**
 * True if the input is a valid Solana pubkey (including PDAs — off-curve
 * program-derived addresses are legitimate stream holders).
 */
export function isValidSolanaAddress(s: string): boolean {
  if (!looksLikeSolana(s)) return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * True if the input is a valid EVM address (via viem's checksum-aware
 * validator). Provided for symmetry with isValidSolanaAddress.
 */
export function isValidEvmAddress(s: string): boolean {
  return typeof s === "string" && looksLikeEvm(s) && isEvmAddress(s);
}

/**
 * True if the input is a valid wallet address on ANY supported ecosystem.
 * This is the drop-in replacement for `viem.isAddress` at call sites that
 * accept user-provided wallet addresses (settings, dashboard, find-vestings,
 * API route validators).
 */
export function isValidWalletAddress(s: string): boolean {
  return detectEcosystem(s) !== null;
}

/**
 * Normalise an address for cache key / DB storage / comparison. The
 * transformation is ecosystem-specific:
 *
 *   EVM:    lowercased hex. Checksum-case is preserved on the wire but
 *           we compare case-insensitively.
 *   Solana: returned as-is. Base58 is case-SENSITIVE — lowercasing would
 *           produce a different (likely invalid) pubkey.
 *
 * Returns the input unchanged if the address isn't recognised on either
 * ecosystem (the caller is responsible for having validated first).
 */
export function normaliseAddress(address: string): string {
  const ecosystem = detectEcosystem(address);
  if (ecosystem === "evm")    return address.toLowerCase();
  if (ecosystem === "solana") return address;
  return address;
}

/**
 * Compare two addresses for equality in an ecosystem-aware way.
 * Case-insensitive for EVM, case-sensitive for Solana.
 */
export function addressesEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normaliseAddress(a) === normaliseAddress(b);
}
