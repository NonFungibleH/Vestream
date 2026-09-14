// src/lib/vesting/adapters/smithii.ts
// ─────────────────────────────────────────────────────────────────────────────
// Smithii Token Vesting adapter — Solana.
//
// Smithii is a no-code token toolkit. Its tools span several chains, but
// VESTING IS SOLANA-ONLY (the EVM side is token creation and management).
// The vesting program is Halborn-audited (March–April 2025, no critical or
// high findings).
//
// Program: `vesFcnNXtfS9JMtspbe9SkMJiRiSPwsywuWMjYwxQ2K`
//
// ── How this layout was established (2026-09-14) ─────────────────────────────
// Smithii publishes NO Anchor IDL — the IDL PDA does not exist on chain. So the
// struct was derived from the data and each field verified against mainnet,
// rather than guessed. Guessing is how you ship confident garbage: a mismatched
// struct on UNCX/Robinhood silently produced zero TVL the same week this was
// written.
//
//   • 2,840 program accounts: 2,087 of size 324 (schedules) and 753 of size 9
//     (Merkle claim receipts — they carry no pubkey, so no use to us).
//   • offset 40 resolves to an account owned by the SPL Token program whose
//     parsed type is "mint" → token mint.
//   • offsets 80 and 88 are unix timestamps on every sampled account, with
//     start < end holding in all of them and dates spread across 2024–2027
//     rather than clustered → start_time / end_time.
//   • offset 72 is a plausible base-unit amount and equals the live balance of
//     the schedule's vault (below) on an unclaimed schedule → total_amount.
//   • offset 8 holds 1,938 DISTINCT wallets across 2,087 schedules, 94% of them
//     appearing exactly once, and sampled values are system-owned accounts. A
//     creator field would cluster heavily (one project, many schedules); this
//     distribution is a BENEFICIARY. That is what makes Smithii per-wallet
//     attributable rather than pool-only like Team Finance.
//   • offsets 96..128 are a Merkle root — zero on ~3 of 4 sampled schedules
//     (direct mode), set on the rest (Merkle distribution mode).
//
// ── Claimed amounts ──────────────────────────────────────────────────────────
// There is NO claimed/released field in the schedule: every candidate offset
// failed the `0 < value <= total` invariant on more than 9% of accounts, which
// is just Merkle-root bytes occasionally passing by chance. Claims live in the
// 9-byte receipt accounts, which carry no amount.
//
// So we read the truth instead. The schedule PDA owns exactly one token
// account, and it IS the deterministic associated token account of
// (mint, schedulePda) — verified byte for byte against the real on-chain vault.
// Its live balance is what the schedule still holds, so
//     withdrawn = total_amount - vault_balance
// which needs no trust in an undocumented field and batches through
// getMultipleAccounts instead of one RPC round trip per schedule.
// ─────────────────────────────────────────────────────────────────────────────

import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  computeLinearVesting,
} from "../types";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { mapBounded, getSolanaRpcUrls } from "../rpc";
import { getJupiterTokenList } from "./jupiter-lock";

export const SMITHII_PROGRAM_ID = "vesFcnNXtfS9JMtspbe9SkMJiRiSPwsywuWMjYwxQ2K";

/** Anchor account discriminator for the 324-byte schedule account. */
const SCHEDULE_DISCRIMINATOR = Buffer.from("6495428a5fc880f1", "hex");
/** base58 of the 8 bytes above, precomputed so bs58 stays out of the bundle.
 *  NOT the first 11 chars of the base58 of a padded 32-byte value — base58 is
 *  not positional across byte boundaries, and that shortcut yields
 *  "7mdn1VmNCQt", which matches nothing and fails silently. */
const SCHEDULE_DISCRIMINATOR_BS58 = "HpnL8FJtY3S";
const SCHEDULE_SIZE = 324;

const OFF_BENEFICIARY = 8;
const OFF_MINT        = 40;
const OFF_TOTAL       = 72;
const OFF_START       = 80;
const OFF_END         = 88;
const OFF_MERKLE      = 96;   // 32 bytes; all-zero = direct (non-Merkle) schedule

