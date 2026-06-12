// src/lib/vesting/smart-money-denylist.ts
// ─────────────────────────────────────────────────────────────────────────────
// Recipient addresses to EXCLUDE from the smart-money leaderboard cron.
//
// The aggregation that powers /dashboard/smart-money (GROUP BY recipient on
// vestingStreamsCache) surfaces a lot of NOISE at the top — burn addresses
// that catch dust from launchpad airdrops, vesting contracts themselves
// (when a protocol acts as both factory and "recipient" for its own escrow),
// CEX hot wallets that receive countless distribution drops, etc. None of
// those are "smart money" — they're plumbing.
//
// This list is the denylist applied by the cron BEFORE building the
// snapshot. It's deliberately small (only obvious noise) — overfitting
// here pushes real wallets off the leaderboard. Add an entry only when:
//
//   1. It surfaces in the top-100 raw aggregate, AND
//   2. It clearly isn't an individual recipient (burn, contract, CEX
//      deposit collector, multi-distribution mixer), AND
//   3. Excluding it would noticeably improve the leaderboard's signal.
//
// Comparison: lowercase EVM hex, case-sensitive Solana base58 (per the
// project's normaliseAddress convention).
// ─────────────────────────────────────────────────────────────────────────────

const RAW_DENYLIST: ReadonlyArray<string> = [
  // ── Burn addresses ────────────────────────────────────────────────────
  "0x0000000000000000000000000000000000000000",     // canonical zero
  "0x000000000000000000000000000000000000dead",     // popular "burn" sentinel
  "0xdead000000000000000042069420694206942069",     // less-common burn variant
  // Solana doesn't have a burn convention in the same sense — tokens are
  // sent to a "system program" address but vesting contracts wouldn't
  // route there. No Solana entries needed yet.
];

// Lowercase + dedupe — defensive. Future contributors might paste
// mixed-case in.
const DENYLIST = new Set<string>(
  RAW_DENYLIST.map((a) => (a.startsWith("0x") ? a.toLowerCase() : a)),
);

/**
 * True when this recipient should be excluded from the smart-money
 * leaderboard. Cheap O(1) Set lookup — called once per recipient during
 * the cron's bulk aggregation.
 */
export function isSmartMoneyDenied(recipient: string): boolean {
  if (!recipient) return true;
  const normalised = recipient.startsWith("0x") ? recipient.toLowerCase() : recipient;
  return DENYLIST.has(normalised);
}

/** Visible for tests + admin diagnostics. */
export const SMART_MONEY_DENYLIST: ReadonlySet<string> = DENYLIST;
