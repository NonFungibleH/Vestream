import { describe, it, expect, vi } from "vitest";
import { toUnlockRows, usdValueForTranche, priceForTranche, mergeUnlockAndClaim } from "./unlock-events";
import type { MergeUnlockInput, MergeClaimInput } from "./unlock-events";
import type { VestingStream } from "./types";

vi.mock("./historical-prices", () => ({
  getHistoricalPrice: vi.fn(),
}));
import { getHistoricalPrice } from "./historical-prices";
const mockPrice = vi.mocked(getHistoricalPrice);

const DAY = 86_400;

// Minimal stream fixture — same shape as unlock-schedule.test.ts's mk.
function mk(o: Partial<VestingStream>): VestingStream {
  return {
    id: o.id ?? "sablier-1-1",
    protocol: o.protocol ?? "sablier",
    chainId: o.chainId ?? 1,
    // Real EIP-55-checksummed addresses (vitalik.eth + WETH) — normaliseAddress
    // only lowercases strings viem recognises as valid EVM addresses.
    recipient: o.recipient ?? "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    tokenAddress: o.tokenAddress ?? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    tokenSymbol: o.tokenSymbol ?? "TKN",
    tokenDecimals: o.tokenDecimals ?? 18,
    totalAmount: o.totalAmount ?? "1000",
    withdrawnAmount: "0",
    claimableNow: "0",
    lockedAmount: o.lockedAmount ?? "1000",
    startTime: o.startTime ?? 0,
    endTime: o.endTime ?? 365 * DAY,
    cliffTime: o.cliffTime ?? null,
    isFullyVested: false,
    nextUnlockTime: null,
    shape: o.shape ?? "linear",
    unlockSteps: o.unlockSteps,
  } as VestingStream;
}

function steppedStream(opts: { id: string; steps: number }): VestingStream {
  const unlockSteps = Array.from({ length: opts.steps }, (_, i) => ({
    timestamp: (i + 1) * 1000,
    amount: "100",
  }));
  return mk({ id: opts.id, protocol: "hedgey", shape: "steps", totalAmount: String(opts.steps * 100), unlockSteps });
}

function linearStream(): VestingStream {
  return mk({ id: "sablier-1-99", shape: "linear", startTime: 0, endTime: 365 * DAY, cliffTime: null });
}

