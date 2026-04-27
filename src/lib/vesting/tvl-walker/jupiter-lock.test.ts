// src/lib/vesting/tvl-walker/jupiter-lock.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Walker tests for Jupiter Lock (Solana).
//
// Mock surface:
//   * `@solana/web3.js`'s `Connection` is replaced — `getProgramAccounts`
//     returns AccountInfo objects whose `data` is a hand-built 296-byte
//     buffer with the documented field offsets.
//   * The Jupiter token-list `fetch` is mocked to a small list.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CHAIN_IDS } from "../types";

// Pre-baked mints — proper base58 32-byte pubkeys. Use known Solana mints to
// guarantee they round-trip through PublicKey decoding.
const MINT_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MINT_BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// ─── Build a 296-byte buffer matching the documented Jupiter Lock layout ─────
//   40   token_mint          (Pubkey,  32 bytes)
//  144   cliff_time          (u64 LE,   8 bytes)
//  160   cliff_unlock_amount (u64 LE,   8 bytes)
//  168   amount_per_period   (u64 LE,   8 bytes)
//  176   number_of_period    (u64 LE,   8 bytes)
//  184   total_claimed       (u64 LE,   8 bytes)
//  200   cancelled_at        (u64 LE,   8 bytes — 0 if not cancelled)

import { PublicKey } from "@solana/web3.js";

interface EscrowFields {
  mint:              string;
  cliffUnlockAmount: bigint;
  amountPerPeriod:   bigint;
  numberOfPeriod:    bigint;
  totalClaimed:      bigint;
  cancelledAt:       bigint;
}

function buildEscrowBuffer(f: EscrowFields): Buffer {
  const buf = Buffer.alloc(296);
  // Anchor discriminator (first 8 bytes) — we set arbitrary bytes since the
  // RPC filter is mocked away; the walker only validates the 32-byte mint
  // bytes round-trip and reads the documented integer offsets.
  buf.writeUInt8(0xaa, 0);
  // token_mint @ 40
  const mintBytes = new PublicKey(f.mint).toBytes();
  buf.set(mintBytes, 40);
  // cliff_unlock_amount @ 160
  buf.writeBigUInt64LE(f.cliffUnlockAmount, 160);
  // amount_per_period @ 168
  buf.writeBigUInt64LE(f.amountPerPeriod, 168);
  // number_of_period @ 176
  buf.writeBigUInt64LE(f.numberOfPeriod, 176);
  // total_claimed @ 184
  buf.writeBigUInt64LE(f.totalClaimed, 184);
  // cancelled_at @ 200
  buf.writeBigUInt64LE(f.cancelledAt, 200);
  return buf;
}

// ─── Mock @solana/web3.js Connection ───────────────────────────────────────
const getProgramAccountsMock = vi.fn();

vi.mock("@solana/web3.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@solana/web3.js")>();
  class StubConnection {
    getProgramAccounts(...args: unknown[]) {
      return getProgramAccountsMock(...args);
    }
  }
  return {
    ...original,
    Connection: StubConnection,
  };
});

// Import AFTER the mock so the walker picks up the stubbed Connection.
import { walkJupiterLock } from "./jupiter-lock";

