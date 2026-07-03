import { describe, it, expect } from "vitest";
import { hasActiveEntitlement } from "./revenuecat-entitlements";

describe("hasActiveEntitlement", () => {
  const NOW = Date.parse("2026-07-03T00:00:00Z");

  it("returns false for no entitlements", () => {
    expect(hasActiveEntitlement(undefined, NOW)).toBe(false);
    expect(hasActiveEntitlement({}, NOW)).toBe(false);
  });

  it("treats a null expires_date as an active lifetime grant", () => {
    expect(hasActiveEntitlement({ pro: { expires_date: null } }, NOW)).toBe(true);
  });

  it("is active when expiry is in the future", () => {
    expect(hasActiveEntitlement({ pro: { expires_date: "2026-08-01T00:00:00Z" } }, NOW)).toBe(true);
  });

  it("is NOT active when the only entitlement lapsed in the past", () => {
    expect(hasActiveEntitlement({ pro: { expires_date: "2026-06-01T00:00:00Z" } }, NOW)).toBe(false);
  });

  it("is active if ANY entitlement is still valid (mixed set)", () => {
    expect(hasActiveEntitlement({
      mobile: { expires_date: "2026-06-01T00:00:00Z" }, // lapsed
      pro:    { expires_date: "2026-09-01T00:00:00Z" }, // active
    }, NOW)).toBe(true);
  });

  it("fails closed on an unparseable expiry date", () => {
    expect(hasActiveEntitlement({ pro: { expires_date: "not-a-date" } }, NOW)).toBe(false);
  });

  it("is exclusive at the exact expiry instant (expired)", () => {
    expect(hasActiveEntitlement({ pro: { expires_date: "2026-07-03T00:00:00Z" } }, NOW)).toBe(false);
  });
});
