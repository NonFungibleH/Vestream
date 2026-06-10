import { erc20Abi } from "viem";
import { VestingAdapter } from "./index";
import { VestingStream, SupportedChainId, CHAIN_IDS } from "../types";
import { makeFallbackClient } from "../rpc";
import { resolveTokenMeta } from "../token-resolver";

// Module-level token metadata cache — survives within the same serverless instance
// Key: `${chainId}:${tokenAddress}`, Value: { symbol, decimals }
const TOKEN_META_CACHE = new Map<string, { symbol: string; decimals: number }>();
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Hedgey TokenVestingPlans contract addresses per chain
// Verified on-chain: 0x2CDE... = same bytecode on ETH, Base, BSC, Polygon, Arbitrum, Optimism
//                    0x68b6... = 30402 bytes on Sepolia (same bytecode, from Locked_VestingTokenPlans repo)
// Arbitrum verified 2026-05-02 — totalSupply() returned 1,191 plans via arb1.arbitrum.io/rpc.
// Optimism verified 2026-05-02 — totalSupply() returned 422 plans via optimism.drpc.org.
const CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BSC]:      "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.POLYGON]:  "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BASE]:     "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.ARBITRUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.OPTIMISM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.SEPOLIA]:  "0x68b6986416c7A38F630cBc644a2833A0b78b3631",
};

// VIEM_CHAINS removed 2026-05-26: makeFallbackClient now owns the chain
// → viem-chain mapping centrally in rpc.ts.

const HEDGEY_ABI = [
  { name: "balanceOf",          type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "tokenOfOwnerByIndex",type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "plans",              type: "function", stateMutability: "view", inputs: [{ name: "planId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "token",            type: "address" },
      { name: "amount",           type: "uint256" },
      { name: "start",            type: "uint256" },
      { name: "cliff",            type: "uint256" },
      { name: "rate",             type: "uint256" },
      { name: "period",           type: "uint256" },
      { name: "vestingAdmin",     type: "address" },
      { name: "adminTransferOBO", type: "bool"    },
    ]}]
  },
] as const;

type HedgeyPlan = {
  token: `0x${string}`; amount: bigint; start: bigint; cliff: bigint;
  rate: bigint; period: bigint; vestingAdmin: `0x${string}`; adminTransferOBO: boolean;
};

/**
 * Redeemable (vested) amount for a Hedgey plan at a given time.
 *
 * Hedgey accrues `rate` tokens per `period` from `start`, but releases
 * NOTHING until the `cliff` date — on-chain `redeemableBalance` returns 0
 * while `now < cliff`, then the full back-accrued amount unlocks at the cliff
 * and continues per period. Result is capped at the plan `amount`.
 *
 * Bug history (2026-06): this was previously computed inline as
 * `rate * floor((now-start)/period)` with NO cliff check, so before the
 * cliff we surfaced ~1 period of tokens as "claimable" that cannot actually
 * be claimed — Hedgey's own UI shows 0 vested / 0 claimable pre-cliff.
 * Reported on a Sepolia SEP plan (cliff 31 Jul 2026, app showed 4.17 SEP
 * claimable on 7 Jun). Both the mobile app and the web dashboard read this
 * value from the cache, so the wrong number appeared on both surfaces.
 */
export function hedgeyRedeemable(p: {
  amount: bigint; rate: bigint; period: bigint;
  startTime: number; cliffTime: number | null; nowSec: number;
}): bigint {
  if (p.cliffTime !== null && p.nowSec < p.cliffTime) return 0n; // nothing before the cliff
  if (p.period <= 0n) return 0n;
  const elapsed = BigInt(Math.max(0, p.nowSec - p.startTime));
  const vested  = p.rate * (elapsed / p.period);
  return vested > p.amount ? p.amount : vested;                  // never exceed the plan total
}

