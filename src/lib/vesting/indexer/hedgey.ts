// src/lib/vesting/indexer/hedgey.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hedgey TokenVestingPlans event indexer.
//
// Replaces the seeder.ts `discoverHedgeyRecipients` walk (paginated
// tokenByIndex + ownerOf over EVERY plan ever minted — 10k+ RPC calls per
// chain per daily seed). The event-driven model only processes Transfer
// events since the last tick.
//
// Why Transfer instead of PlanCreated:
//   - Transfer is the canonical ERC721 event — well-known topic hash, fires
//     on mint (from=0x0), transfer, AND burn (to=0x0). Watching it gives us
//     a single feed that captures every owner change.
//   - PlanCreated alone misses ownership transfers, so the cache would
//     drift if a plan got reassigned via safeTransferFrom.
//   - Burn events (to=0x0) tell us a plan has been claimed-out / cancelled —
//     we don't surface those as streams (plans(id) returns zeroed-out data
//     after burn, which the existing decode handles by producing a
//     fully-vested record).
//
// ── Genesis blocks ──────────────────────────────────────────────────────────
// Set per chain to roughly 30 days before this file shipped (May 14 2026).
// The indexer covers everything from genesis forward; the legacy seeder
// continues to backfill anything older until the Hedgey rows are verified
// equivalent and we decommission the seed job.
//
// Tuning: bump these forward (via manual UPDATE on indexer_state) once the
// legacy seeder is retired so a cold restart doesn't re-walk a month of
// blocks.
// ─────────────────────────────────────────────────────────────────────────────

import { erc20Abi, type Hex, type PublicClient } from "viem";
import {
  CHAIN_IDS,
  type SupportedChainId,
  type VestingStream,
} from "../types";
import { writeToCache } from "../dbcache";
import type { Indexer } from "./types";

// Mirrors src/lib/vesting/adapters/hedgey.ts — single source of truth for
// contract addresses lives there; copied for clarity given how rarely it
// changes (the same address ships on every mainnet).
const HEDGEY_CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BSC]:      "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.POLYGON]:  "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BASE]:     "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.ARBITRUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.OPTIMISM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
};

// Approximate "30 days back" block heights as of 2026-05-14. Anything
// older than this stays managed by the legacy seeder until decommission.
const HEDGEY_GENESIS: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ETHEREUM]: 22_400_000n,
  [CHAIN_IDS.BSC]:      49_100_000n,
  [CHAIN_IDS.POLYGON]:  71_700_000n,
  [CHAIN_IDS.BASE]:     27_700_000n,
  [CHAIN_IDS.ARBITRUM]: 320_000_000n,
  [CHAIN_IDS.OPTIMISM]: 132_000_000n,
};

// keccak256("Transfer(address,address,uint256)") — standard ERC721 event.
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;

