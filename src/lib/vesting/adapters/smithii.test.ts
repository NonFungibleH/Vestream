// src/lib/vesting/adapters/smithii.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Struct tests for the Smithii schedule account (Solana).
//
// Smithii publishes no Anchor IDL, so the layout in smithii.ts was reverse-
// engineered from mainnet. That makes these tests unusually load-bearing: they
// are the only thing standing between a future refactor and a silently wrong
// index. The primary fixture is therefore a REAL account captured from mainnet
// (1SpyqkFjCYXQ31VoHVCih8S3RYbPbvQnXFFfqKzpGYG), not a hand-built buffer — a
// synthetic buffer would only prove the decoder agrees with itself.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { decodeSmithiiSchedule, toVestingStream } from "./smithii";
import { CHAIN_IDS } from "../types";

// Captured 2026-09-14 via getAccountInfo. 324 bytes, base64.
const REAL_ACCOUNT_B64 =
  "ZJVCil/IgPH9U3cgPAhBYzoqZ3fXgQ4XyTxQA1b34zbG0h1v+/ZFQaAN6WLqm1hjDfTmq6+Fuv8N4sHjeA49Omx6zOuek8gjALAnXwKuCQCnkQ5pAAAAAEh9OGsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const REAL_PUBKEY = "1SpyqkFjCYXQ31VoHVCih8S3RYbPbvQnXFFfqKzpGYG";
const realBuf = () => Buffer.from(REAL_ACCOUNT_B64, "base64");

describe("decodeSmithiiSchedule — real mainnet account", () => {
  it("decodes every field to the values observed on chain", () => {
    const d = decodeSmithiiSchedule(REAL_PUBKEY, realBuf());
    expect(d).not.toBeNull();
    expect(d!.beneficiary).toBe("J3sxxFTLAqCUTwp6smm5DhfJzeFFXvKd8i3W5q4Bx11i");
    expect(d!.tokenMint).toBe("BmnY3NsRjQFg9NZkPYWwzodi9PZ76kgDwFtk1W9g68fL");
    expect(d!.totalAmount).toBe(2_724_600_000_000_000n);
    expect(d!.startTime).toBe(1762562471);
    expect(d!.endTime).toBe(1798864200);
    // Merkle root is all zero → a direct (non-Merkle) schedule.
    expect(d!.isMerkle).toBe(false);
  });

  it("is 324 bytes and carries the expected discriminator", () => {
    const b = realBuf();
    expect(b.length).toBe(324);
    expect(b.subarray(0, 8).toString("hex")).toBe("6495428a5fc880f1");
  });

  it("keeps the beneficiary and mint distinct", () => {
    // Guards a copy-paste offset slip: 8 and 40 must not read the same pubkey.
    const d = decodeSmithiiSchedule(REAL_PUBKEY, realBuf())!;
    expect(d.beneficiary).not.toBe(d.tokenMint);
  });
});

describe("decodeSmithiiSchedule — rejections", () => {
  it("rejects an account with a foreign discriminator", () => {
    const b = realBuf();
    b.writeUInt8(0x00, 0);
    expect(decodeSmithiiSchedule(REAL_PUBKEY, b)).toBeNull();
  });

  it("rejects a truncated account", () => {
    expect(decodeSmithiiSchedule(REAL_PUBKEY, realBuf().subarray(0, 200))).toBeNull();
  });

  it("rejects an end time beyond the year 2100", () => {
    // 19 live schedules look like this: sane start, absurd end (year 4000+).
    // Indexing them would park real balances as locked-forever and inflate TVL.
    const b = realBuf();
    b.writeBigInt64LE(64_087_833_600n, 88);
    expect(decodeSmithiiSchedule(REAL_PUBKEY, b)).toBeNull();
  });

  it("rejects a schedule that ends before it starts", () => {
    const b = realBuf();
    b.writeBigInt64LE(BigInt(1762562471 - 9), 88);
    expect(decodeSmithiiSchedule(REAL_PUBKEY, b)).toBeNull();
  });

  it("accepts a schedule ending just inside the plausible window", () => {
    const b = realBuf();
    b.writeBigInt64LE(4_102_444_000n, 88);
    expect(decodeSmithiiSchedule(REAL_PUBKEY, b)).not.toBeNull();
  });
});

describe("toVestingStream — withdrawn derives from the vault", () => {
  const base = () => decodeSmithiiSchedule(REAL_PUBKEY, realBuf())!;
  const meta = { symbol: "TEST", decimals: 8 };
  const midway = 1762562471 + Math.floor((1798864200 - 1762562471) / 2);

  it("treats the shortfall against the vault as claimed", () => {
    const s = base();
    const stillHeld = s.totalAmount - 600_000n;
    const out = toVestingStream(s, stillHeld, meta, midway);
    expect(out.withdrawnAmount).toBe("600000");
  });

  it("reports nothing claimed when the vault still holds the full amount", () => {
    const s = base();
    const out = toVestingStream(s, s.totalAmount, meta, midway);
    expect(out.withdrawnAmount).toBe("0");
  });

  it("reports everything claimed when the vault has been drained", () => {
    const s = base();
    const out = toVestingStream(s, 0n, meta, midway);
    expect(out.withdrawnAmount).toBe(s.totalAmount.toString());
  });

  it("assumes nothing claimed when the vault read failed", () => {
    // Overstating locked is the safe direction; inventing a claimed figure is not.
    const out = toVestingStream(base(), undefined, meta, midway);
    expect(out.withdrawnAmount).toBe("0");
  });

  it("never reports negative withdrawn if a vault holds more than the total", () => {
    const s = base();
    const out = toVestingStream(s, s.totalAmount + 1_000n, meta, midway);
    expect(out.withdrawnAmount).toBe("0");
  });

  it("keeps the outstanding parts within the total", () => {
    // claimable + locked is the amount still owed to the recipient, and it can
    // never exceed the allocation. Note the THREE-way sum (plus withdrawn) can
    // legitimately exceed the total: lockedAmount is "not yet vested", so when
    // a vault is drained faster than the schedule vests, the already-withdrawn
    // slice overlaps the not-yet-vested one. That is shared computeLinearVesting
    // semantics across every adapter, not a Smithii quirk.
    const s = base();
    const out = toVestingStream(s, s.totalAmount / 2n, meta, midway);
    const outstanding = BigInt(out.claimableNow) + BigInt(out.lockedAmount);
    expect(outstanding).toBeLessThanOrEqual(BigInt(out.totalAmount));
    expect(BigInt(out.withdrawnAmount)).toBeLessThanOrEqual(BigInt(out.totalAmount));
  });

  it("carries Solana identity and a stable composite id", () => {
    const out = toVestingStream(base(), 0n, meta, midway);
    expect(out.protocol).toBe("smithii");
    expect(out.chainId).toBe(CHAIN_IDS.SOLANA);
    expect(out.id).toBe(`smithii-${CHAIN_IDS.SOLANA}-${REAL_PUBKEY}`);
    expect(out.category).toBe("vesting");
  });

  it("locks nothing once the end time has passed", () => {
    const out = toVestingStream(base(), 0n, meta, 1798864200 + 1);
    expect(out.isFullyVested).toBe(true);
    expect(out.lockedAmount).toBe("0");
    expect(out.nextUnlockTime).toBeNull();
  });

  it("points at the start date before vesting opens", () => {
    const out = toVestingStream(base(), undefined, meta, 1762562471 - 100);
    expect(out.nextUnlockTime).toBe(1762562471);
    expect(out.claimableNow).toBe("0");
  });
});
