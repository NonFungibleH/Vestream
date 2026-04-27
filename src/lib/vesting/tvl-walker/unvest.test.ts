// src/lib/vesting/tvl-walker/unvest.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Walker tests for Unvest holderBalances. The walker uses the subgraph's
// pre-computed `locked` field — no time-based math here, but we still cover
// aggregation, malformed-row skipping, pagination, and error paths.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { walkUnvest } from "./unvest";
import { CHAIN_IDS } from "../types";

describe("walkUnvest", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns error result for unsupported chain", async () => {
    const result = await walkUnvest(CHAIN_IDS.SEPOLIA);
    expect(result.protocol).toBe("unvest");
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
    expect(result.error).toBe("no subgraph configured for this chain");
  });

  it("aggregates locked amounts by underlying token", async () => {
    const row = (id: string, locked: string, underlyingId: string, sym: string, dec: number) => ({
      id,
      user: "0xuser",
      allocation: "1000",
      claimed: "0",
      claimable: "0",
      locked,
      vestingToken: {
        id: "0xvt-" + id,
        underlyingToken: { id: underlyingId, symbol: sym, decimals: dec },
      },
    });

    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          if (calls === 1) {
            return {
              data: {
                holderBalances: [
                  row("a", "1000", "0xUNDER1", "UN1", 18),
                  row("b", "2500", "0xUNDER2", "UN2", 6),
                ],
              },
            };
          }
          return { data: { holderBalances: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkUnvest(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.tokens).toHaveLength(2);
    const un1 = result.tokens.find((t) => t.tokenSymbol === "UN1")!;
    expect(un1.tokenAddress).toBe("0xunder1");
    expect(un1.lockedAmount).toBe("1000");
    expect(un1.tokenDecimals).toBe(18);
    const un2 = result.tokens.find((t) => t.tokenSymbol === "UN2")!;
    expect(un2.lockedAmount).toBe("2500");
  });

  it("sums multiple holder balances for the same underlying token", async () => {
    const make = (id: string, locked: string) => ({
      id,
      user: "0xu",
      allocation: "0",
      claimed: "0",
      claimable: "0",
      locked,
      vestingToken: {
        id: "0xvt",
        underlyingToken: { id: "0xUNDER", symbol: "UN", decimals: 18 },
      },
    });

    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? { data: { holderBalances: [make("a", "100"), make("b", "250")] } }
            : { data: { holderBalances: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkUnvest(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].lockedAmount).toBe("350");
    expect(result.tokens[0].streamCount).toBe(2);
  });

  it("skips zero-locked rows and rows missing underlyingToken", async () => {
    const zeroLocked = {
      id: "z",
      user: "0xu",
      allocation: "0",
      claimed: "0",
      claimable: "0",
      locked: "0",
      vestingToken: { id: "0xvt", underlyingToken: { id: "0xU", symbol: "X", decimals: 18 } },
    };
    const malformed = {
      id: "m",
      user: "0xu",
      allocation: "0",
      claimed: "0",
      claimable: "0",
      locked: "100",
      vestingToken: { id: "0xvt", underlyingToken: null },
    };

    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? { data: { holderBalances: [zeroLocked, malformed] } }
            : { data: { holderBalances: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkUnvest(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(2);
  });

  it("returns error on HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      async json() { return {}; },
    }) as unknown as Response));

    const result = await walkUnvest(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("500");
    expect(result.tokens).toEqual([]);
  });

  it("paginates until a partial page terminates", async () => {
    const PAGE_SIZE = 1000;
    const make = (id: string) => ({
      id,
      user: "0xu",
      allocation: "0",
      claimed: "0",
      claimable: "0",
      locked: "1",
      vestingToken: {
        id: "0xvt",
        underlyingToken: { id: "0xUNIQUE", symbol: "U", decimals: 18 },
      },
    });
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => make(`a${String(i).padStart(5, "0")}`));
    const page2 = Array.from({ length: 3 }, (_, i) => make(`b${i}`));

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      return {
        ok: true,
        async json() {
          return call === 1
            ? { data: { holderBalances: page1 } }
            : { data: { holderBalances: page2 } };
        },
      } as unknown as Response;
    }));

    const result = await walkUnvest(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(PAGE_SIZE + 3);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].streamCount).toBe(PAGE_SIZE + 3);
  });

  it("returns graphql error string on response errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      async json() { return { errors: [{ message: "boom" }] }; },
    }) as unknown as Response));

    const result = await walkUnvest(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("graphql errors");
  });
});
