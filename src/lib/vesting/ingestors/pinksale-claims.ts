// src/lib/vesting/ingestors/pinksale-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// PinkSale (PinkLock V2) claim event ingestor.
//
// PinkLock has no subgraph (per the comment in the main adapter), so we
// query the contract's partial-unlock event log directly via viem
// `getLogs`. Same eth_getLogs pattern as the Hedgey ingestor.
//
// Event signature (PinkLock V2) — VERIFIED on-chain (Base contract, June 2026):
//   event LockVested(
//     uint256 indexed lockId,   // ONLY lockId is indexed
//     address token,
//     address owner,
//     uint256 amount,           // tokens unlocked in THIS event (the claim)
//     uint256 remaining,        // tokens still locked after this unlock
//     uint256 timestamp         // unix seconds of the unlock
//   )
//   selector 0xf93385ff…
//
// The earlier assumed `LockUnlocked(lockId indexed, token indexed, owner,
// amount, unlockedAt)` does NOT exist on the deployed contract — wrong name
// AND wrong indexed-topic layout (only lockId is indexed, not token). That
// mismatch is why this ingestor produced zero rows: the topic0 never matched
// and viem rejected the second-topic filter with "Invalid parameters".
//
// LockVested fires on every unlock() call (TGE + each cycle). We:
//   1. Get the user's locks via the existing `normalLocksForUser` read
//   2. For each lock, query LockVested logs filtered by the lock's indexed
//      lockId + decode amount (field) + timestamp (field)
//   3. Hand off to upsertClaimEvents()
//
// RPC: scans go through the shared multi-RPC pool with forLogs:true so they
// fall through to dRPC when the env-var provider can't serve archive logs
// (publicnode rejects historical eth_getLogs). dRPC caps a single getLogs
// at ~10k blocks, so the scan is chunked — see SCAN_CHUNK below.
// ─────────────────────────────────────────────────────────────────────────────

import {
  parseAbi,
  getAddress,
  type GetLogsReturnType,
} from "viem";
import { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import { makeFallbackClient } from "../rpc";

// PinkLock V2 contract addresses now live in a single source of truth.
// See PINKSALE_CONTRACT_ADDRESSES in src/lib/protocol-constants.ts.
import { PINKSALE_CONTRACT_ADDRESSES as PINKSALE_CONTRACTS } from "../../protocol-constants";

// Approximate deployment blocks per chain — bound the eth_getLogs scan.
const DEPLOYMENT_BLOCKS: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ETHEREUM]: 14_500_000n,
  [CHAIN_IDS.BSC]:      14_400_000n,
  [CHAIN_IDS.POLYGON]:  29_000_000n,
  [CHAIN_IDS.BASE]:     2_500_000n,
};

// Single getLogs window. dRPC (the canonical forLogs fallback) caps
// eth_getLogs at ~10k blocks; 9_000 stays safely under that while a paid
// Alchemy/etc env-var provider handles the same chunks without complaint.
const SCAN_CHUNK = 9_000n;

const LOCK_VESTED_EVENT = parseAbi([
  "event LockVested(uint256 indexed lockId, address token, address owner, uint256 amount, uint256 remaining, uint256 timestamp)",
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
    const fromBlk  = DEPLOYMENT_BLOCKS[chainId];
    // Log-safe fallback client: tries the env-var provider first, then dRPC
    // etc. publicnode (which rejects archive eth_getLogs) is excluded by
    // forLogs and, when it's the env-var provider, viem's fallback transport
    // advances past its JSON-RPC error to the next URL.
    const client = makeFallbackClient(chainId, { forLogs: true });
    if (!contractAddress || !client || !fromBlk) continue;

    const latestBlock = await client.getBlockNumber();

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
        //    Only lockId is indexed in LockVested, so we filter on that
        //    alone. The scan is chunked (SCAN_CHUNK) so the dRPC fallback's
        //    ~10k-block getLogs cap is respected; per-chunk failures are
        //    logged but don't abort the lock (partial coverage beats none).
        for (const lock of locks) {
          const lockId  = lock.id;
          const tokenAddress = lock.token;

          // Typed via the event so `log.args.{amount,timestamp}` decode; a
          // bare getLogs return type loses the decoded args.
          const logs: GetLogsReturnType<typeof LOCK_VESTED_EVENT> = [];
          for (let from = fromBlk; from <= latestBlock; from += SCAN_CHUNK + 1n) {
            const to = from + SCAN_CHUNK > latestBlock ? latestBlock : from + SCAN_CHUNK;
            try {
              const part = await client.getLogs({
                address: contractAddress,
                event:   LOCK_VESTED_EVENT,
                args:    { lockId },
                fromBlock: from,
                toBlock:   to,
              });
              logs.push(...part);
            } catch (err) {
              console.error(`[pinksale-claims] getLogs failed for lock ${lockId} chunk ${from}-${to} on chain ${chainId}:`, err);
            }
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

          const streamId = `pinksale-${chainId}-${lockId.toString()}`;

          for (const log of logs) {
            // LockVested carries the unlock timestamp in its payload, so no
            // per-block getBlock round-trip is needed (also dodges
            // publicnode's archive-getBlock restriction on the fallback path).
            const ts = log.args.timestamp;
            if (typeof ts !== "bigint" || ts === 0n) continue;

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
