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

// Hedgey runs FOUR plan contracts, at the same address on every EVM chain we
// support. We used to read only TokenVestingPlans, which holds 23% of finished
// plans (2026-10-09 census of all four on six chains) — so a wallet scan missed
// most people's Hedgey plans. Lockup plans use a 6-field Plan struct with no
// vesting admin; the voting variants share their base contract's struct.
type HedgeyKind = "vesting" | "lockup";
interface HedgeyContract { address: `0x${string}`; kind: HedgeyKind; tag: string | null }
const OTHER_PLAN_CONTRACTS: HedgeyContract[] = [
  { address: "0x1bb64AF7FE05fc69c740609267d2AbE3e119Ef82", kind: "vesting", tag: "vtvp" }, // VotingTokenVestingPlans
  { address: "0x1961A23409CA59EEDCA6a99c97E4087DaD752486", kind: "lockup",  tag: "tlp"  }, // TokenLockupPlans
  { address: "0x73cD8626b3cD47B009E68380720CFE6679A3Ec3D", kind: "lockup",  tag: "vtlp" }, // VotingTokenLockupPlans
];
function contractsFor(chainId: SupportedChainId): HedgeyContract[] {
  const tvp = CONTRACTS[chainId];
  if (!tvp) return [];
  // tag null keeps TokenVestingPlans' existing stream ids (`hedgey-{chain}-{id}`).
  const list: HedgeyContract[] = [{ address: tvp, kind: "vesting", tag: null }];
  if (chainId !== CHAIN_IDS.SEPOLIA) list.push(...OTHER_PLAN_CONTRACTS);
  return list;
}

// VIEM_CHAINS removed 2026-05-26: makeFallbackClient now owns the chain
// → viem-chain mapping centrally in rpc.ts.

const HEDGEY_LOCKUP_PLANS_ABI = [{
  name: "plans", type: "function", stateMutability: "view",
  inputs: [{ name: "", type: "uint256" }],
  outputs: [
    { name: "token",  type: "address" },
    { name: "amount", type: "uint256" },
    { name: "start",  type: "uint256" },
    { name: "cliff",  type: "uint256" },
    { name: "rate",   type: "uint256" },
    { name: "period", type: "uint256" },
  ],
}] as const;

