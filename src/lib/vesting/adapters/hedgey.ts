import { createPublicClient, http, erc20Abi } from "viem";
import { mainnet, bsc, base, sepolia } from "viem/chains";
import { VestingAdapter } from "./index";
import { VestingStream, SupportedChainId, CHAIN_IDS } from "../types";

// Module-level token metadata cache — survives within the same serverless instance
// Key: `${chainId}:${tokenAddress}`, Value: { symbol, decimals }
const TOKEN_META_CACHE = new Map<string, { symbol: string; decimals: number }>();
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Hedgey TokenVestingPlans contract addresses per chain
// Verified on-chain: 0x2CDE... = same bytecode on ETH, Base, and BSC
//                    0x68b6... = 30402 bytes on Sepolia (same bytecode, from Locked_VestingTokenPlans repo)
const CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BSC]:      "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BASE]:     "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.SEPOLIA]:  "0x68b6986416c7A38F630cBc644a2833A0b78b3631",
};

const VIEM_CHAINS: Partial<Record<SupportedChainId, typeof mainnet | typeof bsc | typeof base | typeof sepolia>> = {
  [CHAIN_IDS.ETHEREUM]: mainnet,
  [CHAIN_IDS.BSC]:      bsc,
  [CHAIN_IDS.BASE]:     base,
  [CHAIN_IDS.SEPOLIA]:  sepolia,
};

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

function getRpcUrl(chainId: SupportedChainId): string | undefined {
  if (chainId === CHAIN_IDS.BASE)    return process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL;
  if (chainId === CHAIN_IDS.ETHEREUM) return process.env.ALCHEMY_RPC_URL_ETH;
  if (chainId === CHAIN_IDS.BSC)     return process.env.BSC_RPC_URL;
  if (chainId === CHAIN_IDS.SEPOLIA) return process.env.SEPOLIA_RPC_URL;
  return undefined;
}

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  const contractAddress = CONTRACTS[chainId];
  const rpcUrl = getRpcUrl(chainId);
  if (!contractAddress || !rpcUrl) return [];

  const chain = VIEM_CHAINS[chainId];
  if (!chain) return [];

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

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
      if (planIds.length === 0) continue;

      // Batch: get plan details
      const detailResults = await client.multicall({
        contracts: planIds.map((planId) => ({
          address: contractAddress, abi: HEDGEY_ABI,
          functionName: "plans" as const, args: [planId] as [bigint],
        })),
      });

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

        for (let j = 0; j < uncached.length; j++) {
          const sym = symResults[j].status === "success" ? (symResults[j].result as string) : "UNKNOWN";
          const dec = decResults[j].status === "success" ? (decResults[j].result as number) : 18;
          TOKEN_META_CACHE.set(`${chainId}:${uncached[j]}`, { symbol: sym, decimals: dec });
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

        // Hedgey: discrete period-based vesting
        const elapsed        = BigInt(Math.max(0, nowSec - startTime));
        const periodsElapsed = plan.period > 0n ? elapsed / plan.period : 0n;
        const vested         = plan.rate * periodsElapsed;
        const totalPeriods   = plan.rate > 0n ? plan.amount / plan.rate : 0n;
        const endTime        = startTime + Number(totalPeriods * plan.period);

        const claimableNow  = vested > 0n ? vested : 0n;
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
  supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.BASE, CHAIN_IDS.SEPOLIA],
  fetch: fetchForChain,
};