// Helius free-tier CU/s ceiling — same constants as streamflow.ts/jupiter-lock.ts.
const SOLANA_CONCURRENCY    = 4;
const SOLANA_BATCH_DELAY_MS = 100;
const MULTI_ACCOUNT_CHUNK   = 100;   // getMultipleAccounts hard limit

// Sanity window for timestamps: 2020-01-01 → 2100-01-01.
//
// This rejects 19 of the 2,087 live schedules (0.9%), and they are bad DATA,
// not bad decoding — every one has a sane, recent start time and a nonsensical
// end: years 2125, 4000, even 20,000, plus three that end seconds BEFORE they
// start. Including them would park real balances as locked-until-forever and
// inflate TVL, the same failure mode as the absurd-price guard in
// tvl-snapshot.ts. The count is logged rather than silently swallowed so the
// omission stays visible if that ratio ever moves.
const MIN_PLAUSIBLE_TS = 1_577_836_800;
const MAX_PLAUSIBLE_TS = 4_102_444_800;

export interface DecodedSmithiiSchedule {
  schedulePubkey: string;
  beneficiary:    string;
  tokenMint:      string;
  totalAmount:    bigint;
  startTime:      number;
  endTime:        number;
  isMerkle:       boolean;
}

export function decodeSmithiiSchedule(pubkey: string, data: Buffer): DecodedSmithiiSchedule | null {
  if (data.length < SCHEDULE_SIZE) return null;
  if (!data.subarray(0, 8).equals(SCHEDULE_DISCRIMINATOR)) return null;

  const startTime = Number(data.readBigInt64LE(OFF_START));
  const endTime   = Number(data.readBigInt64LE(OFF_END));
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  if (startTime < MIN_PLAUSIBLE_TS || endTime < startTime || endTime > MAX_PLAUSIBLE_TS) return null;

  return {
    schedulePubkey: pubkey,
    beneficiary: new PublicKey(data.subarray(OFF_BENEFICIARY, OFF_BENEFICIARY + 32)).toBase58(),
    tokenMint:   new PublicKey(data.subarray(OFF_MINT, OFF_MINT + 32)).toBase58(),
    totalAmount: data.readBigUInt64LE(OFF_TOTAL),
    startTime,
    endTime,
    isMerkle:    !data.subarray(OFF_MERKLE, OFF_MERKLE + 32).every((b) => b === 0),
  };
}

/**
 * Live vault balance per schedule, batched.
 *
 * Deriving the vault as the ATA of (mint, schedulePda, allowOwnerOffCurve)
 * means balances come back through getMultipleAccounts in chunks of 100 rather
 * than one getTokenAccountsByOwner call per schedule.
 *
 * A missing vault means the account was closed after a full claim, so the
 * remaining balance is zero — that is data, not an error.
 */
async function readVaultBalances(
  conn: Connection,
  schedules: DecodedSmithiiSchedule[],
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();

  const derived = schedules
    .map((s) => {
      try {
        return {
          pubkey: s.schedulePubkey,
          ata: getAssociatedTokenAddressSync(
            new PublicKey(s.tokenMint), new PublicKey(s.schedulePubkey), true,
          ),
        };
      } catch { return null; }
    })
    .filter((d): d is { pubkey: string; ata: PublicKey } => d !== null);

  const chunks: { pubkey: string; ata: PublicKey }[][] = [];
  for (let i = 0; i < derived.length; i += MULTI_ACCOUNT_CHUNK) {
    chunks.push(derived.slice(i, i + MULTI_ACCOUNT_CHUNK));
  }

  await mapBounded(chunks, SOLANA_CONCURRENCY, async (chunk) => {
    const infos = await conn.getMultipleAccountsInfo(chunk.map((c) => c.ata));
    chunk.forEach((c, i) => {
      const info = infos[i];
      // SPL token account layout: mint(32) owner(32) amount(u64 @64).
      out.set(c.pubkey, info && info.data.length >= 72 ? info.data.readBigUInt64LE(64) : 0n);
    });
  }, SOLANA_BATCH_DELAY_MS);

  return out;
}

/** Mint decimals read straight off the mint account, batched.
 *  SPL Mint layout: mint_authority COption<Pubkey>(36) supply u64(8) → u8 @44.
 *  Read on-chain rather than from the Jupiter list so UNLISTED tokens — most of
 *  what a vesting tool locks — still get correct decimals. */
