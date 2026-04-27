// src/lib/vesting/tvl-walker/pinksale.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Walker tests for PinkSale (PinkLock V2) — direct contract reads + multicall.
//
// Mock surface:
//   * `viem.createPublicClient()` returns a stub with `readContract` (the
//     initial allNormalTokenLockedCount call) and `multicall` (every other
//     batch). The walker dispatches by `functionName` so we route by name
//     too — keeps mock setup small and readable.
//
// We use chunkedMulticall semantics indirectly: each multicall call goes
// through pass-1 only (no failures triggered). On chunked multicalls a
// single Call entry produces a single result entry, and contracts may mix
// `getCumulativeNormalTokenLockInfo`, `totalLockCountForToken`,
// `getLocksForToken`, `symbol`, and `decimals`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CHAIN_IDS } from "../types";

const readContractMock = vi.fn();
const multicallMock    = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof import("viem")>();
  return {
    ...original,
    createPublicClient: () => ({
      readContract: readContractMock,
      multicall:    multicallMock,
    }),
    http: () => () => ({}),
  };
});

import { walkPinkSale } from "./pinksale";

// Helper: build a multicall mock that dispatches by functionName.
function makeRouter(routes: Record<string, (call: { args?: readonly unknown[] }) => unknown>) {
  return async ({ contracts }: { contracts: { functionName: string; args?: readonly unknown[] }[] }) =>
    contracts.map((c) => {
      const fn = routes[c.functionName];
      if (!fn) return { status: "failure" as const, error: new Error(`unmocked ${c.functionName}`) };
      try {
        return { status: "success" as const, result: fn(c) };
      } catch (e) {
        return { status: "failure" as const, error: e };
      }
    });
}

describe("walkPinkSale", () => {
  beforeEach(() => {
    readContractMock.mockReset();
    multicallMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns error result for chain with no PinkLock contract", async () => {
    const result = await walkPinkSale(CHAIN_IDS.SEPOLIA);
    expect(result.protocol).toBe("pinksale");
    expect(result.tokens).toEqual([]);
    expect(result.error).toBe("no contract deployed on this chain");
  });

  it("returns clean empty when allNormalTokenLockedCount is 0", async () => {
    readContractMock.mockResolvedValueOnce(0n);
    const result = await walkPinkSale(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it("aggregates locked = amount - unlockedAmount across multiple locks/tokens", async () => {
    const T1 = "0xT100000000000000000000000000000000000001";
    const T2 = "0xT200000000000000000000000000000000000002";
    readContractMock.mockResolvedValueOnce(2n); // allNormalTokenLockedCount

    multicallMock.mockImplementation(makeRouter({
      // Cumulative token info — paged: returns the tuple list for that page.
      getCumulativeNormalTokenLockInfo: () => ([
        { token: T1, factory: "0x0", amount: 100n },
        { token: T2, factory: "0x0", amount: 50n  },
      ]),
      totalLockCountForToken: ({ args }) => {
        const [token] = args as [string];
        const t = token.toLowerCase();
        if (t === T1.toLowerCase()) return 2n;
        if (t === T2.toLowerCase()) return 1n;
        return 0n;
      },
      getLocksForToken: ({ args }) => {
        const [token] = args as [string, bigint, bigint];
        const t = token.toLowerCase();
        if (t === T1.toLowerCase()) {
          return [
            { id: 1n, token: T1, owner: "0x0", amount: 100n,
              lockDate: 0n, tgeDate: 0n, tgeBps: 0n, cycle: 0n, cycleBps: 0n,
              unlockedAmount: 30n, description: "" },
            { id: 2n, token: T1, owner: "0x0", amount: 200n,
              lockDate: 0n, tgeDate: 0n, tgeBps: 0n, cycle: 0n, cycleBps: 0n,
              unlockedAmount: 0n,  description: "" },
          ];
        }
        return [
          { id: 3n, token: T2, owner: "0x0", amount: 500n,
            lockDate: 0n, tgeDate: 0n, tgeBps: 0n, cycle: 0n, cycleBps: 0n,
            unlockedAmount: 100n, description: "" },
        ];
      },
      symbol:   () => "TKN",
      decimals: () => 18,
    }));

    const result = await walkPinkSale(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(3);
    expect(result.tokens).toHaveLength(2);

    const t1 = result.tokens.find((t) => t.tokenAddress === T1.toLowerCase())!;
    const t2 = result.tokens.find((t) => t.tokenAddress === T2.toLowerCase())!;
    expect(t1.lockedAmount).toBe("270"); // (100-30) + (200-0)
    expect(t1.streamCount).toBe(2);
    expect(t2.lockedAmount).toBe("400"); // 500-100
    expect(t2.streamCount).toBe(1);
  });

  it("skips fully-unlocked locks (unlockedAmount >= amount)", async () => {
    const T = "0xT00000000000000000000000000000000000000A";
    readContractMock.mockResolvedValueOnce(1n);

    multicallMock.mockImplementation(makeRouter({
      getCumulativeNormalTokenLockInfo: () => ([
        { token: T, factory: "0x0", amount: 100n },
      ]),
      totalLockCountForToken: () => 2n,
      getLocksForToken: () => ([
        { id: 1n, token: T, owner: "0x0", amount: 100n,
          lockDate: 0n, tgeDate: 0n, tgeBps: 0n, cycle: 0n, cycleBps: 0n,
          unlockedAmount: 100n, description: "fully unlocked" }, // skip
        { id: 2n, token: T, owner: "0x0", amount: 100n,
          lockDate: 0n, tgeDate: 0n, tgeBps: 0n, cycle: 0n, cycleBps: 0n,
          unlockedAmount: 200n, description: "over-unlocked (data quirk)" }, // skip
      ]),
      symbol: () => "TKN",
      decimals: () => 18,
    }));

    const result = await walkPinkSale(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
  });

  it("returns error if allNormalTokenLockedCount throws", async () => {
    readContractMock.mockRejectedValue(new Error("rpc dead"));
    const result = await walkPinkSale(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("allNormalTokenLockedCount failed");
    expect(result.tokens).toEqual([]);
  });

  it("returns clean empty when discovery yields no tokens", async () => {
    readContractMock.mockResolvedValueOnce(1n);
    multicallMock.mockImplementation(makeRouter({
      // Returns rows but the only row is the zero-address sentinel → filtered.
      getCumulativeNormalTokenLockInfo: () => ([
        { token: "0x0000000000000000000000000000000000000000", factory: "0x0", amount: 0n },
      ]),
    }));

    const result = await walkPinkSale(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
  });
});
