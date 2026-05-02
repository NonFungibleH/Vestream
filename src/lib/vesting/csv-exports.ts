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

export type ExportFormat = "vestream-generic" | "koinly" | "cointracker" | "turbotax";

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

// ── Vestream generic format ─────────────────────────────────────────────────
// 13 columns. Designed to work as the source-of-truth dump that the user
// can hand to any accountant — no software-specific formatting. The
// "Description" column carries the user's custom name + notes (when set)
// so accountants get human context alongside the machine-readable data.
function buildVestreamGeneric(rows: ClaimRow[], annotations?: AnnotationsByStreamId): string {
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

// ── Public dispatcher ──────────────────────────────────────────────────────

export function buildClaimsCsv(
  rows:        ClaimRow[],
  format:      ExportFormat,
  annotations?: AnnotationsByStreamId,
): string {
  switch (format) {
    case "vestream-generic": return buildVestreamGeneric(rows, annotations);
    case "koinly":           return buildKoinly(rows, annotations);
    case "cointracker":      return buildCoinTracker(rows);  // no description column in CT format
    case "turbotax":         return buildTurboTax(rows, annotations);
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
