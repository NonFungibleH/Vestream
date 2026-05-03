"use client";

// /dashboard/income-statement
// ─────────────────────────────────────────────────────────────────────────────
// Vesting Income Statement — the headline showcase of the Phase 2 claim
// ingestor pipeline. A consolidated P&L-style view of every vesting claim
// the user has received, segmented by tax year, protocol, and token.
//
// Why this is the highest-value follow-up to Phase 2:
//   - The Exports tab gives users a transactional list + CSV downloads.
//     Useful for accountants. Not a pleasant view for the user themselves.
//   - The Income Statement gives them a "what did vesting actually pay me
//     this year, and where did it come from" answer at a glance — the
//     thing they want to look at on January 1st before doing taxes, on
//     April 1st when the bill comes due, and quarterly to check pacing.
//   - It also surfaces our pricing-confidence mix so users know which
//     numbers are firm and which need a manual cost-basis sanity check.
//
// All amounts USD-anchored at claim time (the canonical tax-event basis).
// The CurrencyProvider (wired into the dashboard layout) lets users see
// the totals in their local currency at TODAY's rate — useful for
// situational awareness, not a substitute for the historical-rate
// settlement that tax software needs.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useCurrency } from "@/lib/use-currency";

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
interface PivotRow     { year: number; protocol: string; usd: number }

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
  byYearProtocol: PivotRow[];
  confidenceMix:  ConfidenceMix;
  audienceCategory?: string | null;
}

/** Centralised copy table — keeps the three audience modes labelled
 *  consistently across both the interactive page and the print page.
 *  Investor framing emphasises capital assets / cliff events; worker
 *  framing emphasises ordinary income / continuous receipt. "Both"
 *  hedges by using neutral language. */
function copyForAudience(category: string | null | undefined): {
  eyebrow:  string;
  title:    string;
  subtitle: (currency: string) => string;
} {
  const audience = category ?? "investor";
  if (audience === "worker") {
    return {
      eyebrow:  "Crypto income",
      title:    "Crypto income statement",
      subtitle: (currency) =>
        `Ordinary income received from streams, grants, and contributor pay — broken down by tax year, payer, and token. All amounts USD-anchored at the moment of each on-chain receipt${currency !== "USD" ? `, displayed in ${currency} at today's rate` : ""}.`,
    };
  }
  if (audience === "both") {
    return {
      eyebrow:  "Token income",
      title:    "Token income statement",
      subtitle: (currency) =>
        `Every token you've received — vesting unlocks, salary streams, and grant disbursements — broken down by tax year, source, and token. All amounts USD-anchored at the moment of each on-chain receipt${currency !== "USD" ? `, displayed in ${currency} at today's rate` : ""}.`,
    };
  }
  // investor (default / null)
  return {
    eyebrow:  "Vesting income",
    title:    "Vesting income statement",
    subtitle: (currency) =>
      `What vesting paid you, broken down by tax year, protocol, and token. All amounts USD-anchored at the moment of each on-chain claim${currency !== "USD" ? `, displayed in ${currency} at today's rate` : ""}.`,
  };
}

const PROTOCOL_LABELS: Record<string, string> = {
  "sablier":      "Sablier",
  "hedgey":       "Hedgey",
  "uncx":         "UNCX V3",
  "uncx-vm":      "UNCX VM",
  "unvest":       "Unvest",
  "team-finance": "Team Finance",
  "superfluid":   "Superfluid",
  "pinksale":     "PinkSale",
  "streamflow":   "Streamflow",
  "jupiter-lock": "Jupiter Lock",
};

function pretty(p: string): string {
  return PROTOCOL_LABELS[p] ?? p;
}

