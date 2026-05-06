"use client";

// /dashboard/income-statement/print
// ─────────────────────────────────────────────────────────────────────────────
// Print-friendly year-end vesting income report.
//
// Why this page exists separate from /dashboard/income-statement:
//   - The interactive income statement is for the user (year picker,
//     compact tables, links). The print version is for THEIR ACCOUNTANT —
//     a single A4-formatted document with year-end totals, signed and
//     dated, that they can email or hand over.
//   - "Save as PDF" via the browser's print dialog is a 1-click action
//     for the user and ships zero PDF-rendering dependencies for us.
//     react-pdf / puppeteer would add ~50MB of bundle / cold-start time
//     for an outcome users can already produce themselves with Cmd+P.
//
// Print CSS is inlined here. Non-essential chrome (top nav, sidebar,
// links) is hidden via `@media print`. The dashboard layout
// (CurrencyProvider) still applies but rendering is intentionally
// USD-only on this page — historical-rate currency conversion is what
// tax accountants need, not today's-rate FX.
//
// Query params:
//   ?year=YYYY   → restrict report to that tax year (required)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface YearRow      { year: number; rows: number; usd: number; gasUsd: number }
interface ProtocolRow  { protocol: string; rows: number; usd: number; gasUsd: number }
interface TokenRow     {
  tokenSymbol:   string | null;
  tokenAddress:  string;
  tokenDecimals: number;
  chainId:       number;
  rows:          number;
  usd:           number;
  units:         string;
}
interface ConfidenceMix {
  exact:   { rows: number; usd: number };
  nearest: { rows: number; usd: number };
  missing: { rows: number; usd: number };
}
interface IncomeStatement {
  range:          { since: string | null; until: string | null };
  totals:         { rows: number; usd: number; gasUsd: number };
  byYear:         YearRow[];
  byProtocol:     ProtocolRow[];
  byToken:        TokenRow[];
  confidenceMix:  ConfidenceMix;
  audienceCategory?: string | null;
}

/** Print-page header copy keyed by audience. Drops "Vesting" framing for
 *  workers — accountants reading the worker version need to know up-front
 *  that this is ordinary-income (Schedule C / SA103) not capital-asset
 *  (Schedule D / Capital Gains). Mirrors copyForAudience() in the
 *  interactive page; differs in tone (more formal, accountant-facing). */
function printHeaderForAudience(category: string | null | undefined): {
  rubric:   string;
  receiptLabel: string;  // "claim" vs "receipt" — used in the totals subtitle
  taxFraming: string;    // one-liner under the headline totals
} {
  const audience = category ?? "investor";
  if (audience === "worker") {
    return {
      rubric:       "TokenVest — Crypto Income Report",
      receiptLabel: "receipt",
      taxFraming:   "Ordinary income at FMV-on-receipt. US: Schedule C / 1099-NEC summary. UK: SA103 self-employment turnover. Convert to local currency at year-end published rates.",
    };
  }
  if (audience === "both") {
    return {
      rubric:       "TokenVest — Token Income Report",
      receiptLabel: "receipt",
      taxFraming:   "Combines investor vesting income (capital asset basis events) with worker streaming income (ordinary income). Treat each line per its source category — your accountant can split filings.",
    };
  }
  return {
    rubric:       "TokenVest — Vesting Income Report",
    receiptLabel: "claim",
    taxFraming:   "USD-anchored at the date of each on-chain claim — the canonical tax-event basis used for capital-asset vesting (Schedule D / capital-gains framework).",
  };
}

const PROTOCOL_LABELS: Record<string, string> = {
  "sablier":      "Sablier",
  "hedgey":       "Hedgey",
  "uncx":         "UNCX V3",
  "uncx-vm":      "UNCX VestingManager",
  "unvest":       "Unvest",
  "team-finance": "Team Finance",
  "superfluid":   "Superfluid",
  "pinksale":     "PinkSale",
  "streamflow":   "Streamflow",
  "jupiter-lock": "Jupiter Lock",
};

function fmtUsd(n: number, fractionDigits = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function fmtUsdCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return fmtUsd(n);
}

function pretty(p: string): string {
  return PROTOCOL_LABELS[p] ?? p;
}

