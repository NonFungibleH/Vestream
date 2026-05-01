// src/lib/vesting/ingestors/pinksale-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// PinkSale (PinkLock V2) claim event ingestor.
//
// PinkLock has no subgraph (per the comment in the main adapter), so we
// query the contract's `LockUnlocked` event log directly via viem
// `getLogs`. Same eth_getLogs pattern as the Hedgey ingestor.
//
// Event signature (PinkLock V2):
//   event LockUnlocked(
//     uint256 indexed lockId,
//     address indexed token,
//     address owner,
//     uint256 amount,
//     uint256 unlockedAt
//   )
//
// LockUnlocked fires on every unlock() call. We:
//   1. Get the user's locks via the existing `normalLocksForUser` read
//   2. For each lock, query LockUnlocked logs filtered by the lock's
//      indexed token + decode for amount + timestamp
//   3. Hand off to upsertClaimEvents()
// ─────────────────────────────────────────────────────────────────────────────

import {
  createPublicClient,
  http,
  parseAbi,
  getAddress,
} from "viem";
import { mainnet, bsc, polygon, base } from "viem/chains";
import { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";

// PinkLock V2 contract addresses. MUST stay in sync with the copies in
// tvl-walker/pinksale.ts and adapters/pinksale.ts (3-way drift would
// cause silent data corruption — adapter returning streams the
// claims-ingestor doesn't track, etc). Source-of-truth refactor TBD.
//
// ETH note: 0x33d4cc...5e2a is V1 (basically dead, ~30 tokens). Active
// V2 deployment is 0x71b5759d... — see the walker for full audit.
const PINKSALE_CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x71b5759d73262fbb223956913ecf4ecc51057641",
  [CHAIN_IDS.BSC]:      "0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe",
  [CHAIN_IDS.POLYGON]:  "0x6C9A0D8B1c7a95a323d744dE30cf027694710633",
  [CHAIN_IDS.BASE]:     "0xdd6e31a046b828cbbafb939c2a394629aff8bbdc",
};

// Approximate deployment blocks per chain — bound the eth_getLogs scan.
const DEPLOYMENT_BLOCKS: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ETHEREUM]: 14_500_000n,
  [CHAIN_IDS.BSC]:      14_400_000n,
  [CHAIN_IDS.POLYGON]:  29_000_000n,
  [CHAIN_IDS.BASE]:     2_500_000n,
};

const VIEM_CHAINS: Partial<Record<SupportedChainId, typeof mainnet | typeof bsc | typeof polygon | typeof base>> = {
  [CHAIN_IDS.ETHEREUM]: mainnet,
  [CHAIN_IDS.BSC]:      bsc,
  [CHAIN_IDS.POLYGON]:  polygon,
  [CHAIN_IDS.BASE]:     base,
};

const LOCK_UNLOCKED_EVENT = parseAbi([
  "event LockUnlocked(uint256 indexed lockId, address indexed token, address owner, uint256 amount, uint256 unlockedAt)",
])[0];

const PINKSALE_READ_ABI = parseAbi([
  "function normalLocksForUser(address user) view returns ((uint256 id, address token, address owner, uint256 amount, uint256 lockDate, uint256 tgeDate, uint256 tgeBps, uint256 cycle, uint256 cycleBps, uint256 unlockedAmount, string description)[])",
]);

const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const SUPPORTED_CHAINS: SupportedChainId[] =
  Object.keys(PINKSALE_CONTRACTS).map(Number) as SupportedChainId[];

function getRpcUrl(chainId: SupportedChainId): string | undefined {
  if (chainId === CHAIN_IDS.BASE)     return process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL;
  if (chainId === CHAIN_IDS.ETHEREUM) return process.env.ALCHEMY_RPC_URL_ETH;
  if (chainId === CHAIN_IDS.BSC)      return process.env.BSC_RPC_URL;
  if (chainId === CHAIN_IDS.POLYGON)  return process.env.POLYGON_RPC_URL;
  return undefined;
}

const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

