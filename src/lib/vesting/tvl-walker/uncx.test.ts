// src/lib/vesting/tvl-walker/uncx.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Walker correctness tests for UNCX V3 TokenVesting locks.
// Mocks `global.fetch` and asserts on the locked-amount math, aggregation,
// pagination, and error paths. Time is frozen so Linear-vest math is stable.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { walkUncx } from "./uncx";
import { CHAIN_IDS } from "../types";

const FROZEN_NOW_SEC = 2_000_000_000;

describe("walkUncx", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW_SEC * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns empty result for unsupported chain", async () => {
    const result = await walkUncx(CHAIN_IDS.SEPOLIA);
    expect(result.protocol).toBe("uncx");
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
    expect(result.error).toBe("no subgraph configured for this chain");
  });

  it("aggregates locked amounts and applies cliff/linear math", async () => {
    // Cliff lock — fully locked because nowSec < endEmission
    const cliffLock = {
      id: "lock-1",
      lockID: "1",
      releaseSchedule: "Cliff" as const,
      token: { id: "0xAAA0000000000000000000000000000000000001", symbol: "AAA", decimals: 18 },
      sharesDeposited: "1000",
      sharesWithdrawn: "0",
      startEmission: String(FROZEN_NOW_SEC - 100),
      endEmission:   String(FROZEN_NOW_SEC + 1000),
      lockDate:      String(FROZEN_NOW_SEC - 200),
    };
    // Linear lock — exactly halfway → 500 locked of 1000
    const linearLock = {
      id: "lock-2",
      lockID: "2",
      releaseSchedule: "Linear" as const,
      token: { id: "0xBBB0000000000000000000000000000000000002", symbol: "BBB", decimals: 6 },
      sharesDeposited: "1000",
      sharesWithdrawn: "0",
      startEmission: String(FROZEN_NOW_SEC - 500),
      endEmission:   String(FROZEN_NOW_SEC + 500),
      lockDate:      String(FROZEN_NOW_SEC - 600),
    };

    let pageCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      pageCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return pageCount === 1
            ? { data: { locks: [cliffLock, linearLock] } }
            : { data: { locks: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkUncx(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(2);
    expect(result.tokens).toHaveLength(2);

    const aaa = result.tokens.find((t) => t.tokenSymbol === "AAA")!;
    const bbb = result.tokens.find((t) => t.tokenSymbol === "BBB")!;
    expect(aaa.lockedAmount).toBe("1000");      // cliff, fully locked
    expect(aaa.tokenDecimals).toBe(18);
    expect(bbb.lockedAmount).toBe("500");       // linear, half locked
    expect(bbb.tokenDecimals).toBe(6);
  });

  it("sums multiple locks for the same token", async () => {
    const tokenAddr = "0xCCC0000000000000000000000000000000000003";
    const lockA = {
      id: "lock-a",
      lockID: "10",
      releaseSchedule: "Cliff" as const,
      token: { id: tokenAddr, symbol: "CCC", decimals: 18 },
      sharesDeposited: "300",
      sharesWithdrawn: "0",
      startEmission: "0",
      endEmission:   String(FROZEN_NOW_SEC + 1000),
      lockDate:      "1",
    };
    const lockB = {
      ...lockA,
      id: "lock-b",
      lockID: "11",
      sharesDeposited: "700",
      lockDate: "2",
    };

    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? { data: { locks: [lockA, lockB] } }
            : { data: { locks: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkUncx(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].lockedAmount).toBe("1000");
    expect(result.tokens[0].streamCount).toBe(2);
  });

  it("skips zero-locked entries (cliff past, fully withdrawn)", async () => {
    const expiredCliff = {
      id: "exp",
      lockID: "20",
      releaseSchedule: "Cliff" as const,
      token: { id: "0xDDD0000000000000000000000000000000000004", symbol: "DDD", decimals: 18 },
      sharesDeposited: "100",
      sharesWithdrawn: "0",
      startEmission: "0",
      endEmission: String(FROZEN_NOW_SEC - 100), // already past
      lockDate: "1",
    };
    const fullyWithdrawn = {
      id: "fw",
      lockID: "21",
      releaseSchedule: "Cliff" as const,
      token: { id: "0xEEE0000000000000000000000000000000000005", symbol: "EEE", decimals: 18 },
      sharesDeposited: "100",
      sharesWithdrawn: "100",
      startEmission: "0",
      endEmission: String(FROZEN_NOW_SEC + 1000),
      lockDate: "2",
    };

    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? { data: { locks: [expiredCliff, fullyWithdrawn] } }
            : { data: { locks: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkUncx(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    // Both rows visited, but neither contributes to a TokenAggregate.
    expect(result.streamCount).toBe(2);
    expect(result.tokens).toEqual([]);
  });

  it("returns error and partial data on HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      async json() { return {}; },
    }) as unknown as Response));

    const result = await walkUncx(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("500");
    expect(result.tokens).toEqual([]);
  });

  it("paginates through multiple full pages until a partial page terminates", async () => {
    const PAGE_SIZE = 1000;
    const baseLock = {
      lockID: "x",
      releaseSchedule: "Cliff" as const,
      token: { id: "0xFFF0000000000000000000000000000000000099", symbol: "FFF", decimals: 18 },
      sharesDeposited: "1",
      sharesWithdrawn: "0",
      startEmission: "0",
      endEmission: String(FROZEN_NOW_SEC + 1000),
    };

    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      ...baseLock,
      id: `p1-${i}`,
      lockDate: String(1000 + i),
    }));
    const page2 = Array.from({ length: 5 }, (_, i) => ({
      ...baseLock,
      id: `p2-${i}`,
      lockDate: String(2000 + i),
    }));

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      return {
        ok: true,
        async json() {
          if (call === 1) return { data: { locks: page1 } };
          return { data: { locks: page2 } };
        },
      } as unknown as Response;
    }));

    const result = await walkUncx(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(PAGE_SIZE + 5);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].streamCount).toBe(PAGE_SIZE + 5);
  });

  it("returns graphql error and partial data when subgraph reports errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      async json() { return { errors: [{ message: "indexing error" }] }; },
    }) as unknown as Response));

    const result = await walkUncx(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("graphql errors");
  });
});
