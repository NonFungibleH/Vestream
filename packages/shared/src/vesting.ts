// packages/shared/src/vesting.ts
// ─────────────────────────────────────────────────────────────────────────────
// The authoritative source of truth for TokenVest's vesting data model.
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
export const CHAIN_IDS = {
  ETHEREUM:     1,
  BSC:          56,
  POLYGON:      137,
  BASE:         8453,
  SEPOLIA:      11155111,  // Ethereum Sepolia testnet
  BASE_SEPOLIA: 84532,     // Base Sepolia testnet
} as const;

export type SupportedChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export const CHAIN_NAMES: Record<SupportedChainId, string> = {
  [CHAIN_IDS.ETHEREUM]:     "Ethereum",
  [CHAIN_IDS.BSC]:          "BSC",
  [CHAIN_IDS.POLYGON]:      "Polygon",
  [CHAIN_IDS.BASE]:         "Base",
  [CHAIN_IDS.SEPOLIA]:      "Sepolia",
  [CHAIN_IDS.BASE_SEPOLIA]: "Base Sepolia",
};

export const TESTNET_CHAIN_IDS: SupportedChainId[] = [
  CHAIN_IDS.SEPOLIA,
  CHAIN_IDS.BASE_SEPOLIA,
];

export const ALL_CHAIN_IDS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.SEPOLIA,
  CHAIN_IDS.BASE_SEPOLIA,
];

// ── Normalised vesting stream ──────────────────────────────────────────────
/**
 * The canonical output from every protocol adapter. Every field is
 * JSON-safe (bigints are stringified) so these objects round-trip cleanly
 * through fetch, SSR, localStorage, React Native AsyncStorage, etc.
 */
export interface VestingStream {
  /** Composite ID: `{protocol}-{chainId}-{nativeId}`. Used as stable cache key. */
  id: string;
  /** Adapter ID: "sablier" | "hedgey" | "team-finance" | "uncx" | "unvest" | ... */
  protocol: string;
  chainId: SupportedChainId;
  recipient: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /** Stringified bigint. All downstream math should BigInt() these. */
  totalAmount: string;
  withdrawnAmount: string;
  claimableNow: string;
  lockedAmount: string;
  /** Unix seconds. */
  startTime: number;
  endTime: number;
  cliffTime: number | null;
  isFullyVested: boolean;
  nextUnlockTime: number | null;
  /** undefined = not reported by adapter (e.g. hedgey, uncx). */
  cancelable?: boolean;
  /** Step/tranche vesting (e.g. Sablier LockupTranched). */
  shape?: "linear" | "steps";
  unlockSteps?: { timestamp: number; amount: string }[];
  /** Individual withdrawal/claim events — populated when the adapter can fetch them. */
  claimEvents?: { timestamp: number; amount: string }[];
}

// ── Shared math helpers ─────────────────────────────────────────────────────
export function computeLinearVesting(
  total: bigint,
  withdrawn: bigint,
  startTime: number,
  endTime: number,
  nowSec: number,
): { claimableNow: bigint; lockedAmount: bigint; isFullyVested: boolean } {
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