export default function IncomeStatementPage() {
  const { format, formatCompact, currency } = useCurrency();
  const [data, setData]       = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = yearFilter === "all" ? "" : `?year=${yearFilter}`;
      const res = await fetch(`/api/claims/income-statement${sp}`);
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = (await res.json()) as IncomeStatement;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => { load(); }, [load]);

  const years = data?.byYear.map((r) => r.year) ?? [];
  // Build year-protocol pivot grid: rows = years, cols = protocols
  const protocolsInPivot = Array.from(
    new Set(data?.byYearProtocol.map((p) => p.protocol) ?? [])
  ).sort();
  const pivotByYear = new Map<number, Map<string, number>>();
  for (const p of data?.byYearProtocol ?? []) {
    if (!pivotByYear.has(p.year)) pivotByYear.set(p.year, new Map());
    pivotByYear.get(p.year)!.set(p.protocol, p.usd);
  }

  // Confidence ratio for the headline warning
  const confidenceRows =
    (data?.confidenceMix.exact.rows ?? 0) +
    (data?.confidenceMix.nearest.rows ?? 0) +
    (data?.confidenceMix.missing.rows ?? 0);
  const exactPct =
    confidenceRows > 0
      ? Math.round(((data?.confidenceMix.exact.rows ?? 0) / confidenceRows) * 100)
      : 0;
  const missingPct =
    confidenceRows > 0
      ? Math.round(((data?.confidenceMix.missing.rows ?? 0) / confidenceRows) * 100)
      : 0;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--preview-bg)" }}>
      <main className="flex-1 px-4 md:px-8 py-6 max-w-5xl mx-auto w-full">

        {/* Hero */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <span>Income statement</span>
          </div>
          {(() => {
            const copy = copyForAudience(data?.audienceCategory);
            return (
              <>
                <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
                  {copy.eyebrow}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
                  {copy.title}
                </h1>
                <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
                  {copy.subtitle(currency)}
                </p>
              </>
            );
          })()}
          {/* Jurisdiction caveat — UK / AU users may need to map claim-date data
              to unlock-date tax events. Surfaced inline so it's not buried at
              the bottom of the page where the user might miss it. */}
          <div className="mt-3 rounded-lg p-3 text-[11px] flex gap-2.5 items-start"
            style={{
              background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.20)",
              color: "var(--preview-text-2)",
            }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>
              <strong>Tax basis note:</strong> we capture <em>claim-date</em> events. That&apos;s the
              correct receipt event for US, Canada, Germany, and most of the EU. UK (HMRC) and
              Australia (ATO) filers may owe income tax at the <em>unlock</em> date instead — your
              accountant can map claim records to unlock dates using the per-stream schedules on
              the <Link href="/dashboard" className="underline" style={{ color: "#0F8A8A" }}>main dashboard</Link>.{" "}
              <Link href="/resources/token-vesting-tax-guide" className="underline" style={{ color: "#0F8A8A" }}>Read the full guide →</Link>
            </span>
          </div>
        </div>

        {/* Year filter */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Tax year</label>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg outline-none"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
          >
            <option value="all">All time</option>
            {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          {yearFilter !== "all" && (
            <Link
              href={`/dashboard/income-statement/print?year=${yearFilter}`}
              target="_blank"
              rel="noopener"
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.20)" }}
            >
              Year-end PDF →
            </Link>
          )}
          <Link
            href="/dashboard/exports"
            className="text-xs font-semibold ml-auto"
            style={{ color: "#0F8A8A" }}
          >
            Export to CSV →
          </Link>
        </div>

        {/* Headline cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-2xl p-5"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--preview-text-3)" }}>
              Total income
            </div>
            <div className="text-3xl font-bold" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
              {loading ? "…" : format(data?.totals.usd ?? 0)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--preview-text-3)" }}>
              {data?.totals.rows ?? 0} claim{data?.totals.rows === 1 ? "" : "s"} indexed
            </div>
          </div>

          <div className="rounded-2xl p-5"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--preview-text-3)" }}>
              Gas paid
            </div>
            <div className="text-3xl font-bold" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
              {loading ? "…" : format(data?.totals.gasUsd ?? 0)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--preview-text-3)" }}>
              Often deductible against the income above
            </div>
          </div>

          <div className="rounded-2xl p-5"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--preview-text-3)" }}>
              Pricing confidence
            </div>
            <div className="text-3xl font-bold" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
              {loading ? "…" : `${exactPct}%`}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--preview-text-3)" }}>
              exact-day pricing · {missingPct}% missing (manual cost basis needed)
            </div>
          </div>
        </div>

        {/* Empty state */}
        {!loading && data && data.totals.rows === 0 && (
          <div className="rounded-2xl p-8 text-center mb-6"
            style={{ background: "var(--preview-card)", border: "1px dashed var(--preview-border)", color: "var(--preview-text-2)" }}>
            <p className="text-sm mb-2">No claim history indexed yet.</p>
            <p className="text-xs mb-4" style={{ color: "var(--preview-text-3)" }}>
              Head to the Exports tab and hit &quot;Refresh claims&quot; to pull every vesting payout you&apos;ve
              received from any of the 9 supported protocols.
            </p>
            <Link href="/dashboard/exports"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white" }}>
              Go to Exports
            </Link>
          </div>
        )}

        {/* By year */}
        {!loading && data && data.byYear.length > 0 && yearFilter === "all" && (
          <div className="rounded-2xl mb-5 overflow-hidden"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider"
              style={{ borderColor: "var(--preview-border)", color: "var(--preview-text-3)" }}>
              Income by tax year
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--preview-text-3)" }}>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Year</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Claims</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Income</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Gas</th>
                </tr>
              </thead>
              <tbody>
                {data.byYear.map((y) => (
                  <tr key={y.year} className="border-t" style={{ borderColor: "var(--preview-border)" }}>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--preview-text)" }}>{y.year}</td>
                    <td className="px-5 py-3 text-right" style={{ color: "var(--preview-text-2)" }}>{y.rows.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: "var(--preview-text)" }}>{format(y.usd)}</td>
                    <td className="px-5 py-3 text-right" style={{ color: "var(--preview-text-3)" }}>{format(y.gasUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* By protocol */}
        {!loading && data && data.byProtocol.length > 0 && (
          <div className="rounded-2xl mb-5 overflow-hidden"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider"
              style={{ borderColor: "var(--preview-border)", color: "var(--preview-text-3)" }}>
              Income by protocol
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--preview-text-3)" }}>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Protocol</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Claims</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Income</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">% of total</th>
                </tr>
              </thead>
              <tbody>
                {data.byProtocol.map((p) => {
                  const pct = data.totals.usd > 0
                    ? (p.usd / data.totals.usd) * 100
                    : 0;
                  return (
                    <tr key={p.protocol} className="border-t" style={{ borderColor: "var(--preview-border)" }}>
                      <td className="px-5 py-3 font-medium" style={{ color: "var(--preview-text)" }}>{pretty(p.protocol)}</td>
                      <td className="px-5 py-3 text-right" style={{ color: "var(--preview-text-2)" }}>{p.rows.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right font-semibold" style={{ color: "var(--preview-text)" }}>{format(p.usd)}</td>
                      <td className="px-5 py-3 text-right text-xs" style={{ color: "var(--preview-text-3)" }}>{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* By token (top 25) */}
        {!loading && data && data.byToken.length > 0 && (
          <div className="rounded-2xl mb-5 overflow-hidden"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider flex items-center justify-between"
              style={{ borderColor: "var(--preview-border)", color: "var(--preview-text-3)" }}>
              <span>Top tokens by income</span>
              <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>(up to 25)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr style={{ color: "var(--preview-text-3)" }}>
                    <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Token</th>
                    <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Claims</th>
                    <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Units</th>
                    <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Income</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byToken.map((t, i) => {
                    // Convert stringified bigint sum → human units, capped to 4 decimals.
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
                      <tr key={`${t.chainId}-${t.tokenAddress}-${i}`} className="border-t" style={{ borderColor: "var(--preview-border)" }}>
                        <td className="px-5 py-3" style={{ color: "var(--preview-text)" }}>
                          <div className="font-semibold">{t.tokenSymbol || "?"}</div>
                          <div className="text-[10px] font-mono" style={{ color: "var(--preview-text-3)" }}>
                            {t.tokenAddress.slice(0, 6)}…{t.tokenAddress.slice(-4)}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right" style={{ color: "var(--preview-text-2)" }}>{t.rows.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs" style={{ color: "var(--preview-text-2)" }}>{humanUnits}</td>
                        <td className="px-5 py-3 text-right font-semibold" style={{ color: "var(--preview-text)" }}>{formatCompact(t.usd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Year × Protocol pivot — only meaningful in "all time" view */}
        {!loading && data && yearFilter === "all" && data.byYear.length > 1 && protocolsInPivot.length > 0 && (
          <div className="rounded-2xl mb-5 overflow-hidden"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider"
              style={{ borderColor: "var(--preview-border)", color: "var(--preview-text-3)" }}>
              Income by year × protocol
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr style={{ color: "var(--preview-text-3)" }}>
                    <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Year</th>
                    {protocolsInPivot.map((p) => (
                      <th key={p} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">{pretty(p)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.byYear.map((y) => (
                    <tr key={y.year} className="border-t" style={{ borderColor: "var(--preview-border)" }}>
                      <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--preview-text)" }}>{y.year}</td>
                      {protocolsInPivot.map((p) => {
                        const v = pivotByYear.get(y.year)?.get(p) ?? 0;
                        return (
                          <td key={p} className="px-3 py-3 text-right text-xs"
                            style={{ color: v > 0 ? "var(--preview-text)" : "var(--preview-text-3)" }}>
                            {v > 0 ? formatCompact(v) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pricing confidence detail */}
        {!loading && data && data.totals.rows > 0 && (
          <div className="rounded-2xl p-5 mb-5"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--preview-text-3)" }}>
              Pricing confidence breakdown
            </div>
            <div className="space-y-1.5 text-xs" style={{ color: "var(--preview-text-2)" }}>
              <div className="flex justify-between">
                <span><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: "#10b981" }} /> Exact-day price</span>
                <span style={{ color: "var(--preview-text)" }}>{data.confidenceMix.exact.rows} rows · {format(data.confidenceMix.exact.usd)}</span>
              </div>
              <div className="flex justify-between">
                <span><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: "#f59e0b" }} /> Nearest-day fallback</span>
                <span style={{ color: "var(--preview-text)" }}>{data.confidenceMix.nearest.rows} rows · {format(data.confidenceMix.nearest.usd)}</span>
              </div>
              <div className="flex justify-between">
                <span><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: "#ef4444" }} /> Missing (manual cost basis needed)</span>
                <span style={{ color: "var(--preview-text)" }}>{data.confidenceMix.missing.rows} rows · {format(data.confidenceMix.missing.usd)}</span>
              </div>
            </div>
            <p className="text-[11px] mt-3" style={{ color: "var(--preview-text-3)" }}>
              Exact-day prices come from CoinGecko historical at the claim&apos;s UTC date. Nearest-day means
              the price on the closest available day (within a 7-day window). Missing means CoinGecko had no
              data for that token — your accountant or tax software will need a manual cost basis entered.
            </p>
          </div>
        )}

        <p className="text-[10px] mt-6 text-center" style={{ color: "var(--preview-text-3)" }}>
          USD values are anchored at the moment of each on-chain claim. This is the canonical
          tax basis for the US (IRS), Canada (CRA), Germany, and most of the EU. UK (HMRC) and
          Australia (ATO) filers should verify with an accountant — their tax basis can be the
          unlock date rather than the claim date.
          {currency !== "USD" && (
            <> Display in {currency} uses today&apos;s exchange rate (situational awareness only —
              tax software needs historical-rate settlement at each event date).</>
          )}
        </p>
      </main>
    </div>
  );
}
