// src/lib/vesting/csv-exports.ts
// ─────────────────────────────────────────────────────────────────────────────
// CSV exports of claim history for tax / accounting consumption.
//
// v1 ships ONE format: "vestream-generic" — a clean column layout that
// covers what most tax software ingests via "Generic CSV" import. Future
// commits add format-specific outputs:
//
//   "koinly"      — Koinly's native CSV columns
//   "cointracker" — CoinTracker's native CSV columns
//   "turbotax"    — TurboTax cryptocurrency CSV
//   "irs-8949"    — IRS Form 8949 cap-gains template
//   "hmrc-sa108"  — HMRC self-assessment SA108 template
//
// All formats consume the same source rows from the `claim_events` table.
// Format-specific logic lives in this file (one function per format).
// ─────────────────────────────────────────────────────────────────────────────

import type { claimEvents } from "../db/schema";
import { CHAIN_NAMES } from "./types";

// Drizzle row shape from `select().from(claimEvents)`.
type ClaimRow = typeof claimEvents.$inferSelect;

export type ExportFormat =
  | "vestream-generic"
  | "koinly"
  | "cointracker"
  | "turbotax"
  | "payroll-income"     // per-claim ordinary-income detail at FMV-on-receipt
  | "payroll-summary-us" // payer-grouped totals for IRS / 1099-NEC summary
  | "payroll-summary-uk"; // payer-grouped totals for HMRC / SA103 self-employment

/**
 * Format a single CSV cell — escape if it contains a comma, quote, or
 * newline. RFC 4180 — wrap in double quotes and double-up internal quotes.
 */
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

/** Convert raw token amount (bigint string × 10^decimals) to a human-readable
 *  whole-token string. Returns "—" on parse failure. */
function tokensWhole(amount: string, decimals: number): string {
  try {
    const big = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole   = big / divisor;
    const frac    = big % divisor;
    if (frac === 0n) return whole.toString();
    // Show up to 8 decimal places, trim trailing zeros
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 8).replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return "—";
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function isoDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19); // YYYY-MM-DD HH:MM:SS UTC
}

/**
 * User-supplied per-stream context, threaded into all CSV builders below.
 * Caller passes a `Map<streamId, { customName, notes }>` populated via
 * `getStreamAnnotationsForUser()`. When absent, builders fall back to the
 * existing protocol-derived descriptions — annotations are pure additive
 * context, never replacing the underlying machine-readable data.
 */
export interface AnnotationsByStreamId {
  get(streamId: string): { customName: string | null; notes: string | null } | undefined;
}

/**
 * Per-stream tag map. Caller passes a `Map<streamId, string[]>` populated
 * via `getStreamTagsForUser()`. Tag values are already lowercased in the
 * DB so consumers can render them as-is or title-case for display.
 *
 * The tag string list is what gets emitted in the CSV "Tags" column —
 * empty array (or absent map) renders as a blank cell.
 */
export interface TagsByStreamId {
  get(streamId: string): string[] | undefined;
}

/** Compose a description fragment from a stream's annotation. Returns "" when
 *  no annotation exists or when both fields are blank. */
function annotationDescription(
  annotations: AnnotationsByStreamId | undefined,
  streamId:    string,
): string {
  const a = annotations?.get(streamId);
  if (!a) return "";
  const parts: string[] = [];
  if (a.customName) parts.push(a.customName);
  if (a.notes)      parts.push(a.notes);
  return parts.join(" — ");
}

/** Pipe-separated tag list — chosen so a tag value can never collide with
 *  the CSV's comma delimiter (commas are escaped by csvCell anyway, but
 *  pipes scan more cleanly when an accountant pastes the column into
 *  Excel). Empty list → empty string. */
function tagList(tags: TagsByStreamId | undefined, streamId: string): string {
  const t = tags?.get(streamId);
  if (!t || t.length === 0) return "";
  return t.join(" | ");
}

