// src/lib/vesting/tvl-walker/smithii.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive Smithii walker — Solana-only.
//
// Program: `vesFcnNXtfS9JMtspbe9SkMJiRiSPwsywuWMjYwxQ2K`
// Account layout is documented in full in ../adapters/smithii.ts, including
// how each offset was verified. This file only needs the mint at offset 40.
//
// ── Why this walker measures custody directly ────────────────────────────────
// Most walkers infer locked value from schedule arithmetic (total − claimed).
// Smithii stores no claimed field, but it gives us something better: every
// schedule PDA owns exactly one vault, and that vault is the deterministic
// associated token account of (mint, schedulePda). So the locked balance is
// not derived at all — it is READ, straight from the vault the program still
// custodies. That matches the TVL definition the other walkers approximate
// ("whatever the protocol still holds"), without trusting any field.
//
// Decimals are read from each mint account rather than taken from a token
// list. 98% of Smithii's 1,548 mints are unlisted, and a wrong decimals value
// misprices a token by orders of magnitude — the exact failure mode behind the
// TVL inflation incidents this pipeline now guards against.
//
// RPC cost for a full walk: 1 getProgramAccounts + ~21 vault batches + ~16
// mint batches. Program scans are the expensive primitive here, and free-tier
// Solana providers rate-limit them hard, hence the shared backoff wrapper.
// ─────────────────────────────────────────────────────────────────────────────

import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";
import { getJupiterTokenList } from "../adapters/jupiter-lock";

const SMITHII_PROGRAM_ID          = "vesFcnNXtfS9JMtspbe9SkMJiRiSPwsywuWMjYwxQ2K";
const SCHEDULE_DISCRIMINATOR_BS58 = "HpnL8FJtY3S";
const SCHEDULE_SIZE               = 324;
const OFFSET_TOKEN_MINT           = 40;

const CHUNK        = 100;   // getMultipleAccounts hard limit
const CHUNK_DELAY  = 120;   // ms between batches — free-tier CU/s headroom

function empty(chainId: SupportedChainId, started: number, error: string | null): WalkerResult {
  return { protocol: "smithii", chainId, tokens: [], streamCount: 0, error, elapsedMs: Date.now() - started };
}