/**
 * Ingest PinkSale (PinkLock V2) claim events for one user across all
 * tracked wallets and the 4 chains where the contract is deployed.
 *
 * Idempotent — re-runs are no-ops via the dedup unique index on
 * claim_events.
 */
export async function ingestPinksaleClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds:  SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;

  const inputs: ClaimEventInput[] = [];

  for (const chainId of chainIds) {
    const contractAddress = PINKSALE_CONTRACTS[chainId];
    const rpcUrl   = getRpcUrl(chainId);
    const chain    = VIEM_CHAINS[chainId];
    const fromBlk  = DEPLOYMENT_BLOCKS[chainId];
    if (!contractAddress || !rpcUrl || !chain || !fromBlk) continue;

    const client = createPublicClient({ chain, transport: http(rpcUrl) });

    for (const wallet of wallets) {
      try {
        const owner = getAddress(wallet);

        // 1) Get the user's locks. PinkLock returns the FULL list including
        //    fully-unlocked entries — we need them all because past claims
        //    against fully-unlocked locks are still tax-relevant.
        const locks = (await client.readContract({
          address:      contractAddress,
          abi:          PINKSALE_READ_ABI,
          functionName: "normalLocksForUser",
          args:         [owner],
        })) as ReadonlyArray<{
          id:              bigint;
          token:           `0x${string}`;
          owner:           `0x${string}`;
          amount:          bigint;
          lockDate:        bigint;
          tgeDate:         bigint;
          tgeBps:          bigint;
          cycle:           bigint;
          cycleBps:        bigint;
          unlockedAmount:  bigint;
          description:     string;
        }>;
        if (locks.length === 0) continue;

        // 2) For each lock, fetch unlock events from contract deployment.
        //    Filter on the lock's id + token (both indexed in the event).
        for (const lock of locks) {
          const lockId  = lock.id;
          const tokenAddress = lock.token;

          let logs;
          try {
            logs = await client.getLogs({
              address: contractAddress,
              event:   LOCK_UNLOCKED_EVENT,
              args:    { lockId, token: tokenAddress },
              fromBlock: fromBlk,
              toBlock:   "latest",
            });
          } catch (err) {
            console.error(`[pinksale-claims] getLogs failed for lock ${lockId} on chain ${chainId}:`, err);
            continue;
          }
          if (logs.length === 0) continue;

          // Token metadata cache
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
              tokenMeta = { decimals: 18, symbol: "" };
            }
          }

          // Block timestamp lookup batched per unique block
          const uniqueBlocks = [...new Set(logs.map((l) => l.blockNumber!))];
          const blockTimestamps = new Map<bigint, bigint>();
          for (const bn of uniqueBlocks) {
            try {
              const block = await client.getBlock({ blockNumber: bn });
              blockTimestamps.set(bn, block.timestamp);
            } catch {
              // skip — better to drop the row than emit bogus timestamps
            }
          }

          const streamId = `pinksale-${chainId}-${lockId.toString()}`;

          for (const log of logs) {
            const blockNumber = log.blockNumber!;
            const ts = blockTimestamps.get(blockNumber);
            if (ts == null) continue;

            const amount = log.args.amount;
            if (typeof amount !== "bigint" || amount === 0n) continue;

            const txHash = log.transactionHash
              ? log.transactionHash.toLowerCase()
              : syntheticTxHash(streamId, Number(ts));

            inputs.push({
              userId,
              streamId,
              protocol:      "pinksale",
              chainId,
              recipient:     owner.toLowerCase(),
              tokenAddress:  tokenAddress.toLowerCase(),
              tokenSymbol:   tokenMeta.symbol || null,
              tokenDecimals: tokenMeta.decimals,
              amount:        amount.toString(),
              claimedAt:     new Date(Number(ts) * 1000),
              txHash,
            });
          }
        }
      } catch (err) {
        console.error(`[pinksale-claims] wallet ${wallet} on chain ${chainId} failed:`, err);
      }
    }
  }

  return upsertClaimEvents(inputs);
}
