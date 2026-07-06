// packages/shared/src/vesting.ts
// ─────────────────────────────────────────────────────────────────────────────
// The authoritative source of truth for Vestream's vesting data model.
//
// Every adapter, every API response, every mobile screen, every MCP tool
// eventually normalises to the `VestingStream` interface below. By keeping
// this file pure TypeScript (no Next.js, no react, no drizzle, no viem
// imports) we can publish it as `@vestream/shared` and have web, mobile, and
// the MCP server all consume it — so a field rename is a single-file change
// instead of a grep-and-pray exercise across three repos.
//
// CURRENT STATE: this package is not yet published to npm. Imports still go
// through `src/lib/vesting/types.ts` in the web app, which now re-exports
// everything from here. Once we stabilise the fields and publish, we can
// point both the web and mobile repos at the npm version.
//
// RULES FOR THIS FILE:
//   - No runtime dependencies (no imports from any package)
//   - No Node or browser-only APIs (no `fs`, no `fetch`, no `window`)
//   - No bigint literals at the type level — keep everything JSON-serialisable
//   - If you add a field to VestingStream, document the semantics here, then
//     run `grep -rn "VestingStream" .` in every consuming repo to check impact
// ─────────────────────────────────────────────────────────────────────────────

// ── Chain IDs ───────────────────────────────────────────────────────────────
//
// `SupportedChainId` is a network identifier — it's named after the EVM
// `chainId` concept (which is where we started) but it's not EVM-exclusive.
// Non-EVM networks don't have a canonical EVM-style chainId, so we pick
// stable synthetic numbers that can't collide with real EVM chains:
//   - Solana uses 101 (Solana's own cluster enum convention)
//
// When adding a new non-EVM chain, add it here, add a CHAIN_NAMES entry,
// add it to ALL_CHAIN_IDS, and add it to NON_EVM_CHAIN_IDS. Downstream
// ecosystem-aware helpers (isEvmChain, address validation) pick it up
// automatically.
export const CHAIN_IDS = {
  ETHEREUM:     1,
  BSC:          56,
  POLYGON:      137,
  BASE:         8453,
  ARBITRUM:     42161,     // Arbitrum One — largest L2 by TVL
  OPTIMISM:     10,        // OP Mainnet — major L2 (OP token vesting + ecosystem)
  AVALANCHE:    43114,     // Avalanche C-Chain — vesting TVL across Sablier/Hedgey/Team Finance/LlamaPay
  SEPOLIA:      11155111,  // Ethereum Sepolia testnet
  BASE_SEPOLIA: 84532,     // Base Sepolia testnet
  SOLANA:       101,       // Solana mainnet-beta (non-EVM)
} as const;

export type SupportedChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export const CHAIN_NAMES: Record<SupportedChainId, string> = {
  [CHAIN_IDS.ETHEREUM]:     "Ethereum",
  [CHAIN_IDS.BSC]:          "BSC",
  [CHAIN_IDS.POLYGON]:      "Polygon",
  [CHAIN_IDS.BASE]:         "Base",
  [CHAIN_IDS.ARBITRUM]:     "Arbitrum",
  [CHAIN_IDS.OPTIMISM]:     "Optimism",
  [CHAIN_IDS.AVALANCHE]:    "Avalanche",
  [CHAIN_IDS.SEPOLIA]:      "Sepolia",
  [CHAIN_IDS.BASE_SEPOLIA]: "Base Sepolia",
  [CHAIN_IDS.SOLANA]:       "Solana",
};

export const TESTNET_CHAIN_IDS: SupportedChainId[] = [
  CHAIN_IDS.SEPOLIA,
  CHAIN_IDS.BASE_SEPOLIA,
];

// Explicit EVM / non-EVM partitioning — used by address validators,
// ecosystem-aware UI helpers, and adapters that need to branch on network
// family rather than on individual chain IDs.
export const NON_EVM_CHAIN_IDS: SupportedChainId[] = [
  CHAIN_IDS.SOLANA,
];

export const EVM_CHAIN_IDS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.AVALANCHE,
  CHAIN_IDS.SEPOLIA,
  CHAIN_IDS.BASE_SEPOLIA,
];

/** True when the given chainId belongs to an EVM-compatible network. */
export function isEvmChain(id: SupportedChainId): boolean {
  return EVM_CHAIN_IDS.includes(id);
}

export const ALL_CHAIN_IDS: SupportedChainId[] = [
  ...EVM_CHAIN_IDS,
  ...NON_EVM_CHAIN_IDS,
];