async function readMintDecimals(conn: Connection, mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += MULTI_ACCOUNT_CHUNK) {
    chunks.push(mints.slice(i, i + MULTI_ACCOUNT_CHUNK));
  }
  await mapBounded(chunks, SOLANA_CONCURRENCY, async (chunk) => {
    const infos = await conn.getMultipleAccountsInfo(chunk.map((m) => new PublicKey(m)));
    chunk.forEach((m, i) => {
      const info = infos[i];
      if (info && info.data.length > 44) out.set(m, info.data[44]);
    });
  }, SOLANA_BATCH_DELAY_MS);
  return out;
}

/** Decoded schedule + live vault balance → the canonical VestingStream. */
export function toVestingStream(
  s: DecodedSmithiiSchedule,
  vaultBalance: bigint | undefined,
  meta: { symbol: string; decimals: number },
  nowSec: number,
): VestingStream {
  // withdrawn = total − what the vault still holds. When the vault read failed
  // we do NOT invent a number: assume nothing claimed, which overstates locked
  // rather than understating it — the same direction of error as every other
  // unclaimed-tail figure on the site.
  const remaining = vaultBalance ?? s.totalAmount;
  const withdrawn = s.totalAmount > remaining ? s.totalAmount - remaining : 0n;

  const { claimableNow, lockedAmount, isFullyVested } = computeLinearVesting(
    s.totalAmount, withdrawn, s.startTime, s.endTime, nowSec,
  );

  return {
    id:              `smithii-${CHAIN_IDS.SOLANA}-${s.schedulePubkey}`,
    protocol:        "smithii",
    category:        "vesting",
    chainId:         CHAIN_IDS.SOLANA,
    recipient:       s.beneficiary,
    tokenAddress:    s.tokenMint,
    tokenSymbol:     meta.symbol,
    tokenDecimals:   meta.decimals,
    totalAmount:     s.totalAmount.toString(),
    withdrawnAmount: withdrawn.toString(),
    claimableNow:    claimableNow.toString(),
    lockedAmount:    lockedAmount.toString(),
    startTime:       s.startTime,
    endTime:         s.endTime,
    // The account carries no separate cliff field, so there is nothing honest
    // to report here — a fabricated cliff would gate claimable tokens wrongly.
    cliffTime:       null,
    isFullyVested,
    nextUnlockTime:  isFullyVested ? null : (nowSec < s.startTime ? s.startTime : null),
    cancelable:      false,
    shape:           "linear",
    lockTxHash:      null,
  };
}

/** Decode a batch, counting rejects so a decode regression shows up in logs
 *  instead of quietly shrinking the index. */
function decodeMany(entries: { pubkey: string; data: Buffer }[]): DecodedSmithiiSchedule[] {
  const rows: DecodedSmithiiSchedule[] = [];
  let rejected = 0;
  for (const e of entries) {
    const d = decodeSmithiiSchedule(e.pubkey, e.data);
    if (d) rows.push(d); else rejected++;
  }
  if (rejected > 0) {
    console.info(`[smithii] skipped ${rejected}/${entries.length} schedules with implausible vesting windows`);
  }
  return rows;
}

/** Attach symbols/decimals to decoded schedules and convert. Shared by the
 *  per-wallet fetch and the bulk seeder so both produce identical rows. */
async function hydrate(
  conn: Connection,
  schedules: DecodedSmithiiSchedule[],
): Promise<VestingStream[]> {
  const mints = [...new Set(schedules.map((s) => s.tokenMint))];
  const [vaults, decimalsByMint, jupiter] = await Promise.all([
    readVaultBalances(conn, schedules),
    readMintDecimals(conn, mints),
    getJupiterTokenList(),
  ]);

  const nowSec = Math.floor(Date.now() / 1000);
  return schedules.map((s) => {
    const listed = jupiter.get(s.tokenMint);
    const meta = {
      symbol:   listed?.symbol ?? `${s.tokenMint.slice(0, 4)}…`,
      decimals: decimalsByMint.get(s.tokenMint) ?? listed?.decimals ?? 9,
    };
    return toVestingStream(s, vaults.get(s.schedulePubkey), meta, nowSec);
  });
}

