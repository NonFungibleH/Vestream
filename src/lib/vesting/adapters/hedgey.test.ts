import { describe, it, expect } from "vitest";
import { hedgeyRedeemable } from "./hedgey";

// start=0, period=10s, rate=4/period, amount=100 → 25 periods, fully vested at t=250.
const base = { amount: 100n, rate: 4n, period: 10n, startTime: 0 };

describe("hedgeyRedeemable", () => {
  it("returns 0 before the cliff even though periods have elapsed", () => {
    // 2 periods elapsed (would be 8) but cliff is at t=30 → nothing redeemable.
    expect(hedgeyRedeemable({ ...base, cliffTime: 30, nowSec: 20 })).toBe(0n);
  });

  it("releases the full back-accrued amount at the cliff", () => {
    // at t=30 (cliff): floor(30/10)=3 periods → 12 unlock at once.
    expect(hedgeyRedeemable({ ...base, cliffTime: 30, nowSec: 30 })).toBe(12n);
  });

  it("continues linearly after the cliff", () => {
    expect(hedgeyRedeemable({ ...base, cliffTime: 30, nowSec: 55 })).toBe(20n); // floor(55/10)=5 → 20
  });

  it("accrues from start when there is no cliff", () => {
    expect(hedgeyRedeemable({ ...base, cliffTime: null, nowSec: 25 })).toBe(8n); // floor(25/10)=2 → 8
  });

  it("never exceeds the plan total (caps at amount)", () => {
    expect(hedgeyRedeemable({ ...base, cliffTime: null, nowSec: 100_000 })).toBe(100n);
  });

  it("is 0 before start", () => {
    expect(hedgeyRedeemable({ ...base, cliffTime: null, nowSec: 0 })).toBe(0n);
  });

  it("returns 0 for a zero period (guards divide-by-zero)", () => {
    expect(hedgeyRedeemable({ ...base, period: 0n, cliffTime: null, nowSec: 50 })).toBe(0n);
  });
});
