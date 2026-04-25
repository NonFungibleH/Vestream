// src/lib/vesting/adapters/streamflow.ts
// ─────────────────────────────────────────────────────────────────────────────
// Streamflow adapter — first non-EVM protocol in Vestream.
//
// Streamflow is Solana's dominant vesting protocol (~$2.5B peak TVL,
// 1.3M users, 25k+ token launches). Their TypeScript SDK (@streamflow/stream)
// exposes `client.get({ address })` which fetches every stream for a given
// wallet in one call — no program-account scanning or discriminator magic
// needed for user-initiated lookups.
//
// Architecture notes:
//   - Gated by SOLANA_ENABLED=true env var. Returns [] when false so the
//     adapter is dormant across EVM-only deployments / local dev without
//     SOLANA_RPC_URL configured.
//   - Only handles standard Contract streams. AlignedContract variants
//     (price-aligned unlocks with min/max price and oracle dependency)
//     are skipped — <5% of Streamflow volume, and their min/max price
//     dynamics don't fit the time-based VestingStream schema cleanly.
//     Log-and-skip; revisit if user feedback demands coverage.
//   - SPL token metadata split: decimals from on-chain `getMint` (cheap,
//     always available), symbol from Jupiter's token list (covers top
//     few thousand Solana tokens by volume — no Metaplex PDA lookups
//     needed for the common case). Falls back to the first 4 chars of
//     the mint address as a last resort.
//   - Jupiter token list cached in-process for 30 minutes. Low risk —
//     Solana's liveness tokens don't churn symbols more often than that.
// ─────────────────────────────────────────────────────────────────────────────

import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  computeStepVesting,
  nextUnlockTimeForSteps,
} from "../types";
import {
  SolanaStreamClient,
  StreamType,
  StreamDirection,
  Contract as StreamflowContract,
  AlignedContract,
} from "@streamflow/stream";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

// ─── Jupiter token list (symbol fallback) ───────────────────────────────────

const JUPITER_TOKEN_LIST_URL = "https://token.jup.ag/all";
const JUPITER_TTL_MS = 30 * 60 * 1000;

interface JupiterTokenEntry {
  address:  string;
  symbol:   string;
  decimals: number;
}

let jupiterCache: Map<string, { symbol: string; decimals: number }> | null = null;
let jupiterCacheFetchedAt = 0;