// ── Vestream generic format ─────────────────────────────────────────────────
// 13 columns. Designed to work as the source-of-truth dump that the user
// can hand to any accountant — no software-specific formatting. The
// "Description" column carries the user's custom name + notes (when set)
// so accountants get human context alongside the machine-readable data.
function buildVestreamGeneric(
  rows:         ClaimRow[],
  annotations?: AnnotationsByStreamId,
  tags?:        TagsByStreamId,
): string {
  const header = csvRow([
    "Date (UTC)",
    "Time (UTC)",
    "Protocol",
    "Chain",
    "Token Symbol",
    "Token Address",
    "Amount",
    "USD Value at Claim",
    "Price Confidence",
    "Recipient Address",
    "Tx Hash",
    "Stream ID",
    "Description",
    "Tags",
  ]);
  const body = rows.map((r) => csvRow([
    isoDate(r.claimedAt),
    isoDateTime(r.claimedAt).slice(11),
    r.protocol,
    CHAIN_NAMES[r.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${r.chainId}`,
    r.tokenSymbol ?? "",
    r.tokenAddress,
    tokensWhole(r.amount, r.tokenDecimals),
    r.usdValueAtClaim ?? "",
    r.priceConfidence,
    r.recipient,
    r.txHash.startsWith("synthetic:") ? "" : r.txHash,
    r.streamId,
    annotationDescription(annotations, r.streamId),
    tagList(tags, r.streamId),
  ]));
  return [header, ...body].join("\n") + "\n";
}

// ── Koinly format ───────────────────────────────────────────────────────────
// Koinly's "Custom" CSV expects:
//   Date, Sent Amount, Sent Currency, Received Amount, Received Currency,
//   Fee Amount, Fee Currency, Net Worth Amount, Net Worth Currency,
//   Label, Description, TxHash
//
// For vesting claims, the Sent side is empty (nothing leaves your wallet —
// vested tokens arrive). Received side is the token + amount. Net Worth is
// the USD value at claim, which Koinly uses to compute cost basis.
function buildKoinly(rows: ClaimRow[], annotations?: AnnotationsByStreamId): string {
  const header = csvRow([
    "Date",
    "Sent Amount",
    "Sent Currency",
    "Received Amount",
    "Received Currency",
    "Fee Amount",
    "Fee Currency",
    "Net Worth Amount",
    "Net Worth Currency",
    "Label",
    "Description",
    "TxHash",
  ]);
  const body = rows.map((r) => {
    // Description column: when the user has annotated this stream, prefix
    // their custom name + notes onto the machine description. Format is
    // "<custom> — Vesting claim on <protocol> (<chain>)" so accountants
    // see context first, technical detail second.
    const ann = annotationDescription(annotations, r.streamId);
    const machine = `Vesting claim on ${r.protocol} (${CHAIN_NAMES[r.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${r.chainId}`})`;
    const description = ann ? `${ann} — ${machine}` : machine;
    return csvRow([
      isoDateTime(r.claimedAt) + " UTC",
      "",                                    // Sent Amount (empty — nothing left wallet)
      "",                                    // Sent Currency
      tokensWhole(r.amount, r.tokenDecimals),
      r.tokenSymbol ?? r.tokenAddress.slice(0, 8),
      "",                                    // Fee Amount (gas not yet captured — Phase 2)
      "",                                    // Fee Currency
      r.usdValueAtClaim ?? "",
      r.usdValueAtClaim ? "USD" : "",
      "income",                              // Koinly label for vesting claims
      description,
      r.txHash.startsWith("synthetic:") ? "" : r.txHash,
    ]);
  });
  return [header, ...body].join("\n") + "\n";
}

// ── CoinTracker format ──────────────────────────────────────────────────────
// CoinTracker's "Other Transaction" CSV expects:
//   Date, Received Quantity, Received Currency, Sent Quantity, Sent Currency,
//   Fee Amount, Fee Currency, Tag
//
// Vesting claims map to Tag=staking (closest CT category for periodic
// token receipts) — users may want to re-tag in CT after import.
function buildCoinTracker(rows: ClaimRow[]): string {
  const header = csvRow([
    "Date",
    "Received Quantity",
    "Received Currency",
    "Sent Quantity",
    "Sent Currency",
    "Fee Amount",
    "Fee Currency",
    "Tag",
  ]);
  const body = rows.map((r) => csvRow([
    isoDateTime(r.claimedAt),
    tokensWhole(r.amount, r.tokenDecimals),
    r.tokenSymbol ?? r.tokenAddress.slice(0, 8),
    "",
    "",
    "",
    "",
    "staking",
  ]));
  return [header, ...body].join("\n") + "\n";
}

// ── TurboTax format ─────────────────────────────────────────────────────────
// TurboTax's crypto CSV is a simplified cap-gains-friendly layout:
//   Date Acquired, Description, Proceeds, Cost Basis, Gain/Loss
//
// For *received* tokens (vesting claims) — TurboTax wants this as Income,
// not Sale. We export it as a 'Date Acquired' row with USD = cost basis,
// proceeds blank. The user files this under Form 1040 Schedule 1 (Other
// Income) and uses the cost basis later when they sell.
function buildTurboTax(rows: ClaimRow[], annotations?: AnnotationsByStreamId): string {
  const header = csvRow([
    "Date Acquired",
    "Description",
    "Cost Basis",
    "Proceeds",
    "Gain/Loss",
  ]);
  const body = rows.map((r) => {
    const ann = annotationDescription(annotations, r.streamId);
    const machine = `${tokensWhole(r.amount, r.tokenDecimals)} ${r.tokenSymbol ?? r.tokenAddress.slice(0, 8)} via ${r.protocol}`;
    const description = ann ? `${ann} — ${machine}` : machine;
    return csvRow([
      isoDate(r.claimedAt),
      description,
      r.usdValueAtClaim ?? "",
      "",
      "",
    ]);
  });
  return [header, ...body].join("\n") + "\n";
}

// ── Payroll-income (worker audience) ──────────────────────────────────────
// Ordinary-income summary, jurisdiction-agnostic. Each claim is treated as
// income at fair-market-value-on-receipt (the only basis HMRC, IRS, ATO,
// and CRA all accept for crypto-paid wages and contributor pay).
//
// Column shape is designed to be human-scannable AND paste-able into:
//   - TurboTax → 1099-NEC summary box (US)
//   - HMRC SA103 box 15 (UK self-employment)
//   - Generic accountant import (everywhere else — figures already in USD)
//
// Distinct from buildKoinly() which labels claims as "income" too — Koinly
// then reads them through capital-gains math. This format omits the
// capital-gains scaffolding entirely so worker users aren't filing the
// wrong return.
function buildPayrollIncome(
  rows:         ClaimRow[],
  annotations?: AnnotationsByStreamId,
  tags?:        TagsByStreamId,
): string {
  const header = csvRow([
    "Date",
    "Source",                   // free-form: annotation customName, else "<protocol> via <chain>"
    "Token",
    "Amount Received",
    "FMV USD at Receipt",       // canonical income figure for tax filing
    "Pricing Confidence",       // high / medium / low / missing — auditable
    "Income Type",              // "salary" | "vesting income" | "grant" — derived from stream category
    "Tags",                     // user-supplied taxonomy ("Investor", "Salary", "Advisor", etc.)
    "Stream Address",           // payer contract — proxy for the "employer" / payer
    "Tx Hash",
  ]);
  const body = rows.map((r) => {
    const ann = annotationDescription(annotations, r.streamId);
    const source = ann ?? `${r.protocol} via chain ${r.chainId}`;
    // Income-type derivation: claim_events doesn't store stream category
    // directly, but we can infer from protocol — llamapay = salary,
    // everything else = vesting income. Future: read from a denormalised
    // category column on claim_events when streams gain multi-category.
    const incomeType = r.protocol === "llamapay" ? "salary" : "vesting income";
    return csvRow([
      isoDate(r.claimedAt),
      source,
      r.tokenSymbol ?? r.tokenAddress.slice(0, 10),
      tokensWhole(r.amount, r.tokenDecimals),
      r.usdValueAtClaim ?? "",
      r.priceConfidence,
      incomeType,
      tagList(tags, r.streamId),
      r.streamId,                   // composite "<protocol>-<chain>-<id>" — recognisable to the user
      r.txHash,
    ]);
  });
  return [header, ...body].join("\n") + "\n";
}

// ── Payroll summary variants — payer-grouped totals ───────────────────────
//
// Same data as buildPayrollIncome() but aggregated by payer (stream).
// Tax filings generally want one line per payer with summed totals, not
// one line per per-second tick. Two jurisdiction variants share an
// internal aggregation pass; only the column headers and the trailing
// notes line differ.
//
// Aggregation strategy: group by streamId (the canonical "<protocol>-<chain>-<id>"
// composite). Each row carries:
//   - source label   = annotation.customName || "<protocol> via chain <chainId>"
//   - protocol/chain = preserved for accountant audit trail
//   - tokens         = sum of human-readable token amounts (per token)
//   - usdTotal       = sum of FMV USD across all claims from this payer
//   - claimCount     = number of distinct receipts
//   - dateFirst/Last = receipt date range
//
// We preserve the *first* token symbol/decimals seen for each payer; mixed-
// token streams from one payer are rare in practice (a payer streams ONE
// asset) but if encountered the 'tokens' column will show only the first
// token type — the per-claim CSV remains the source of truth for audits.

interface PayrollAggregate {
  streamId:      string;
  source:        string;
  protocol:      string;
  chainId:       number;
  tokenSymbol:   string;
  tokens:        bigint;
  tokenDecimals: number;
  usdTotal:      number;
  claimCount:    number;
  dateFirst:     Date;
  dateLast:      Date;
}

function aggregatePayroll(
  rows:         ClaimRow[],
  annotations?: AnnotationsByStreamId,
): PayrollAggregate[] {
  const map = new Map<string, PayrollAggregate>();
  for (const r of rows) {
    const ann = annotationDescription(annotations, r.streamId);
    const source = ann || `${r.protocol} via chain ${r.chainId}`;
    const existing = map.get(r.streamId);
    const usd = r.usdValueAtClaim ? Number(r.usdValueAtClaim) : 0;
    if (!existing) {
      map.set(r.streamId, {
        streamId:      r.streamId,
        source,
        protocol:      r.protocol,
        chainId:       r.chainId,
        tokenSymbol:   r.tokenSymbol ?? r.tokenAddress.slice(0, 10),
        tokens:        BigInt(r.amount),
        tokenDecimals: r.tokenDecimals,
        usdTotal:      usd,
        claimCount:    1,
        dateFirst:     r.claimedAt,
        dateLast:      r.claimedAt,
      });
    } else {
      existing.tokens     += BigInt(r.amount);
      existing.usdTotal   += usd;
      existing.claimCount += 1;
      if (r.claimedAt < existing.dateFirst) existing.dateFirst = r.claimedAt;
      if (r.claimedAt > existing.dateLast)  existing.dateLast  = r.claimedAt;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.usdTotal - a.usdTotal);
}

// US — IRS framing. The receiver pastes total USD per payer into TurboTax
// → 1099-NEC summary, OR attaches the CSV as supporting documentation if
// they're filing Schedule C with a long contributor list. Column names
// borrow IRS terminology so accountants don't have to map.
function buildPayrollSummaryUs(rows: ClaimRow[], annotations?: AnnotationsByStreamId): string {
  const aggs = aggregatePayroll(rows, annotations);
  const header = csvRow([
    "Payer",                       // who the income came from
    "Protocol",                    // streaming rail (Sablier Flow / LlamaPay / etc)
    "Chain",
    "Token",
    "Tokens Received",
    "Gross Income (USD)",          // 1099-NEC Box 1: Nonemployee Compensation
    "Number of Receipts",
    "First Receipt",
    "Last Receipt",
    "Stream ID",
  ]);
  const body = aggs.map((a) =>
    csvRow([
      a.source,
      a.protocol,
      a.chainId,
      a.tokenSymbol,
      tokensWhole(a.tokens.toString(), a.tokenDecimals),
      a.usdTotal.toFixed(2),
      a.claimCount,
      isoDate(a.dateFirst),
      isoDate(a.dateLast),
      a.streamId,
    ]),
  );
  // Trailing total row — pre-summed for direct paste into 1099-NEC Box 1
  const grand = aggs.reduce((acc, a) => acc + a.usdTotal, 0);
  const total = csvRow([
    "TOTAL", "", "", "", "", grand.toFixed(2), "", "", "", "",
  ]);
  return [header, ...body, total].join("\n") + "\n";
}

// UK — HMRC SA103 self-employment / SA103S short. Receiver enters Box 9
// (Turnover) on SA103S, OR Box 15 if reporting on SA103F. Amounts stay
// in USD with a footer note pointing the user to HMRC's published
// exchange rate page — converting to GBP requires the year-end average
// or transaction-time rate, both of which we'd need extra data to
// compute reliably. Better to leave one explicit conversion step than
// fabricate a bad GBP figure.
function buildPayrollSummaryUk(rows: ClaimRow[], annotations?: AnnotationsByStreamId): string {
  const aggs = aggregatePayroll(rows, annotations);
  const header = csvRow([
    "Source of Income",
    "Streaming Platform",
    "Chain",
    "Token",
    "Tokens Received",
    "Gross Income (USD)",          // SA103 Turnover — convert to GBP at year-end
    "Number of Receipts",
    "Period Start",
    "Period End",
    "Stream ID",
  ]);
  const body = aggs.map((a) =>
    csvRow([
      a.source,
      a.protocol,
      a.chainId,
      a.tokenSymbol,
      tokensWhole(a.tokens.toString(), a.tokenDecimals),
      a.usdTotal.toFixed(2),
      a.claimCount,
      isoDate(a.dateFirst),
      isoDate(a.dateLast),
      a.streamId,
    ]),
  );
  const grand = aggs.reduce((acc, a) => acc + a.usdTotal, 0);
  const total = csvRow([
    "TOTAL", "", "", "", "", grand.toFixed(2), "", "", "", "",
  ]);
  // HMRC accepts USD figures with a published-rate conversion. We don't
  // pick a rate for the user — the exact rate (year-end average vs spot
  // at receipt) varies by accountant preference. Surfacing the total
  // separately so the conversion is one multiplication rather than a
  // pivot-table exercise.
  const footer = csvRow([
    "Note: convert USD → GBP using HMRC published rates. https://www.gov.uk/government/publications/hmrc-exchange-rates-for-2025-monthly",
    "", "", "", "", "", "", "", "", "",
  ]);
  return [header, ...body, total, footer].join("\n") + "\n";
}

// ── Public dispatcher ──────────────────────────────────────────────────────

export function buildClaimsCsv(
  rows:         ClaimRow[],
  format:       ExportFormat,
  annotations?: AnnotationsByStreamId,
  tags?:        TagsByStreamId,
): string {
  switch (format) {
    case "vestream-generic":    return buildVestreamGeneric(rows, annotations, tags);
    case "koinly":              return buildKoinly(rows, annotations);
    case "cointracker":         return buildCoinTracker(rows);  // no description column in CT format
    case "turbotax":            return buildTurboTax(rows, annotations);
    case "payroll-income":      return buildPayrollIncome(rows, annotations, tags);
    case "payroll-summary-us":  return buildPayrollSummaryUs(rows, annotations);
    case "payroll-summary-uk":  return buildPayrollSummaryUk(rows, annotations);
    default:
      // Exhaustive switch; TypeScript will catch missing branches at compile time.
      return buildVestreamGeneric(rows, annotations);
  }
}

export function csvFilename(format: ExportFormat, sinceYear?: number, untilYear?: number): string {
  const range =
    sinceYear && untilYear
      ? sinceYear === untilYear ? `${sinceYear}` : `${sinceYear}-${untilYear}`
      : "all-time";
  return `vestream-claims-${format}-${range}.csv`;
}
