// src/lib/vesting/adapters/jupiter-lock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Jupiter Lock adapter — Solana, 9th TokenVest protocol.
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
  const escrows: DecodedEscrow[] = [];
  await Promise.all(
    wallets.map(async (wallet) => {
      try {
        new PublicKey(wallet);
      } catch {
        return; // invalid pubkey — skip
      }

      try {
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
      } catch (err) {
        console.error(`[jupiter-lock] fetch failed for ${wallet}:`, err);
      }
    }),
  );

  if (escrows.length === 0) return [];

  // Batch-fetch SPL metadata for every unique mint, same pattern as Streamflow.
  const uniqueMints = [...new Set(escrows.map((e) => e.tokenMint))];
  const jupiterList = await getJupiterTokenList();

  const decimalsByMint = new Map<string, number>();
  const symbolsByMint  = new Map<string, string>();

  await Promise.all(
    uniqueMints.map(async (mint) => {
      const fromJupiter = jupiterList.get(mint);
      try {
        const mintInfo = await getMint(connection, new PublicKey(mint));
        decimalsByMint.set(mint, mintInfo.decimals);
      } catch {
        decimalsByMint.set(mint, fromJupiter?.decimals ?? 9);
      }
      symbolsByMint.set(mint, fromJupiter?.symbol ?? `${mint.slice(0, 4)}…`);
    }),
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