// ── Normalised vesting stream ──────────────────────────────────────────────
/**
 * The canonical output from every protocol adapter. Every field is
 * JSON-safe (bigints are stringified) so these objects round-trip cleanly
 * through fetch, SSR, localStorage, React Native AsyncStorage, etc.
 */
/**
 * Category of a token-receipt stream. Drives UI branching, copy choices,
 * and tax-export labelling. Set explicitly by every adapter.
 *
 *   - "vesting"   = discrete or linear cliff/unlock vesting (Sablier Lockup,
 *                   Hedgey, UNCX, Unvest, Team Finance, PinkSale, Streamflow,
 *                   Jupiter Lock — investor TGE / team grants / token locks).
 *   - "stream"    = continuous per-second token streaming (LlamaPay,
 *                   Superfluid Money Streams, Sablier Flow — payroll / DAO
 *                   contributor pay / grant streams).
 *   - "milestone" = milestone-/event-triggered releases that aren't on a
 *                   time schedule (reserved for future protocols; nothing
 *                   uses this today).
 *
 * The category is a property of the protocol + product, not the receiver —
 * the same stream looks identical to investor and worker users; the
 * difference is in HOW we frame it (next-unlock-countdown vs streaming-rate)
 * and how the receiver's tax export classifies the income.
 */
export type StreamCategory = "vesting" | "stream" | "milestone";

/**
 * Default category lookup keyed by adapter ID. Adapters should set
 * `category` explicitly on each stream — this map exists so:
 *   1. Cache rows from before the field existed can be back-filled at
 *      read time (defaults derived from `protocol`).
 *   2. Cross-cutting code (e.g. /protocols category filter, /status page)
 *      can group protocols without touching every adapter.
 *
 * If a protocol ever produces multiple categories (e.g. a future Sablier
 * adapter that handles both Lockup AND Flow), the adapter sets each
 * stream's category individually and this map gives a sensible fallback.
 */
export const PROTOCOL_DEFAULT_CATEGORY: Record<string, StreamCategory> = {
  sablier:        "vesting",
  "sablier-flow": "stream",
  hedgey:         "vesting",
  uncx:           "vesting",
  "uncx-vm":      "vesting",
  unvest:         "vesting",
  "team-finance": "vesting",
  superfluid:     "vesting", // VestingScheduler — Money Streams adapter would be "stream"
  pinksale:       "vesting",
  streamflow:     "vesting",
  "jupiter-lock": "vesting",
  llamapay:       "stream",
};

/** Lookup helper — falls back to "vesting" for unknown adapter ids so the
 *  UI never crashes on a freshly-added protocol that the shared package
 *  hasn't been bumped to know about yet. */
export function categoryForProtocol(protocol: string): StreamCategory {
  return PROTOCOL_DEFAULT_CATEGORY[protocol] ?? "vesting";
}

