"use client";

// /dashboard/exports
// ─────────────────────────────────────────────────────────────────────────────
// The Exports tab — surfaces a user's claim history and offers tax-software-
// ready CSV downloads. Currently powered by Sablier ingestion only; a
// coverage banner honestly tells users what's indexed vs pending.
//
// Why this page matters:
//   - HNW vesting recipients spend hours reconciling claim history each
//     tax season. Vestream pre-computes USD-value-at-claim and serves it
//     in formats their accountant already uses (Koinly, CoinTracker,
//     TurboTax).
//   - "Once tax season uses you, churn → 0" — sticky feature. This is the
//     single highest-LTV feature in the consumer lineup.
//
// v1 scope (this commit):
//   - Refresh button → POST /api/claims/history?action=refresh
//   - Year filter
//   - Per-row table with USD value at claim + price-confidence flag
//   - Download CSV in 4 formats (Vestream generic / Koinly / CoinTracker / TurboTax)
//   - Coverage banner (1 of 9 protocols indexed)
//
// Phase 3 follow-ups:
//   - Date-range picker (currently year only)
//   - Cost-basis method selector (FIFO / LIFO / HIFO)
//   - Multi-currency display (read-only — USD-at-claim stays in USD for tax)
//   - PDF year-end summary report
//   - Direct accountant email
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { track } from "@/lib/analytics";

// Drizzle row shape mirrored manually — the API returns rows from the
// claim_events table with claimedAt as ISO string after JSON serialization.
interface ClaimEvent {
  id:               string;
  streamId:         string;
  protocol:         string;
  chainId:          number;
  recipient:        string;
  tokenAddress:     string;
  tokenSymbol:      string | null;
  tokenDecimals:    number;
  amount:           string;
  claimedAt:        string;
  txHash:           string;
  usdValueAtClaim:  string | null;
  priceConfidence:  "exact" | "nearest" | "missing";
}

interface YearSummary { rows: number; usd: number }
interface Summary {
  totalRows: number;
  totalUsd:  number;
  byYear:    Record<string, YearSummary>;
}

interface IngestResult {
  protocol:        string;
  inserted:        number;
  notImplemented?: boolean;
  error?:          string;
}

// Platforms with a public import URL get a one-click "Open in <platform>" link
// that deep-links straight to the right place. The CSV download is auto-
// triggered when the user clicks the guided-send button so they don't have
// to bounce back here to grab the file. None of these platforms have a
// public push API (we researched — Koinly + CoinTracker only support
// CSV upload or pull-direction integrations), so the guided flow is the
// closest thing to a 1-click experience we can ship.
interface ExportFormat {
  id:        string;
  name:      string;
  subtitle:  string;
  importUrl?: string;
  /** Human-readable steps the user follows after we drop them on importUrl. */
  steps?:    string[];
  /** Audience this format primarily serves. Drives the order cards appear
   *  in (workers see payroll formats first, investors see capital-gains
   *  formats first). "any" formats sit in the middle for everyone. */
  audience: "investor" | "worker" | "any";
}

