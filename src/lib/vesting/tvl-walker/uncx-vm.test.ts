// src/lib/vesting/tvl-walker/uncx-vm.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Walker tests for UNCX VestingManager (event-driven). Mocks the viem client's
// getBlockNumber, getLogs, and multicall. Pads the topic[1] (vestingId) so it
// decodes back to a stable bigint.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CHAIN_IDS } from "../types";

const FROZEN_NOW_SEC = 2_000_000_000;

const VESTING_CREATED_TOPIC =
  "0xcfcd2ea84a9e988255710b3adc4919275a012aa72f68b63acf1e9f67296e134f";

function vestingIdTopic(id: number): string {
  return "0x" + id.toString(16).padStart(64, "0");
}

const getBlockNumberMock = vi.fn();
const getLogsMock = vi.fn();
const multicallMock = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof import("viem")>();
  return {
    ...original,
    createPublicClient: () => ({
      getBlockNumber: getBlockNumberMock,
      getLogs:        getLogsMock,
      multicall:      multicallMock,
    }),
    http: () => () => ({}),
  };
});

import { walkUncxVm } from "./uncx-vm";

describe("walkUncxVm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW_SEC * 1000);
    getBlockNumberMock.mockReset();
    getLogsMock.mockReset();
    multicallMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns clean empty for unsupported chain (e.g. Polygon)", async () => {
    const result = await walkUncxVm(CHAIN_IDS.POLYGON);
    expect(result.protocol).toBe("uncx-vm");
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it("aggregates schedules: sums future tranches, clamps to (total - released), skips cancelled", async () => {
    // 1 block window so we only emit one getLogs chunk
    getBlockNumberMock.mockResolvedValue(23_143_944n);
    getLogsMock.mockResolvedValue([
      { topics: [VESTING_CREATED_TOPIC, vestingIdTopic(1), null, null] },
      { topics: [VESTING_CREATED_TOPIC, vestingIdTopic(2), null, null] },
      { topics: [VESTING_CREATED_TOPIC, vestingIdTopic(3), null, null] },
    ]);

    // Schedules:
    //   id=1 → token 0xAAA, total 1000, released 100 → remaining 900;
    //          two future tranches summing to 600 → locked 600
    //   id=2 → cancelled → 0 (skipped)
    //   id=3 → token 0xAAA, total 200, released 0, future tranche 50 → locked 50
    multicallMock.mockImplementation(async ({ contracts }: { contracts: { args: [bigint] }[] }) => {
      return contracts.map(({ args }) => {
        const [vid] = args;
        if (vid === 1n) {
          return {
            status: "success" as const,
            result: {
              token: "0xAAA0000000000000000000000000000000000001" as `0x${string}`,
              creator: "0x0", beneficiary: "0x0",
              totalAmount: 1000n, isSoft: false, isNftized: false, isTopable: false,
              released: 100n, cancelled: false, vestingType: 0,
              tranches: [
                { time: BigInt(FROZEN_NOW_SEC + 100),  amount: 400n },
                { time: BigInt(FROZEN_NOW_SEC + 200),  amount: 200n },
                { time: BigInt(FROZEN_NOW_SEC - 100),  amount: 300n }, // past → excluded
              ],
            },
          };
        }
        if (vid === 2n) {
          return {
            status: "success" as const,
            result: {
              token: "0xAAA0000000000000000000000000000000000001" as `0x${string}`,
              creator: "0x0", beneficiary: "0x0",
              totalAmount: 1000n, isSoft: false, isNftized: false, isTopable: false,
              released: 0n, cancelled: true, vestingType: 0,
              tranches: [{ time: BigInt(FROZEN_NOW_SEC + 100), amount: 1000n }],
            },
          };
        }
        return {
          status: "success" as const,
          result: {
            token: "0xAAA0000000000000000000000000000000000001" as `0x${string}`,
            creator: "0x0", beneficiary: "0x0",
            totalAmount: 200n, isSoft: false, isNftized: false, isTopable: false,
            released: 0n, cancelled: false, vestingType: 0,
            tranches: [{ time: BigInt(FROZEN_NOW_SEC + 50), amount: 50n }],
          },
        };
      });
    });

    const result = await walkUncxVm(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.streamCount).toBe(2); // id=2 cancelled → not counted
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].tokenAddress).toBe("0xaaa0000000000000000000000000000000000001");
    expect(result.tokens[0].lockedAmount).toBe("650"); // 600 + 50
    expect(result.tokens[0].streamCount).toBe(2);
  });

  it("aggregates 2+ tokens", async () => {
    getBlockNumberMock.mockResolvedValue(23_143_944n);
    getLogsMock.mockResolvedValue([
      { topics: [VESTING_CREATED_TOPIC, vestingIdTopic(1), null, null] },
      { topics: [VESTING_CREATED_TOPIC, vestingIdTopic(2), null, null] },
    ]);

    multicallMock.mockImplementation(async ({ contracts }: { contracts: { args: [bigint]; functionName: string }[] }) => {
      return contracts.map(({ args, functionName }) => {
        if (functionName === "getVestingSchedule") {
          const [vid] = args;
          const token = vid === 1n
            ? "0xAA00000000000000000000000000000000000001"
            : "0xBB00000000000000000000000000000000000002";
          return {
            status: "success" as const,
            result: {
              token: token as `0x${string}`,
              creator: "0x0", beneficiary: "0x0",
              totalAmount: 100n, isSoft: false, isNftized: false, isTopable: false,
              released: 0n, cancelled: false, vestingType: 0,
              tranches: [{ time: BigInt(FROZEN_NOW_SEC + 100), amount: 100n }],
            },
          };
        }
        // token-meta multicall — symbol or decimals
        return {
          status: "success" as const,
          result: functionName === "symbol" ? "TOK" : 18,
        };
      });
    });

    const result = await walkUncxVm(CHAIN_IDS.ETHEREUM);
    expect(result.error).toBeNull();
    expect(result.tokens).toHaveLength(2);
  });

  it("returns empty result when no logs found", async () => {
    getBlockNumberMock.mockResolvedValue(23_143_944n);
    getLogsMock.mockResolvedValue([]);
    const result = await walkUncxVm(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toEqual([]);
    expect(result.streamCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it("returns error when getBlockNumber fails", async () => {
    getBlockNumberMock.mockRejectedValue(new Error("rpc dead"));
    const result = await walkUncxVm(CHAIN_IDS.ETHEREUM);
    expect(result.error).toContain("getBlockNumber");
    expect(result.tokens).toEqual([]);
  });

  it("skips zero-locked schedules (released >= total, no future tranches)", async () => {
    getBlockNumberMock.mockResolvedValue(23_143_944n);
    getLogsMock.mockResolvedValue([
      { topics: [VESTING_CREATED_TOPIC, vestingIdTopic(1), null, null] },
      { topics: [VESTING_CREATED_TOPIC, vestingIdTopic(2), null, null] },
    ]);

    multicallMock.mockImplementation(async ({ contracts }: { contracts: { args: [bigint]; functionName: string }[] }) => {
      return contracts.map(({ args, functionName }) => {
        if (functionName !== "getVestingSchedule") {
          return { status: "success" as const, result: functionName === "symbol" ? "TOK" : 18 };
        }
        const [vid] = args;
        if (vid === 1n) {
          // Fully released
          return {
            status: "success" as const,
            result: {
              token: "0xCC00000000000000000000000000000000000003" as `0x${string}`,
              creator: "0x0", beneficiary: "0x0",
              totalAmount: 100n, isSoft: false, isNftized: false, isTopable: false,
              released: 100n, cancelled: false, vestingType: 0,
              tranches: [{ time: BigInt(FROZEN_NOW_SEC + 100), amount: 100n }],
            },
          };
        }
        // No future tranches
        return {
          status: "success" as const,
          result: {
            token: "0xCC00000000000000000000000000000000000003" as `0x${string}`,
            creator: "0x0", beneficiary: "0x0",
            totalAmount: 100n, isSoft: false, isNftized: false, isTopable: false,
            released: 0n, cancelled: false, vestingType: 0,
            tranches: [{ time: BigInt(FROZEN_NOW_SEC - 50), amount: 100n }],
          },
        };
      });
    });

    const result = await walkUncxVm(CHAIN_IDS.ETHEREUM);
    expect(result.tokens).toEqual([]);
  });
});
