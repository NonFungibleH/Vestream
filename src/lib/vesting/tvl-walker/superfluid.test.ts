// src/lib/vesting/tvl-walker/superfluid.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Walker tests for Superfluid vestingSchedules. Time-frozen so the cliff/flow
// math is deterministic. Mocks both `fetch` (subgraph) and viem multicall
// (SuperToken metadata).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CHAIN_IDS } from "../types";

const FROZEN_NOW_SEC = 2_000_000_000;

const multicallMock = vi.fn();
vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof import("viem")>();
  return {
    ...original,
    createPublicClient: () => ({ multicall: multicallMock }),
    http: () => () => ({}),
  };
});

import { walkSuperfluid } from "./superfluid";

describe("walkSuperfluid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW_SEC * 1000);
    multicallMock.mockReset();
    multicallMock.mockImplementation(async ({ contracts }: { contracts: { functionName: string }[] }) => {
      return contracts.map((c) => ({
        status: "success",
        // getUnderlyingToken → zero address: these test SuperTokens are native
        // (no underlying), so aggregation keys by the SuperToken address itself.
        // Returning a non-address here (the old `: 18` default) poisoned the
        // underlying lookup added in the 2026-06-23 underlying-pricing change.
        result:
          c.functionName === "symbol"             ? "SUPER"
          : c.functionName === "getUnderlyingToken" ? "0x0000000000000000000000000000000000000000"
          : 18,
      }));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns error result for unsupported chain", async () => {
    const result = await walkSuperfluid(CHAIN_IDS.SEPOLIA);
    expect(result.protocol).toBe("superfluid");
    expect(result.error).toBe("no subgraph configured for this chain");
    expect(result.tokens).toEqual([]);
  });

  it("computes locked correctly: pre-cliff, mid-flow, post-end", async () => {
    // pre-cliff → totalVested = 0 → locked = total
    const preCliff = {
      id: "1",
      superToken: "0xST1",
      sender: "0xs", receiver: "0xr",
      startDate: String(FROZEN_NOW_SEC + 100),
      cliffAndFlowDate: String(FROZEN_NOW_SEC + 1000),
      cliffAmount: "10",
      flowRate: "1",
      endDate: String(FROZEN_NOW_SEC + 5000),
      totalAmount: "1000",
      settledAmount: "0",
      cliffAndFlowExecutedAt: null, endExecutedAt: null, deletedAt: null,
    };
    // mid-flow: cliff at now-100, end at now+900 → cliffAmount=100 + 1*100 = 200 vested → 800 locked
    const midFlow = {
      id: "2",
      superToken: "0xST2",
      sender: "0xs", receiver: "0xr",
      startDate: String(FROZEN_NOW_SEC - 200),
      cliffAndFlowDate: String(FROZEN_NOW_SEC - 100),
      cliffAmount: "100",
      flowRate: "1",
      endDate: String(FROZEN_NOW_SEC + 900),
      totalAmount: "1000",
      settledAmount: "0",
      cliffAndFlowExecutedAt: null, endExecutedAt: null, deletedAt: null,
    };
    // post-end → fully vested → locked 0 (will be filtered out)
    const postEnd = {
      id: "3",
      superToken: "0xST3",
      sender: "0xs", receiver: "0xr",
      startDate: String(FROZEN_NOW_SEC - 5000),
      cliffAndFlowDate: String(FROZEN_NOW_SEC - 4000),
      cliffAmount: "0",
      flowRate: "1",
      endDate: String(FROZEN_NOW_SEC - 100),
      totalAmount: "1000",
      settledAmount: "0",
      cliffAndFlowExecutedAt: null, endExecutedAt: null, deletedAt: null,
    };

    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? { data: { vestingSchedules: [preCliff, midFlow, postEnd] } }
            : { data: { vestingSchedules: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkSuperfluid(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(3);
    expect(result.tokens).toHaveLength(2);

    const st1 = result.tokens.find((t) => t.tokenAddress === "0xst1")!;
    const st2 = result.tokens.find((t) => t.tokenAddress === "0xst2")!;
    expect(st1.lockedAmount).toBe("1000");
    expect(st2.lockedAmount).toBe("800");
  });

  it("prices by the underlying ERC-20 when a SuperToken wraps one", async () => {
    const UNDERLYING = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // e.g. USDC
    const sched = {
      id: "1", superToken: "0xUSDCx", sender: "0xs", receiver: "0xr",
      startDate:        String(FROZEN_NOW_SEC - 100),
      cliffAndFlowDate: String(FROZEN_NOW_SEC + 1000), // pre-cliff → all locked
      cliffAmount: "0", flowRate: "1",
      endDate:          String(FROZEN_NOW_SEC + 5000),
      totalAmount: "1000", settledAmount: "0",
      cliffAndFlowExecutedAt: null, endExecutedAt: null, deletedAt: null,
    };
    multicallMock.mockImplementation(async ({ contracts }: { contracts: { functionName: string }[] }) =>
      contracts.map((c) => ({
        status: "success",
        result:
          c.functionName === "symbol"             ? "USDCx"
          : c.functionName === "getUnderlyingToken" ? UNDERLYING
          : 18,
      })),
    );
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? { data: { vestingSchedules: [sched] } }
            : { data: { vestingSchedules: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkSuperfluid(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.tokens).toHaveLength(1);
    // Priced by the underlying token, not the SuperToken address.
    expect(result.tokens[0].tokenAddress).toBe(UNDERLYING);
    expect(result.tokens[0].lockedAmount).toBe("1000");
  });

  it("sums multiple schedules for the same SuperToken", async () => {
    const make = (id: string, superToken: string) => ({
      id,
      superToken,
      sender: "0xs", receiver: "0xr",
      startDate: "0",
      cliffAndFlowDate: String(FROZEN_NOW_SEC + 1000),  // pre-cliff → fully locked
      cliffAmount: "0",
      flowRate: "0",
      endDate: String(FROZEN_NOW_SEC + 2000),
      totalAmount: "100",
      settledAmount: "0",
      cliffAndFlowExecutedAt: null, endExecutedAt: null, deletedAt: null,
    });

    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return calls === 1
            ? { data: { vestingSchedules: [make("a", "0xST"), make("b", "0xST")] } }
            : { data: { vestingSchedules: [] } };
        },
      } as unknown as Response;
    }));

    const result = await walkSuperfluid(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].lockedAmount).toBe("200");
    expect(result.tokens[0].streamCount).toBe(2);
  });

  it("returns HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 503,
      async json() { return {}; },
    }) as unknown as Response));

    const result = await walkSuperfluid(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("503");
  });

  it("paginates until partial page", async () => {
    const PAGE_SIZE = 1000;
    const make = (id: string) => ({
      id,
      superToken: "0xUNI",
      sender: "0xs", receiver: "0xr",
      startDate: "0",
      cliffAndFlowDate: String(FROZEN_NOW_SEC + 1000),
      cliffAmount: "0",
      flowRate: "0",
      endDate: String(FROZEN_NOW_SEC + 2000),
      totalAmount: "1",
      settledAmount: "0",
      cliffAndFlowExecutedAt: null, endExecutedAt: null, deletedAt: null,
    });
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => make(`p1-${i}`));
    const page2 = [make("p2-0")];

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      return {
        ok: true,
        async json() {
          return call === 1
            ? { data: { vestingSchedules: page1 } }
            : { data: { vestingSchedules: page2 } };
        },
      } as unknown as Response;
    }));

    const result = await walkSuperfluid(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(PAGE_SIZE + 1);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].streamCount).toBe(PAGE_SIZE + 1);
  });

  it("returns graphql errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      async json() { return { errors: [{ message: "x" }] }; },
    }) as unknown as Response));

    const result = await walkSuperfluid(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("graphql errors");
  });
});