function solanaConnection(): Connection | null {
  const urls = getSolanaRpcUrls();
  if (urls.length === 0) return null;
  return new Connection(urls[0], "confirmed");
}

async function fetchForChain(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<VestingStream[]> {
  if (chainId !== CHAIN_IDS.SOLANA) return [];
  if (process.env.SOLANA_ENABLED !== "true") return [];
  if (wallets.length === 0) return [];

  const conn = solanaConnection();
  if (!conn) return [];

  // One getProgramAccounts per wallet, memcmp-filtered on the beneficiary —
  // same shape as Jupiter Lock. Cheap because the filter is server-side.
  const found: DecodedSmithiiSchedule[] = [];
  const results = await mapBounded(wallets, SOLANA_CONCURRENCY, async (wallet) => {
    const accs = await conn.getProgramAccounts(new PublicKey(SMITHII_PROGRAM_ID), {
      filters: [
        { dataSize: SCHEDULE_SIZE },
        { memcmp: { offset: 0, bytes: SCHEDULE_DISCRIMINATOR_BS58 } },
        { memcmp: { offset: OFF_BENEFICIARY, bytes: wallet } },
      ],
    });
    return decodeMany(accs.map((a) => ({ pubkey: a.pubkey.toBase58(), data: a.account.data as Buffer })));
  }, SOLANA_BATCH_DELAY_MS);

  for (const r of results) {
    if (r.status === "fulfilled") found.push(...r.value);
    else console.warn("[smithii] wallet scan failed:", String(r.reason).slice(0, 140));
  }

  if (found.length === 0) return [];
  return hydrate(conn, found);
}

export const smithiiAdapter: VestingAdapter = {
  id:                "smithii",
  name:              "Smithii",
  supportedChainIds: [CHAIN_IDS.SOLANA],
  fetch:             fetchForChain,
};

/**
 * Every Smithii schedule on the program, for the seeder / TVL walker.
 *
 * Two-phase like Jupiter Lock: Phase 1 pulls only the 8-byte discriminator
 * slice to enumerate pubkeys without hauling ~676KB in one response, Phase 2
 * refetches the full accounts in chunks. Note the dataSlice is {0,8} and not
 * {0,0}: the RPC applies the slice BEFORE evaluating memcmp filters, so a
 * zero-length slice leaves the filter nothing to match against.
 */
export async function fetchAllSmithiiSchedules(): Promise<VestingStream[]> {
  if (process.env.SOLANA_ENABLED !== "true") return [];
  const conn = solanaConnection();
  if (!conn) return [];

  const keys = await conn.getProgramAccounts(new PublicKey(SMITHII_PROGRAM_ID), {
    dataSlice: { offset: 0, length: 8 },
    filters: [
      { dataSize: SCHEDULE_SIZE },
      { memcmp: { offset: 0, bytes: SCHEDULE_DISCRIMINATOR_BS58 } },
    ],
  });
  if (keys.length === 0) return [];

  const chunks: PublicKey[][] = [];
  for (let i = 0; i < keys.length; i += MULTI_ACCOUNT_CHUNK) {
    chunks.push(keys.slice(i, i + MULTI_ACCOUNT_CHUNK).map((k) => k.pubkey));
  }

  const decoded: DecodedSmithiiSchedule[] = [];
  const results = await mapBounded(chunks, SOLANA_CONCURRENCY, async (chunk) => {
    const infos = await conn.getMultipleAccountsInfo(chunk);
    const present: { pubkey: string; data: Buffer }[] = [];
    chunk.forEach((k, i) => {
      const info = infos[i];
      if (info) present.push({ pubkey: k.toBase58(), data: info.data });
    });
    return decodeMany(present);
  }, SOLANA_BATCH_DELAY_MS);

  for (const r of results) {
    if (r.status === "fulfilled") decoded.push(...r.value);
    else console.warn("[smithii] bulk chunk failed:", String(r.reason).slice(0, 140));
  }

  if (decoded.length === 0) return [];
  return hydrate(conn, decoded);
}