const HEDGEY_ABI = [
  {
    name: "plans", type: "function", stateMutability: "view",
    inputs: [{ name: "planId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "token",            type: "address" },
        { name: "amount",           type: "uint256" },
        { name: "start",            type: "uint256" },
        { name: "cliff",            type: "uint256" },
        { name: "rate",             type: "uint256" },
        { name: "period",           type: "uint256" },
        { name: "vestingAdmin",     type: "address" },
        { name: "adminTransferOBO", type: "bool"    },
      ],
    }],
  },
  {
    name: "ownerOf", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function makeIndexer(chainId: SupportedChainId): Indexer {
  const contract     = HEDGEY_CONTRACTS[chainId];
  const genesisBlock = HEDGEY_GENESIS[chainId];
  if (!contract || genesisBlock == null) {
    throw new Error(`Hedgey indexer not configured for chainId ${chainId}`);
  }

  return {
    protocol:     "hedgey",
    chainId,
    genesisBlock,
    // 2000-block window — Hedgey is more active than UNCX-VM (10k+ Transfer
    // events historically), so smaller windows keep individual scans bounded
    // even during bursts. Per-chain block-time varies; on ETH this is ~7
    // minutes, on Polygon/Base ~70 seconds — both within the 60s cron budget.
    maxBlocksPerScan: 2000n,
    reorgLag:         12n,

    async scanWindow(client: PublicClient, fromBlock: bigint, toBlock: bigint) {
      // 1. Pull ERC721 Transfer logs in the window.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (client.getLogs as any)({
        address:   contract,
        topics:    [TRANSFER_TOPIC],
        fromBlock,
        toBlock,
      }) as { topics: readonly (Hex | null | undefined)[]; transactionHash?: Hex }[];

      // ERC721 Transfer has all three params indexed → topic[3] is tokenId.
      const valid = logs.filter(
        (log) =>
          log.topics[0] === TRANSFER_TOPIC &&
          log.topics.length >= 4 &&
          log.topics[3] != null,
      );
      if (valid.length === 0) return { eventCount: 0 };

      // De-dupe by tokenId — a plan may be transferred multiple times
      // within one window. For each unique tokenId track the MINT-event
      // tx hash specifically (topic[1] zero-address from). That's the
      // tx the user wants to see ("when was this plan created?") rather
      // than any subsequent owner-transfer tx. Falls back to the first
      // Transfer we saw if no mint landed in this window (the plan
      // existed before the indexer's genesis block — common during the
      // initial backfill).
      const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const mintTxByTokenId    = new Map<string, Hex>();
      const fallbackTxByTokenId = new Map<string, Hex>();
      for (const log of valid) {
        const tokenIdKey = BigInt(log.topics[3] as Hex).toString();
        if (!log.transactionHash) continue;
        if (log.topics[1] === ZERO_TOPIC && !mintTxByTokenId.has(tokenIdKey)) {
          mintTxByTokenId.set(tokenIdKey, log.transactionHash);
        }
        if (!fallbackTxByTokenId.has(tokenIdKey)) {
          fallbackTxByTokenId.set(tokenIdKey, log.transactionHash);
        }
      }

      const tokenIds = [
        ...new Set(valid.map((log) => BigInt(log.topics[3] as Hex).toString())),
      ].map(BigInt);

      // 2. Multicall plans(id) AND ownerOf(id) for every affected plan.
      const [planResults, ownerResults] = await Promise.all([
        client.multicall({
          contracts: tokenIds.map((id) => ({
            address:      contract,
            abi:          HEDGEY_ABI,
            functionName: "plans" as const,
            args:         [id] as [bigint],
          })),
          allowFailure: true,
        }),
        client.multicall({
          contracts: tokenIds.map((id) => ({
            address:      contract,
            abi:          HEDGEY_ABI,
            functionName: "ownerOf" as const,
            args:         [id] as [bigint],
          })),
          allowFailure: true,
        }),
      ]);

      // 3. Decode + write. Token metadata cached per window.
      const tokenCache = new Map<string, { symbol: string; decimals: number }>();
      const nowSec     = Math.floor(Date.now() / 1000);
      const streams: VestingStream[] = [];

      for (let i = 0; i < tokenIds.length; i++) {
        const planResult  = planResults[i];
        const ownerResult = ownerResults[i];
        if (planResult.status  !== "success") continue;
        if (ownerResult.status !== "success") continue;

        const plan      = planResult.result as {
          token: `0x${string}`; amount: bigint; start: bigint; cliff: bigint;
          rate: bigint; period: bigint; vestingAdmin: `0x${string}`;
        };
        const recipient = (ownerResult.result as string).toLowerCase();
        // Burned plans → ownerOf reverts (we'd never reach here). Belt-and-
        // braces zero-recipient skip in case a future contract returns 0x0
        // for burnt tokens instead of reverting.
        if (recipient === ZERO_ADDRESS) continue;

        const tokenAddr = plan.token.toLowerCase();
        if (!tokenCache.has(tokenAddr)) {
          try {
            const [symbol, decimals] = await Promise.all([
              client.readContract({ address: plan.token, abi: erc20Abi, functionName: "symbol"   }),
              client.readContract({ address: plan.token, abi: erc20Abi, functionName: "decimals" }),
            ]);
            tokenCache.set(tokenAddr, { symbol, decimals });
          } catch {
            tokenCache.set(tokenAddr, { symbol: "UNKNOWN", decimals: 18 });
          }
        }
        const { symbol: tokenSymbol, decimals: tokenDecimals } = tokenCache.get(tokenAddr)!;

        const startTime = Number(plan.start);
        const cliffTime = Number(plan.cliff) > startTime ? Number(plan.cliff) : null;

        // Period-based vesting math — mirrors adapter so cache rows are
        // byte-identical during cutover.
        const elapsed        = BigInt(Math.max(0, nowSec - startTime));
        const periodsElapsed = plan.period > 0n ? elapsed / plan.period : 0n;
        const vested         = plan.rate * periodsElapsed;
        const totalPeriods   = plan.rate > 0n ? plan.amount / plan.rate : 0n;
        const endTime        = startTime + Number(totalPeriods * plan.period);

        const claimableNow  = vested > 0n ? vested : 0n;
        const lockedAmount  = plan.amount > vested ? plan.amount - vested : 0n;
        const isFullyVested = vested >= plan.amount;

        let nextUnlock: number | null = null;
        if (!isFullyVested) {
          if (cliffTime && nowSec < cliffTime) nextUnlock = cliffTime;
          else if (plan.period > 0n)           nextUnlock = startTime + Number((periodsElapsed + 1n) * plan.period);
          else                                 nextUnlock = endTime;
        }

        const tokenIdKey = tokenIds[i].toString();
        const lockTxHash = mintTxByTokenId.get(tokenIdKey) ?? fallbackTxByTokenId.get(tokenIdKey) ?? null;

        streams.push({
          id:              `hedgey-${chainId}-${tokenIdKey}`,
          protocol:        "hedgey",
          category:        "vesting",
          chainId,
          recipient,
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
          nextUnlockTime:  nextUnlock,
          cancelable:      plan.vestingAdmin.toLowerCase() !== ZERO_ADDRESS,
          lockTxHash,
        });
      }

      if (streams.length > 0) await writeToCache(streams);
      return { eventCount: streams.length };
    },
  };
}

export const hedgeyIndexers: Indexer[] = [
  makeIndexer(CHAIN_IDS.ETHEREUM),
  makeIndexer(CHAIN_IDS.BSC),
  makeIndexer(CHAIN_IDS.POLYGON),
  makeIndexer(CHAIN_IDS.BASE),
  makeIndexer(CHAIN_IDS.ARBITRUM),
  makeIndexer(CHAIN_IDS.OPTIMISM),
];
