// src/lib/vesting/ingestors/hedgey-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hedgey-specific claim event ingestor.
//
// Unlike Sablier (which has a rich Envio Hasura endpoint exposing every
// withdrawal action), Hedgey lives entirely on-chain — there's no
// public subgraph indexing redemption events. So this ingestor uses
// viem `getLogs` directly against the user's RPC:
//
//   1. Resolve the user's owned plan IDs via tokenOfOwnerByIndex (same
//      pattern as the main Hedgey adapter)
//   2. Read each plan's token address via plans(id) so we know which
//      ERC-20 to attribute the claim to
//   3. eth_getLogs filtered by topic[0]=PlanRedeemed sig + topic[1]=planId
//      across the FULL chain history (capped at the contract deployment
//      block per chain to avoid scanning genesis).
//   4. For each log: fetch block timestamp, decode amountRedeemed,
//      map to ClaimEventInput
//   5. Hand to upsertClaimEvents() for historical-price enrichment
//
// Event signature (TokenVestingPlans contract):
//   event PlanRedeemed(
//     uint256 indexed id,
//     uint256 amountRedeemed,
//     uint256 planAmount,
//     uint256 resetDate
//   )
//
// PlanRedeemed fires on every redeemPlanTokens / redeemAllPlans call. It's
// the canonical "tokens left vesting → wallet" event for tax purposes.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createPublicClient,
  http,
  parseAbi,
  getAddress,
} from "viem";
import { mainnet, bsc, polygon, base, sepolia } from "viem/chains";
import { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";

const HEDGEY_CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BSC]:      "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.POLYGON]:  "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BASE]:     "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.SEPOLIA]:  "0x68b6986416c7A38F630cBc644a2833A0b78b3631",
};

// Approximate deployment blocks per chain — bound the eth_getLogs scan.
// Without this, viem walks from genesis (millions of blocks) and the RPC
// rejects the query. These are deliberately a bit older than the actual
// deployment to absorb any fork / re-org edge cases.
const DEPLOYMENT_BLOCKS: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ETHEREUM]: 18_700_000n,
  [CHAIN_IDS.BSC]:      33_500_000n,
  [CHAIN_IDS.POLYGON]:  50_500_000n,
  [CHAIN_IDS.BASE]:     7_700_000n,
  [CHAIN_IDS.SEPOLIA]:  4_700_000n,
};

const VIEM_CHAINS: Partial<Record<SupportedChainId, typeof mainnet | typeof bsc | typeof polygon | typeof base | typeof sepolia>> = {
  [CHAIN_IDS.ETHEREUM]: mainnet,
  [CHAIN_IDS.BSC]:      bsc,
  [CHAIN_IDS.POLYGON]:  polygon,
  [CHAIN_IDS.BASE]:     base,
  [CHAIN_IDS.SEPOLIA]:  sepolia,
};

const PLAN_REDEEMED_EVENT = parseAbi([
  "event PlanRedeemed(uint256 indexed id, uint256 amountRedeemed, uint256 planAmount, uint256 resetDate)",
])[0];

const HEDGEY_READ_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function plans(uint256 planId) view returns (address token, uint256 amount, uint256 start, uint256 cliff, uint256 rate, uint256 period, address vestingAdmin, bool adminTransferOBO)",
]);

const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const SUPPORTED_CHAINS: SupportedChainId[] =
  Object.keys(HEDGEY_CONTRACTS).map(Number) as SupportedChainId[];

function getRpcUrl(chainId: SupportedChainId): string | undefined {
  if (chainId === CHAIN_IDS.BASE)     return process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL;
  if (chainId === CHAIN_IDS.ETHEREUM) return process.env.ALCHEMY_RPC_URL_ETH;
  if (chainId === CHAIN_IDS.BSC)      return process.env.BSC_RPC_URL;
  if (chainId === CHAIN_IDS.POLYGON)  return process.env.POLYGON_RPC_URL;
  if (chainId === CHAIN_IDS.SEPOLIA)  return process.env.SEPOLIA_RPC_URL;
  return undefined;
}

// In-memory caches for token metadata (symbol + decimals) so the same
// ERC-20 read isn't repeated across plans within a single ingestion run.
const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

/**
 * Ingest Hedgey claim events for one user across all their tracked
 * wallets and the chains where Hedgey is deployed.
 */
