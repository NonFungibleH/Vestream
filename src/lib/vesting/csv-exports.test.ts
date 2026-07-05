import { describe, it, expect } from "vitest";
import {
  buildTaxCsv,
  claimRowToExportRow,
  unlockRowToExportRow,
  type ExportFormat,
  type TaxExportRow,
} from "./csv-exports";
import golden from "./__golden_csv.json";

// A claim row + a synthetic-tx claim row — the exact fixture used to capture the
// golden output BEFORE the TaxExportRow refactor. Feeding claim-adapted rows
// through the new builders must reproduce byte-identical CSVs (regression guard;
// the claim path stays UTC).
function claimFixture() {
  const claim = {
    id: "c1", userId: "u1", streamId: "hedgey-1-42", protocol: "hedgey", chainId: 1,
    recipient: "0xrecipient", tokenAddress: "0xtoken", tokenSymbol: "NOVA", tokenDecimals: 18,
    amount: "1500000000000000000",
    claimedAt: new Date("2026-01-15T09:30:00.000Z"),
    txHash: "0xabc123", gasNative: null,
    usdValueAtClaim: "3000.000000", priceConfidence: "exact",
    gasUsdValueAtClaim: null, indexedAt: new Date("2026-02-01T00:00:00.000Z"),
  } as Parameters<typeof claimRowToExportRow>[0];
  const synthetic = { ...claim, id: "c2", txHash: "synthetic:hedgey-1-42:100", usdValueAtClaim: null, priceConfidence: "missing" } as typeof claim;
  return [claim, synthetic];
}

const FORMATS: ExportFormat[] = [
  "vestream-generic", "koinly", "cointracker", "turbotax",
  "payroll-income", "payroll-summary-us", "payroll-summary-uk",
];

describe("buildTaxCsv — claim regression (byte-identical)", () => {
  for (const format of FORMATS) {
    it(`${format} matches pre-refactor output`, () => {
      const rows = claimFixture().map(claimRowToExportRow);
      expect(buildTaxCsv(rows, format)).toBe((golden as Record<string, string>)[format]);
    });
  }
});

describe("unlockRowToExportRow", () => {
  const unlockRow = {
    id: "u1", userId: "user1", streamId: "hedgey-1-42", protocol: "hedgey", chainId: 1,
    recipient: "0xrecipient", tokenAddress: "0xtoken", tokenSymbol: "NOVA", tokenDecimals: 18,
    amount: "1500000000000000000",
    unlockTime: new Date("2025-08-20T00:00:00.000Z"),
    trancheKey: "hedgey-1-42:0:1000",
    usdValueAtUnlock: "1500.000000", priceConfidence: "exact",
    manualPrice: false, computedAt: new Date("2026-07-05T00:00:00.000Z"),
  } as Parameters<typeof unlockRowToExportRow>[0];

  it("maps unlock fields onto the common shape (date=unlockTime, no txHash)", () => {
    const r: TaxExportRow = unlockRowToExportRow(unlockRow);
    expect(r.date).toEqual(new Date("2025-08-20T00:00:00.000Z"));
    expect(r.usdValue).toBe("1500.000000");
    expect(r.txHash).toBeNull();
    expect(r.confidence).toBe("exact");
    expect(r.amount).toBe("1500000000000000000");
  });

  it("emits the unlock date + value in the CSV, never a silent 0 for missing", () => {
    const missing = { ...unlockRow, usdValueAtUnlock: null, priceConfidence: "missing" } as typeof unlockRow;
    const csv = buildTaxCsv([unlockRowToExportRow(missing)], "vestream-generic");
    const dataLine = csv.trim().split("\n")[1];
    expect(dataLine).toContain("2025-08-20"); // unlock date, not claim date
    // USD value + unit price cells are blank (not "0") for a missing price
    expect(dataLine).toContain(",,"); // consecutive empty cells where USD would be
    expect(dataLine).toContain("missing");
  });
});
