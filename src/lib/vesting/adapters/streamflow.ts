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
//   - SPL token metadata (symbol + decimals) comes from chain via
//     `resolveSolanaMintMeta` — mint account, Token-2022 metadata extension,
//     Metaplex metadata PDA, then Jupiter. The Jupiter-only lookup this
//     replaced left 2,675 rows with a truncated mint as their symbol.
//   - Two entry points: `fetch` (per-wallet, for live lookups) and
//     `fetchAllStreamflowStreams` (one program-wide scan, for the seeder).
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
  decodeStream,
  deriveContractPDA,
  PROGRAM_ID,
  ALIGNED_UNLOCKS_PROGRAM_ID,
  STREAM_STRUCT_OFFSET_CLOSED,
} from "@streamflow/stream";
import { Connection, PublicKey } from "@solana/web3.js";
import { mapBounded, getSolanaRpcUrls } from "../rpc";
import { resolveSolanaMintMeta, solanaSymbolFallback, SolanaMintMeta } from "../solana-token-meta";

// Concurrency + delay tuned for free-tier Solana RPCs (Alchemy / Helius).
// Each Streamflow SDK call internally fires 3-5 RPC sub-requests, so
// CONCURRENCY=4 → ~16 simultaneous requests per batch, which reliably
// triggers 429 storms on Alchemy (observed in production 2026-06-02).
// Dropping to 2 concurrent wallets × 250ms inter-batch delay gives
// ~8 requests/batch every 250ms = ~32 req/s — well inside Alchemy's
// free-tier 40 req/s window and Helius's credit rate limits.
const SOLANA_CONCURRENCY = 2;
const SOLANA_BATCH_DELAY_MS = 250;

// ─── Stream schedule → discrete unlock steps ────────────────────────────────
//
// Streamflow's Contract encodes the schedule as:
//   start → cliff → end, with cliffAmount at cliff, then amountPerPeriod
//   every `period` seconds until depositedAmount is released.
//
// We materialise this into explicit { timestamp, amount } steps so it
// matches the other step-shaped adapters (PinkSale, UNCX, etc.).
//
// Step count is capped at MAX_UNLOCK_STEPS by merging consecutive periods.
// Each emitted step lands on a real period boundary with the exact cumulative
// amount vested by then; between steps the schedule lags by less than one
// merged interval. Schedules with ≤ MAX_UNLOCK_STEPS periods are unchanged.
//
// This replaced a hard stop after 10,000 iterations, which on a per-second
// stream (period = 1) modelled the first ~2.8 hours and dumped the remainder
// at `end` — 868 open streams on 2026-10-29, 664 still vesting, all showing
// nearly everything locked until the final second. Those rows also carried
// ~400KB of steps each, which is what pushed the bulk seed past 300s.
const MAX_UNLOCK_STEPS = 500;

