import { describe, it, expect } from "vitest";
import { toUnlockRows } from "./unlock-events";
import type { VestingStream } from "./types";

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
