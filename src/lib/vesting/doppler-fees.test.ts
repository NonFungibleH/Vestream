import { describe, it, expect } from "vitest";
import { feeShare, WAD } from "./doppler-fees";

describe("feeShare", () => {
  it("is (cumulated - last) * shares / WAD", () => {
    // 1,000 units accrued since last release, 25% share → 250
    expect(feeShare(1_000n, 0n, WAD / 4n)).toBe(250n);
  });

  it("only counts fees since the beneficiary's last release", () => {
    expect(feeShare(1_000n, 600n, WAD)).toBe(400n);
  });

  it("is zero when nothing has accrued or the registry is ahead of the chain", () => {
    expect(feeShare(500n, 500n, WAD)).toBe(0n);
    expect(feeShare(400n, 500n, WAD)).toBe(0n);
  });

  it("is zero for a zero share", () => {
    expect(feeShare(1_000n, 0n, 0n)).toBe(0n);
  });

  it("floors fractional units", () => {
    // 3 units, one-third share → 0.999… → 0
    expect(feeShare(3n, 0n, WAD / 3n)).toBe(0n);
    expect(feeShare(3n * 10n ** 18n, 0n, WAD / 3n)).toBe(999_999_999_999_999_999n);
  });
});