const FORMATS: ExportFormat[] = [
  {
    id:       "vestream-generic",
    name:     "Vestream generic CSV",
    subtitle: "Universal — works with any spreadsheet or accountant",
    audience: "any",
  },
  {
    id:        "koinly",
    name:      "Koinly CSV",
    subtitle:  "Pre-formatted for Koinly's Custom CSV importer",
    importUrl: "https://app.koinly.io/p/wallets/import",
    steps:     [
      "We'll download your Koinly-format CSV and open Koinly's import page in a new tab.",
      "In Koinly, search for and select \"Custom CSV\" as the wallet type.",
      "Click \"Upload File\" and pick the CSV we just downloaded.",
      "Koinly maps the columns automatically — confirm and import.",
    ],
    audience: "investor",
  },
  {
    id:        "cointracker",
    name:      "CoinTracker CSV",
    subtitle:  "Pre-formatted for CoinTracker's generic CSV upload",
    importUrl: "https://www.cointracker.io/wallets",
    steps:     [
      "We'll download your CoinTracker-format CSV and open CoinTracker's wallets page.",
      "Click \"Add Wallet\" and select \"Generic CSV\".",
      "Upload the CSV we just downloaded.",
      "CoinTracker validates the format and imports — review and confirm.",
    ],
    audience: "investor",
  },
  {
    id:        "turbotax",
    name:      "TurboTax CSV",
    subtitle:  "Pre-formatted for the TurboTax crypto importer (US only)",
    importUrl: "https://turbotax.intuit.com/personal-taxes/online/premier.jsp",
    steps:     [
      "We'll download your TurboTax-format CSV.",
      "In TurboTax: Investments → Cryptocurrency → \"I'll type it in myself\" → Upload CSV.",
      "Select \"Other\" as the platform and upload the CSV we just downloaded.",
      "TurboTax classifies vesting income on Schedule 1 / capital gains on Schedule D — review the import preview.",
    ],
    audience: "investor",
  },
  // Worker-pivot formats — ordinary-income at FMV-on-receipt. Distinct
  // from the four capital-gains formats above. For DAO contributors,
  // crypto-paid contractors, and salary streams.
  {
    id:        "payroll-income",
    name:      "Payroll income — detail",
    subtitle:  "Per-claim CSV at FMV-on-receipt — the audit-trail format your accountant will want",
    steps:     [
      "We'll download a CSV with one row per claim received as income.",
      "Each row carries the FMV in USD at the moment of receipt — the figure your tax authority wants.",
      "US: paste totals into TurboTax → 1099-NEC summary, or attach the CSV as supporting documentation.",
      "UK: the per-row figures map onto SA103 (Self-employment) — your accountant can sum and convert to GBP at year-end.",
      "Other countries: the CSV is generic enough for any accountant to use directly.",
    ],
    audience: "worker",
  },
  {
    id:        "payroll-summary-us",
    name:      "Payroll income — US 1099-NEC summary",
    subtitle:  "One row per payer with summed totals — drops directly into TurboTax / FreeTaxUSA / 1099-NEC line 1",
    steps:     [
      "We'll download a CSV with one row per payer (the streaming contract paying you).",
      "Each row carries the total Gross Income (USD) you received from that payer in the selected period.",
      "Paste the per-payer total into TurboTax → 1099-NEC → \"Box 1: Nonemployee Compensation\" — one entry per payer.",
      "Self-employed (Schedule C) filers: total of all rows is your gross receipts.",
      "Per-claim audit detail is in the \"Payroll income — detail\" CSV.",
    ],
    audience: "worker",
  },
  {
    id:        "payroll-summary-uk",
    name:      "Payroll income — UK SA103 summary",
    subtitle:  "Self-employment turnover by payer — for HMRC SA103 / SA103S box 9",
    steps:     [
      "We'll download a CSV with one row per payer (the streaming contract paying you).",
      "Amounts stay in USD — the CSV's footer note links to HMRC's published exchange-rate page for year-end conversion.",
      "Sum all payers (last row of the CSV) → convert to GBP → enter on SA103S box 9 (Turnover) or SA103F box 15.",
      "Keep the CSV as supporting documentation in case HMRC requests the breakdown.",
      "Per-claim audit detail is in the \"Payroll income — detail\" CSV.",
    ],
    audience: "worker",
  },
];

/** Sort export formats by audience preference — workers see payroll
 *  formats first, investors see capital-gains formats first. "any"-tagged
 *  formats sit between. Stable sort preserves the original relative order
 *  inside each audience bucket. Falls back to investor-first when the
 *  user hasn't completed onboarding (audienceCategory === null).
 *
 *  May 5 2026 — strategy reset: marketing surface focuses on vesting
 *  while Payroll moves to the roadmap. The audience-aware sort code
 *  is preserved (server still tracks audienceCategory; we'll re-enable
 *  the worker-first ordering when Payroll relaunches), but the page
 *  now hard-codes the investor-first sort regardless of the user's
 *  stored audienceCategory. Worker-flavoured formats (1099-NEC / SA103)
 *  remain in the format list — power users who want them can still
 *  scroll down — they're just no longer hoisted to the top.
 */
function sortFormatsForAudience(
  formats:           ExportFormat[],
  _audienceCategory: string | null,
): ExportFormat[] {
  const orderFor = (a: ExportFormat["audience"]): number => {
    return a === "investor" ? 0 : a === "any" ? 1 : 2;
  };
  return [...formats].sort((x, y) => orderFor(x.audience) - orderFor(y.audience));
}

