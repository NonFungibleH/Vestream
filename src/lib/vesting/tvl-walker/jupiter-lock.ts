// src/lib/vesting/tvl-walker/jupiter-lock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive Jupiter Lock walker — Solana-only. Jupiter Lock has no subgraph,
// but Solana's `getProgramAccounts` RPC primitive with a discriminator memcmp
// filter returns every VestingEscrow in one call. This is the simplest walker
// in the fleet: one RPC call, decode, aggregate.
//
// Unlike the adapter (which filters by recipient pubkey) we don't want a
// recipient filter — TVL walks enumerate every escrow on-chain. We also need
// the full 296-byte account body (no dataSlice) so we can decode token_mint +
// amount fields.
//
// ─── RPC provider note ──────────────────────────────────────────────────────
// Solana RPC providers impose strict compute-unit (CU) limits on
// `getProgramAccounts`, which is one of the most expensive primitives the RPC
// exposes (it forces the node to scan every account owned by the program).
// Alchemy's free tier is especially aggressive here and will return HTTP 429
// "exceeded its compute units per second capacity" on a single call to a
// program with non-trivial account count — Jupiter Lock easily trips this.
//
// The retry-with-exponential-backoff wrapper below is a band-aid that lets the
// daily TVL cron survive transient rate-limiting on shared infra. For
// production the right path is either:
//   (a) upgrade to a paid Solana RPC plan (Alchemy Growth+, Triton, etc.), or
//   (b) move the Solana endpoint to Helius — their free tier is significantly
//       more generous on `getProgramAccounts` specifically.
// ─────────────────────────────────────────────────────────────────────────────
//
// Program: `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`
// Account layout (offsets include the 8-byte Anchor discriminator prefix):
//   40   token_mint          (Pubkey,  32 bytes)
//  144   cliff_time          (u64 LE,   8 bytes)
//  160   cliff_unlock_amount (u64 LE,   8 bytes)
//  168   amount_per_period   (u64 LE,   8 bytes)
//  176   number_of_period    (u64 LE,   8 bytes)
//  184   total_claimed       (u64 LE,   8 bytes)
//  200   cancelled_at        (u64 LE,   8 bytes — 0 if not cancelled)
//
// Locked math:
//   total    = cliff_unlock_amount + amount_per_period * number_of_period
//   locked   = (cancelled_at > 0) ? 0 : max(0, total - total_claimed)
// This intentionally ignores vesting schedule timing — from a TVL standpoint,
// anything the contract still holds is "locked in the protocol." The
// finer-grained timing math belongs in the wallet-scoped adapter.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Connection,
  PublicKey,
  type AccountInfo,
  type GetProgramAccountsConfig,
  type GetProgramAccountsResponse,
} from "@solana/web3.js";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";

// ─── Program identity + account layout ──────────────────────────────────────

const JUPITER_LOCK_PROGRAM_ID           = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn";
const VESTING_ESCROW_DISCRIMINATOR_BS58 = "hteFiUjrzUz";
const ACCOUNT_SIZE                      = 296;

const OFFSET_TOKEN_MINT           = 40;
const OFFSET_CLIFF_UNLOCK_AMOUNT  = 160;
const OFFSET_AMOUNT_PER_PERIOD    = 168;
const OFFSET_NUMBER_OF_PERIOD     = 176;
const OFFSET_TOTAL_CLAIMED_AMOUNT = 184;
const OFFSET_CANCELLED_AT         = 200;

// ─── Jupiter token-list cache (mirrors adapter pattern, standalone state) ───

const JUPITER_TOKEN_LIST_URL = "https://token.jup.ag/all";
const JUPITER_TTL_MS         = 30 * 60 * 1000;

interface JupiterTokenEntry {
  address:  string;
  symbol:   string;
  decimals: number;
}

let jupiterCache:          Map<string, { symbol: string; decimals: number }> | null = null;
let jupiterCacheFetchedAt: number = 0;

async function getJupiterTokenList(): Promise<Map<string, { symbol: string; decimals: number }>> {
  const now = Date.now();
  if (jupiterCache && now - jupiterCacheFetchedAt < JUPITER_TTL_MS) return jupiterCache;
  try {
    const res = await fetch(JUPITER_TOKEN_LIST_URL, {
      headers: { Accept: "application/json" },
      cache:   "no-store",
    });
    if (!res.ok) return jupiterCache ?? new Map();
    const tokens = (await res.json()) as JupiterTokenEntry[];
    const map    = new Map<string, { symbol: string; decimals: number }>();
    for (const t of tokens) {
      if (t.address && t.symbol) map.set(t.address, { symbol: t.symbol, decimals: t.decimals });
    }
    jupiterCache          = map;
    jupiterCacheFetchedAt = now;
    return map;
  } catch {
    return jupiterCache ?? new Map();
  }
}

// ─── Account decoding ───────────────────────────────────────────────────────

interface DecodedEscrow {
  tokenMint:         string;
  cliffUnlockAmount: bigint;
  amountPerPeriod:   bigint;
  numberOfPeriod:    bigint;
  totalClaimed:      bigint;
  cancelledAt:       bigint;
}