export function buildUnlockSteps(
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

  if (period > 0 && amountPerPeriod > 0n && vestedSoFar < depositedAmount) {
    // Periods until fully vested, or until `end`, whichever comes first.
    const toVest  = (depositedAmount - vestedSoFar + amountPerPeriod - 1n) / amountPerPeriod;
    const toEnd   = Math.max(0, Math.floor((end - cliff) / period));
    const periods = toVest < BigInt(toEnd) ? Number(toVest) : toEnd;
    const group   = Math.max(1, Math.ceil(periods / MAX_UNLOCK_STEPS));

    for (let k = group; periods > 0; k += group) {
      const p      = Math.min(k, periods);
      let   target = cliffAmount + amountPerPeriod * BigInt(p);
      if (target > depositedAmount) target = depositedAmount;
      steps.push({ timestamp: cliff + p * period, amount: (target - vestedSoFar).toString() });
      vestedSoFar = target;
      if (p === periods) break;
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

// ─── Contract → VestingStream ────────────────────────────────────────────────
//
// Shared by the per-wallet fetch and the program-wide scan so both write
// identical rows.

function toVestingStream(
  id:     string,
  stream: StreamflowContract,
  meta:   SolanaMintMeta | undefined,
  nowSec: number,
): VestingStream {
  const decimals = meta?.decimals ?? 9;
  const symbol   = meta?.symbol   ?? solanaSymbolFallback(stream.mint);

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
    // Streamflow Vesting product — investor team token unlocks. The
    // separate "Payments" product (continuous payroll on Solana) is
    // skipped today; when added it'll be category: "stream".
    category:        "vesting",
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
}

// ─── Program-wide scan ───────────────────────────────────────────────────────
//
// The seeder used to discover Streamflow by listing every recipient with one
// getProgramAccounts call, then hydrating only the first 200 of ~50k wallets
// with per-wallet client.get(). getProgramAccounts returns accounts in a stable
// order, so it was the SAME 200 wallets every day: on 2026-10-29 the cache
// held 4 of 45 open CARDS streams and 11 of 56 UFO streams.
//
// The scan already had every Contract account in hand; it just threw the data
// away. One call with a `closed = false` memcmp returns every open stream
// (40,069 of 76,882 Contract accounts that day, ~4s on the public endpoint),
// decoded in-process. No per-wallet fan-out, nothing capped.
//
// dataSlice stops at the `closed` byte. Everything after it (pause and
// rate-change bookkeeping, old_metadata, payer, bump) is unused here, so the
// buffer is zero-padded back to full size for the SDK decoder. That cuts the
// response from ~59MB to ~36MB of base64.

const STREAMFLOW_PROGRAM_ID   = new PublicKey(PROGRAM_ID.mainnet);
const ALIGNED_PROGRAM_ID      = new PublicKey(ALIGNED_UNLOCKS_PROGRAM_ID.mainnet);
const STREAMFLOW_CONTRACT_SIZE = 1104;
const STREAMFLOW_SCAN_BYTES    = STREAM_STRUCT_OFFSET_CLOSED + 1;
// base58 of a single 0x00 byte — `closed = false`.
const BS58_ZERO_BYTE = "1";
// The public endpoint serves this scan; Alchemy's free tier 429s it. Set
// STREAMFLOW_RPC_URL to a Helius / paid endpoint to stop depending on it.
const PUBLIC_MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const SCAN_TIMEOUT_MS    = 90_000;

export interface OpenStreamflowContract {
  id:     string;
  stream: StreamflowContract;
}

/** Every open (not closed) Streamflow Contract, AlignedContract variants excluded. */
export async function scanOpenStreamflowContracts(
  conn: Connection,
): Promise<OpenStreamflowContract[]> {
  const accounts = await conn.getProgramAccounts(STREAMFLOW_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { dataSize: STREAMFLOW_CONTRACT_SIZE },
      { memcmp: { offset: STREAM_STRUCT_OFFSET_CLOSED, bytes: BS58_ZERO_BYTE } },
    ],
    dataSlice: { offset: 0, length: STREAMFLOW_SCAN_BYTES },
  });

  const out: OpenStreamflowContract[] = [];
  let decodeErrors = 0;
  for (const { pubkey, account } of accounts) {
    const buf = Buffer.alloc(STREAMFLOW_CONTRACT_SIZE);
    Buffer.from(account.data).copy(buf);
    let decoded: ReturnType<typeof decodeStream>;
    try {
      decoded = decodeStream(buf);
    } catch {
      decodeErrors++;
      continue;
    }
    if (decoded.closed) continue;
    // Aligned (price-oracle) unlocks: the sender is the aligned proxy's PDA
    // for this stream (same check as the SDK's isAlignedUnlock). A PDA is off
    // the ed25519 curve, so only off-curve senders need the derivation.
    if (
      !PublicKey.isOnCurve(decoded.sender.toBytes()) &&
      decoded.sender.equals(deriveContractPDA(ALIGNED_PROGRAM_ID, pubkey))
    ) continue;
    // The Contract constructor calls BN.toNumber() on its time fields and
    // throws on values past 2^53 (sentinel "never" timestamps). The SDK's own
    // client.get() throws on the same accounts, so they were never coverable.
    try {
      out.push({ id: pubkey.toBase58(), stream: new StreamflowContract(decoded) });
    } catch {
      decodeErrors++;
    }
  }
  if (decodeErrors > 0) {
    console.warn(`[streamflow] scan: ${decodeErrors} accounts failed to decode`);
  }
  return out;
}

/**
 * Seeder entry point: every open Streamflow stream as a VestingStream.
 * Returns null when Solana is disabled or no RPC would serve the scan.
 */
export async function fetchAllStreamflowStreams(
  /** Mint metadata the caller already has (the seeder passes the cache's). */
  knownMeta?: Map<string, { symbol: string; decimals: number }>,
): Promise<VestingStream[] | null> {
  if (process.env.SOLANA_ENABLED !== "true") return null;

  const urls = [...new Set([
    process.env.STREAMFLOW_RPC_URL,
    ...getSolanaRpcUrls(),
    PUBLIC_MAINNET_RPC,
  ].filter((u): u is string => typeof u === "string" && u.length > 0))];

  let contracts: OpenStreamflowContract[] | null = null;
  let conn: Connection | null = null;
  for (const url of urls) {
    const urlShort = url.replace(/api[-_]?key=[^&?]+/i, "api-key=***").split("?")[0].slice(0, 60);
    try {
      // No built-in 429 backoff on the scan: Alchemy's free tier always 429s
      // it, and web3.js retrying cost ~60s before falling through.
      const c = new Connection(url, { commitment: "confirmed", disableRetryOnRateLimit: true });
      const t0 = Date.now();
      // Normally 3-12s. A throttled endpoint has taken 360s, which would let
      // the lambda die mid-job with nothing recorded; give up and move on.
      const found = await Promise.race([
        scanOpenStreamflowContracts(c),
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error(`scan exceeded ${SCAN_TIMEOUT_MS / 1000}s`)), SCAN_TIMEOUT_MS)),
      ]);
      // An empty answer is a provider that doesn't index the program, not an
      // empty protocol (tens of thousands of streams are open). Try the next.
      if (found.length === 0) {
        console.warn(`[streamflow] scan: ${urlShort} returned 0 open contracts, trying next`);
        continue;
      }
      console.log(`[streamflow] scan: ${found.length} open contracts in ${Date.now() - t0}ms (RPC=${urlShort})`);
      contracts = found;
      // Metadata reads are small and paced, so they keep web3.js's backoff.
      conn = new Connection(url, "confirmed");
      break;
    } catch (err) {
      console.warn(`[streamflow] scan failed on ${urlShort}: ${err instanceof Error ? err.message.slice(0, 140) : err}`);
    }
  }
  if (!contracts || !conn) {
    console.error(`[streamflow] SCAN FAILED on all ${urls.length} RPC URL(s); cache will not refresh`);
    return null;
  }

  const meta = await resolveSolanaMintMeta(conn, contracts.map((c) => c.stream.mint), knownMeta);
  const nowSec = Math.floor(Date.now() / 1000);
  // A mint whose account read failed has no decimals. Writing it with an
  // assumed 9 would mis-scale every amount by orders of magnitude, so skip it;
  // any existing row is left as it was and the next run retries.
  const out: VestingStream[] = [];
  let skipped = 0;
  for (const c of contracts) {
    const m = meta.get(c.stream.mint);
    if (m?.decimals == null) { skipped++; continue; }
    out.push(toVestingStream(c.id, c.stream, m, nowSec));
  }
  if (skipped > 0) console.warn(`[streamflow] ${skipped} streams skipped: mint decimals unreadable this run`);
  return out;
}