async function getJupiterTokenList(): Promise<Map<string, { symbol: string; decimals: number }>> {
  const now = Date.now();
  if (jupiterCache && now - jupiterCacheFetchedAt < JUPITER_TTL_MS) {
    return jupiterCache;
  }
  try {
    const res = await fetch(JUPITER_TOKEN_LIST_URL, {
      next: { revalidate: 1800 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return jupiterCache ?? new Map();
    const tokens = (await res.json()) as JupiterTokenEntry[];
    const map = new Map<string, { symbol: string; decimals: number }>();
    for (const t of tokens) {
      if (t.address && t.symbol) {
        map.set(t.address, { symbol: t.symbol, decimals: t.decimals });
      }
    }
    jupiterCache = map;
    jupiterCacheFetchedAt = now;
    return map;
  } catch (err) {
    console.error("[streamflow] Jupiter token list fetch failed:", err);
    return jupiterCache ?? new Map();
  }
}

// ─── Stream schedule → discrete unlock steps ────────────────────────────────
//
// Streamflow's Contract encodes the schedule as:
//   start → cliff → end, with cliffAmount at cliff, then amountPerPeriod
//   every `period` seconds until depositedAmount is released.
//
// We materialise this into explicit { timestamp, amount } steps so it
// matches the other step-shaped adapters (PinkSale, UNCX, etc.). Iteration
// is capped at 10,000 to guard against nonsensically-short `period` values
// (the adapter wouldn't ship garbage but a malicious creator could).

function buildUnlockSteps(
  depositedAmount: bigint,
  cliff:           number,
  cliffAmount:     bigint,
  period:          number,
  amountPerPeriod: bigint,
  end:             number,
): { timestamp: number; amount: string }[] {
  const steps: { timestamp: number; amount: string }[] = [];

  if (cliffAmount > 0n) {
    steps.push({ timestamp: cliff, amount: cliffAmount.toString() });
  }

  let vestedSoFar = cliffAmount;
  let stepTime    = cliff + period;
  let iterations  = 0;

  if (period > 0 && amountPerPeriod > 0n) {
    while (vestedSoFar < depositedAmount && stepTime <= end && iterations < 10_000) {
      const remaining = depositedAmount - vestedSoFar;
      const stepAmt   = remaining < amountPerPeriod ? remaining : amountPerPeriod;
      steps.push({ timestamp: stepTime, amount: stepAmt.toString() });
      vestedSoFar += stepAmt;
      stepTime    += period;
      iterations++;
    }
  }

  // Residual unlock at `end` if the schedule didn't fully vest via steps.
  if (vestedSoFar < depositedAmount) {
    steps.push({ timestamp: end, amount: (depositedAmount - vestedSoFar).toString() });
  }

  // Degenerate case — no cliff, no period — single unlock at end.
  if (steps.length === 0) {
    steps.push({ timestamp: end, amount: depositedAmount.toString() });
  }

  return steps.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Main fetch ──────────────────────────────────────────────────────────────

async function fetchForChain(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<VestingStream[]> {
  // Adapter only runs on Solana; return empty for any EVM chain.
  if (chainId !== CHAIN_IDS.SOLANA) return [];

  // Feature-flag gate. Dormant until explicitly enabled per environment.
  if (process.env.SOLANA_ENABLED !== "true") return [];

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    console.error("[streamflow] SOLANA_RPC_URL not configured — adapter returning empty");
    return [];
  }

  let client: SolanaStreamClient;
  try {
    client = new SolanaStreamClient(rpcUrl);
  } catch (err) {
    console.error("[streamflow] client construction failed:", err);
    return [];
  }

  // Fetch streams for every wallet in parallel. Invalid pubkeys
  // (shouldn't happen — validated upstream — but defence in depth)
  // are rejected per-wallet without sinking the whole batch.
  const allStreams: Array<[string, StreamflowContract]> = [];
  await Promise.all(
    wallets.map(async (wallet) => {
      try {
        new PublicKey(wallet); // throws on malformed pubkey
        const result = await client.get({
          address:   wallet,
          type:      StreamType.All,
          direction: StreamDirection.All,
        });
        for (const [id, stream] of result) {
          // Skip AlignedContract — price-aligned unlocks are out of scope
          // for v1 (see header comment).
          if (stream instanceof AlignedContract) continue;
          // Skip closed/cancelled streams — they're historical, and the
          // cache is for active vestings. Fully-vested (but not closed)
          // streams still return; they'll be flagged isFullyVested=true.
          if (stream.closed) continue;
          allStreams.push([id, stream]);
        }
      } catch (err) {
        console.error(`[streamflow] fetch failed for ${wallet}:`, err);
      }
    }),
  );

  if (allStreams.length === 0) return [];

  // Batch-fetch SPL metadata for every unique mint in the result set.
  // Decimals come from on-chain getMint (always authoritative); symbols
  // try Jupiter's token list first, fall back to a 4-char mint slug.
  const uniqueMints  = [...new Set(allStreams.map(([, s]) => s.mint))];
  const connection   = new Connection(rpcUrl);
  const jupiterList  = await getJupiterTokenList();

  const decimalsByMint = new Map<string, number>();
  const symbolsByMint  = new Map<string, string>();

  await Promise.all(
    uniqueMints.map(async (mint) => {
      const fromJupiter = jupiterList.get(mint);
      try {
        const mintInfo = await getMint(connection, new PublicKey(mint));
        decimalsByMint.set(mint, mintInfo.decimals);
      } catch {
        // getMint failed — trust Jupiter's decimals if we have it, else
        // fall back to Solana's common default (9).
        decimalsByMint.set(mint, fromJupiter?.decimals ?? 9);
      }
      symbolsByMint.set(mint, fromJupiter?.symbol ?? `${mint.slice(0, 4)}…`);
    }),
  );

  const nowSec = Math.floor(Date.now() / 1000);

  return allStreams.map(([id, stream]): VestingStream => {
    const decimals = decimalsByMint.get(stream.mint) ?? 9;
    const symbol   = symbolsByMint.get(stream.mint)   ?? `${stream.mint.slice(0, 4)}…`;

    // Streamflow uses BN (from bn.js) for amounts. Convert to native bigint
    // for our schema. String roundtrip avoids the BN↔bigint version skew
    // between direct-dep bn.js and any transitive copies.
    const depositedAmount = BigInt(stream.depositedAmount.toString());
    const withdrawnAmount = BigInt(stream.withdrawnAmount.toString());
    const cliffAmount     = BigInt(stream.cliffAmount.toString());
    const amountPerPeriod = BigInt(stream.amountPerPeriod.toString());

    const steps = buildUnlockSteps(
      depositedAmount,
      stream.cliff,
      cliffAmount,
      stream.period,
      amountPerPeriod,
      stream.end,
    );

    const { claimableNow, lockedAmount, isFullyVested } = computeStepVesting(
      depositedAmount,
      withdrawnAmount,
      steps,
      nowSec,
    );

    return {
      id:              `streamflow-${CHAIN_IDS.SOLANA}-${id}`,
      protocol:        "streamflow",
      chainId:         CHAIN_IDS.SOLANA,
      recipient:       stream.recipient,
      tokenAddress:    stream.mint,
      tokenSymbol:     symbol,
      tokenDecimals:   decimals,
      totalAmount:     depositedAmount.toString(),
      withdrawnAmount: withdrawnAmount.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime:       stream.start,
      endTime:         stream.end,
      cliffTime:       stream.cliff > stream.start ? stream.cliff : null,
      isFullyVested,
      nextUnlockTime:  nextUnlockTimeForSteps(nowSec, steps),
      cancelable:      stream.cancelableBySender || stream.cancelableByRecipient,
      shape:           "steps",
      unlockSteps:     steps,
    };
  });
}

export const streamflowAdapter: VestingAdapter = {
  id:                "streamflow",
  name:              "Streamflow",
  supportedChainIds: [CHAIN_IDS.SOLANA],
  fetch:             fetchForChain,
};