export default function PrintIncomeStatementPage() {
  const searchParams = useSearchParams();
  const year = searchParams.get("year");

  const [data, setData]       = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!year || !/^\d{4}$/.test(year)) {
      setError("Provide ?year=YYYY in the URL to render the year-end report.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/claims/income-statement?year=${year}`);
        if (!res.ok) {
          if (!cancelled) setError("Could not load report. Are you signed in?");
          return;
        }
        const json = (await res.json()) as IncomeStatement;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year]);

  if (loading) {
    return <div className="p-8 text-sm">Loading year-end report…</div>;
  }

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <Link href="/dashboard/income-statement" className="text-sm underline">
          ← Back to income statement
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const generatedAt = new Date().toISOString().slice(0, 10);
  const exactPct =
    data.totals.rows > 0
      ? Math.round((data.confidenceMix.exact.rows / data.totals.rows) * 100)
      : 0;

  return (
    <>
      {/* Print-only stylesheet — keeps the printable surface clean
          (white bg, black text, A4 margins) and hides non-content chrome. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 18mm; }
          body  { background: white !important; }
          .no-print { display: none !important; }
        }
        .print-page {
          background: white;
          color: #0f172a;
          font-family: ui-sans-serif, system-ui, sans-serif;
          padding: 32px;
          max-width: 880px;
          margin: 0 auto;
          line-height: 1.5;
        }
        .print-page h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
        .print-page h2 { font-size: 16px; font-weight: 600; margin-top: 28px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        .print-page table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .print-page th, .print-page td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
        .print-page th { text-align: left; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
        .print-page td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .print-page .muted { color: #64748b; }
      `}</style>

      <div className="print-page">
        {/* Toolbar — only visible on screen, hidden on print */}
        <div className="no-print mb-6 flex items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: "#e2e8f0" }}>
          <Link href={`/dashboard/income-statement?year=${year}`} className="text-sm underline" style={{ color: "#2563eb" }}>
            ← Back to interactive view
          </Link>
          <button
            onClick={() => window.print()}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}
          >
            Print / Save as PDF
          </button>
        </div>

        {/* Header — audience-aware. Investor and worker both file in
            different sections of their respective tax codes; the rubric +
            framing copy here primes the receiving accountant. */}
        {(() => {
          const h = printHeaderForAudience(data.audienceCategory);
          return (
            <header className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#0F8A8A" }}>
                {h.rubric}
              </p>
              <h1>Tax year {year}</h1>
              <p className="text-xs muted mt-1">
                Generated {generatedAt} · All amounts in USD at the date of each {h.receiptLabel}
              </p>
              <p className="text-[11px] mt-2" style={{ color: "#475569", maxWidth: 720 }}>
                {h.taxFraming}
              </p>
            </header>
          );
        })()}

        {/* Headline totals */}
        <section style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider muted">Total income</p>
            <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{fmtUsd(data.totals.usd)}</p>
            <p className="text-[10px] muted">{data.totals.rows} claim{data.totals.rows === 1 ? "" : "s"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider muted">Gas paid</p>
            <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{fmtUsd(data.totals.gasUsd)}</p>
            <p className="text-[10px] muted">often deductible</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider muted">Pricing confidence</p>
            <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{exactPct}%</p>
            <p className="text-[10px] muted">exact-day pricing</p>
          </div>
        </section>

        {/* By protocol */}
        {data.byProtocol.length > 0 && (
          <section>
            <h2>Income by protocol</h2>
            <table>
              <thead>
                <tr>
                  <th>Protocol</th>
                  <th className="num">Claims</th>
                  <th className="num">Income (USD)</th>
                  <th className="num">Gas (USD)</th>
                  <th className="num">% of total</th>
                </tr>
              </thead>
              <tbody>
                {data.byProtocol.map((p) => {
                  const pct = data.totals.usd > 0 ? (p.usd / data.totals.usd) * 100 : 0;
                  return (
                    <tr key={p.protocol}>
                      <td>{pretty(p.protocol)}</td>
                      <td className="num">{p.rows.toLocaleString()}</td>
                      <td className="num">{fmtUsd(p.usd)}</td>
                      <td className="num muted">{fmtUsd(p.gasUsd)}</td>
                      <td className="num muted">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Top tokens */}
        {data.byToken.length > 0 && (
          <section>
            <h2>Top tokens by income</h2>
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Address</th>
                  <th className="num">Claims</th>
                  <th className="num">Units claimed</th>
                  <th className="num">Income (USD)</th>
                </tr>
              </thead>
              <tbody>
                {data.byToken.map((t, i) => {
                  let humanUnits = "—";
                  try {
                    const big = BigInt(t.units);
                    const divisor = 10n ** BigInt(t.tokenDecimals);
                    const whole = big / divisor;
                    const frac  = big % divisor;
                    const fracStr = (Number(frac) / Number(divisor)).toFixed(4).slice(2);
                    humanUnits = `${whole.toLocaleString()}.${fracStr}`;
                  } catch { /* leave em-dash */ }
                  return (
                    <tr key={`${t.chainId}-${t.tokenAddress}-${i}`}>
                      <td><strong>{t.tokenSymbol || "?"}</strong></td>
                      <td className="muted" style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}>{t.tokenAddress}</td>
                      <td className="num">{t.rows.toLocaleString()}</td>
                      <td className="num muted">{humanUnits}</td>
                      <td className="num">{fmtUsdCompact(t.usd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Confidence breakdown */}
        <section>
          <h2>Pricing confidence breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Confidence</th>
                <th className="num">Claims</th>
                <th className="num">USD value</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Exact-day</strong></td>
                <td className="num">{data.confidenceMix.exact.rows}</td>
                <td className="num">{fmtUsd(data.confidenceMix.exact.usd)}</td>
                <td className="muted">CoinGecko historical at the claim&apos;s UTC date</td>
              </tr>
              <tr>
                <td><strong>Nearest-day</strong></td>
                <td className="num">{data.confidenceMix.nearest.rows}</td>
                <td className="num">{fmtUsd(data.confidenceMix.nearest.usd)}</td>
                <td className="muted">Within a 7-day fallback window</td>
              </tr>
              <tr>
                <td><strong>Missing</strong></td>
                <td className="num">{data.confidenceMix.missing.rows}</td>
                <td className="num">{fmtUsd(data.confidenceMix.missing.usd)}</td>
                <td className="muted">Manual cost basis required</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Notes / disclaimers — accountant-readable */}
        <section style={{ marginTop: 28, fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
          <h2 style={{ fontSize: 13 }}>Notes for the preparer</h2>
          <ol style={{ paddingLeft: 18 }}>
            <li><strong>Tax basis used:</strong> claim date. Each row is dated at the on-chain claim transaction (when tokens moved from the vesting contract to the recipient&apos;s wallet) and valued at the CoinGecko historical USD price for that UTC date.</li>
            <li><strong>Jurisdictional applicability:</strong> the claim-date basis maps directly to the receipt event for US (IRS), Canada (CRA), Germany, and most of the EU. For UK (HMRC) and Australia (ATO), the receipt event can be the <em>unlock date</em> rather than the claim date — re-attribution to unlock dates may be required. Per-stream unlock schedules are visible on the recipient&apos;s TokenVest dashboard.</li>
            <li>Gas values are paid in the chain&apos;s native token (ETH, BNB, MATIC, SOL) and converted to USD at the time of the transaction.</li>
            <li>Superfluid claims captured here represent discrete cliff and end-of-vesting payouts. Continuous flow accrual between cliff and end is not yet attributed at the per-event level.</li>
            <li>Solana protocols (Streamflow, Jupiter Lock) use an account-snapshot delta model: pre-TokenVest-activation history may appear as a single baseline event per stream, while subsequent claims are tracked individually.</li>
            <li>This report is an aid for tax preparation, not tax advice. Verify against on-chain receipts before filing.</li>
          </ol>
        </section>

        {/* Footer */}
        <footer style={{ marginTop: 36, paddingTop: 12, borderTop: "1px solid #e2e8f0", fontSize: 10, color: "#94a3b8", textAlign: "center" }}>
          Generated by TokenVest · vestream.io · Tax year {year}
        </footer>
      </div>
    </>
  );
}