// The contract's own view of a plan (both contract kinds): what is redeemable
// at `timeStamp`, what remains, and the end date. Using these instead of our
// own arithmetic gets the cliff, the cap and the end date exactly right — our
// floor(amount / rate) end date was one period early on ~50% of plans.
const HEDGEY_VIEW_ABI = [
  { name: "planBalanceOf", type: "function", stateMutability: "view",
    inputs:  [{ name: "planId", type: "uint256" }, { name: "timeStamp", type: "uint256" }, { name: "redemptionTime", type: "uint256" }],
    outputs: [{ name: "balance", type: "uint256" }, { name: "remainder", type: "uint256" }, { name: "latestUnlock", type: "uint256" }] },
  { name: "planEnd", type: "function", stateMutability: "view",
    inputs:  [{ name: "planId", type: "uint256" }],
    outputs: [{ name: "end", type: "uint256" }] },
] as const;

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
  const contracts = contractsFor(chainId);
  if (contracts.length === 0) return [];

  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) return [];

  const nowSec = Math.floor(Date.now() / 1000);
  const now    = BigInt(nowSec);
  const streams: VestingStream[] = [];

  for (const wallet of wallets) {
    const address = wallet as `0x${string}`;
    for (const c of contracts) {
      try {
        const balance = await client.readContract({
          address: c.address, abi: HEDGEY_ABI, functionName: "balanceOf", args: [address],
        });
        if (Number(balance) === 0) continue;

        // Batch: get all plan IDs
        const planIdResults = await client.multicall({
          contracts: Array.from({ length: Number(balance) }, (_, i) => ({
            address: c.address, abi: HEDGEY_ABI,
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
        if (planIds.length === 0) {
          const firstFailure = planIdResults.find((r) => r.status === "failure");
          if (firstFailure && "error" in firstFailure) {
            console.error(
              `[hedgey/${chainId}/${c.tag ?? "tvp"}] tokenOfOwnerByIndex multicall returned all-failures for ${wallet} ` +
              `(balance=${balance}, results=${planIdResults.length}). First error: ${(firstFailure.error as Error)?.message ?? String(firstFailure.error)}`
            );
          }
          continue;
        }

        // Batch: plan struct + the contract's own balance/end views, 3 calls per plan.
        const plansAbi = c.kind === "lockup" ? HEDGEY_LOCKUP_PLANS_ABI : HEDGEY_ABI;
        const detailResults = await client.multicall({
          contracts: planIds.flatMap((planId) => [
            { address: c.address, abi: plansAbi,        functionName: "plans"         as const, args: [planId] as [bigint] },
            { address: c.address, abi: HEDGEY_VIEW_ABI, functionName: "planBalanceOf" as const, args: [planId, now, now] as [bigint, bigint, bigint] },
            { address: c.address, abi: HEDGEY_VIEW_ABI, functionName: "planEnd"       as const, args: [planId] as [bigint] },
          ]),
        });

        type Row = { planId: bigint; plan: HedgeyPlan; claimable: bigint; remainder: bigint; end: number };
        const rows: Row[] = [];
        planIds.forEach((planId, k) => {
          const p = detailResults[k * 3], b = detailResults[k * 3 + 1], e = detailResults[k * 3 + 2];
          if (p?.status !== "success" || b?.status !== "success" || e?.status !== "success") return;
          const raw = p.result as unknown as readonly unknown[] | HedgeyPlan;
          // viem returns struct outputs as a tuple array; normalise both shapes.
          const t = Array.isArray(raw) ? raw : null;
          const plan: HedgeyPlan = t
            ? {
                token: t[0] as `0x${string}`, amount: t[1] as bigint, start: t[2] as bigint, cliff: t[3] as bigint,
                rate: t[4] as bigint, period: t[5] as bigint,
                vestingAdmin: (t[6] as `0x${string}` | undefined) ?? (ZERO_ADDRESS as `0x${string}`),
                adminTransferOBO: (t[7] as boolean | undefined) ?? false,
              }
            : (raw as HedgeyPlan);
          const [bal, rem] = b.result as readonly [bigint, bigint, bigint];
          rows.push({ planId, plan, claimable: bal, remainder: rem, end: Number(e.result as bigint) });
        });

        if (rows.length === 0 && detailResults.length > 0) {
          const firstFailure = detailResults.find((r) => r.status === "failure");
          if (firstFailure && "error" in firstFailure) {
            console.error(
              `[hedgey/${chainId}/${c.tag ?? "tvp"}] plan detail multicall returned all-failures for ${wallet} ` +
              `(planIds=${planIds.length}). First error: ${(firstFailure.error as Error)?.message ?? String(firstFailure.error)}`
            );
          }
          continue;
        }

        // Batch-fetch token metadata for all unique tokens not already cached
        const uniqueTokens = [...new Set(rows.map((r) => r.plan.token.toLowerCase()))];
        const uncached = uniqueTokens.filter((addr) => !TOKEN_META_CACHE.has(`${chainId}:${addr}`));
        if (uncached.length > 0) {
          const [symResults, decResults] = await Promise.all([
            client.multicall({ contracts: uncached.map((addr) => ({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" as const })) }),
            client.multicall({ contracts: uncached.map((addr) => ({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" as const })) }),
          ]);
          // bytes32-symbol fallback via the shared resolver (see 2026-05-20 note in git history).
          for (let k = 0; k < uncached.length; k++) {
            const symHint = symResults[k].status === "success" ? (symResults[k].result as string) : null;
            const decHint = decResults[k].status === "success" ? (decResults[k].result as number) : null;
            const meta = await resolveTokenMeta(chainId, uncached[k], { existingSymbol: symHint, existingDecimals: decHint });
            TOKEN_META_CACHE.set(`${chainId}:${uncached[k]}`, meta);
          }
        }

        for (const r of rows) {
          const { plan } = r;
          const meta = TOKEN_META_CACHE.get(`${chainId}:${plan.token.toLowerCase()}`);
          const startTime = Number(plan.start);
          const cliffTime = Number(plan.cliff) > startTime ? Number(plan.cliff) : null;
          const endTime   = r.end;

          // The contract's own figures: redeemable now, and what stays locked.
          // plans().amount is the REMAINING balance (redemptions shrink it and
          // move `start` forward), so it is the total still owed, not the
          // original grant. withdrawnAmount stays "0" until the indexer stores
          // creation/redemption history — see the 2026-10-09 Hedgey research.
          const claimableNow  = r.claimable;
          const lockedAmount  = r.remainder;
          const isFullyVested = r.remainder === 0n;

          let nxtUnlock: number | null = null;
          if (!isFullyVested) {
            if (cliffTime && nowSec < cliffTime) nxtUnlock = cliffTime;
            else if (plan.period > 0n) {
              const periodsElapsed = BigInt(Math.max(0, nowSec - startTime)) / plan.period;
              nxtUnlock = Math.min(startTime + Number((periodsElapsed + 1n) * plan.period), endTime);
            } else nxtUnlock = endTime;
          }

          streams.push({
            id:              c.tag ? `hedgey-${chainId}-${c.tag}-${r.planId.toString()}` : `hedgey-${chainId}-${r.planId.toString()}`,
            protocol:        "hedgey",
            category:        "vesting",
            chainId,
            recipient:       wallet,
            tokenAddress:    plan.token,
            tokenSymbol:     meta?.symbol   ?? "UNKNOWN",
            tokenDecimals:   meta?.decimals ?? 18,
            totalAmount:     plan.amount.toString(),
            withdrawnAmount: "0",
            claimableNow:    claimableNow.toString(),
            lockedAmount:    lockedAmount.toString(),
            startTime,
            endTime,
            cliffTime,
            isFullyVested,
            nextUnlockTime:  nxtUnlock,
            // Lockup plans have no vesting admin, so they cannot be revoked.
            cancelable:      c.kind === "vesting" && plan.vestingAdmin.toLowerCase() !== ZERO_ADDRESS,
            // In-app claiming: redeemPlans([planId]) — the same signature on all
            // four contracts, so point at whichever one holds this plan.
            claimContract:   c.address,
            claimNativeId:   r.planId.toString(),
          });
        }
      } catch (err) {
        console.error(`Hedgey (chain ${chainId}, ${c.tag ?? "tvp"}) error for ${wallet}:`, err);
      }
    }
  }

  return streams;
}

export const hedgeyAdapter: VestingAdapter = {
  id:   "hedgey",
  name: "Hedgey Finance",
  supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.BASE, CHAIN_IDS.ARBITRUM, CHAIN_IDS.OPTIMISM, CHAIN_IDS.BERACHAIN, CHAIN_IDS.SEPOLIA],
  fetch: fetchForChain,
};
