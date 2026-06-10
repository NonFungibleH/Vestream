import { describe, it, expect } from "vitest";
import {
  resolveThresholdAlert,
  thresholdDedupTimestamp,
  validateThresholdUsd,
  collectThresholdSlots,
  renderThresholdCopy,
  validateStreamPrefs,
  THRESHOLD_USD_MIN,
  THRESHOLD_USD_MAX,
} from "./threshold";

// 500 tokens at 18 decimals.
const CLAIMABLE_500 = (500n * 10n ** 18n).toString();

const stream = (over: Partial<{ claimableNow: string; tokenDecimals: number }> = {}) => ({
  claimableNow: CLAIMABLE_500,
  tokenDecimals: 18,
  ...over,
});

describe("resolveThresholdAlert", () => {
  it("fires when claimable USD is above the threshold", () => {
    // 500 tokens × $3 = $1500 ≥ $1000
    const res = resolveThresholdAlert(stream(), 3, 1000);
    expect(res).not.toBeNull();
    expect(res!.fired).toBe(true);
    expect(res!.claimableUsd).toBeCloseTo(1500, 6);
  });

  it("fires when claimable USD is EXACTLY at the threshold", () => {
    // 500 tokens × $2 = $1000 ≥ $1000 (>= semantics, not >)
    const res = resolveThresholdAlert(stream(), 2, 1000);
    expect(res!.fired).toBe(true);
  });

  it("does not fire below the threshold", () => {
    // 500 tokens × $1 = $500 < $1000
    const res = resolveThresholdAlert(stream(), 1, 1000);
    expect(res).not.toBeNull();
    expect(res!.fired).toBe(false);
  });

  it("skips unpriced tokens (null / undefined / zero / NaN price) — never alerts on unpriced claimable", () => {
    expect(resolveThresholdAlert(stream(), null, 100)).toBeNull();
    expect(resolveThresholdAlert(stream(), undefined, 100)).toBeNull();
    expect(resolveThresholdAlert(stream(), 0, 100)).toBeNull();
    expect(resolveThresholdAlert(stream(), -5, 100)).toBeNull();
    expect(resolveThresholdAlert(stream(), Number.NaN, 100)).toBeNull();
  });

  it("skips invalid thresholds and malformed claimableNow", () => {
    expect(resolveThresholdAlert(stream(), 3, 0)).toBeNull();
    expect(resolveThresholdAlert(stream(), 3, Number.NaN)).toBeNull();
    expect(resolveThresholdAlert(stream({ claimableNow: "not-a-bigint" }), 3, 100)).toBeNull();
  });

  it("handles zero claimable (continuous stream not yet accrued)", () => {
    const res = resolveThresholdAlert(stream({ claimableNow: "0" }), 3, 100);
    expect(res!.fired).toBe(false);
    expect(res!.claimableUsd).toBe(0);
  });

  it("respects tokenDecimals (6-decimal USDC-style token)", () => {
    // 250 tokens at 6 decimals × $1 = $250
    const res = resolveThresholdAlert(
      stream({ claimableNow: (250n * 10n ** 6n).toString(), tokenDecimals: 6 }),
      1,
      200,
    );
    expect(res!.fired).toBe(true);
    expect(res!.claimableUsd).toBeCloseTo(250, 6);
  });

  it("only reads claimableNow + tokenDecimals — works for continuous streams with no unlock schedule", () => {
    // Superfluid/LlamaPay-shaped input: nothing but the two fields the
    // helper's type asks for. Compiles + evaluates without
    // nextUnlockTime/unlockSteps existing at all.
    const res = resolveThresholdAlert(
      { claimableNow: CLAIMABLE_500, tokenDecimals: 18 },
      2,
      999,
    );
    expect(res!.fired).toBe(true);
  });
});

describe("thresholdDedupTimestamp", () => {
  it("is stable — same threshold always yields the identical timestamp", () => {
    const a = thresholdDedupTimestamp(1000);
    const b = thresholdDedupTimestamp(1000);
    expect(a.getTime()).toBe(b.getTime());
  });

  it("distinct whole-dollar thresholds are spaced outside the ±1h dedup window", () => {
    // hasNotificationBeenSent matches within ±3,600s. Adjacent dollar
    // thresholds must be further apart than that or a $1000→$1001
    // change would never re-arm.
    const gapSec =
      (thresholdDedupTimestamp(1001).getTime() - thresholdDedupTimestamp(1000).getTime()) / 1000;
    expect(gapSec).toBeGreaterThan(2 * 3600);
  });

  it("never collides with real event timestamps (far-future base)", () => {
    // Time-based alerts dedup on real firingTimes (current era, and at
    // most a few decades out). The synthetic key must sit far beyond
    // any of those even at the smallest threshold.
    const minSec = thresholdDedupTimestamp(THRESHOLD_USD_MIN).getTime() / 1000;
    const year3000Sec = 32_503_680_000;
    expect(minSec).toBeGreaterThan(year3000Sec);
    // …and stays a valid JS Date at the largest threshold.
    const max = thresholdDedupTimestamp(THRESHOLD_USD_MAX);
    expect(Number.isFinite(max.getTime())).toBe(true);
  });
});