describe("toUnlockRows", () => {
  it("maps a wallet's discrete streams to unlock rows (one per tranche, unpriced)", () => {
    const rows = toUnlockRows("user-1", [steppedStream({ id: "hedgey-1-42", steps: 3 }), linearStream()]);
    expect(rows).toHaveLength(3); // linear contributes 0
    expect(rows.every((r) => r.priceConfidence === "missing" && r.usdValueAtUnlock === null)).toBe(true);
    expect(new Set(rows.map((r) => r.trancheKey)).size).toBe(3); // unique keys
  });

  it("carries stream metadata and normalises addresses (EVM lowercased)", () => {
    const [row] = toUnlockRows("user-1", [steppedStream({ id: "hedgey-1-42", steps: 1 })]);
    expect(row.userId).toBe("user-1");
    expect(row.streamId).toBe("hedgey-1-42");
    expect(row.protocol).toBe("hedgey");
    expect(row.chainId).toBe(1);
    expect(row.recipient).toBe("0xd8da6bf26964af9d7eed9e03e53415d37aa96045"); // EVM lowercased
    expect(row.tokenAddress).toBe("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
    expect(row.tokenSymbol).toBe("TKN");
    expect(row.tokenDecimals).toBe(18);
    expect(row.amount).toBe("100");
    expect(row.manualPrice).toBe(false);
  });

  it("converts unlock seconds to a Date for the timestamp column", () => {
    const [row] = toUnlockRows("user-1", [steppedStream({ id: "hedgey-1-42", steps: 1 })]);
    expect(row.unlockTime).toBeInstanceOf(Date);
    expect(row.unlockTime.getTime()).toBe(1000 * 1000); // step 1 at ts=1000s
  });

  it("preserves Solana base58 addresses (never lowercased)", () => {
    const mint = "So11111111111111111111111111111111111111112";
    const rows = toUnlockRows("user-1", [
      mk({ id: "jupiter-lock-101-1", protocol: "jupiter-lock", chainId: 101, tokenAddress: mint, recipient: mint, shape: "steps", totalAmount: "100", unlockSteps: [{ timestamp: 1000, amount: "100" }] }),
    ]);
    expect(rows[0].tokenAddress).toBe(mint);
    expect(rows[0].recipient).toBe(mint);
  });
});

describe("usdValueForTranche", () => {
  it("converts base units × price with 6-dp precision", () => {
    // 1.5 tokens (18 decimals) × $2.00 = $3.000000
    expect(usdValueForTranche("1500000000000000000", 18, 2)).toBe("3.000000");
  });
  it("handles 6-decimal tokens (e.g. USDC-shaped)", () => {
    // 100 tokens (6 decimals) × $0.50 = $50.000000
    expect(usdValueForTranche("100000000", 6, 0.5)).toBe("50.000000");
  });
  it("returns null on a malformed amount", () => {
    expect(usdValueForTranche("not-a-number", 18, 2)).toBeNull();
  });
});

describe("priceForTranche", () => {
  it("prices via getHistoricalPrice and carries the confidence", async () => {
    mockPrice.mockResolvedValueOnce({ usd: 2, confidence: "exact", resolvedDate: "2026-01-01" });
    const r = await priceForTranche(1, "0xtok", 1_700_000_000, "1000000000000000000", 18);
    expect(mockPrice).toHaveBeenCalledWith(1, "0xtok", 1_700_000_000);
    expect(r).toEqual({ usdValueAtUnlock: "2.000000", priceConfidence: "exact" });
  });
  it("leaves value null + confidence missing when no price exists", async () => {
    mockPrice.mockResolvedValueOnce({ usd: null, confidence: "missing", resolvedDate: null });
    const r = await priceForTranche(1, "0xtok", 1_700_000_000, "1000000000000000000", 18);
    expect(r).toEqual({ usdValueAtUnlock: null, priceConfidence: "missing" });
  });
});

describe("mergeUnlockAndClaim", () => {
  function unlock(o: Partial<MergeUnlockInput>): MergeUnlockInput {
    return {
      id: o.id ?? "u1",
      streamId: o.streamId ?? "hedgey-1-42",
      protocol: o.protocol ?? "hedgey",
      chainId: o.chainId ?? 1,
      tokenAddress: o.tokenAddress ?? "0xtok",
      tokenSymbol: o.tokenSymbol ?? "TKN",
      tokenDecimals: o.tokenDecimals ?? 18,
      amount: o.amount ?? "100",
      unlockTime: o.unlockTime ?? new Date("2026-01-01T00:00:00Z"),
      usdValueAtUnlock: "usdValueAtUnlock" in o ? (o.usdValueAtUnlock ?? null) : "200.000000",
      priceConfidence: o.priceConfidence ?? "exact",
      manualPrice: o.manualPrice ?? false,
    };
  }
  function claim(o: Partial<MergeClaimInput>): MergeClaimInput {
    return {
      streamId: o.streamId ?? "hedgey-1-42",
      tokenAddress: o.tokenAddress ?? "0xtok",
      amount: o.amount ?? "100",
      claimedAt: o.claimedAt ?? new Date("2026-02-01T00:00:00Z"),
      usdValueAtClaim: o.usdValueAtClaim ?? "150.000000",
      priceConfidence: o.priceConfidence ?? "exact",
    };
  }

  it("pairs an unlock with its later claim (same stream+token)", () => {
    const [row] = mergeUnlockAndClaim([unlock({})], [claim({})]);
    expect(row.usdAtUnlock).toBe("200.000000");
    expect(row.claimedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
    expect(row.usdAtClaim).toBe("150.000000");
    expect(row.needsInput).toBe(false);
  });

  it("leaves the claim side null when no claim matches", () => {
    const [row] = mergeUnlockAndClaim([unlock({})], []);
    expect(row.claimedAt).toBeNull();
    expect(row.usdAtClaim).toBeNull();
    expect(row.claimConfidence).toBeNull();
  });

  it("flags needsInput when the unlock price is missing", () => {
    const [row] = mergeUnlockAndClaim([unlock({ priceConfidence: "missing", usdValueAtUnlock: null })], []);
    expect(row.needsInput).toBe(true);
    expect(row.usdAtUnlock).toBeNull();
  });

  it("does not match a claim that predates the tranche", () => {
    const [row] = mergeUnlockAndClaim(
      [unlock({ unlockTime: new Date("2026-03-01T00:00:00Z") })],
      [claim({ claimedAt: new Date("2026-01-01T00:00:00Z") })], // before unlock
    );
    expect(row.claimedAt).toBeNull();
  });

  it("assigns each claim to at most one tranche (one-to-one)", () => {
    const rows = mergeUnlockAndClaim(
      [
        unlock({ id: "u1", unlockTime: new Date("2026-01-01T00:00:00Z") }),
        unlock({ id: "u2", unlockTime: new Date("2026-01-15T00:00:00Z") }),
      ],
      [claim({ claimedAt: new Date("2026-02-01T00:00:00Z") })], // single claim
    );
    const withClaim = rows.filter((r) => r.claimedAt !== null);
    expect(withClaim).toHaveLength(1); // only ONE tranche gets the claim
  });
});