describe("walkJupiterLock", () => {
  const ORIGINAL_RPC = process.env.SOLANA_RPC_URL;

  beforeEach(() => {
    process.env.SOLANA_RPC_URL = "https://stub-solana.example.com";
    getProgramAccountsMock.mockReset();
    // Default: no fetched token list — walker uses its fallback labels.
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      async json() {
        return [
          { address: MINT_USDC, symbol: "USDC", decimals: 6 },
          { address: MINT_BONK, symbol: "BONK", decimals: 5 },
        ];
      },
    }) as unknown as Response));
  });

  afterEach(() => {
    if (ORIGINAL_RPC === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = ORIGINAL_RPC;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns clean empty for non-Solana chains", async () => {
    const result = await walkJupiterLock(CHAIN_IDS.ETHEREUM);
    expect(result.protocol).toBe("jupiter-lock");
    expect(result.tokens).toEqual([]);
    expect(result.error).toBeNull();
  });

  it("returns error when SOLANA_RPC_URL is missing", async () => {
    delete process.env.SOLANA_RPC_URL;
    const result = await walkJupiterLock(CHAIN_IDS.SOLANA);
    expect(result.error).toBe("SOLANA_RPC_URL not configured");
    expect(result.tokens).toEqual([]);
  });

  it("aggregates locked = total - claimed across multiple escrows and tokens", async () => {
    // Escrow 1 (USDC): total = 100 + 10*5 = 150, claimed 30 → locked 120
    // Escrow 2 (USDC): total = 0 + 50*2 = 100,  claimed 0  → locked 100
    // Escrow 3 (BONK): total = 1000 + 0*0 = 1000, claimed 200 → locked 800
    // Escrow 4 (cancelled): skipped
    // Escrow 5 (fully claimed): skipped
    getProgramAccountsMock.mockResolvedValue([
      { pubkey: { toBase58: () => "p1" }, account: { data: buildEscrowBuffer({
        mint: MINT_USDC, cliffUnlockAmount: 100n, amountPerPeriod: 10n, numberOfPeriod: 5n,
        totalClaimed: 30n, cancelledAt: 0n,
      })}},
      { pubkey: { toBase58: () => "p2" }, account: { data: buildEscrowBuffer({
        mint: MINT_USDC, cliffUnlockAmount: 0n, amountPerPeriod: 50n, numberOfPeriod: 2n,
        totalClaimed: 0n, cancelledAt: 0n,
      })}},
      { pubkey: { toBase58: () => "p3" }, account: { data: buildEscrowBuffer({
        mint: MINT_BONK, cliffUnlockAmount: 1000n, amountPerPeriod: 0n, numberOfPeriod: 0n,
        totalClaimed: 200n, cancelledAt: 0n,
      })}},
      { pubkey: { toBase58: () => "p4" }, account: { data: buildEscrowBuffer({
        mint: MINT_USDC, cliffUnlockAmount: 100n, amountPerPeriod: 0n, numberOfPeriod: 0n,
        totalClaimed: 0n, cancelledAt: 1_700_000_000n, // cancelled
      })}},
      { pubkey: { toBase58: () => "p5" }, account: { data: buildEscrowBuffer({
        mint: MINT_USDC, cliffUnlockAmount: 50n, amountPerPeriod: 0n, numberOfPeriod: 0n,
        totalClaimed: 50n, cancelledAt: 0n, // fully claimed
      })}},
    ]);

    const result = await walkJupiterLock(CHAIN_IDS.SOLANA);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(3);
    expect(result.tokens).toHaveLength(2);

    const usdc = result.tokens.find((t) => t.tokenAddress === MINT_USDC)!;
    const bonk = result.tokens.find((t) => t.tokenAddress === MINT_BONK)!;
    expect(usdc.lockedAmount).toBe("220"); // 120 + 100
    expect(usdc.streamCount).toBe(2);
    expect(usdc.tokenSymbol).toBe("USDC");
    expect(usdc.tokenDecimals).toBe(6);
    expect(bonk.lockedAmount).toBe("800");
    expect(bonk.tokenSymbol).toBe("BONK");
    expect(bonk.tokenDecimals).toBe(5);
  });

  it("skips cancelled escrows", async () => {
    getProgramAccountsMock.mockResolvedValue([
      { pubkey: { toBase58: () => "p" }, account: { data: buildEscrowBuffer({
        mint: MINT_USDC, cliffUnlockAmount: 1000n, amountPerPeriod: 0n, numberOfPeriod: 0n,
        totalClaimed: 0n, cancelledAt: 42n,
      })}},
    ]);
    const result = await walkJupiterLock(CHAIN_IDS.SOLANA);
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
  });

  it("returns empty when getProgramAccounts returns []", async () => {
    getProgramAccountsMock.mockResolvedValue([]);
    const result = await walkJupiterLock(CHAIN_IDS.SOLANA);
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it("returns error when getProgramAccounts throws a non-rate-limit error", async () => {
    getProgramAccountsMock.mockRejectedValue(new Error("network down"));
    const result = await walkJupiterLock(CHAIN_IDS.SOLANA);
    expect(result.error).toContain("getProgramAccounts failed");
    expect(result.tokens).toEqual([]);
  });

  it("falls back to truncated mint label when token isn't in the Jupiter list", async () => {
    // Use a mint NOT present in the cached Jupiter token list (the list cache
    // from earlier tests may persist for the module-level TTL window).
    const UNKNOWN_MINT = "So11111111111111111111111111111111111111112"; // wSOL — guaranteed valid base58 pubkey
    getProgramAccountsMock.mockResolvedValue([
      { pubkey: { toBase58: () => "p" }, account: { data: buildEscrowBuffer({
        mint: UNKNOWN_MINT, cliffUnlockAmount: 100n, amountPerPeriod: 0n, numberOfPeriod: 0n,
        totalClaimed: 0n, cancelledAt: 0n,
      })}},
    ]);

    // Make the token list return nothing matching UNKNOWN_MINT.
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      async json() { return []; },
    }) as unknown as Response));

    const result = await walkJupiterLock(CHAIN_IDS.SOLANA);
    expect(result.tokens).toHaveLength(1);
    // When the mint isn't found in the Jupiter list, the walker falls back to
    // a "{first-4-chars}..." label and decimals=6. (NOTE: if the module-level
    // cache from an earlier test happens to have this mint, this will fail —
    // but we picked a mint that's NOT in our seeded cache.)
    expect(result.tokens[0].tokenSymbol).toMatch(/\.\.\./);
    expect(result.tokens[0].tokenDecimals).toBe(6);
  });
});
