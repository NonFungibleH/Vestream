// src/lib/vesting/adapters/jupiter-lock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Jupiter Lock adapter — Solana, 9th Vestream protocol.
//
// Jupiter Lock is the default token-vesting rail in the Jupiter ecosystem on
// Solana. Every Solana token launch since late 2024 has standardised on it;
// it's the backbone of the JUP team/investor vesting and countless launchpad
// deals on top of that. Bigger count-wise than Streamflow on Solana, and
// critically differentiates us against dropstab/tokenomist/cryptorank which
// index zero Solana protocol-level data.
//
// Program: `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`
// Source:  github.com/jup-ag/jup-lock/programs/locker/src/state/vesting_escrow.rs
//
// Account layout (Anchor, `zero_copy`):
//   offset 0    8   discriminator (sha256("account:VestingEscrow")[0..8])
//   offset 8   32   recipient           (Pubkey) ← we memcmp-filter on this
//   offset 40  32   token_mint          (Pubkey)
//   offset 72  32   creator             (Pubkey)
//   offset 104 32   base                (Pubkey)
//   offset 136  4   u8 flags (bump + mode bytes)
//   offset 140  4   padding_0
//   offset 144  8   cliff_time          (u64, unix secs)
//   offset 152  8   frequency           (u64, secs between periods)
//   offset 160  8   cliff_unlock_amount (u64)
//   offset 168  8   amount_per_period   (u64)
//   offset 176  8   number_of_period    (u64)
//   offset 184  8   total_claimed_amount(u64)
//   offset 192  8   vesting_start_time  (u64, unix secs)
//   offset 200  8   cancelled_at        (u64, 0 if not cancelled)
//   offset 208  8   padding_1
//   offset 216 80   buffer [u128;5]
//   total     296   bytes per account
//
// Vesting schedule (per the program's compute_vesting_amount):
//   t < cliff_time:              0 unlocked
//   t >= cliff_time:              cliff_unlock_amount unlocked
//   t >= cliff_time + frequency*k: cliff_unlock_amount + k*amount_per_period
//     for k in 1..=number_of_period
//   t >= cliff_time + frequency*number_of_period: fully vested
//
// Total locked = cliff_unlock_amount + amount_per_period * number_of_period
// ─────────────────────────────────────────────────────────────────────────────

import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  computeStepVesting,
  nextUnlockTimeForSteps,
} from "../types";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { mapBounded } from "../rpc";

// Helius free-tier CU/s ceiling — see streamflow.ts for the same constants.
const SOLANA_CONCURRENCY = 4;
const SOLANA_BATCH_DELAY_MS = 100;

// ─── Program identity + account layout ──────────────────────────────────────

const JUPITER_LOCK_PROGRAM_ID   = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn";
// base58 of Anchor sha256("account:VestingEscrow")[0..8] — precomputed so we
// don't pull bs58 into the runtime bundle. Verified against the on-chain
// discriminator of a live escrow.
const VESTING_ESCROW_DISCRIMINATOR_BS58 = "hteFiUjrzUz";
const ACCOUNT_SIZE = 296;

// Byte offsets within the full account (includes 8-byte disc prefix).
const OFFSET_RECIPIENT            = 8;
const OFFSET_TOKEN_MINT           = 40;
const OFFSET_CLIFF_TIME           = 144;
const OFFSET_FREQUENCY            = 152;
const OFFSET_CLIFF_UNLOCK_AMOUNT  = 160;
const OFFSET_AMOUNT_PER_PERIOD    = 168;
const OFFSET_NUMBER_OF_PERIOD     = 176;
const OFFSET_TOTAL_CLAIMED_AMOUNT = 184;
const OFFSET_VESTING_START_TIME   = 192;
const OFFSET_CANCELLED_AT         = 200;

// ─── Jupiter token-list fallback (shared pattern with Streamflow) ───────────

const JUPITER_TOKEN_LIST_URL = "https://token.jup.ag/all";
const JUPITER_TTL_MS         = 30 * 60 * 1000;

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
      if (t.address && t.symbol) map.set(t.address, { symbol: t.symbol, decimals: t.decimals });
    }
    jupiterCache = map;
    jupiterCacheFetchedAt = now;
    return map;
  } catch (err) {
    console.error("[jupiter-lock] Jupiter token list fetch failed:", err);
    return jupiterCache ?? new Map();
  }
}

// ─── Account decoding ───────────────────────────────────────────────────────

interface DecodedEscrow {
  escrowPubkey:       string;
  recipient:          string;
  tokenMint:          string;
  cliffTime:          number;
  frequency:          number;
  cliffUnlockAmount:  bigint;
  amountPerPeriod:    bigint;
  numberOfPeriod:     bigint;
  totalClaimedAmount: bigint;
  vestingStartTime:   number;
  cancelledAt:        number;
}

