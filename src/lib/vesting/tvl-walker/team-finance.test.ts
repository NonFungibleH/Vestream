// src/lib/vesting/tvl-walker/team-finance.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Walker tests for Team Finance Squid `vestingFactoryVestings`. Mocks the
// HTTP fetch to the Squid endpoint AND mocks `viem`'s createPublicClient so
// the metadata-multicall step doesn't hit the network.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CHAIN_IDS } from "../types";

// ── Stub viem.createPublicClient → multicall returns symbol/decimals pairs ──
const multicallMock = vi.fn();
vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof import("viem")>();
  return {
    ...original,
    createPublicClient: () => ({ multicall: multicallMock }),
    http: () => () => ({}),
  };
});

import { walkTeamFinance } from "./team-finance";

describe("walkTeamFinance", () => {
  beforeEach(() => {
    multicallMock.mockReset();
    // Default: any token resolves as { symbol: "TKN", decimals: 18 }
    multicallMock.mockImplementation(async ({ contracts }: { contracts: { functionName: string }[] }) => {
      return contracts.map((c) => ({
        status: "success",
        result: c.functionName === "symbol" ? "TKN" : 18,
      }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns error result for unsupported chain", async () => {
    const result = await walkTeamFinance(CHAIN_IDS.SEPOLIA);
    expect(result.protocol).toBe("team-finance");
    expect(result.tokens).toEqual([]);
    expect(result.error).toBe("chain not supported by team-finance walker");
  });

  it("aggregates locked = tokenTotal - claimed and skips fully-claimed", async () => {
    const v = (id: string, token: string, total: string, claimed: string) => ({
      id, address: "0xva", token, tokenTotal: total, claimed,
    });

    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? {
                data: {
                  vestingFactoryVestings: [
                    v("1", "0xAAA", "1000", "300"),  // locked = 700
                    v("2", "0xBBB", "500", "500"),   // locked = 0 (skip)
                    v("3", "0xCCC", "0",   "0"),     // tokenTotal "0" → falsy, skipped
                  ],
                },
              }
            : { data: { vestingFactoryVestings: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkTeamFinance(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(3);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].tokenAddress).toBe("0xaaa");
    expect(result.tokens[0].lockedAmount).toBe("700");
    expect(result.tokens[0].tokenSymbol).toBe("TKN");
  });

  it("sums multiple vestings sharing the same token", async () => {
    const tok = "0xSAME";
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? {
                data: {
                  vestingFactoryVestings: [
                    { id: "1", address: "0xa", token: tok, tokenTotal: "1000", claimed: "100" },
                    { id: "2", address: "0xb", token: tok, tokenTotal: "500",  claimed: "200" },
                  ],
                },
              }
            : { data: { vestingFactoryVestings: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkTeamFinance(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].lockedAmount).toBe("1200"); // 900 + 300
    expect(result.tokens[0].streamCount).toBe(2);
  });

  it("returns multi-token aggregates when 2+ tokens are present", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? {
                data: {
                  vestingFactoryVestings: [
                    { id: "1", address: "0xa", token: "0xT1", tokenTotal: "100", claimed: "0" },
                    { id: "2", address: "0xb", token: "0xT2", tokenTotal: "200", claimed: "0" },
                  ],
                },
              }
            : { data: { vestingFactoryVestings: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkTeamFinance(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toHaveLength(2);
  });

  it("returns HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      async json() { return {}; },
    }) as unknown as Response));

    const result = await walkTeamFinance(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("500");
    expect(result.tokens).toEqual([]);
  });

  it("paginates until partial page", async () => {
    const PAGE_SIZE = 1000;
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `p1-${i}`, address: "0xa", token: "0xUNI", tokenTotal: "10", claimed: "0",
    }));
    const page2 = [
      { id: "p2-0", address: "0xa", token: "0xUNI", tokenTotal: "5", claimed: "0" },
    ];

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      return {
        ok: true,
        async json() {
          return call === 1
            ? { data: { vestingFactoryVestings: page1 } }
            : { data: { vestingFactoryVestings: page2 } };
        },
      } as unknown as Response;
    }));

    const result = await walkTeamFinance(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(PAGE_SIZE + 1);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].streamCount).toBe(PAGE_SIZE + 1);
  });

  it("returns graphql error from squid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      async json() { return { errors: [{ message: "bad" }] }; },
    }) as unknown as Response));

    const result = await walkTeamFinance(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("graphql errors");
  });
});
