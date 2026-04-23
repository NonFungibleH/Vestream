// packages/shared/src/vesting.test.ts
// Unit tests for the vesting math helpers. These functions are the most
// critical regression surface in the codebase — a 1-line bug here mis-reports
// every user's claimable/locked balance across every protocol adapter.
//
// Every test uses realistic scales (18-decimal tokens, month-long schedules)
// so a refactor that accidentally uses Number arithmetic instead of BigInt
// will fail loudly on values > 2^53.

import { describe, it, expect } from "vitest";
import {
  computeLinearVesting,
  computeStepVesting,
  nextUnlockTime,
  nextUnlockTimeForSteps,
} from "./vesting";

// 1 unit = 1e18 wei — canonical 18-decimal ERC20 scale.
const ONE = 10n ** 18n;

describe("computeLinearVesting", () => {
  it("returns nothing vested before the stream starts", () => {
    const r = computeLinearVesting(
      /* total       */ 1000n * ONE,
      /* withdrawn   */ 0n,
      /* startTime   */ 1_000_000,
      /* endTime     */ 2_000_000,
      /* nowSec      */ 999_999, // one second before start
    );
    expect(r.claimableNow).toBe(0n);
    expect(r.lockedAmount).toBe(1000n * ONE);
    expect(r.isFullyVested).toBe(false);
  });

  it("vests linearly at the midpoint", () => {
    const total = 1000n * ONE;
    const r = computeLinearVesting(
      total,
      /* withdrawn */ 0n,
      /* startTime */ 0,
      /* endTime   */ 1000,
      /* nowSec    */ 500, // exactly halfway
    );
    expect(r.claimableNow).toBe(500n * ONE);
    expect(r.lockedAmount).toBe(500n * ONE);
    expect(r.isFullyVested).toBe(false);
  });

  it("fully vests once end time passes", () => {
    const r = computeLinearVesting(
      1000n * ONE,
      /* withdrawn */ 0n,
      0,
      1000,
      1001,
    );
    expect(r.claimableNow).toBe(1000n * ONE);
    expect(r.lockedAmount).toBe(0n);
    expect(r.isFullyVested).toBe(true);
  });

  it("subtracts already-withdrawn from claimable", () => {
    const total = 1000n * ONE;
    const r = computeLinearVesting(
      total,
      /* withdrawn */ 200n * ONE,
      0,
      1000,
      500,
    );
    // 500 vested, 200 already withdrawn → 300 still claimable
    expect(r.claimableNow).toBe(300n * ONE);
    expect(r.lockedAmount).toBe(500n * ONE);
  });

  it("never reports negative claimable when withdrawn exceeds vested", () => {
    // Can happen if the recipient drags the clock forward then back (unusual,
    // but a contract could refund or re-schedule).
    const r = computeLinearVesting(
      1000n * ONE,
      /* withdrawn */ 600n * ONE, // they claimed more than currently vested
      0,
      1000,
      500, // 500 vested
    );
    expect(r.claimableNow).toBe(0n);
  });

  it("handles zero-duration streams without dividing by zero", () => {
    const r = computeLinearVesting(
      1000n * ONE,
      0n,
      1_000_000,
      1_000_000, // start === end
      1_000_001,
    );
    expect(r.isFullyVested).toBe(true);
    expect(r.claimableNow).toBe(0n); // duration=0 path short-circuits vested calc
  });

  it("preserves precision at large token scales (bigint discipline)", () => {
    // 1 trillion 18-decimal tokens — way past Number.MAX_SAFE_INTEGER.
    const trillion = 1_000_000_000_000n * ONE;
    const r = computeLinearVesting(trillion, 0n, 0, 100, 50);
    // Should be exactly half — no floating point drift.
    expect(r.claimableNow).toBe(trillion / 2n);
    expect(r.lockedAmount).toBe(trillion / 2n);
  });
});

describe("nextUnlockTime", () => {
  it("returns cliff time when now < cliff", () => {
    const result = nextUnlockTime(
      /* isFullyVested */ false,
      /* nowSec        */ 500,
      /* cliffTime     */ 1000,
      /* endTime       */ 2000,
    );
    expect(result).toBe(1000);
  });

  it("returns end time when past the cliff", () => {
    const result = nextUnlockTime(false, 1500, 1000, 2000);
    expect(result).toBe(2000);
  });

  it("returns end time when there's no cliff", () => {
    const result = nextUnlockTime(false, 500, null, 2000);
    expect(result).toBe(2000);
  });

  it("returns null when the stream is fully vested", () => {
    const result = nextUnlockTime(true, 3000, 1000, 2000);
    expect(result).toBeNull();
  });
});

describe("computeStepVesting", () => {
  const steps = [
    { timestamp: 100, amount: (100n * ONE).toString() },
    { timestamp: 200, amount: (200n * ONE).toString() },
    { timestamp: 300, amount: (300n * ONE).toString() },
  ];
  const total = 600n * ONE;

  it("reports zero claimable before the first step", () => {
    const r = computeStepVesting(total, 0n, steps, 50);
    expect(r.claimableNow).toBe(0n);
    expect(r.lockedAmount).toBe(total);
    expect(r.isFullyVested).toBe(false);
  });

  it("sums only steps whose timestamp has passed", () => {
    // At t=250, steps 1 and 2 have unlocked (100 + 200 = 300).
    const r = computeStepVesting(total, 0n, steps, 250);
    expect(r.claimableNow).toBe(300n * ONE);
    expect(r.lockedAmount).toBe(300n * ONE); // step 3 still locked
    expect(r.isFullyVested).toBe(false);
  });

  it("marks fully vested at or after the last step timestamp", () => {
    const r = computeStepVesting(total, 0n, steps, 300);
    expect(r.claimableNow).toBe(total);
    expect(r.lockedAmount).toBe(0n);
    expect(r.isFullyVested).toBe(true);
  });

  it("subtracts withdrawn from claimable", () => {
    const r = computeStepVesting(total, /* withdrawn */ 150n * ONE, steps, 250);
    // 300 vested - 150 already claimed = 150 still claimable
    expect(r.claimableNow).toBe(150n * ONE);
  });

  it("handles an empty step list as never vested", () => {
    const r = computeStepVesting(0n, 0n, [], 1_000_000);
    expect(r.claimableNow).toBe(0n);
    expect(r.lockedAmount).toBe(0n);
    expect(r.isFullyVested).toBe(false);
  });
});

describe("nextUnlockTimeForSteps", () => {
  const steps = [
    { timestamp: 100, amount: "1" },
    { timestamp: 200, amount: "2" },
    { timestamp: 300, amount: "3" },
  ];

  it("returns the next future step", () => {
    expect(nextUnlockTimeForSteps(150, steps)).toBe(200);
  });

  it("returns the first step when now is before all of them", () => {
    expect(nextUnlockTimeForSteps(50, steps)).toBe(100);
  });

  it("returns null when all steps have passed", () => {
    expect(nextUnlockTimeForSteps(500, steps)).toBeNull();
  });

  it("treats equality as already-unlocked (step.timestamp > nowSec)", () => {
    // At exactly t=200, step 2 is considered already unlocked — next is 300.
    expect(nextUnlockTimeForSteps(200, steps)).toBe(300);
  });

  it("returns null for an empty step list", () => {
    expect(nextUnlockTimeForSteps(0, [])).toBeNull();
  });
});
