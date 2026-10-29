import { describe, it, expect } from "vitest";
import { buildUnlockSteps } from "./streamflow";

const sum = (steps: { amount: string }[]) => steps.reduce((a, s) => a + BigInt(s.amount), 0n);

describe("buildUnlockSteps", () => {
  it("emits one step per period when the schedule is short", () => {
    // 100 cliff at t=1000, then 10 per 100s until 200 deposited.
    const steps = buildUnlockSteps(200n, 1000, 100n, 100, 10n, 2000);
    expect(steps[0]).toEqual({ timestamp: 1000, amount: "100" });
    expect(steps).toHaveLength(11);
    expect(steps[1]).toEqual({ timestamp: 1100, amount: "10" });
    expect(steps.at(-1)).toEqual({ timestamp: 2000, amount: "10" });
    expect(sum(steps)).toBe(200n);
  });

  it("puts the residual at end when periods run out first", () => {
    const steps = buildUnlockSteps(1000n, 0, 0n, 100, 10n, 250);
    expect(steps.map((s) => s.timestamp)).toEqual([100, 200, 250]);
    expect(steps.at(-1)!.amount).toBe("980");
  });

  it("caps a per-second stream at 500 steps and keeps the cumulative exact", () => {
    const year = 365 * 86_400;
    const steps = buildUnlockSteps(BigInt(year), 0, 0n, 1, 1n, year);
    expect(steps.length).toBeLessThanOrEqual(501);
    expect(sum(steps)).toBe(BigInt(year));
    expect(steps.at(-1)!.timestamp).toBe(year);
    // Halfway through, the vested amount equals the elapsed seconds at the
    // step boundary — not ~0 as under the old 10,000-iteration stop.
    let vested = 0n;
    for (const s of steps) { if (s.timestamp > year / 2) break; vested += BigInt(s.amount); }
    const last = steps.filter((s) => s.timestamp <= year / 2).at(-1)!.timestamp;
    expect(vested).toBe(BigInt(last));
    expect(year / 2 - last).toBeLessThan(year / 500 + 1);
  });

  it("falls back to a single unlock at end with no cliff or period", () => {
    expect(buildUnlockSteps(500n, 0, 0n, 0, 0n, 9999)).toEqual([{ timestamp: 9999, amount: "500" }]);
  });
});