function readU64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function decodeEscrow(escrowPubkey: string, data: Buffer): DecodedEscrow | null {
  if (data.length < ACCOUNT_SIZE) return null;
  return {
    escrowPubkey,
    recipient:          new PublicKey(data.subarray(OFFSET_RECIPIENT,  OFFSET_RECIPIENT + 32)).toBase58(),
    tokenMint:          new PublicKey(data.subarray(OFFSET_TOKEN_MINT, OFFSET_TOKEN_MINT + 32)).toBase58(),
    cliffTime:          Number(readU64LE(data, OFFSET_CLIFF_TIME)),
    frequency:          Number(readU64LE(data, OFFSET_FREQUENCY)),
    cliffUnlockAmount:  readU64LE(data, OFFSET_CLIFF_UNLOCK_AMOUNT),
    amountPerPeriod:    readU64LE(data, OFFSET_AMOUNT_PER_PERIOD),
    numberOfPeriod:     readU64LE(data, OFFSET_NUMBER_OF_PERIOD),
    totalClaimedAmount: readU64LE(data, OFFSET_TOTAL_CLAIMED_AMOUNT),
    vestingStartTime:   Number(readU64LE(data, OFFSET_VESTING_START_TIME)),
    cancelledAt:        Number(readU64LE(data, OFFSET_CANCELLED_AT)),
  };
}

// ─── Build discrete unlock steps from the escrow schedule ───────────────────

function buildUnlockSteps(e: DecodedEscrow): { timestamp: number; amount: string }[] {
  const steps: { timestamp: number; amount: string }[] = [];

  if (e.cliffUnlockAmount > 0n) {
    steps.push({ timestamp: e.cliffTime, amount: e.cliffUnlockAmount.toString() });
  }

  const numPeriods = Number(e.numberOfPeriod);
  if (e.frequency > 0 && e.amountPerPeriod > 0n && numPeriods > 0) {
    // Cap at 10k steps (defensive against nonsensical number_of_period values)
    const cap = Math.min(numPeriods, 10_000);
    for (let k = 1; k <= cap; k++) {
      steps.push({
        timestamp: e.cliffTime + e.frequency * k,
        amount:    e.amountPerPeriod.toString(),
      });
    }
  }

  // Degenerate case — no cliff, no periodic vesting. Single instantaneous
  // unlock at cliffTime (which for a zero-cliff escrow is effectively
  // vesting_start_time).
  if (steps.length === 0) {
    const total = e.cliffUnlockAmount + e.amountPerPeriod * e.numberOfPeriod;
    if (total > 0n) {
      steps.push({ timestamp: e.cliffTime || e.vestingStartTime, amount: total.toString() });
    }
  }

  return steps.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Main fetch ─────────────────────────────────────────────────────────────

async function fetchForChain(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<VestingStream[]> {
  if (chainId !== CHAIN_IDS.SOLANA) return [];
  if (process.env.SOLANA_ENABLED !== "true") return [];

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    console.error("[jupiter-lock] SOLANA_RPC_URL not configured — adapter returning empty");
    return [];
  }

  let connection: Connection;
  try {
    connection = new Connection(rpcUrl, "confirmed");
  } catch (err) {
    console.error("[jupiter-lock] Connection construction failed:", err);
    return [];
  }

  const programId = new PublicKey(JUPITER_LOCK_PROGRAM_ID);

  // For each wallet, getProgramAccounts with two memcmp filters:
  //   offset 0  discriminator (narrow to VestingEscrow only)
  //   offset 8  wallet pubkey (narrow to recipient = this wallet)
  // dataSlice is NOT used here because we need the full account body to
  // decode cliff/period/amount fields. Payload is ~300 bytes per escrow,
  // so fetching the whole thing is still cheap.
  // Bounded-concurrency per-wallet getProgramAccounts. See SOLANA_CONCURRENCY.
  const escrows: DecodedEscrow[] = [];
  await mapBounded(
    wallets,
    SOLANA_CONCURRENCY,
    async (wallet) => {
      try {
        new PublicKey(wallet);
      } catch {
        return; // invalid pubkey — skip
      }

      const accounts = await connection.getProgramAccounts(programId, {
        commitment: "confirmed",
        filters: [
          { memcmp: { offset: 0, bytes: VESTING_ESCROW_DISCRIMINATOR_BS58 } },
          { memcmp: { offset: OFFSET_RECIPIENT, bytes: wallet } },
        ],
      });

      for (const { pubkey, account } of accounts) {
        const data = account.data instanceof Buffer ? account.data : Buffer.from(account.data);
        const decoded = decodeEscrow(pubkey.toBase58(), data);
        if (!decoded) continue;
        // Skip cancelled escrows — they're historical, not active.
        if (decoded.cancelledAt > 0) continue;
        escrows.push(decoded);
      }
    },
    SOLANA_BATCH_DELAY_MS,
  ).then((results) => {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") {
        console.error(`[jupiter-lock] fetch failed for ${wallets[i]}:`, r.reason);
      }
    }
  });

  if (escrows.length === 0) return [];

  // Batch-fetch SPL metadata for every unique mint, same pattern as Streamflow.
  const uniqueMints = [...new Set(escrows.map((e) => e.tokenMint))];
  const jupiterList = await getJupiterTokenList();

  const decimalsByMint = new Map<string, number>();
  const symbolsByMint  = new Map<string, string>();

  // Bounded-concurrency mint metadata fan-out — same Helius rate budget.
  await mapBounded(
    uniqueMints,
    SOLANA_CONCURRENCY,
    async (mint) => {
      const fromJupiter = jupiterList.get(mint);
      try {
        const mintInfo = await getMint(connection, new PublicKey(mint));
        decimalsByMint.set(mint, mintInfo.decimals);
      } catch {
        decimalsByMint.set(mint, fromJupiter?.decimals ?? 9);
      }
      symbolsByMint.set(mint, fromJupiter?.symbol ?? `${mint.slice(0, 4)}…`);
    },
    SOLANA_BATCH_DELAY_MS,
  );

  const nowSec = Math.floor(Date.now() / 1000);

  return escrows.map((e): VestingStream => {
    const decimals = decimalsByMint.get(e.tokenMint) ?? 9;
    const symbol   = symbolsByMint.get(e.tokenMint)  ?? `${e.tokenMint.slice(0, 4)}…`;

    const totalAmount = e.cliffUnlockAmount + e.amountPerPeriod * e.numberOfPeriod;
    const withdrawn   = e.totalClaimedAmount;

    const steps = buildUnlockSteps(e);
    const { claimableNow, lockedAmount, isFullyVested } = computeStepVesting(
      totalAmount,
      withdrawn,
      steps,
      nowSec,
    );

    const endTime   = steps.length > 0 ? steps[steps.length - 1].timestamp : e.cliffTime;
    // cliffTime is null when there's no cliff-before-start-of-vesting gap —
    // i.e. when cliff_time equals vesting_start_time (instant start).
    const cliffTime = e.cliffTime > e.vestingStartTime ? e.cliffTime : null;

    return {
      id:              `jupiter-lock-${CHAIN_IDS.SOLANA}-${e.escrowPubkey}`,
      protocol:        "jupiter-lock",
      category:        "vesting",
      chainId:         CHAIN_IDS.SOLANA,
      recipient:       e.recipient,
      tokenAddress:    e.tokenMint,
      tokenSymbol:     symbol,
      tokenDecimals:   decimals,
      totalAmount:     totalAmount.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime:       e.vestingStartTime,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  nextUnlockTimeForSteps(nowSec, steps),
      // Jupiter Lock cancel mode lives in the account but we simplify: treat
      // cancellable-at-all as cancelable: true. If cancel_mode == 0 (neither)
      // the adapter could flag false, but the granularity isn't useful for
      // display purposes today.
      cancelable:      true,
      shape:           "steps",
      unlockSteps:     steps,
    };
  });
}