export async function ingestHedgeyClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds:  SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;

  const inputs: ClaimEventInput[] = [];

  for (const chainId of chainIds) {
    const contractAddress = HEDGEY_CONTRACTS[chainId];
    const rpcUrl   = getRpcUrl(chainId);
    const chain    = VIEM_CHAINS[chainId];
    const fromBlk  = DEPLOYMENT_BLOCKS[chainId];
    if (!contractAddress || !rpcUrl || !chain || !fromBlk) continue;

    const client = createPublicClient({ chain, transport: http(rpcUrl) });

    for (const wallet of wallets) {
      try {
        const owner = getAddress(wallet);

        // 1) How many plans does this wallet own?
        const balance = (await client.readContract({
          address: contractAddress,
          abi:     HEDGEY_READ_ABI,
          functionName: "balanceOf",
          args: [owner],
        })) as bigint;
        if (balance === 0n) continue;

        // 2) Resolve plan IDs via multicall — one RPC round trip
        const planIdResults = await client.multicall({
          contracts: Array.from({ length: Number(balance) }, (_, i) => ({
            address: contractAddress,
            abi: HEDGEY_READ_ABI,
            functionName: "tokenOfOwnerByIndex" as const,
            args: [owner, BigInt(i)] as [`0x${string}`, bigint],
          })),
        });
        const planIds = planIdResults
          .filter((r) => r.status === "success")
          .map((r) => r.result as bigint);
        if (planIds.length === 0) continue;

        // 3) Resolve token address per plan — needed because Hedgey events
        //    don't carry the token address; we attribute claims to the
        //    plan's currently-set token (immutable post-creation in
        //    Hedgey's contract).
        const planResults = await client.multicall({
          contracts: planIds.map((id) => ({
            address: contractAddress,
            abi: HEDGEY_READ_ABI,
            functionName: "plans" as const,
            args: [id] as [bigint],
          })),
        });
        const planTokenById = new Map<string, `0x${string}`>();
        planResults.forEach((r, i) => {
          if (r.status === "success") {
            const result = r.result as readonly [`0x${string}`, bigint, bigint, bigint, bigint, bigint, `0x${string}`, boolean];
            planTokenById.set(planIds[i].toString(), result[0]);
          }
        });

        // 4) For each plan, fetch redemption logs since deployment.
        //    Hedgey indexes the plan id on topic[1]; we filter precisely
        //    rather than scan all logs and post-filter.
        for (const planId of planIds) {
          const tokenAddress = planTokenById.get(planId.toString());
          if (!tokenAddress) continue;

          let logs;
          try {
            logs = await client.getLogs({
              address: contractAddress,
              event:   PLAN_REDEEMED_EVENT,
              args:    { id: planId },
              fromBlock: fromBlk,
              toBlock:   "latest",
            });
          } catch (err) {
            console.error(`[hedgey-claims] getLogs failed for plan ${planId} on chain ${chainId}:`, err);
            continue;
          }
          if (logs.length === 0) continue;

          // Token metadata — cached per (chain, token) so a plan with
          // 200 redemptions doesn't read decimals 200 times.
          const tokenMetaKey = `${chainId}:${tokenAddress.toLowerCase()}`;
          let tokenMeta = tokenMetaCache.get(tokenMetaKey);
          if (!tokenMeta) {
            try {
              const [decimals, symbol] = await Promise.all([
                client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }) as Promise<number>,
                client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" })   as Promise<string>,
              ]);
              tokenMeta = { decimals: Number(decimals), symbol: String(symbol) };
              tokenMetaCache.set(tokenMetaKey, tokenMeta);
            } catch {
              tokenMeta = { decimals: 18, symbol: "" }; // sensible fallback
            }
          }

          // 5) For each log, fetch block timestamp + map to ClaimEventInput.
          //    We batch block lookups by unique blockNumber to avoid
          //    re-fetching for redemptions in the same block.
          const uniqueBlocks = [...new Set(logs.map((l) => l.blockNumber!))];
          const blockTimestamps = new Map<bigint, bigint>();
          for (const bn of uniqueBlocks) {
            try {
              const block = await client.getBlock({ blockNumber: bn });
              blockTimestamps.set(bn, block.timestamp);
            } catch {
              // Block fetch failed — skip these events rather than emit
              // rows with bogus timestamps that pollute tax reports.
            }
          }

          const streamId = `hedgey-${chainId}-${planId.toString()}`;

          for (const log of logs) {
            const blockNumber = log.blockNumber!;
            const ts = blockTimestamps.get(blockNumber);
            if (ts == null) continue;

            const amountRedeemed = log.args.amountRedeemed;
            if (typeof amountRedeemed !== "bigint" || amountRedeemed === 0n) continue;

            const txHash = log.transactionHash
              ? log.transactionHash.toLowerCase()
              : syntheticTxHash(streamId, Number(ts));

            inputs.push({
              userId,
              streamId,
              protocol:      "hedgey",
              chainId,
              recipient:     owner.toLowerCase(),
              tokenAddress:  tokenAddress.toLowerCase(),
              tokenSymbol:   tokenMeta.symbol || null,
              tokenDecimals: tokenMeta.decimals,
              amount:        amountRedeemed.toString(),
              claimedAt:     new Date(Number(ts) * 1000),
              txHash,
            });
          }
        }
      } catch (err) {
        console.error(`[hedgey-claims] wallet ${wallet} on chain ${chainId} failed:`, err);
      }
    }
  }

  return upsertClaimEvents(inputs);
}
