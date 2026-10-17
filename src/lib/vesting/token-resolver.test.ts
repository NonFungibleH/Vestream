import { describe, it, expect, vi, beforeEach } from "vitest";

const readContract = vi.fn();
vi.mock("./rpc", () => ({ makeFallbackClient: () => ({ readContract }) }));

import { resolveTokenMeta, __resetTokenResolverCache } from "./token-resolver";

const QOIN = "0x7ba2accc20861f7b0e58c0a97d1ad94cc29b3049";

beforeEach(() => {
  __resetTokenResolverCache();
  readContract.mockReset();
});

describe("resolveTokenMeta decimals hint", () => {
  it("does not trust a hint of 0: confirms on-chain (QOIN is 18, Envio said 0)", async () => {
    readContract.mockResolvedValue(18);
    const meta = await resolveTokenMeta(8453, QOIN, { existingSymbol: "QOIN", existingDecimals: 0 });
    expect(meta.decimals).toBe(18);
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it("keeps 0 when the token really has 0 decimals", async () => {
    readContract.mockResolvedValue(0);
    const meta = await resolveTokenMeta(8453, QOIN, { existingSymbol: "QOIN", existingDecimals: 0 });
    expect(meta.decimals).toBe(0);
  });

  it("falls back to the hint when the on-chain read fails", async () => {
    readContract.mockRejectedValue(new Error("rpc down"));
    const meta = await resolveTokenMeta(8453, QOIN, { existingSymbol: "QOIN", existingDecimals: 0 });
    expect(meta.decimals).toBe(0);
  });

  it("trusts a non-zero hint without an RPC call", async () => {
    const meta = await resolveTokenMeta(8453, QOIN, { existingSymbol: "QOIN", existingDecimals: 18 });
    expect(meta.decimals).toBe(18);
    expect(readContract).not.toHaveBeenCalled();
  });
});
