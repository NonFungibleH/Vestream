// src/lib/vesting/seed-wallets.ts
// ─────────────────────────────────────────────────────────────────────────────
// Curated list of wallet addresses known to have vesting activity on
// protocols that can't be discovered programmatically (no subgraph, no
// indexable events with predictable signatures).
//
// The seeder re-scans these wallets on every run so their vestings stay
// fresh in `vestingStreamsCache` even without any real user traffic.
//
// When to add a wallet here:
//   - You encountered a real PinkSale / UNCX-VM lock in the wild that
//     Vestream would otherwise miss
//   - A Team Finance customer asked for their wallet to show in our
//     Discover page (Team Finance is normally seeded via Squid, but
//     if the Squid ever goes down we fall back to this list)
//   - You want Demo C on /demo to show an obviously populated result
//     (drop the demo recipient wallet here and it'll be in the cache
//     within 24 hours)
//
// Format: lowercase 0x-prefixed addresses, per chain. An empty array for
// a chain means "don't seed anything from here on that chain".
//
// ⚠️  This list is NOT a substitute for proper discovery. It's a manual
// fill-in while we figure out better strategies (contract event scans,
// NFT enumeration, etc.). Keep it small — a few dozen wallets per protocol
// at most. If you find yourself wanting to add 100+ wallets here, that's
// the signal to build real discovery for that protocol instead.
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "./types";

/**
 * Wallets known to have PinkSale (PinkLock V2) locks. PinkLock has no
 * subgraph, and its events haven't been mapped yet in the seeder, so this
 * list is how we prime the cache for the PinkSale protocol card on /protocols.
 *
 * Populate opportunistically as you encounter real wallets — a pre-launch
 * empty list is expected and the /protocols card will read "no data" until
 * it's filled.
 */
export const PINKSALE_SEED_WALLETS: Record<SupportedChainId, string[]> = {
  [CHAIN_IDS.ETHEREUM]:     [],
  [CHAIN_IDS.BSC]:          [],
  [CHAIN_IDS.POLYGON]:      [],
  [CHAIN_IDS.BASE]:         [],
  [CHAIN_IDS.SEPOLIA]:      [],
  [CHAIN_IDS.BASE_SEPOLIA]: [],
};