describe("validateThresholdUsd", () => {
  it("accepts in-bounds numbers and rounds to whole dollars", () => {
    expect(validateThresholdUsd(1)).toBe(1);
    expect(validateThresholdUsd(1_000_000)).toBe(1_000_000);
    expect(validateThresholdUsd(99.6)).toBe(100);
    expect(validateThresholdUsd(250.4)).toBe(250);
  });

  it("rejects out-of-bounds, non-finite, and non-number values", () => {
    expect(validateThresholdUsd(0)).toBeNull();
    expect(validateThresholdUsd(0.5)).toBeNull();
    expect(validateThresholdUsd(-100)).toBeNull();
    expect(validateThresholdUsd(1_000_001)).toBeNull();
    expect(validateThresholdUsd(Number.POSITIVE_INFINITY)).toBeNull();
    expect(validateThresholdUsd(Number.NaN)).toBeNull();
    expect(validateThresholdUsd("100")).toBeNull();
    expect(validateThresholdUsd(null)).toBeNull();
    expect(validateThresholdUsd(undefined)).toBeNull();
  });
});

describe("collectThresholdSlots", () => {
  it("collects only enabled slots with trigger 'threshold' and a valid value", () => {
    const slots = collectThresholdSlots({
      alert1Enabled: true,  alert1TriggerType: "threshold",     thresholdUsd1: 500,
      alert2Enabled: true,  alert2TriggerType: "before-unlock", thresholdUsd2: 900, // wrong trigger
      alert3Enabled: false, alert3TriggerType: "threshold",     thresholdUsd3: 100, // disabled
    });
    expect(slots).toEqual([{ slot: 1, thresholdUsd: 500 }]);
  });

  it("skips slots with missing or invalid thresholds", () => {
    expect(
      collectThresholdSlots({
        alert1Enabled: true, alert1TriggerType: "threshold", // no thresholdUsd1
        alert2Enabled: true, alert2TriggerType: "threshold", thresholdUsd2: 0, // out of bounds
      }),
    ).toEqual([]);
    expect(collectThresholdSlots(undefined)).toEqual([]);
    expect(collectThresholdSlots(null)).toEqual([]);
  });

  it("supports multiple threshold slots on one stream", () => {
    const slots = collectThresholdSlots({
      alert1Enabled: true, alert1TriggerType: "threshold", thresholdUsd1: 100,
      alert3Enabled: true, alert3TriggerType: "threshold", thresholdUsd3: 1000,
    });
    expect(slots).toEqual([
      { slot: 1, thresholdUsd: 100 },
      { slot: 3, thresholdUsd: 1000 },
    ]);
  });
});

describe("renderThresholdCopy", () => {
  it("matches the existing copy tone — plain text, no emoji", () => {
    const { title, body } = renderThresholdCopy(
      { tokenSymbol: "NOVA", chainId: 8453 },
      1000,
      1523.7,
    );
    expect(title).toBe("NOVA passed $1,000 claimable");
    expect(body).toBe("NOVA on chain 8453 — about $1,524 is claimable now. Tap to view.");
    // No emoji anywhere (existing renderAlertCopy uses none).
    expect(/\p{Extended_Pictographic}/u.test(title + body)).toBe(false);
  });
});

describe("validateStreamPrefs (mobile prefs route)", () => {
  it("accepts 'threshold' in the trigger-type whitelist and rounds thresholds", () => {
    const res = validateStreamPrefs({
      "sablier-1-123": {
        enabled: true,
        alert1Enabled: true,
        alert1TriggerType: "threshold",
        thresholdUsd1: 499.6,
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value["sablier-1-123"]).toMatchObject({
        alert1TriggerType: "threshold",
        thresholdUsd1: 500,
      });
    }
  });

  it("rejects out-of-bounds thresholds (below 1 and above 1,000,000)", () => {
    expect(
      validateStreamPrefs({ s: { thresholdUsd1: 0 } }).ok,
    ).toBe(false);
    expect(
      validateStreamPrefs({ s: { thresholdUsd2: 1_000_001 } }).ok,
    ).toBe(false);
    expect(
      validateStreamPrefs({ s: { thresholdUsd3: "lots" } }).ok,
    ).toBe(false);
    expect(
      validateStreamPrefs({ s: { thresholdUsd1: Number.NaN } }).ok,
    ).toBe(false);
  });

  it("rejects unknown trigger types but allows all existing ones", () => {
    expect(validateStreamPrefs({ s: { alert1TriggerType: "moon-phase" } }).ok).toBe(false);
    const ok = validateStreamPrefs({
      s: {
        alert1TriggerType: "before-unlock",
        alert2TriggerType: "cliff",
        alert3TriggerType: "claim-ready",
      },
    });
    expect(ok.ok).toBe(true);
  });

  it("passes through unrelated keys and null thresholds untouched", () => {
    const res = validateStreamPrefs({
      s: { enabled: true, pushTiming2: 4, thresholdUsd1: null },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value["s"]).toMatchObject({ enabled: true, pushTiming2: 4, thresholdUsd1: null });
    }
  });

  it("coerces non-object bags to {} (matches the route's prior defensive behaviour)", () => {
    expect(validateStreamPrefs(null)).toEqual({ ok: true, value: {} });
    expect(validateStreamPrefs([1, 2])).toEqual({ ok: true, value: {} });
    expect(validateStreamPrefs("nope")).toEqual({ ok: true, value: {} });
  });
});
