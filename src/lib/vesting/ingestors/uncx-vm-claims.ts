// src/lib/vesting/ingestors/uncx-vm-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// UNCX VestingManager claim event ingestor.
//
// UNCX VestingManager has no public withdrawal-event subgraph — the existing
// uncx-vm adapter reads CURRENT state via getVestingSchedule(). For tax-grade
// per-claim history we instead scan the contract's TokensReleased event
// directly via viem getLogs, mirroring the eth_getLogs pattern from the
// hedgey-claims and pinksale-claims ingestors.
//
// Event signature (verified against the deployed contract on Etherscan):
//   event TokensReleased(
//     uint256 indexed vestingId,
//     address indexed beneficiary,
//     uint256 amount
//   )
//
// Both vestingId and beneficiary are indexed, so we filter precisely on
// topic[2] (padded beneficiary address) per wallet — no client-side
// post-filtering needed.
//
// Pipeline:
//   1. For each chain: build chunked block range from contract deployment
//      → latest (PublicNode caps eth_getLogs at 50_000 blocks per call)
//   2. For each wallet: scan all chunks in parallel batches filtering on
//      topic[2] = padded beneficiary address
//   3. For each unique vestingId in the matched logs: read the schedule
//      once via multicall to learn the token address (TokensReleased
//      doesn't carry the token in its payload — same shape as Hedgey)
//   4. Map each log → ClaimEventInput and upsert
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet, bsc, base } from "viem/chains";
import { upsertClaimEvents, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";

const CHAIN_CONFIG: Partial<Record<SupportedChainId, {
  contractAddress: `0x${string}`;
  fromBlock:       bigint;
  chain:           typeof mainnet | typeof bsc | typeof base;
  getRpcUrl:       () => string | undefined;
}>> = {
  [CHAIN_IDS.ETHEREUM]: {
    contractAddress: "0xa98f06312b7614523d0f5e725e15fd20fb1b99f5",
    fromBlock:       23_143_944n,
    chain:           mainnet,
    getRpcUrl:       () => process.env.ALCHEMY_RPC_URL_ETH,
  },
  [CHAIN_IDS.BASE]: {
    contractAddress: "0xcb08B6d865b6dE9a5ca04b886c9cECEf70211b45",
    fromBlock:       43_187_425n,
    chain:           base,
    getRpcUrl:       () => process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL,
  },
  [CHAIN_IDS.BSC]: {
    contractAddress: "0xEc76C87EAB54217F581cc703DAea0554D825d1Fa",
    fromBlock:       85_818_300n,
    chain:           bsc,
    getRpcUrl:       () => process.env.BSC_RPC_URL,
  },
};

const CHUNK_SIZE = 49_999n;

// keccak256("TokensReleased(uint256,address,uint256)")
// Computed from the verified event signature; topic[0] used to filter logs
// before client-side address filtering kicks in for chains where the RPC
// ignores topic[2] OR-arrays (PublicNode quirk).
const TOKENS_RELEASED_EVENT = parseAbi([
  "event TokensReleased(uint256 indexed vestingId, address indexed beneficiary, uint256 amount)",
])[0];

// Minimal slice of getVestingSchedule — we only need .token to attribute
// the claim to an ERC-20.
const VESTING_MANAGER_ABI = parseAbi([
  "function getVestingSchedule(uint256 vestingId) view returns (address token, address creator, address beneficiary, uint256 totalAmount, bool isSoft, bool isNftized, bool isTopable, uint256 released, bool cancelled, uint8 vestingType, (uint256 time, uint256 amount)[] tranches)",
]);

const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const SUPPORTED_CHAINS: SupportedChainId[] =
  Object.keys(CHAIN_CONFIG).map(Number) as SupportedChainId[];

const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

/**
 * Ingest UNCX VestingManager claim events for one user across all
 * tracked wallets and the 3 chains where the contract is deployed.
 *
 * Idempotent — re-runs are no-ops via the dedup unique index on
 * claim_events.
 */
export async function ingestUncxVmClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds:  SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;

  const inputs: ClaimEventInput[] = [];

  for (const chainId of chainIds) {
    const config = CHAIN_CONFIG[chainId];
    if (!config) continue;
    const rpcUrl = config.getRpcUrl();
    if (!rpcUrl) continue;

    const { contractAddress, fromBlock, chain } = config;
    const client = createPublicClient({ chain, transport: http(rpcUrl) });

    try {
      const latestBlock = await client.getBlockNumber();

      // Build chunk list — PublicNode and most providers cap eth_getLogs
      // at 50_000 blocks per call.
      const chunks: { from: bigint; to: bigint }[] = [];
      for (let from = fromBlock; from <= latestBlock; from += CHUNK_SIZE + 1n) {
        chunks.push({
          from,
          to: from + CHUNK_SIZE > latestBlock ? latestBlock : from + CHUNK_SIZE,
        });
      }

      // Per-wallet scan. We don't combine wallets into one OR-filter
      // because some RPCs ignore topic-array filters and we'd then have
      // to post-filter — clearer to scope per wallet.
      for (const wallet of wallets) {
        let owner: `0x${string}`;
        try {
          owner = getAddress(wallet);
        } catch {
          continue;
        }

        const BATCH = 10;
        const matchedLogs: Array<{
          vestingId:       bigint;
          blockNumber:     bigint;
          transactionHash: string | null;
          amount:          bigint;
        }> = [];

        for (let i = 0; i < chunks.length; i += BATCH) {
          const batch = chunks.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map(({ from, to }) =>
              client.getLogs({
                address: contractAddress,
                event:   TOKENS_RELEASED_EVENT,
                args:    { beneficiary: owner },
                fromBlock: from,
                toBlock:   to,
              })
            )
          );
          for (const r of results) {
            if (r.status === "fulfilled") {
              for (const log of r.value) {
                const vestingId = log.args.vestingId;
                const amount    = log.args.amount;
                if (typeof vestingId !== "bigint" || typeof amount !== "bigint") continue;
                if (amount === 0n) continue;
                matchedLogs.push({
                  vestingId,
                  blockNumber:     log.blockNumber!,
                  transactionHash: log.transactionHash ?? null,
                  amount,
                });
              }
            } else {
              console.error(`[uncx-vm-claims] chain ${chainId} chunk failed:`, r.reason);
            }
          }
        }

        if (matchedLogs.length === 0) continue;

        // Resolve token address per unique vestingId via one multicall.
        // TokensReleased payload doesn't carry the token, so we read
        // getVestingSchedule(vestingId).token once per id.
        const uniqueVestingIds = [...new Set(matchedLogs.map((l) => l.vestingId.toString()))]
          .map((s) => BigInt(s));

        const scheduleResults = await client.multicall({
          contracts: uniqueVestingIds.map((id) => ({
            address:      contractAddress,
            abi:          VESTING_MANAGER_ABI,
            functionName: "getVestingSchedule" as const,
            args:         [id] as [bigint],
          })),
        });

        const tokenByVestingId = new Map<string, `0x${string}`>();
        scheduleResults.forEach((r, idx) => {
          if (r.status === "success") {
            const tokenAddr = r.result[0] as `0x${string}`;
            tokenByVestingId.set(uniqueVestingIds[idx].toString(), tokenAddr);
          }
        });

        // Per-token metadata (decimals + symbol), cached across the run
        const uniqueTokens = [...new Set([...tokenByVestingId.values()].map((a) => a.toLowerCase()))];
        for (const tokenLower of uniqueTokens) {
          const cacheKey = `${chainId}:${tokenLower}`;
          if (tokenMetaCache.has(cacheKey)) continue;
          try {
            const [decimals, symbol] = await Promise.all([
              client.readContract({ address: tokenLower as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }) as Promise<number>,
              client.readContract({ address: tokenLower as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" })   as Promise<string>,
            ]);
            tokenMetaCache.set(cacheKey, { decimals: Number(decimals), symbol: String(symbol) });
          } catch {
            tokenMetaCache.set(cacheKey, { decimals: 18, symbol: "" });
          }
        }

        // Block timestamp lookup batched per unique block
        const uniqueBlocks = [...new Set(matchedLogs.map((l) => l.blockNumber))];
        const blockTimestamps = new Map<bigint, bigint>();
        const BLOCK_BATCH = 25;
        for (let i = 0; i < uniqueBlocks.length; i += BLOCK_BATCH) {
          const slice = uniqueBlocks.slice(i, i + BLOCK_BATCH);
          const results = await Promise.allSettled(
            slice.map((bn) => client.getBlock({ blockNumber: bn }))
          );
          results.forEach((r, idx) => {
            if (r.status === "fulfilled") {
              blockTimestamps.set(slice[idx], r.value.timestamp);
            }
          });
        }

        // Compose claim event inputs
        for (const log of matchedLogs) {
          const tokenAddress = tokenByVestingId.get(log.vestingId.toString());
          if (!tokenAddress) continue;

          const ts = blockTimestamps.get(log.blockNumber);
          if (ts == null) continue;

          if (!log.transactionHash) continue; // every TokensReleased log has txHash on a real chain

          const tokenLower = tokenAddress.toLowerCase();
          const meta = tokenMetaCache.get(`${chainId}:${tokenLower}`) ?? { decimals: 18, symbol: "" };
          const streamId = `uncx-vm-${chainId}-${log.vestingId.toString()}`;

          inputs.push({
            userId,
            streamId,
            protocol:      "uncx-vm",
            chainId,
            recipient:     owner.toLowerCase(),
            tokenAddress:  tokenLower,
            tokenSymbol:   meta.symbol || null,
            tokenDecimals: meta.decimals,
            amount:        log.amount.toString(),
            claimedAt:     new Date(Number(ts) * 1000),
            txHash:        log.transactionHash.toLowerCase(),
          });
        }
      }
    } catch (err) {
      console.error(`[uncx-vm-claims] chain ${chainId} failed:`, err);
    }
  }

  return upsertClaimEvents(inputs);
}