export default function ExportsPage() {
  const router = useRouter();
  const [events, setEvents]     = useState<ClaimEvent[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [coverage, setCoverage] = useState<string[]>([]);
  const [pending, setPending]   = useState<string[]>([]);
  // From the user record. Drives the export-format card ordering — workers
  // see payroll-flavoured CSVs first; investors see capital-gains formats
  // first; null falls back to investor-first. Captured from the same
  // /api/claims/history response that populates events + summary, so no
  // extra round-trip.
  const [audienceCategory, setAudienceCategory] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [refreshMsg, setRefreshMsg]   = useState<string | null>(null);
  const [yearFilter, setYearFilter]   = useState<string>("all");
  // Per-protocol inserted/error counts from the most recent refresh.
  // Used to surface the per-protocol diagnostic panel right after a refresh
  // so users can see exactly which ingestors ran, which inserted rows,
  // and which errored out — instead of having to deduce coverage from the
  // single aggregate totalInserted figure the previous flow showed.
  const [perProtocol, setPerProtocol] = useState<IngestResult[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (yearFilter !== "all") {
        sp.set("since", `${yearFilter}-01-01`);
        sp.set("until", `${yearFilter}-12-31`);
      }
      const res = await fetch(`/api/claims/history?${sp.toString()}`);
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
      setSummary(data.summary ?? null);
      setAudienceCategory(data.audienceCategory ?? null);
    } finally {
      setLoading(false);
    }
  }, [yearFilter, router]);

  useEffect(() => { load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/claims/history?action=refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRefreshMsg(data.error ?? "Refresh failed");
        return;
      }
      setRefreshMsg(data.message ?? "Indexing complete");
      setCoverage(data.coverage ?? []);
      setPending((data.perProtocol ?? []).filter((r: IngestResult) => r.notImplemented).map((r: IngestResult) => r.protocol));
      setPerProtocol(data.perProtocol ?? []);
      track("cta_clicked", { cta_id: "exports_refresh", inserted: data.inserted });
      await load();
    } catch {
      setRefreshMsg("Network error");
    } finally {
      setRefreshing(false);
    }
  }

  function downloadCsv(format: string) {
    const sp = new URLSearchParams({ format });
    if (yearFilter !== "all") {
      sp.set("since", `${yearFilter}-01-01`);
      sp.set("until", `${yearFilter}-12-31`);
    }
    track("cta_clicked", { cta_id: "exports_download", format, year: yearFilter });
    // Trigger a same-tab download. window.location.href IS a navigation
    // primitive, not a "mutation of external state" — the React compiler
    // lint rule that flags this can't tell the difference. Suppress here
    // rather than refactor to a hidden <a> tag, which would be ceremony
    // for the same outcome.
    // eslint-disable-next-line react-hooks/immutability
    window.location.href = `/api/claims/export?${sp.toString()}`;
  }

  const years = summary
    ? Object.keys(summary.byYear).sort((a, b) => Number(b) - Number(a))
    : [];

  return (
    <div className="min-h-screen flex" style={{ background: "var(--preview-bg)" }}>
      <main className="flex-1 px-4 md:px-8 py-6 max-w-5xl mx-auto w-full">

        {/* Hero */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <span>Tax Reports</span>
          </div>
          <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
            Tax Reports
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
            Tax reports & exports
          </h1>
          <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
            Every vesting claim, with USD value at the moment of claim. Download as CSV for your accountant or import directly into Koinly, CoinTracker, or TurboTax.
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--preview-text-3)" }}>
            Want a P&amp;L-style summary?{" "}
            <Link href="/dashboard/income-statement" className="font-semibold" style={{ color: "#0F8A8A" }}>
              View your income statement →
            </Link>
          </p>
        </div>

        {/* Coverage banner — honest about what's indexed */}
        <div className="rounded-2xl p-4 mb-5"
          style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.20)",
          }}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--preview-text)" }}>
                Indexed: <span style={{ color: "#0F8A8A" }}>all 9 protocols</span> · Sablier, Hedgey, Superfluid, LlamaPay, PinkSale, UNCX, Unvest, Streamflow, Jupiter Lock
              </p>
              <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                Hit refresh below to index your claims. Three caveats: <strong>tax basis</strong> — we
                index on-chain claim transactions, which is the right receipt event for US/Canada/EU/
                Germany. UK (HMRC) and Australia (ATO) filers may need to re-attribute to unlock dates
                with their accountant.{" "}
                <Link href="/resources/token-vesting-tax-guide" className="underline" style={{ color: "#0F8A8A" }}>
                  Tax guide →
                </Link>
                {" "}<strong>Superfluid</strong> captures discrete cliff and end events — continuous flow
                accrual between them is not yet attributed. <strong>Solana protocols</strong> (Streamflow,
                Jupiter Lock) use snapshot-diff: pre-Vestream history shows as one baseline event per
                stream; subsequent claims are tracked individually whenever you refresh.
              </p>
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Tax year</label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
            >
              <option value="all">All time</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y} ({summary?.byYear[y]?.rows ?? 0} claims · ${(summary?.byYear[y]?.usd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all disabled:opacity-50"
            style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.25)" }}
          >
            {refreshing ? "Indexing…" : "↻ Refresh claims"}
          </button>
        </div>
        {refreshMsg && (
          <p className="text-xs mb-5" style={{ color: refreshMsg.toLowerCase().includes("fail") || refreshMsg.toLowerCase().includes("error") ? "#B3322E" : "var(--preview-text-3)" }}>
            {refreshMsg}
          </p>
        )}
        {coverage.length > 0 && pending.length > 0 && (
          <p className="text-[11px] -mt-3 mb-5" style={{ color: "var(--preview-text-3)" }}>
            Last refresh indexed: {coverage.join(", ")}.
            {pending.length > 0 && ` Pending adapters: ${pending.join(", ")}.`}
          </p>
        )}

        {/* Per-protocol breakdown — only shown after the most recent
            refresh, so users see exactly which ingestors found data,
            which were silent (no streams on that protocol — expected),
            and which errored. Replaces the previous "single totalInserted"
            figure that gave no diagnostic info. */}
        {perProtocol.length > 0 && (
          <div className="mb-5 rounded-xl p-3"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--preview-text-3)" }}>
              Last refresh — per protocol
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
              {perProtocol.map((r) => {
                const status = r.error
                  ? { color: "#B3322E", text: `error: ${r.error.slice(0, 40)}${r.error.length > 40 ? "…" : ""}` }
                  : r.notImplemented
                    ? { color: "var(--preview-text-3)", text: "not yet shipped" }
                    : r.inserted > 0
                      ? { color: "#0F8A8A", text: `+${r.inserted} new` }
                      : { color: "var(--preview-text-3)", text: "no new claims" };
                return (
                  <div key={r.protocol} className="flex justify-between items-baseline gap-2">
                    <span className="capitalize" style={{ color: "var(--preview-text-2)" }}>
                      {r.protocol.replace("-", " ")}
                    </span>
                    <span style={{ color: status.color }}>{status.text}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] mt-2" style={{ color: "var(--preview-text-3)" }}>
              &quot;No new claims&quot; usually means you don&apos;t have any vesting streams on that
              protocol — not an error. Errors will show in red.
            </p>
          </div>
        )}

        {/* Summary card */}
        {summary && summary.totalRows > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <SummaryCard
              label="Total claims"
              value={summary.totalRows.toLocaleString()}
            />
            <SummaryCard
              label="Total USD at claim"
              value={`$${summary.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <SummaryCard
              label="Years covered"
              value={Object.keys(summary.byYear).length.toString()}
            />
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-sm" style={{ color: "var(--preview-text-3)" }}>Loading…</div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl p-10 text-center"
            style={{ background: "var(--preview-card)", border: "1px dashed var(--preview-border)", color: "var(--preview-text-3)" }}>
            <p className="text-sm mb-1">No claim history indexed yet.</p>
            <p className="text-xs">Hit &quot;Refresh claims&quot; above to pull your Sablier claim history.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden mb-6"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Date</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Token</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Amount</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>USD at claim</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Protocol</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Chain</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={e.id} style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--preview-text)" }}>
                        {new Date(e.claimedAt).toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--preview-text)" }}>
                        {e.tokenSymbol ?? `${e.tokenAddress.slice(0, 6)}…${e.tokenAddress.slice(-4)}`}
                      </td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap" style={{ color: "var(--preview-text)" }}>
                        {tokensWhole(e.amount, e.tokenDecimals)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: e.usdValueAtClaim ? "var(--preview-text)" : "var(--preview-text-3)" }}>
                        {e.usdValueAtClaim
                          ? `$${Number(e.usdValueAtClaim).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                          : "—"}
                        {e.priceConfidence === "nearest" && (
                          <span className="ml-1 text-[10px]" title="Used nearest available price within ±7 days" style={{ color: "#d97706" }}>~</span>
                        )}
                        {e.priceConfidence === "missing" && (
                          <span className="ml-1 text-[10px]" title="No historical price found — set cost basis manually" style={{ color: "#B3322E" }}>!</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize" style={{ color: "var(--preview-text-2)" }}>{e.protocol}</td>
                      <td className="px-4 py-3" style={{ color: "var(--preview-text-2)" }}>
                        {CHAIN_NAMES[e.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${e.chainId}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Download formats */}
        {events.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>Download formats</h2>
            <div className="grid gap-3">
              {sortFormatsForAudience(FORMATS, audienceCategory).map((f) => (
                <ExportFormatCard
                  key={f.id}
                  format={f}
                  onDownload={() => downloadCsv(f.id)}
                />
              ))}
            </div>
            <p className="text-[11px] mt-4" style={{ color: "var(--preview-text-3)" }}>
              ✦ The CSV exports cost basis values at the date of claim — Koinly / CoinTracker /
              TurboTax use these as the income amount and as cost basis for future capital-gains calculations.
              Rows where price was approximate carry a ~ marker; rows with no price found carry a ! marker
              and need a manual cost basis entered in your tax software.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-4"
      style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--preview-text-3)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color: "var(--preview-text)" }}>{value}</div>
    </div>
  );
}

/**
 * Per-format export card. Two action surfaces:
 *
 *   - Bare "Download CSV" button — for users who want the file and know
 *     where it's going (their accountant, manual reconciliation, etc).
 *   - "Send to <Platform>" button — for users importing into a specific
 *     tax tool. Triggers the CSV download AND opens the platform's
 *     import page in a new tab, then expands a numbered steps panel
 *     so the user knows exactly what to click on the other side.
 *
 * The platforms covered (Koinly, CoinTracker, TurboTax) don't expose
 * public push APIs — every one of them imports via CSV upload. The
 * guided flow is the closest thing to 1-click we can build without a
 * private partnership; researched + documented in the FORMATS const.
 */
function ExportFormatCard({
  format,
  onDownload,
}: {
  format:     ExportFormat;
  onDownload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  function handleGuidedSend() {
    onDownload();
    if (format.importUrl) {
      window.open(format.importUrl, "_blank", "noopener,noreferrer");
    }
    setExpanded(true);
    track("cta_clicked", { cta_id: "exports_guided_send", format: format.id });
  }

  return (
    <div className="rounded-xl"
      style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
      <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--preview-text)" }}>{format.name}</div>
          <div className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>{format.subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownload}
            className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
            style={{ background: "transparent", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }}
          >
            Download CSV
          </button>
          {format.importUrl && (
            <button
              onClick={handleGuidedSend}
              className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
              style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}
            >
              Send to {format.name.replace(" CSV", "")} →
            </button>
          )}
        </div>
      </div>
      {expanded && format.steps && (
        <div className="px-4 pb-4 pt-0">
          <div className="rounded-lg p-3"
            style={{ background: "rgba(28,184,184,0.04)", border: "1px solid rgba(28,184,184,0.15)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#0F8A8A" }}>
              Steps to import
            </p>
            <ol className="space-y-1.5 text-xs" style={{ color: "var(--preview-text-2)" }}>
              {format.steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 font-mono font-semibold" style={{ color: "#0F8A8A" }}>
                    {i + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-[10px] mt-2.5" style={{ color: "var(--preview-text-3)" }}>
              Note: none of these platforms expose a public push API, so the CSV upload is the
              official integration path. Your data never leaves your computer between Vestream
              and the tax tool.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mirror of the helper in csv-exports.ts — kept duplicated client-side
 *  rather than imported because csv-exports has server-only imports
 *  (db schema types). Same logic, smaller surface. */
function tokensWhole(amount: string, decimals: number): string {
  try {
    const big = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole   = big / divisor;
    const frac    = big % divisor;
    if (frac === 0n) return whole.toLocaleString();
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
    return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
  } catch {
    return "—";
  }
}