/** Retry only on rate limiting; other failures surface immediately.
 *  Backoff 5s/10s/20s — program scans are expensive on shared infra. */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const rateLimited = msg.includes("429") || msg.includes("rate limit") ||
                          msg.includes("too many requests") || msg.includes("compute units");
      if (!rateLimited || attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 5_000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

export async function walkSmithii(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();
  if (chainId !== CHAIN_IDS.SOLANA) return empty(chainId, started, null);

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) return empty(chainId, started, "SOLANA_RPC_URL not configured");

  let connection: Connection;
  try {
    connection = new Connection(rpcUrl, "confirmed");
  } catch (err) {
    return empty(chainId, started, `connection: ${String(err)}`);
  }

  // ── 1. Enumerate every schedule, carrying only its mint ───────────────────
  // dataSlice keeps the response at 32 bytes/account instead of 324. The
  // memcmp filter sits at offset 0 while the slice starts at 40; that is safe
  // because the RPC evaluates filters against the FULL account and slices only
  // the returned data. Verified against mainnet: 2,087 accounts returned.
  let accounts: readonly { pubkey: PublicKey; account: { data: Buffer } }[];
  try {
    accounts = await withRetry(() =>
      connection.getProgramAccounts(new PublicKey(SMITHII_PROGRAM_ID), {
        commitment: "confirmed",
        filters: [
          { dataSize: SCHEDULE_SIZE },
          { memcmp: { offset: 0, bytes: SCHEDULE_DISCRIMINATOR_BS58 } },
        ],
        dataSlice: { offset: OFFSET_TOKEN_MINT, length: 32 },
      }),
    );
  } catch (err) {
    return empty(chainId, started, `getProgramAccounts: ${String(err)}`);
  }

  if (accounts.length === 0) {
    // A zero here is almost always the provider refusing the scan rather than
    // an empty program, so report it as a partial walk: the snapshot pipeline
    // then keeps the prior row instead of overwriting real TVL with $0.
    return empty(chainId, started, "program scan returned 0 accounts");
  }

  const schedules: { pubkey: PublicKey; mint: string; vault: PublicKey }[] = [];
  for (const a of accounts) {
    if (a.account.data.length !== 32) continue;
    try {
      const mint = new PublicKey(a.account.data);
      schedules.push({
        pubkey: a.pubkey,
        mint:   mint.toBase58(),
        vault:  getAssociatedTokenAddressSync(mint, a.pubkey, true),
      });
    } catch { /* malformed pubkey — skip */ }
  }
  if (schedules.length === 0) return empty(chainId, started, "no decodable schedules");

  // ── 2. Read what each vault still holds ───────────────────────────────────
  const lockedByMint  = new Map<string, bigint>();
  const countsByMint  = new Map<string, number>();
  let vaultReadErrors = 0;

  for (let i = 0; i < schedules.length; i += CHUNK) {
    const batch = schedules.slice(i, i + CHUNK);
    try {
      const infos = await withRetry(() =>
        connection.getMultipleAccountsInfo(batch.map((b) => b.vault)),
      );
      batch.forEach((b, j) => {
        const info = infos[j];
        // SPL token account: mint(32) owner(32) amount(u64 @64). A missing
        // vault means it was closed after a full claim → nothing locked.
        const bal = info && info.data.length >= 72 ? info.data.readBigUInt64LE(64) : 0n;
        if (bal > 0n) {
          lockedByMint.set(b.mint, (lockedByMint.get(b.mint) ?? 0n) + bal);
          countsByMint.set(b.mint, (countsByMint.get(b.mint) ?? 0) + 1);
        }
      });
    } catch (err) {
      vaultReadErrors++;
      console.warn(`[walker:smithii] vault batch ${i / CHUNK} failed:`, String(err).slice(0, 140));
    }
    await new Promise((r) => setTimeout(r, CHUNK_DELAY));
  }

  const mints = [...lockedByMint.keys()];
  if (mints.length === 0) {
    return empty(chainId, started, vaultReadErrors > 0 ? "all vault reads failed" : null);
  }

  // ── 3. Decimals from the mint accounts themselves ─────────────────────────
  // SPL Mint layout: mint_authority COption<Pubkey>(36) supply u64(8) → u8 @44.
  const decimalsByMint = new Map<string, number>();
  for (let i = 0; i < mints.length; i += CHUNK) {
    const batch = mints.slice(i, i + CHUNK);
    try {
      const infos = await withRetry(() =>
        connection.getMultipleAccountsInfo(batch.map((m) => new PublicKey(m))),
      );
      batch.forEach((m, j) => {
        const info = infos[j];
        if (info && info.data.length > 44) decimalsByMint.set(m, info.data[44]);
      });
    } catch (err) {
      console.warn(`[walker:smithii] mint batch ${i / CHUNK} failed:`, String(err).slice(0, 140));
    }
    await new Promise((r) => setTimeout(r, CHUNK_DELAY));
  }

  const jupiter = await getJupiterTokenList();

  const tokens: TokenAggregate[] = [];
  let skippedUnknownDecimals = 0;
  for (const mint of mints) {
    const decimals = decimalsByMint.get(mint) ?? jupiter.get(mint)?.decimals;
    // Never guess decimals. A default of 9 against a 6-decimal token overstates
    // that token's value 1000x, which is how TVL gets silently inflated.
    if (decimals === undefined) { skippedUnknownDecimals++; continue; }
    tokens.push({
      chainId:       CHAIN_IDS.SOLANA,
      tokenAddress:  mint,
      tokenSymbol:   jupiter.get(mint)?.symbol ?? null,
      tokenDecimals: decimals,
      lockedAmount:  (lockedByMint.get(mint) ?? 0n).toString(),
      streamCount:   countsByMint.get(mint) ?? 0,
    });
  }
  if (skippedUnknownDecimals > 0) {
    console.warn(`[walker:smithii] skipped ${skippedUnknownDecimals} mints with unreadable decimals`);
  }

  const streamCount = tokens.reduce((n, t) => n + t.streamCount, 0);
  console.log(
    `[walker:smithii] schedules=${schedules.length} funded=${streamCount} tokens=${tokens.length} ` +
    `vaultBatchErrors=${vaultReadErrors} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  return {
    protocol:    "smithii",
    chainId,
    tokens,
    streamCount,
    // A partial vault read must not be published as a complete walk.
    error:       vaultReadErrors > 0 ? `${vaultReadErrors} vault batch(es) failed` : null,
    elapsedMs:   Date.now() - started,
  };
}