export const jupiterLockAdapter: VestingAdapter = {
  id:                "jupiter-lock",
  name:              "Jupiter Lock",
  supportedChainIds: [CHAIN_IDS.SOLANA],
  fetch:             fetchForChain,
};

/**
 * Walker-style bulk fetch — returns every active VestingEscrow.
 *
 * Two-phase to fit inside Helius free tier (single full-body
 * getProgramAccounts on 44k+ accounts × 296 bytes = 13MB payload
 * routinely exceeded 290s):
 *
 *   Phase 1: getProgramAccounts with discriminator filter +
 *            dataSlice {offset:0, length:0} → returns 44k account
 *            pubkeys with empty data. ~30s, ~1MB response.
 *   Phase 2: chunk-fetch full data via getMultipleAccountsInfo
 *            (100 accounts per call, capped concurrency to stay
 *            under Helius compute-units-per-second). ~440 calls,
 *            ~60s wall-clock at concurrency=4.
 *
 * Used by the seeder to populate vesting_streams_cache directly
 * without paying for one getProgramAccounts per wallet (44k+ wallets
 * × 2 memcmp filters was timing out the 300s seed budget).
 */
export async function fetchAllJupiterLockEscrows(): Promise<VestingStream[] | null> {
  if (process.env.SOLANA_ENABLED !== "true") return null;
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    console.error("[jupiter-lock] SOLANA_RPC_URL not configured — bulk fetch returning null");
    return null;
  }

  let connection: Connection;
  try {
    connection = new Connection(rpcUrl, "confirmed");
  } catch (err) {
    console.error("[jupiter-lock] Connection construction failed:", err);
    return null;
  }

  const programId = new PublicKey(JUPITER_LOCK_PROGRAM_ID);

  // Phase 1 — light enumeration: pubkeys only.
  let pubkeys: PublicKey[];
  try {
    const lite = await connection.getProgramAccounts(programId, {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: VESTING_ESCROW_DISCRIMINATOR_BS58 } },
      ],
      dataSlice: { offset: 0, length: 0 },
    });
    pubkeys = lite.map((a) => a.pubkey);
    console.log(`[jupiter-lock] phase 1 enumeration: ${pubkeys.length} escrow pubkeys`);
  } catch (err) {
    console.error("[jupiter-lock] phase 1 getProgramAccounts failed:", err);
    return null;
  }
  if (pubkeys.length === 0) return [];

  // Phase 2 — chunked full-body fetch via getMultipleAccountsInfo.
  // 100-pubkey chunks × concurrency 4 keeps us under Helius free
  // compute units/sec while still completing in ~60s for 44k accounts.
  const CHUNK = 100;
  const FETCH_CONCURRENCY = 4;
  const chunks: PublicKey[][] = [];
  for (let i = 0; i < pubkeys.length; i += CHUNK) {
    chunks.push(pubkeys.slice(i, i + CHUNK));
  }

  const escrows: DecodedEscrow[] = [];
  let chunkErrors = 0;
  await mapBounded(
    chunks,
    FETCH_CONCURRENCY,
    async (chunk) => {
      try {
        const infos = await connection.getMultipleAccountsInfo(chunk, "confirmed");
        for (let i = 0; i < infos.length; i++) {
          const info = infos[i];
          if (!info) continue;
          const data = info.data instanceof Buffer ? info.data : Buffer.from(info.data);
          const decoded = decodeEscrow(chunk[i].toBase58(), data);
          if (!decoded) continue;
          if (decoded.cancelledAt > 0) continue;
          escrows.push(decoded);
        }
      } catch (err) {
        chunkErrors++;
        if (chunkErrors < 5) {
          console.error("[jupiter-lock] phase 2 chunk failed:", err);
        }
      }
    },
    100, // 100ms inter-batch pacing — same Helius rate-limit guard as Streamflow.
  );
  console.log(
    `[jupiter-lock] phase 2 decode: ${escrows.length} active escrows from ${pubkeys.length} pubkeys (${chunkErrors} chunk errors)`,
  );

  if (escrows.length === 0) return [];

  // SPL metadata via Jupiter token-list (cached for 30 min).
  const jupiterList = await getJupiterTokenList();
  const decimalsByMint = new Map<string, number>();
  const symbolsByMint  = new Map<string, string>();
  for (const e of escrows) {
    if (decimalsByMint.has(e.tokenMint)) continue;
    const fromJupiter = jupiterList.get(e.tokenMint);
    decimalsByMint.set(e.tokenMint, fromJupiter?.decimals ?? 9);
    symbolsByMint.set(e.tokenMint, fromJupiter?.symbol ?? `${e.tokenMint.slice(0, 4)}…`);
  }

  // Map decoded escrows → VestingStream. Same logic as fetchForChain's
  // tail block, just on bulk data instead of per-wallet output.
  const nowSec = Math.floor(Date.now() / 1000);
  return escrows.map((e): VestingStream => {
    const decimals = decimalsByMint.get(e.tokenMint) ?? 9;
    const symbol   = symbolsByMint.get(e.tokenMint)  ?? `${e.tokenMint.slice(0, 4)}…`;
    const totalAmount = e.cliffUnlockAmount + e.amountPerPeriod * e.numberOfPeriod;
    const withdrawn   = e.totalClaimedAmount;
    const steps = buildUnlockSteps(e);
    const { claimableNow, lockedAmount, isFullyVested } = computeStepVesting(
      totalAmount, withdrawn, steps, nowSec,
    );
    const endTime   = steps.length > 0 ? steps[steps.length - 1].timestamp : e.cliffTime;
    const cliffTime = e.cliffTime > e.vestingStartTime ? e.cliffTime : null;
    return {
      id:              `jupiter-lock-${CHAIN_IDS.SOLANA}-${e.escrowPubkey}`,
      protocol:        "jupiter-lock",
      category:        "vesting",
      chainId:         CHAIN_IDS.SOLANA,
      recipient:       e.recipient,
      tokenAddress:    e.tokenMint,
      tokenSymbol:     symbol,
      tokenDecimals:   decimals,
      totalAmount:     totalAmount.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime:       e.vestingStartTime,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  nextUnlockTimeForSteps(nowSec, steps),
      cancelable:      true,
      shape:           "steps",
      unlockSteps:     steps,
    };
  });
}