// ─── Per-wallet fetch ────────────────────────────────────────────────────────

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
    console.error("[streamflow] SOLANA_RPC_URL not configured, adapter returning empty");
    return [];
  }

  let client: SolanaStreamClient;
  try {
    client = new SolanaStreamClient(rpcUrl);
  } catch (err) {
    console.error("[streamflow] client construction failed:", err);
    return [];
  }

  // Bounded-concurrency fetch — see SOLANA_CONCURRENCY comment up top.
  // Errors are recorded per-wallet without sinking the whole batch
  // (mapBounded returns PromiseSettledResult[] so a few rejections
  // don't fail the run).
  const allStreams: Array<[string, StreamflowContract]> = [];
  await mapBounded(
    wallets,
    SOLANA_CONCURRENCY,
    async (wallet) => {
      try {
        new PublicKey(wallet); // throws on malformed pubkey
      } catch {
        return; // invalid pubkey, skip
      }
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
    },
    SOLANA_BATCH_DELAY_MS,
  ).then((results) => {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") {
        console.error(`[streamflow] fetch failed for ${wallets[i]}:`, r.reason);
      }
    }
  });

  if (allStreams.length === 0) return [];

  const meta   = await resolveSolanaMintMeta(new Connection(rpcUrl), allStreams.map(([, s]) => s.mint));
  const nowSec = Math.floor(Date.now() / 1000);
  return allStreams.map(([id, stream]) => toVestingStream(id, stream, meta.get(stream.mint), nowSec));
}

export const streamflowAdapter: VestingAdapter = {
  id:                "streamflow",
  name:              "Streamflow",
  supportedChainIds: [CHAIN_IDS.SOLANA],
  fetch:             fetchForChain,
};
