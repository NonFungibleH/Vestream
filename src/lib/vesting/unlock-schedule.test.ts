import { describe, it, expect } from "vitest";
import { computeUnlockTranches, isDiscreteSchedule } from "./unlock-schedule";
import type { VestingStream } from "./types";

// Fixture builder — mirrors rounds.test.ts's `mk`. Defaults describe a
// 1-year linear stream; override fields per case.
function mk(o: Partial<VestingStream>): VestingStream {
  return {
    id: o.id ?? "sablier-1-1",
    protocol: o.protocol ?? "sablier",
    chainId: o.chainId ?? 1,
    recipient: o.recipient ?? "0xrec",
    tokenAddress: o.tokenAddress ?? "0xtok",
    tokenSymbol: "TKN",
    tokenDecimals: 18,
    totalAmount: o.totalAmount ?? "1000",
    withdrawnAmount: "0",
    claimableNow: "0",
    lockedAmount: o.lockedAmount ?? "1000",
    startTime: o.startTime ?? 0,
    endTime: o.endTime ?? 86_400 * 365,
    cliffTime: o.cliffTime ?? null,
    isFullyVested: false,
    nextUnlockTime: o.nextUnlockTime ?? null,
    shape: o.shape ?? "linear",
    unlockSteps: o.unlockSteps,
  } as VestingStream;
}

const DAY = 86_400;

describe("isDiscreteSchedule", () => {
  it("stepped schedules are discrete", () => {
    expect(isDiscreteSchedule(mk({ shape: "steps", unlockSteps: [{ timestamp: 1, amount: "1000" }] }))).toBe(true);
  });
  it("instant (start === end) is discrete", () => {
    expect(isDiscreteSchedule(mk({ startTime: 1000, endTime: 1000 }))).toBe(true);
  });
  it("cliff-only (end at/near cliff) is discrete", () => {
    expect(isDiscreteSchedule(mk({ startTime: 0, cliffTime: 1_700_000_000, endTime: 1_700_000_000 }))).toBe(true);
  });
  it("real linear duration is NOT discrete (deferred to phase 2)", () => {
    expect(isDiscreteSchedule(mk({ startTime: 0, endTime: 365 * DAY, cliffTime: null, shape: "linear" }))).toBe(false);
  });
  it("linear-with-cliff (cliff far before end) is NOT discrete", () => {
    expect(isDiscreteSchedule(mk({ startTime: 0, endTime: 365 * DAY, cliffTime: 30 * DAY }))).toBe(false);
  });
});

describe("computeUnlockTranches", () => {
  it("cliff: one tranche of the full amount at cliffTime", () => {
    const t = computeUnlockTranches(mk({ startTime: 0, cliffTime: 1_700_000_000, endTime: 1_700_000_000, totalAmount: "5000" }));
    expect(t).toHaveLength(1);
    expect(t[0].unlockTime).toBe(1_700_000_000);
    expect(t[0].amount).toBe("5000");
  });

  it("cliff with null cliffTime (instant) falls back to endTime", () => {
    const t = computeUnlockTranches(mk({ startTime: 1000, endTime: 1000, cliffTime: null, totalAmount: "42" }));
    expect(t).toHaveLength(1);
    expect(t[0].unlockTime).toBe(1000);
    expect(t[0].amount).toBe("42");
  });

  it("stepped: one tranche per step, amounts as-is (already incremental)", () => {
    const t = computeUnlockTranches(mk({
      shape: "steps", totalAmount: "1000",
      unlockSteps: [{ timestamp: 1000, amount: "100" }, { timestamp: 2000, amount: "300" }, { timestamp: 3000, amount: "600" }],
    }));
    expect(t.map((x) => x.unlockTime)).toEqual([1000, 2000, 3000]);
    expect(t.map((x) => x.amount)).toEqual(["100", "300", "600"]);
  });

  it("stepped amounts sum to the schedule total (invariant)", () => {
    const stream = mk({ shape: "steps", totalAmount: "1000", unlockSteps: [{ timestamp: 1000, amount: "400" }, { timestamp: 2000, amount: "600" }] });
    const sum = computeUnlockTranches(stream).reduce((s, x) => s + BigInt(x.amount), 0n);
    expect(sum).toBe(BigInt(stream.totalAmount));
  });

  it("drops zero-amount steps", () => {
    const t = computeUnlockTranches(mk({
      shape: "steps", totalAmount: "100",
      unlockSteps: [{ timestamp: 1000, amount: "0" }, { timestamp: 2000, amount: "100" }],
    }));
    expect(t).toHaveLength(1);
    expect(t[0].amount).toBe("100");
  });

  it("linear/continuous returns [] in phase 1", () => {
    expect(computeUnlockTranches(mk({ startTime: 0, endTime: 365 * DAY, shape: "linear" }))).toEqual([]);
  });

  it("emits a stable dedup key per tranche across regenerations", () => {
    const s = mk({ id: "hedgey-1-42", shape: "steps", totalAmount: "300", unlockSteps: [{ timestamp: 1000, amount: "100" }, { timestamp: 2000, amount: "200" }] });
    const a = computeUnlockTranches(s).map((x) => x.trancheKey);
    const b = computeUnlockTranches(s).map((x) => x.trancheKey);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(2);
    expect(a[0]).toBe("hedgey-1-42:0:1000");
  });
});
