export type AddressEcosystem = "evm" | "solana";
/**
 * Return the ecosystem an address belongs to, or null if it's not a valid
 * address on either supported ecosystem.
 */
export declare function detectEcosystem(address: string): AddressEcosystem | null;
/**
 * True if the input is a valid Solana pubkey (including PDAs — off-curve
 * program-derived addresses are legitimate stream holders).
 */
export declare function isValidSolanaAddress(s: string): boolean;
/**
 * True if the input is a valid EVM address (via viem's checksum-aware
 * validator). Provided for symmetry with isValidSolanaAddress.
 */
export declare function isValidEvmAddress(s: string): boolean;
/**
 * True if the input is a valid wallet address on ANY supported ecosystem.
 * This is the drop-in replacement for `viem.isAddress` at call sites that
 * accept user-provided wallet addresses (settings, dashboard, find-vestings,
 * API route validators).
 */
export declare function isValidWalletAddress(s: string): boolean;
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
export declare function normaliseAddress(address: string): string;
/**
 * Compare two addresses for equality in an ecosystem-aware way.
 * Case-insensitive for EVM, case-sensitive for Solana.
 */
export declare function addressesEqual(a: string, b: string): boolean;