// 2026-05-26: migrated from single-URL http() transport to the shared
// fallback client. Previous pattern picked ONE URL via getRpcUrl() and
// pinned the entire wallet scan to it — if that URL happened to be
// ankr.com (now requires API key), meowrpc.com (rejects eth_call on some
// endpoints), publicnode.com (returning 404 today), or onfinality.io
// (rate-limited), every scan hitting that rotation failed loudly even
// though other URLs in the pool were healthy. makeFallbackClient hands
// viem a `fallback` transport over the whole pool with per-call
// failover + quarantine — same pattern PinkSale's walker uses.

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  const contractAddress = CONTRACTS[chainId];
  if (!contractAddress) return [];

  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) return [];

  const nowSec = Math.floor(Date.now() / 1000);
  const streams: VestingStream[] = [];

  for (const wallet of wallets) {
    try {
      const address = wallet as `0x${string}`;

      const balance = await client.readContract({
        address: contractAddress, abi: HEDGEY_ABI, functionName: "balanceOf", args: [address],
      });
      if (Number(balance) === 0) continue;

      // Batch: get all plan IDs
      const planIdResults = await client.multicall({
        contracts: Array.from({ length: Number(balance) }, (_, i) => ({
          address: contractAddress, abi: HEDGEY_ABI,
          functionName: "tokenOfOwnerByIndex" as const,
          args: [address, BigInt(i)] as [`0x${string}`, bigint],
        })),
      });

      const planIds = planIdResults
        .filter((r) => r.status === "success")
        .map((r) => r.result as bigint);

      // Diagnostic: when balanceOf > 0 but all multicall results failed,
      // log the first failure reason. Otherwise the silent-empty pattern
      // is invisible (Hedgey Polygon was stuck for 9+ days because of this
      // exact shape — adapter returned 0 streams with no error logged).
      // Same hedgey adapter runs on every chain so this catches the next
      // chain-specific multicall regression too.
      if (planIds.length === 0) {
        const firstFailure = planIdResults.find((r) => r.status === "failure");
        if (firstFailure && "error" in firstFailure) {
          console.error(
            `[hedgey/${chainId}] tokenOfOwnerByIndex multicall returned all-failures for ${wallet} ` +
            `(balance=${balance}, results=${planIdResults.length}). First error: ${(firstFailure.error as Error)?.message ?? String(firstFailure.error)}`
          );
        }
        continue;
      }

      // Batch: get plan details
      const detailResults = await client.multicall({
        contracts: planIds.map((planId) => ({
          address: contractAddress, abi: HEDGEY_ABI,
          functionName: "plans" as const, args: [planId] as [bigint],
        })),
      });

      // Same diagnostic for the plan-details multicall.
      const successCount = detailResults.filter((r) => r.status === "success").length;
      if (successCount === 0 && detailResults.length > 0) {
        const firstFailure = detailResults.find((r) => r.status === "failure");
        if (firstFailure && "error" in firstFailure) {
          console.error(
            `[hedgey/${chainId}] plans() multicall returned all-failures for ${wallet} ` +
            `(planIds=${planIds.length}). First error: ${(firstFailure.error as Error)?.message ?? String(firstFailure.error)}`
          );
        }
      }

      // Batch-fetch token metadata for all unique tokens not already cached
      const successPlans = detailResults
        .map((r, i) => (r.status === "success" ? { plan: r.result as HedgeyPlan, idx: i } : null))
        .filter(Boolean) as { plan: HedgeyPlan; idx: number }[];

      const uniqueTokens = [...new Set(successPlans.map((p) => p.plan.token.toLowerCase()))];
      const uncached = uniqueTokens.filter((addr) => !TOKEN_META_CACHE.has(`${chainId}:${addr}`));

      if (uncached.length > 0) {
        // Two multicalls: one for symbol, one for decimals — avoids mixed return type issues
        const [symResults, decResults] = await Promise.all([
          client.multicall({
            contracts: uncached.map((addr) => ({
              address: addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" as const,
            })),
          }),
          client.multicall({
            contracts: uncached.map((addr) => ({
              address: addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" as const,
            })),
          }),
        ]);

        // 2026-05-20: bytes32-symbol fallback via the shared resolver.
        // Hedgey's multicall reads `symbol() returns (string)`. Tokens
        // that implement `symbol()` as bytes32 (older ERC-20 convention)
        // fail this call silently and used to land here as the literal
        // string "UNKNOWN". The resolver re-tries with the bytes32 ABI
        // and only falls back to a truncated address as a last resort.
        // The string-symbol multicall result is passed in as a hint, so
        // when it succeeded the resolver is a fast cache hit; only the
        // failures actually do follow-up chain calls.
        for (let j = 0; j < uncached.length; j++) {
          const symHint  = symResults[j].status === "success" ? (symResults[j].result as string) : null;
          const decHint  = decResults[j].status === "success" ? (decResults[j].result as number) : null;
          const meta = await resolveTokenMeta(chainId, uncached[j], {
            existingSymbol:   symHint,
            existingDecimals: decHint,
          });
          TOKEN_META_CACHE.set(`${chainId}:${uncached[j]}`, meta);
        }
      }

      for (let i = 0; i < detailResults.length; i++) {
        const r = detailResults[i];
        if (r.status !== "success") continue;
        const plan = r.result as HedgeyPlan;

        // Resolve token metadata from cache (always populated above)
        const meta = TOKEN_META_CACHE.get(`${chainId}:${plan.token.toLowerCase()}`);
        const tokenSymbol   = meta?.symbol   ?? "UNKNOWN";
        const tokenDecimals = meta?.decimals ?? 18;

        const startTime = Number(plan.start);
        const cliffTime = Number(plan.cliff) > startTime ? Number(plan.cliff) : null;

        // Hedgey: discrete period-based vesting, gated on the cliff (see
        // hedgeyRedeemable — nothing is redeemable before the cliff date).
        const periodsElapsed = plan.period > 0n ? BigInt(Math.max(0, nowSec - startTime)) / plan.period : 0n;
        const vested         = hedgeyRedeemable({
          amount: plan.amount, rate: plan.rate, period: plan.period,
          startTime, cliffTime, nowSec,
        });
        const totalPeriods   = plan.rate > 0n ? plan.amount / plan.rate : 0n;
        const endTime        = startTime + Number(totalPeriods * plan.period);

        const claimableNow  = vested;
        const lockedAmount  = plan.amount > vested ? plan.amount - vested : 0n;
        const isFullyVested = vested >= plan.amount;

        let nxtUnlock: number | null = null;
        if (!isFullyVested) {
          if (cliffTime && nowSec < cliffTime) nxtUnlock = cliffTime;
          else if (plan.period > 0n) nxtUnlock = startTime + Number((periodsElapsed + 1n) * plan.period);
          else nxtUnlock = endTime;
        }

        streams.push({
          id:              `hedgey-${chainId}-${planIds[i].toString()}`,
          protocol:        "hedgey",
          category:        "vesting",
          chainId,
          recipient:       wallet,
          tokenAddress:    plan.token,
          tokenSymbol,
          tokenDecimals,
          totalAmount:     plan.amount.toString(),
          withdrawnAmount: "0",
          claimableNow:    claimableNow.toString(),
          lockedAmount:    lockedAmount.toString(),
          startTime,
          endTime,
          cliffTime,
          isFullyVested,
          nextUnlockTime:  nxtUnlock,
          cancelable:      plan.vestingAdmin.toLowerCase() !== ZERO_ADDRESS,
          // In-app claiming: redeemPlans([planId]) on the chain's
          // TokenVestingPlans deployment. planId == our nativeId.
          claimContract:   CONTRACTS[chainId] ?? null,
          claimNativeId:   planIds[i].toString(),
        });
      }
    } catch (err) {
      console.error(`Hedgey (chain ${chainId}) error for ${wallet}:`, err);
    }
  }

  return streams;
}

export const hedgeyAdapter: VestingAdapter = {
  id:   "hedgey",
  name: "Hedgey Finance",
  supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.BASE, CHAIN_IDS.ARBITRUM, CHAIN_IDS.OPTIMISM, CHAIN_IDS.SEPOLIA],
  fetch: fetchForChain,
};
