import { describe, it, expect } from "vitest";
import { summariseToken } from "./token-summary";
import type { VestingStream } from "./types";

const NOW = 1_700_000_000; // fixed "now" for determinism

function stream(over: Partial<VestingStream>): VestingStream {
  return {
    id: over.id ?? "sablier-1-1",
    protocol: over.protocol ?? "sablier",
    chainId: 1,
    recipient: over.recipient ?? "0xaaa",
    tokenAddress: "0xToKeN",
    tokenSymbol: over.tokenSymbol ?? "NOVA",
    tokenDecimals: over.tokenDecimals ?? 18,
    totalAmount: over.totalAmount ?? "0",
    withdrawnAmount: over.withdrawnAmount ?? "0",
    claimableNow: over.claimableNow ?? "0",
    lockedAmount: over.lockedAmount ?? "0",
    startTime: over.startTime ?? NOW - 1000,
    endTime: over.endTime ?? NOW + 10_000,
    cliffTime: over.cliffTime ?? null,
    isFullyVested: over.isFullyVested ?? false,
    nextUnlockTime: over.nextUnlockTime ?? null,
    shape: over.shape,
    unlockSteps: over.unlockSteps,
  } as VestingStream;
}

describe("summariseToken", () => {
  it("returns an empty summary for no streams", () => {
    const s = summariseToken([], 1, "0xToKeN", NOW);
    expect(s).toMatchObject({
      chainId: 1,
      tokenAddress: "0xtoken",
      tokenSymbol: null,
      streamCount: 0,
      recipientCount: 0,
      totalAmount: "0",
      totalLocked: "0",
      nextUnlockTime: null,
      nextUnlockAmount: null,
      protocols: [],
    });
  });

  it("sums token-denominated amounts across holders as bigints", () => {
    const s = summariseToken([
      stream({ recipient: "0xAAA", totalAmount: "100", lockedAmount: "60", claimableNow: "10" }),
      stream({ id: "sablier-1-2", recipient: "0xBBB", totalAmount: "200", lockedAmount: "150", claimableNow: "5" }),
    ], 1, "0xToKeN", NOW);
    expect(s.totalAmount).toBe("300");
    expect(s.totalLocked).toBe("210");
    expect(s.totalClaimable).toBe("15");
    expect(s.streamCount).toBe(2);
    expect(s.recipientCount).toBe(2);
  });

  it("dedupes recipients (one holder, two streams) and protocols", () => {
    const s = summariseToken([
      stream({ recipient: "0xAAA", protocol: "sablier" }),
      stream({ id: "uncx-1-9", recipient: "0xaaa", protocol: "uncx" }),
    ], 1, "0xToKeN", NOW);
    expect(s.recipientCount).toBe(1);
    expect(s.protocols.sort()).toEqual(["sablier", "uncx"]);
  });

  it("picks the earliest FUTURE unlock and ignores past ones", () => {
    const s = summariseToken([
      stream({ nextUnlockTime: NOW - 500 }),               // past — ignored
      stream({ id: "s2", nextUnlockTime: NOW + 5_000 }),
      stream({ id: "s3", nextUnlockTime: NOW + 2_000 }),   // earliest future
    ], 1, "0xToKeN", NOW);
    expect(s.nextUnlockTime).toBe(NOW + 2_000);
  });

  it("aggregates step amounts unlocking within the same day as the next unlock", () => {
    const s = summariseToken([
      stream({
        nextUnlockTime: NOW + 1_000,
        unlockSteps: [
          { timestamp: NOW + 1_000, amount: "40" }, // in window
          { timestamp: NOW + 90_000, amount: "999" }, // next day — excluded
        ],
      }),
      stream({
        id: "s2",
        nextUnlockTime: NOW + 1_500,
        unlockSteps: [{ timestamp: NOW + 1_500, amount: "60" }], // in window (within 86400)
      }),
    ], 1, "0xToKeN", NOW);
    expect(s.nextUnlockTime).toBe(NOW + 1_000);
    expect(s.nextUnlockAmount).toBe("100"); // 40 + 60
  });

  it("leaves nextUnlockAmount null for pure-linear streams with no steps", () => {
    const s = summariseToken([
      stream({ nextUnlockTime: NOW + 1_000, shape: "linear" }),
    ], 1, "0xToKeN", NOW);
    expect(s.nextUnlockTime).toBe(NOW + 1_000);
    expect(s.nextUnlockAmount).toBeNull();
  });

  it("tolerates malformed bigint strings without throwing", () => {
    const s = summariseToken([
      stream({ totalAmount: "not-a-number", lockedAmount: "" }),
    ], 1, "0xToKeN", NOW);
    expect(s.totalAmount).toBe("0");
    expect(s.totalLocked).toBe("0");
  });
});
