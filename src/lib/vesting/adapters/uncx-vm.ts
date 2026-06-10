import { erc20Abi, type Hex } from "viem";
import { VestingAdapter } from "./index";
import { makeFallbackClient } from "../rpc";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  computeStepVesting,
  nextUnlockTimeForSteps,
} from "../types";

// ─── Per-chain contract config ─────────────────────────────────────────────────
// UNCX VestingManager — each chain has its own contract deployment.
//
// 2026-05-14: RPC URL resolution moved to the shared multi-RPC pool
// (src/lib/vesting/rpc.ts). Previously this file hardcoded per-chain env-var
// reads (ALCHEMY_RPC_URL_ETH, BSC_RPC_URL, ALCHEMY_RPC_URL_BASE) which were
// NEVER SET — silently returning empty results for BSC/Base, and slamming
// Alchemy free-tier's 10-block eth_getLogs cap on ETH. The shared pool gives
// us proper fallback-over-all-providers via viem's fallback transport, so a
// single provider 401/429/timeout no longer kills the whole chunk scan.
//
// 2026-04-29: BSC and Base removed. dRPC free tier no longer serves
// eth_getLogs on those chains, and UNCX-VM's eth_getLogs scan (up to
// ~100M+ blocks in 50k-block chunks) causes every free RPC provider to
// time out — eventually killing the Vercel function with a 504. Re-add
// if/when paid RPC env vars (BSC_RPC_URL, ALCHEMY_RPC_URL_BASE) are set.
const CHAIN_CONFIG: Partial<Record<SupportedChainId, {
  contractAddress: `0x${string}`;
  fromBlock:       bigint;
}>> = {
  [CHAIN_IDS.ETHEREUM]: {
    contractAddress: "0xa98f06312b7614523d0f5e725e15fd20fb1b99f5",
    fromBlock:       23_143_944n, // deployed 2025-08-15
  },
};

const CHUNK_SIZE = 49_999n; // PublicNode caps eth_getLogs at 50 000 blocks

// ─── VestingCreated event ──────────────────────────────────────────────────────
// Verified topic hash taken directly from on-chain tx logs (not computed):
// event VestingCreated(uint256 indexed vestingId, address indexed beneficiary, address indexed token, ...)
const VESTING_CREATED_TOPIC =
  "0xcfcd2ea84a9e988255710b3adc4919275a012aa72f68b63acf1e9f67296e134f" as Hex;

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────
const VESTING_MANAGER_ABI = [
  {
    name: "getVestingSchedule",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "vestingId", type: "uint256" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "token",       type: "address" },
        { name: "creator",     type: "address" },
        { name: "beneficiary", type: "address" },
        { name: "totalAmount", type: "uint256" },
        { name: "isSoft",      type: "bool"    },
        { name: "isNftized",   type: "bool"    },
        { name: "isTopable",   type: "bool"    },
        { name: "released",    type: "uint256" },
        { name: "cancelled",   type: "bool"    },
        { name: "vestingType", type: "uint8"   },
        {
          name: "tranches",
          type: "tuple[]",
          components: [
            { name: "time",   type: "uint256" },
            { name: "amount", type: "uint256" },
          ],
        },
      ],
    }],
  },
] as const;

