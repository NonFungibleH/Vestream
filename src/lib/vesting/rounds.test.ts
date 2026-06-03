import { describe, it, expect } from "vitest";
import { groupIntoRounds } from "./rounds";
import type { VestingStream } from "./types";

function mk(o: Partial<VestingStream>): VestingStream {
  return {
    id: o.id ?? Math.random().toString(),
    protocol: o.protocol ?? "sablier",
    chainId: o.chainId ?? 1,
    recipient: o.recipient ?? "0xrec",
    tokenAddress: "0xtok",
    tokenSymbol: "TKN",
    tokenDecimals: 18,
    totalAmount: o.totalAmount ?? "1000",
    withdrawnAmount: "0",
    claimableNow: "0",
    lockedAmount: o.lockedAmount ?? "1000",
    startTime: o.startTime ?? 0,
    endTime: o.endTime ?? 86400 * 365,
    cliffTime: o.cliffTime ?? null,
    isFullyVested: false,
    nextUnlockTime: o.nextUnlockTime ?? null,
    shape: o.shape ?? "linear",
  } as VestingStream;
}

describe("groupIntoRounds", () => {
  it("returns [] for no streams", () => {
    expect(groupIntoRounds([])).toEqual([]);
  });

  it("groups two streams with identical terms into one round, counting recipients", () => {
    const rounds = groupIntoRounds([
      mk({ recipient: "0xA", lockedAmount: "100" }),
      mk({ recipient: "0xB", lockedAmount: "200" }),
    ]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].recipientCount).toBe(2);
    expect(rounds[0].totalLocked).toBe("300");
  });

  it("dedupes recipientCount by address", () => {
    const rounds = groupIntoRounds([
      mk({ recipient: "0xA" }),
      mk({ recipient: "0xA" }),
    ]);
    expect(rounds[0].recipientCount).toBe(1);
  });

  it("separates different protocols, cliffs, durations, and shapes", () => {
    const rounds = groupIntoRounds([
      mk({ protocol: "sablier" }),
      mk({ protocol: "uncx" }),
      mk({ cliffTime: 86400 * 90 }), // 90d cliff
      mk({ endTime: 86400 * 730 }), // 2yr duration
      mk({ shape: "steps" }),
    ]);
    expect(rounds.length).toBe(5);
  });

  it("sorts rounds by totalLocked desc", () => {
    const rounds = groupIntoRounds([
      mk({ protocol: "uncx", lockedAmount: "10" }),
      mk({ protocol: "sablier", lockedAmount: "999" }),
    ]);
    expect(rounds[0].protocol).toBe("sablier");
  });

  it("labels by terms including cliff", () => {
    const [r] = groupIntoRounds([mk({ cliffTime: 86400 * 180, endTime: 86400 * 730 })]);
    expect(r.label).toContain("cliff");
    expect(r.label).toContain("linear");
  });

  it("takes the soonest nextUnlockTime in a round", () => {
    const [r] = groupIntoRounds([
      mk({ nextUnlockTime: 500 }),
      mk({ nextUnlockTime: 200 }),
      mk({ nextUnlockTime: null }),
    ]);
    expect(r.nextUnlockTime).toBe(200);
  });
});