export interface VestingStream {
  /** Composite ID: `{protocol}-{chainId}-{nativeId}`. Used as stable cache key. */
  id: string;
  /** Adapter ID: "sablier" | "hedgey" | "team-finance" | "uncx" | "unvest" | ... */
  protocol: string;
  /** Vesting vs stream vs milestone. See StreamCategory docstring. Required —
   *  every adapter must set this explicitly so the UI/tax/export layers can
   *  branch off it without runtime surprises. Cache rows from before this
   *  field existed are back-filled via categoryForProtocol() on read. */
  category: StreamCategory;
  chainId: SupportedChainId;
  recipient: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /** Stringified bigint. All downstream math should BigInt() these.
   *
   *  Semantics differ by category:
   *    - vesting/milestone: total scheduled allocation (fixed at creation).
   *    - stream: streamed-so-far snapshot at fetch time. Advances on each
   *      refresh as more time elapses; there is no fixed "scheduled total"
   *      because the payer can keep topping up the deposit indefinitely. */
  totalAmount: string;
  withdrawnAmount: string;
  claimableNow: string;
  /** Always 0 for "stream" category — continuous streams have no future
   *  locked allocation in the vesting sense. */
  lockedAmount: string;
  /** Unix seconds. */
  startTime: number;
  /** For "stream" category, this is the snapshot time (nowSec at fetch),
   *  not a scheduled end. Use category to decide how to render. */
  endTime: number;
  cliffTime: number | null;
  isFullyVested: boolean;
  /** Null for "stream" category — continuous streams have no discrete
   *  next-unlock event; receivers can claim accrued balance any time. */
  nextUnlockTime: number | null;
  /** undefined = not reported by adapter (e.g. hedgey, uncx). */
  cancelable?: boolean;
  /** Step/tranche vesting (e.g. Sablier LockupTranched). */
  shape?: "linear" | "steps";
  unlockSteps?: { timestamp: number; amount: string }[];
  /** Individual withdrawal/claim events — populated when the adapter can fetch them. */
  claimEvents?: { timestamp: number; amount: string }[];
  /** Originating on-chain transaction hash (the tx that minted/created
   *  this vesting). EVM: 0x-prefixed 32-byte hash. Solana: base58
   *  signature (different shape but same semantic role). Null when the
   *  adapter can't surface it cheaply — PinkSale relies on contract
   *  enumeration with no per-stream tx context, and Solana program
   *  accounts don't include the originating signature in their data.
   *  Tap-to-open routes through the chain's block explorer. Added
   *  2026-05-14 for the retail-transparency push: a verifiable on-chain
   *  link from each vesting back to its creation event. */
  lockTxHash?: string | null;
  /** In-app claiming (2026-06, Phase 1: Sablier + Hedgey).
   *  claimContract — the on-chain contract holding the claim function
   *  (Sablier: per-stream Lockup contract from Envio's `contract` field;
   *  Hedgey: the TokenVestingPlans deployment for the chain).
   *  claimNativeId — the on-chain id the claim function takes. NOT always
   *  the stream id's third segment: Sablier ids embed Envio's `subgraphId`
   *  (a global counter), while withdrawMax() needs the per-contract
   *  `tokenId`. Hedgey's planId is the same in both places.
   *  Both undefined ⇒ in-app claiming unsupported for this stream (mobile
   *  falls back to the protocol's web claim UI). */
  claimContract?: string | null;
  claimNativeId?: string | null;
  /** Extra named claim arguments for protocols whose claim call takes more
   *  than a single id (added 2026-06, universal-claiming Phase 0). Example:
   *  LlamaPay's `withdraw(from, to, amountPerSec)` needs `{ from, amountPerSec }`
   *  (the recipient = `to` comes from `recipient`). A recipe reads EITHER
   *  `claimNativeId` (single-id protocols) OR `claimArgs` (multi-arg). Values
   *  are stringified so the payload stays JSON-safe through the cache + API. */
  claimArgs?: Record<string, string> | null;
}

// ── Shared math helpers ─────────────────────────────────────────────────────
export function computeLinearVesting(
  total: bigint,
  withdrawn: bigint,
  startTime: number,
  endTime: number,
  nowSec: number,
  cliffTime?: number | null,
): { claimableNow: bigint; lockedAmount: bigint; isFullyVested: boolean } {
  // Linear-with-cliff releases NOTHING until the cliff date, then unlocks the
  // back-accrued amount at the cliff and continues linearly. Without this gate
  // we'd surface tokens as claimable before the cliff — which they aren't.
  // (Same class of bug fixed in the Hedgey adapter, 2026-06.)
  if (cliffTime != null && nowSec < cliffTime) {
    return { claimableNow: 0n, lockedAmount: total, isFullyVested: false };
  }
  const duration = endTime - startTime;
  const elapsed  = Math.max(0, Math.min(nowSec - startTime, duration));
  const vested   = duration > 0 ? (total * BigInt(elapsed)) / BigInt(duration) : 0n;
  const claimableNow = vested > withdrawn ? vested - withdrawn : 0n;
  const lockedAmount = total > vested ? total - vested : 0n;
  return { claimableNow, lockedAmount, isFullyVested: nowSec >= endTime };
}

export function nextUnlockTime(
  isFullyVested: boolean,
  nowSec: number,
  cliffTime: number | null,
  endTime: number,
): number | null {
  if (isFullyVested) return null;
  if (cliffTime && nowSec < cliffTime) return cliffTime;
  return endTime;
}

export function computeStepVesting(
  total: bigint,
  withdrawn: bigint,
  unlockSteps: { timestamp: number; amount: string }[],
  nowSec: number,
): { claimableNow: bigint; lockedAmount: bigint; isFullyVested: boolean } {
  const vestedSoFar = unlockSteps
    .filter((s) => s.timestamp <= nowSec)
    .reduce((sum, s) => sum + BigInt(s.amount), 0n);
  const claimableNow = vestedSoFar > withdrawn ? vestedSoFar - withdrawn : 0n;
  const lockedAmount = total > vestedSoFar ? total - vestedSoFar : 0n;
  const lastStep = unlockSteps.at(-1);
  const isFullyVested = lastStep ? nowSec >= lastStep.timestamp : false;
  return { claimableNow, lockedAmount, isFullyVested };
}

export function nextUnlockTimeForSteps(
  nowSec: number,
  unlockSteps: { timestamp: number; amount: string }[],
): number | null {
  const next = unlockSteps.find((s) => s.timestamp > nowSec);
  return next?.timestamp ?? null;
}