// ─── Fetcher ───────────────────────────────────────────────────────────────────
async function fetchForChain(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<VestingStream[]> {
  const config = CHAIN_CONFIG[chainId];
  if (!config) return [];

  // Use the shared pool's fallback client: viem's fallback transport will
  // try each RPC in order, moving to the next on any failure (429, 401,
  // 404, timeout). `forLogs: true` skips publicnode (logs-pruned). Much
  // more resilient than picking ONE URL via round-robin and praying.
  const client = makeFallbackClient(chainId, { forLogs: true });
  if (!client) return [];

  const { contractAddress, fromBlock } = config;
  const nowSec  = Math.floor(Date.now() / 1000);
  const streams: VestingStream[] = [];
  const tokenCache = new Map<string, { symbol: string; decimals: number }>();

  try {
    // Pad ALL wallet addresses for topic[2] OR-filter — one scan covers all wallets
    const paddedAddresses = wallets.map(
      (w) => `0x${"0".repeat(24)}${w.toLowerCase().slice(2)}` as Hex
    );

    // Build paginated chunk list (PublicNode caps eth_getLogs at 50 000 blocks)
    const latestBlock = await client.getBlockNumber();
    const chunks: { from: bigint; to: bigint }[] = [];
    for (let from = fromBlock; from <= latestBlock; from += CHUNK_SIZE + 1n) {
      chunks.push({
        from,
        to: from + CHUNK_SIZE > latestBlock ? latestBlock : from + CHUNK_SIZE,
      });
    }

    // Fetch all chunks in parallel batches of 10 (fast but rate-limit friendly)
    const BATCH = 10;
    const rawLogs: { topics: readonly (Hex | null | undefined)[]; transactionHash?: Hex }[] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(({ from, to }) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.getLogs as any)({
            address:   contractAddress,
            topics:    [VESTING_CREATED_TOPIC, null, paddedAddresses],
            fromBlock: from,
            toBlock:   to,
          })
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled") rawLogs.push(...r.value);
        else console.error(`UNCX VestingManager (chain ${chainId}) chunk error:`, r.reason);
      }
    }

    // Keep only VestingCreated logs where beneficiary matches one of our wallets.
    // PublicNode ignores array OR-filters in topics, so we must filter client-side.
    const paddedSet = new Set(paddedAddresses.map((a) => a.toLowerCase()));
    const allLogs = rawLogs.filter(
      (log) =>
        log.topics[0] === VESTING_CREATED_TOPIC &&
        log.topics.length >= 3 &&
        log.topics[1] != null &&
        log.topics[2] != null &&
        paddedSet.has((log.topics[2] as string).toLowerCase())
    );

    if (allLogs.length === 0) return streams;

    // topic[1] = vestingId, topic[2] = beneficiary (both indexed, padded to 32 bytes)
    // 2026-05-14: carry transactionHash through so the cache row links
    // back to the originating creation tx (same plumbing as the indexer).
    type LogEntry = { vestingId: bigint; recipient: string; lockTxHash: string | null };
    const entries: LogEntry[] = allLogs.map((log) => ({
      vestingId: BigInt(log.topics[1] as Hex),
      // strip 12-byte padding → lowercase address
      recipient: `0x${(log.topics[2] as Hex).slice(26)}`,
      lockTxHash: log.transactionHash ?? null,
    }));

    // Batch-read all vesting schedules via multicall
    const scheduleResults = await client.multicall({
      contracts: entries.map(({ vestingId }) => ({
        address:      contractAddress,
        abi:          VESTING_MANAGER_ABI,
        functionName: "getVestingSchedule" as const,
        args:         [vestingId] as [bigint],
      })),
    });

    for (let i = 0; i < entries.length; i++) {
      const result = scheduleResults[i];
      if (result.status !== "success") continue;

      const schedule = result.result;
      if (schedule.cancelled) continue;

      const tokenAddr = schedule.token.toLowerCase();

      // Token metadata (cached per run)
      if (!tokenCache.has(tokenAddr)) {
        try {
          const [symbol, decimals] = await Promise.all([
            client.readContract({ address: schedule.token, abi: erc20Abi, functionName: "symbol"   }),
            client.readContract({ address: schedule.token, abi: erc20Abi, functionName: "decimals" }),
          ]);
          tokenCache.set(tokenAddr, { symbol, decimals });
        } catch {
          tokenCache.set(tokenAddr, { symbol: "???", decimals: 18 });
        }
      }

      const { symbol: tokenSymbol, decimals: tokenDecimals } = tokenCache.get(tokenAddr)!;

      // Sort tranches ascending by unlock time
      const unlockSteps = [...schedule.tranches]
        .map((t) => ({ timestamp: Number(t.time), amount: t.amount.toString() }))
        .sort((a, b) => a.timestamp - b.timestamp);

      const total     = schedule.totalAmount;
      const withdrawn = schedule.released;
      const { claimableNow, lockedAmount, isFullyVested } =
        computeStepVesting(total, withdrawn, unlockSteps, nowSec);

      const startTime = unlockSteps[0]?.timestamp ?? 0;
      const endTime   = unlockSteps.at(-1)?.timestamp ?? 0;

      streams.push({
        id:              `uncx-vm-${chainId}-${entries[i].vestingId.toString()}`,
        protocol:        "uncx-vm",
        category:        "vesting",
        chainId,
        recipient:       entries[i].recipient,
        tokenAddress:    tokenAddr,
        tokenSymbol,
        tokenDecimals,
        totalAmount:     total.toString(),
        withdrawnAmount: withdrawn.toString(),
        claimableNow:    claimableNow.toString(),
        lockedAmount:    lockedAmount.toString(),
        startTime,
        endTime,
        cliffTime:       null,
        isFullyVested,
        nextUnlockTime:  nextUnlockTimeForSteps(nowSec, unlockSteps),
        shape:           "steps",
        unlockSteps,
        cancelable:      schedule.isSoft,
        lockTxHash:      entries[i].lockTxHash,
        // In-app claiming: release(vestingId) on the VestingManager.
        // Selector 0x37bdc99b verified present in the deployed bytecode
        // (eth_getCode scan, 2026-06-10). vestingId == nativeId.
        claimContract:   contractAddress,
        claimNativeId:   entries[i].vestingId.toString(),
      });
    }
  } catch (err) {
    console.error(`UNCX VestingManager (chain ${chainId}) error:`, err);
  }

  return streams;
}

// ─── Adapter export ────────────────────────────────────────────────────────────
export const uncxVmAdapter: VestingAdapter = {
  id:                 "uncx-vm",
  name:               "UNCX VestingManager",
  supportedChainIds:  [CHAIN_IDS.ETHEREUM],
  fetch:              fetchForChain,
};
