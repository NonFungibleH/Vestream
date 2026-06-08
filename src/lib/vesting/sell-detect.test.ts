import { describe, it, expect } from "vitest";
import { transfersToCandidates, type RawTransfer } from "./sell-detect";

const TOKEN = "0xAbC0000000000000000000000000000000000001";
const WALLET = "0x1111111111111111111111111111111111111111";
const OWN2   = "0x2222222222222222222222222222222222222222";
const DEX    = "0x9999999999999999999999999999999999999999";

function t(over: Partial<RawTransfer>): RawTransfer {
  return {
    uniqueId:       "0xhash:log:0",
    hash:           "0xhash",
    from:           WALLET,
    to:             DEX,
    rawValueHex:    "0x0de0b6b3a7640000", // 1e18
    decimals:       18,
    value:          1,
    blockTimestamp: "2026-03-01T12:00:00.000Z",
    ...over,
  };
}

describe("transfersToCandidates", () => {
  it("maps an outbound transfer to a candidate (base-unit amount from rawValueHex)", () => {
    const out = transfersToCandidates([t({})], [WALLET], 1, TOKEN);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      chainId:          1,
      tokenAddress:     TOKEN.toLowerCase(),
      txHash:           "0xhash",
      uniqueId:         "0xhash:log:0",
      toAddress:        DEX.toLowerCase(),
      amountRaw:        "1000000000000000000",
      occurredAt:       "2026-03-01T12:00:00.000Z",
      internalTransfer: false,
    });
  });

  it("flags transfers to the user's own tracked wallets as internal", () => {
    const out = transfersToCandidates([t({ to: OWN2 })], [WALLET, OWN2], 1, TOKEN);
    expect(out[0].internalTransfer).toBe(true);
  });

  it("is case-insensitive on the own-wallet match", () => {
    const out = transfersToCandidates([t({ to: OWN2.toLowerCase() })], [OWN2.toUpperCase()], 1, TOKEN);
    expect(out[0].internalTransfer).toBe(true);
  });

  it("falls back to value*10^decimals when rawValueHex is missing", () => {
    const out = transfersToCandidates([t({ rawValueHex: null, value: 2.5, decimals: 6 })], [WALLET], 1, TOKEN);
    expect(out[0].amountRaw).toBe("2500000");
  });

  it("skips rows with no recipient or no timestamp", () => {
    const out = transfersToCandidates(
      [t({ to: null }), t({ uniqueId: "x", blockTimestamp: "" })],
      [WALLET], 1, TOKEN,
    );
    expect(out).toEqual([]);
  });

  it("dedupes by uniqueId", () => {
    const out = transfersToCandidates([t({}), t({})], [WALLET], 1, TOKEN);
    expect(out).toHaveLength(1);
  });
});
