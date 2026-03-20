// Supported chain IDs
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

// All supported chain IDs as an array for convenience
export const ALL_CHAIN_IDS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.SEPOLIA,
  CHAIN_IDS.BASE_SEPOLIA,
];

// The normalized stream interface — common output from every adapter
export interface VestingStream {
  id: string;               // "{protocol}-{chainId}-{nativeId}"
  protocol: string;         // "sablier" | "hedgey" | "team-finance" | "uncx" | "unvest" | ...
  chainId: SupportedChainId;
  recipient: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  totalAmount: string;      // stringified bigint for JSON serialization
  withdrawnAmount: string;
  claimableNow: string;
  lockedAmount: string;
  startTime: number;        // unix seconds
  endTime: number;
  cliffTime: number | null;
  isFullyVested: boolean;
  nextUnlockTime: number | null;
  cancelable?: boolean;    // undefined = not reported by adapter (e.g. hedgey, uncx)
  // Step/tranche vesting (e.g. Sablier LockupTranched)
  shape?: "linear" | "steps";
  unlockSteps?: { timestamp: number; amount: string }[];  // sorted asc; each step = bigint tokens
  // Individual withdrawal/claim events — populated when the adapter can fetch them
  claimEvents?: { timestamp: number; amount: string }[];  // sorted desc (newest first)
}

// Shared vesting math helpers used by adapters
export function computeLinearVesting(
  total: bigint,
  withdrawn: bigint,
  startTime: number,
  endTime: number,
  nowSec: number
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
  endTime: number
): number | null {
  if (isFullyVested) return null;
  if (cliffTime && nowSec < cliffTime) return cliffTime;
  return endTime;
}

// Step/tranche vesting math — used for Sablier LockupTranched and similar
export function computeStepVesting(
  total: bigint,
  withdrawn: bigint,
  unlockSteps: { timestamp: number; amount: string }[],
  nowSec: number
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

// Next step unlock time — returns the timestamp of the first future tranche
export function nextUnlockTimeForSteps(
  nowSec: number,
  unlockSteps: { timestamp: number; amount: string }[]
): number | null {
  const next = unlockSteps.find((s) => s.timestamp > nowSec);
  return next?.timestamp ?? null;
}
