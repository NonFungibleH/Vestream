import { describe, it, expect } from "vitest";
import { teamFinanceVested, teamFinanceNextUnlock } from "./team-finance";

// Mirrors the contract's getClaimable() (verified source): elapsed is floored
// to whole cadence steps and percentageOnStart is BASIS POINTS (max 10,000).
const DAY = 86_400, MONTH = 2_592_000;
const start = 1_700_000_000, end = start + 10 * MONTH;
const total = 1_000_000n;

describe("teamFinanceVested", () => {
  it("is zero before start and everything after end", () => {
    expect(teamFinanceVested(total, start, end, MONTH, 0, start - 1)).toBe(0n);
    expect(teamFinanceVested(total, start, end, MONTH, 0, end + 1)).toBe(total);
  });

  it("treats percentageOnStart as basis points, not percent", () => {
    // 2,000 bps = 20% at start. The old ×100 bug made this 2000% (fully vested).
    expect(teamFinanceVested(total, start, end, MONTH, 2000, start)).toBe(200_000n);
    expect(teamFinanceVested(total, start, end, MONTH, 2000, start)).toBeLessThan(total);
  });

  it("never exceeds the grant", () => {
    expect(teamFinanceVested(total, start, end, MONTH, 10_000, start + DAY)).toBe(total);
  });

  it("releases in whole cadence steps", () => {
    // 1.5 months in, monthly cadence: only one step has released.
    const t = start + MONTH + MONTH / 2;
    expect(teamFinanceVested(total, start, end, MONTH, 0, t)).toBe(100_000n);
    // continuous cadence vests pro-rata
    expect(teamFinanceVested(total, start, end, 1, 0, t)).toBe(150_000n);
  });
});

describe("teamFinanceNextUnlock", () => {
  it("returns the next cadence boundary, capped at end", () => {
    expect(teamFinanceNextUnlock(start, end, MONTH, start + DAY)).toBe(start + MONTH);
    expect(teamFinanceNextUnlock(start, end, MONTH, end - DAY)).toBe(end);
    expect(teamFinanceNextUnlock(start, end, MONTH, end + 1)).toBeNull();
    expect(teamFinanceNextUnlock(start, end, 1, start + DAY)).toBe(end);
  });
});
