import { describe, it, expect } from "vitest";
import { isTaxBasis, DEFAULT_TAX_BASIS } from "./tax-basis";

describe("isTaxBasis", () => {
  it("accepts the two valid bases", () => {
    expect(isTaxBasis("claim")).toBe(true);
    expect(isTaxBasis("unlock")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isTaxBasis("")).toBe(false);
    expect(isTaxBasis("income")).toBe(false);
    expect(isTaxBasis("Claim")).toBe(false); // case-sensitive
    expect(isTaxBasis(null)).toBe(false);
    expect(isTaxBasis(undefined)).toBe(false);
    expect(isTaxBasis(42)).toBe(false);
  });
  it("defaults to claim (claim-basis stays the default)", () => {
    expect(DEFAULT_TAX_BASIS).toBe("claim");
  });
});