function decodeEscrow(data: Uint8Array): DecodedEscrow | null {
  if (data.length < ACCOUNT_SIZE) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const mintBytes = data.subarray(OFFSET_TOKEN_MINT, OFFSET_TOKEN_MINT + 32);
  let tokenMint: string;
  try {
    tokenMint = new PublicKey(mintBytes).toBase58();
  } catch {
    return null;
  }
  return {
    tokenMint,
    cliffUnlockAmount: dv.getBigUint64(OFFSET_CLIFF_UNLOCK_AMOUNT,  true),
    amountPerPeriod:   dv.getBigUint64(OFFSET_AMOUNT_PER_PERIOD,    true),
    numberOfPeriod:    dv.getBigUint64(OFFSET_NUMBER_OF_PERIOD,     true),
    totalClaimed:      dv.getBigUint64(OFFSET_TOTAL_CLAIMED_AMOUNT, true),
    cancelledAt:       dv.getBigUint64(OFFSET_CANCELLED_AT,         true),
  };
}

// ─── RPC retry wrapper ──────────────────────────────────────────────────────

async function getProgramAccountsWithRetry(
  connection: Connection,
  programId: PublicKey,
  config: GetProgramAccountsConfig,
  maxRetries = 4,
): Promise<GetProgramAccountsResponse | Array<{ pubkey: PublicKey; account: AccountInfo<Buffer> }>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await connection.getProgramAccounts(programId, config);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Only retry on 429 / rate-limit errors. Other errors (network, malformed
      // response) bubble up immediately so we don't waste cycles.
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many requests") || msg.toLowerCase().includes("compute units");
      if (!isRateLimit || attempt === maxRetries - 1) throw err;
      // Exponential backoff: 5s, 10s, 20s, 40s. Solana program scans are
      // expensive on shared free-tier infra; aggressive backoff is correct.
      const delayMs = 5_000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// ─── Walker ─────────────────────────────────────────────────────────────────

export async function walkJupiterLock(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();

  if (chainId !== CHAIN_IDS.SOLANA) {
    return {
      protocol:    "jupiter-lock",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       null,
      elapsedMs:   Date.now() - started,
    };
  }

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    return {
      protocol:    "jupiter-lock",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "SOLANA_RPC_URL not configured",
      elapsedMs:   Date.now() - started,
    };
  }

  let connection: Connection;
  try {
    connection = new Connection(rpcUrl, "confirmed");
  } catch (err) {
    return {
      protocol:    "jupiter-lock",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       `connection construction failed: ${err instanceof Error ? err.message : String(err)}`,
      elapsedMs:   Date.now() - started,
    };
  }

  // 1. One getProgramAccounts call with discriminator filter — no dataSlice
  //    because we need token_mint + amount fields from the full body.
  //    Wrapped in retry-with-exponential-backoff to ride out 429 rate limits
  //    from shared/free-tier RPC infra (see provider note at top of file).
  let accounts: Awaited<ReturnType<typeof connection.getProgramAccounts>>;
  try {
    const programId = new PublicKey(JUPITER_LOCK_PROGRAM_ID);
    accounts = await getProgramAccountsWithRetry(connection, programId, {
      commitment: "confirmed",
      filters: [
        { dataSize: ACCOUNT_SIZE },
        { memcmp: { offset: 0, bytes: VESTING_ESCROW_DISCRIMINATOR_BS58 } },
      ],
    });
  } catch (err) {
    return {
      protocol:    "jupiter-lock",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       `getProgramAccounts failed: ${err instanceof Error ? err.message : String(err)}`,
      elapsedMs:   Date.now() - started,
    };
  }

  // 2. Decode + compute locked per escrow + collect distinct mints
  const lockedPerEscrow: { mint: string; locked: bigint }[] = [];
  const mintSet = new Set<string>();
  const errors: string[] = [];

  for (const { account } of accounts) {
    const data    = account.data instanceof Uint8Array ? account.data : new Uint8Array(account.data as ArrayBufferLike);
    const decoded = decodeEscrow(data);
    if (!decoded) continue;

    // Cancelled escrows have no outstanding obligation — their funds are
    // (in theory) returned / claimable by the creator. Treat as 0 locked.
    if (decoded.cancelledAt > 0n) continue;

    const total  = decoded.cliffUnlockAmount + decoded.amountPerPeriod * decoded.numberOfPeriod;
    const locked = total > decoded.totalClaimed ? total - decoded.totalClaimed : 0n;
    if (locked <= 0n) continue;

    mintSet.add(decoded.tokenMint);
    lockedPerEscrow.push({ mint: decoded.tokenMint, locked });
  }

  // 3. Resolve SPL metadata via Jupiter token list (cached). Fallback to
  //    { short-mint, 6 } when the mint isn't in the Jupiter catalogue.
  let jupiterList: Map<string, { symbol: string; decimals: number }>;
  try {
    jupiterList = await getJupiterTokenList();
  } catch (err) {
    errors.push(`jupiter token list fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    jupiterList = new Map();
  }

  // 4. Aggregate by mint
  const byToken = new Map<string, TokenAggregate>();
  for (const { mint, locked } of lockedPerEscrow) {
    const existing = byToken.get(mint);
    if (existing) {
      existing.lockedAmount = (BigInt(existing.lockedAmount) + locked).toString();
      existing.streamCount += 1;
    } else {
      const meta = jupiterList.get(mint);
      byToken.set(mint, {
        chainId,
        tokenAddress:  mint,
        tokenSymbol:   meta?.symbol  ?? `${mint.slice(0, 4)}...`,
        tokenDecimals: meta?.decimals ?? 6,
        lockedAmount:  locked.toString(),
        streamCount:   1,
      });
    }
  }

  return {
    protocol:    "jupiter-lock",
    chainId,
    tokens:      Array.from(byToken.values()),
    streamCount: lockedPerEscrow.length,
    error:       errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
    elapsedMs:   Date.now() - started,
  };
}
