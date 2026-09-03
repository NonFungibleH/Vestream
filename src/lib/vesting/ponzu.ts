// src/lib/vesting/ponzu.ts
// ─────────────────────────────────────────────────────────────────────────────
// Ponzu (ponzu.app) — shared constants and on-chain shapes.
//
// A permissionless ERC-20 launchpad with "diamond-hand" vesting on Ethereum,
// Robinhood Chain and Sepolia. Tokens vest linearly over the craft's
// vestingDuration, and a holder may claim EXACTLY ONCE: claiming early
// permanently forfeits the unvested remainder, which is redistributed to the
// holders who waited.
//
// That mechanic is the whole reason we integrate a launchpad this small. On
// every other protocol we track, claiming early costs nothing — you simply
// claim again later. Here the timing decision is worth real money, which makes
// it the sharpest possible demonstration of what Vestream is for. A verified
// example from their Sepolia deployment:
//
//   TokensClaimed  user 0xb09F0dF7…  tokenId 1
//     vested        2.568765379152963660
//     unvested   2887.292286167931154602      ← forfeited
//     => claimed 0.1% of a 2,889.86 allocation
//
// Architecture: ONE factory (PonzuV4Recipe) clones a full per-project stack.
// A holder's position is a "bottle" — an ERC-721 minted by the presale clone,
// which IS the NFT collection. Positions are transferable and a wallet may
// hold several, so a bottle (not a wallet) is the unit that maps to one
// VestingStream.
// ─────────────────────────────────────────────────────────────────────────────
import { parseAbi } from "viem";
import { CHAIN_IDS, type SupportedChainId } from "./types";

/** Factory ("recipe") per chain. From docs.ponzu.app/protocol/contract-addresses. */
export const PONZU_RECIPE: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]:  "0xCF3c37C0aD2Fd94368921ff570d100119072E826",
  [CHAIN_IDS.ROBINHOOD]: "0x79e44301FF3D01cbA3F1D3BB697CFF9Da426647b",
  [CHAIN_IDS.SEPOLIA]:   "0xc5fB448b4C1E9FF6e20c41f6E3cD4153a34247F9",
};

export const PONZU_CHAINS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM, CHAIN_IDS.ROBINHOOD, CHAIN_IDS.SEPOLIA,
];

/**
 * Emitted by the FACTORY once per project. Gives us every clone address plus
 * the vest terms, so this is our discovery source for the presale registry.
 */
export const PONZU_CRAFTED_ABI = parseAbi([
  "event PonzuCrafted(address indexed owner, string tokenName, string tokenSymbol, (address governor, address project, address operator, address lpVault, address memberCard, address membersVault, address token, address presale, address launcher, address distributor, address farm, address hook, address paymentVault, address teamVault, address workLock) addresses, (uint256 poolId, address pricingStrategy, address protocolFeeRecipient, address ethRewarder, bytes32 pricingStrategyTemplate, uint256 vestingDuration, uint256 presaleAllocation, uint256 midRaise, uint256 minRaise, uint256 maxBonusMultiplier, bytes pricingStrategyData) terms)",
]);
export const PONZU_CRAFTED_TOPIC =
  "0x8466618509937ab93d4da52413a941f4b3fbcc830270536361033c280ea400b4" as const;

/**
 * Emitted by each PRESALE CLONE when a bottle is claimed. Added by the Ponzu
 * team at our request (2026-09-02) — `unvestedAmount` in particular, which is
 * the forfeited remainder and the number our alerts are built on.
 *
 * Both params are indexed, so we can filter by wallet or by bottle.
 * Verified against a real Sepolia log; topic0 below is confirmed on-chain,
 * not derived from the docs.
 */
export const PONZU_CLAIMED_ABI = parseAbi([
  "event TokensClaimed(address indexed user, uint256 indexed tokenId, uint256 vestedAmount, uint256 unvestedAmount)",
]);
export const PONZU_CLAIMED_TOPIC =
  "0xe49649ad7d04a14b0d2a43dae89f207c0822143ff6f88a6480e88907e4e5c548" as const;

/** Presale reads. There is no `launched()` — launchTime() > 0 means graduated. */
export const PONZU_PRESALE_ABI = parseAbi([
  "function getUserBottle(address user) view returns (uint256)",
  "function claimWeight(uint256 tokenId) view returns (uint256)",
  "function ethContributions(uint256 tokenId) view returns (uint256)",
  "function launchTime() view returns (uint256)",
  "function tokensAvailable() view returns (uint256)",
]);

/**
 * A claimed bottle is SPENT, not partially vested: the unvested remainder is
 * gone, not pending. Anything rendering a Ponzu position must show
 * claimed/forfeited and a ZERO remaining allocation — never a phantom balance
 * that can no longer be claimed. This is the one Ponzu-specific rule that does
 * not fall out of our normal vesting model.
 */
export interface PonzuClaim {
  chainId:        SupportedChainId;
  presale:        string;
  user:           string;
  tokenId:        bigint;
  vestedAmount:   bigint;   // taken
  unvestedAmount: bigint;   // forfeited
  blockNumber:    bigint;
  txHash:         string;
}

/** Original allocation = what they took + what they gave up. */
export function ponzuAllocation(c: Pick<PonzuClaim, "vestedAmount" | "unvestedAmount">): bigint {
  return c.vestedAmount + c.unvestedAmount;
}

/** Share of the allocation actually claimed, 0-100. */
export function ponzuClaimedPct(c: Pick<PonzuClaim, "vestedAmount" | "unvestedAmount">): number {
  const total = ponzuAllocation(c);
  if (total === 0n) return 0;
  return Number((c.vestedAmount * 10_000n) / total) / 100;
}
