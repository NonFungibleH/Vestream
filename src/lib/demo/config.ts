// src/lib/demo/config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Demo mode selection + shared constants.
//
// Simulation mode (default):   Works with zero config. Pure math, no chain calls.
// Sepolia mode (real on-chain): Activates when the env vars below are all set.
//
// The UI is identical in both modes; only the backend changes. This lets us
// ship the demo UI to production immediately and flip on the real Sepolia
// integration once the user deploys the demo contracts.
// ─────────────────────────────────────────────────────────────────────────────

export type DemoMode = "simulation" | "sepolia";

/** Demo vesting parameters shared by both modes. */
export const DEMO_CONFIG = {
  tokenSymbol:   "DEMO",
  tokenDecimals: 18,
  /** 1000 DEMO (with 18 decimals). */
  totalAmount:   (1000n * 10n ** 18n).toString(),
  /** 15 minutes, expressed in seconds. */
  durationSec:   15 * 60,
  /** No cliff — linear from t=0. */
  cliffSec:      0,
} as const;

/**
 * Sepolia chain config. Used only in "sepolia" mode.
 * The Google Cloud faucet is linked from the demo page for users who want to
 * top up their own wallets with testnet ETH.
 */
export const SEPOLIA_CONFIG = {
  chainId:      11155111,
  explorerBase: "https://sepolia.etherscan.io",
  faucetUrl:    "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
} as const;

/**
 * Decide which mode to run the demo in based on env vars.
 * Real (sepolia) mode requires ALL of:
 *   - SEPOLIA_RPC_URL
 *   - DEMO_HOT_WALLET_PRIVATE_KEY
 *   - DEMO_VESTING_FACTORY_ADDRESS (or DEMO_VESTING_ADDRESS for a fixed instance)
 *   - DEMO_TOKEN_ADDRESS
 */
export function getDemoMode(): DemoMode {
  const hasAll =
    !!process.env.SEPOLIA_RPC_URL &&
    !!process.env.DEMO_HOT_WALLET_PRIVATE_KEY &&
    (!!process.env.DEMO_VESTING_FACTORY_ADDRESS || !!process.env.DEMO_VESTING_ADDRESS) &&
    !!process.env.DEMO_TOKEN_ADDRESS;

  return hasAll ? "sepolia" : "simulation";
}
