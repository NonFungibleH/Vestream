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
//   - Coverage banner (1 of 10 protocols indexed)
//
// Phase 3 follow-ups:
//   - Date-range picker (currently year only)
//   - Cost-basis method selector (FIFO / LIFO / HIFO)
//   - Multi-currency display (read-only — USD-at-claim stays in USD for tax)
//   - PDF year-end summary report
//   - Direct accountant email
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { getProtocol } from "@/lib/protocol-constants";
import { useCurrency } from "@/lib/use-currency";
import { formatMoney, getCurrencyMeta } from "@/lib/currency";
import { track } from "@/lib/analytics";
import { useToast } from "@/components/Toast";
import { CopyButton } from "@/components/CopyButton";
import { useCountUp } from "@/lib/use-count-up";
import { VestingsList } from "./VestingsList";

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

interface YearSummary { rows: number; usd: number; local: number }
interface Summary {
  totalRows:  number;
  totalUsd:   number;
  totalLocal: number; // USD totals converted at each claim's historical FX rate
  byYear:     Record<string, YearSummary>;
}

interface IngestResult {
  protocol:        string;
  inserted:        number;
  notImplemented?: boolean;
  error?:          string;
}

// ── Claim-table sort (in-memory; mirrors ExplorerTable's pattern) ────────────
type ClaimSortCol = "date" | "token" | "amount" | "price" | "usd" | "protocol" | "chain";
type SortDir      = "asc" | "desc";

function claimAmountNum(e: ClaimEvent): number {
  try { return Number(BigInt(e.amount)) / 10 ** Math.min(e.tokenDecimals, 18); } catch { return 0; }
}

/** USD price per whole token at the claim date = usdValueAtClaim ÷ tokens
 *  claimed. Null when the row is unpriced or the amount is zero. */
function claimUnitPrice(e: ClaimEvent): number | null {
  if (e.usdValueAtClaim == null) return null;
  const amt = claimAmountNum(e);
  if (!(amt > 0)) return null;
  const p = Number(e.usdValueAtClaim) / amt;
  return Number.isFinite(p) ? p : null;
}
function claimSortValue(e: ClaimEvent, col: ClaimSortCol): number | string {
  switch (col) {
    case "date":     return new Date(e.claimedAt).getTime() || 0;
    case "token":    return (e.tokenSymbol ?? e.tokenAddress).toLowerCase();
    case "amount":   return claimAmountNum(e);
    case "price":    return claimUnitPrice(e) ?? -Infinity;
    case "usd":      return e.usdValueAtClaim != null ? Number(e.usdValueAtClaim) : -Infinity;
    case "protocol": return e.protocol.toLowerCase();
    case "chain":    return (CHAIN_NAMES[e.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${e.chainId}`).toLowerCase();
  }
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
  const toast  = useToast();
  const [coverage, setCoverage] = useState<string[]>([]);
  const [pending, setPending]   = useState<string[]>([]);
  const [refreshing, setRefreshing]   = useState(false);
  const [refreshMsg, setRefreshMsg]   = useState<string | null>(null);
  // Date range for the report (empty string = open-ended). Replaces the old
  // year-only dropdown — UK tax years (Apr 6–Apr 5) and single quarters don't
  // fit calendar years. Presets below set these; the date inputs allow any
  // custom span. The /api/claims/{history,export} endpoints already take
  // since/until, so this is purely a UI change.
  const [since, setSince] = useState<string>("");
  const [until, setUntil] = useState<string>("");
  // Per-protocol inserted/error counts from the most recent refresh.
  // Used to surface the per-protocol diagnostic panel right after a refresh
  // so users can see exactly which ingestors ran, which inserted rows,
  // and which errored out — instead of having to deduce coverage from the
  // single aggregate totalInserted figure the previous flow showed.
  const [perProtocol, setPerProtocol] = useState<IngestResult[]>([]);
  // Which export format is currently being built (server takes a few seconds);
  // drives the per-card spinner so a click gives immediate feedback.
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  // View-only filters (protocol / chain / token) for exploring history. These
  // refine the on-screen table + summary cards ONLY — the downloadable reports
  // always cover the full Report Period in date order (see downloadCsv).
  const [fProtocol, setFProtocol] = useState<string>("");
  const [fChain,    setFChain]    = useState<string>("");
  const [fToken,    setFToken]    = useState<string>("");
  // Auto-refresh guard — fire once on first mount if no claims are indexed yet.
  // The ref ensures we only auto-trigger once per page visit even if the
  // yearFilter changes and load() re-runs.
  const autoRefreshed = useRef(false);

  // SWR-cached per yearFilter. The dashboard's SWRConfig provider keeps
  // the cache alive across navigations, so going Dashboard → Tax → Dashboard
  // → Tax renders the second Tax visit instantly. The refresh() POST below
  // mutates the SWR cache directly on success.
  // Fetch ALL of the user's claims once with a STABLE key; the date filter is
  // applied client-side below (instant, no round-trip, and immune to the
  // server-filtered fetch intermittently not reflecting in the UI). The CSV
  // export still filters server-side via its own ?since/?until URL.
  const swrKey = `/api/claims/history`;
  const { data: historyData, isLoading, mutate: mutateHistory } = useSWR<{
    events: ClaimEvent[];
    summary: Summary | null;
    audienceCategory: string | null;
  }>(swrKey, async (url: string) => {
    // no-store: the response varies by ?since/?until — never reuse a cached
    // body for a different date range (the year-filter "not filtering" bug).
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    if (res.status === 401) { router.push("/login"); throw new Error("unauthorized"); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  const events: ClaimEvent[] = historyData?.events ?? [];
  const audienceCategory: string | null = historyData?.audienceCategory ?? null;
  const loading = isLoading;

  // ── Multi-currency (historical FX) ───────────────────────────────────────
  // Each claim's USD-at-receipt value is shown in the user's chosen currency
  // converted AT THE RATE ON THE CLAIM DATE — tax-correct (HMRC wants GBP at
  // receipt, not today's GBP). We fetch a date→rate map for the distinct claim
  // dates; a date the provider can't resolve falls back to the live rate. USD
  // short-circuits to no conversion (rate 1 everywhere).
  const { currency, rate: liveRate } = useCurrency();
  const ccyMeta = getCurrencyMeta(currency);

  const claimDates = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) s.add(e.claimedAt.slice(0, 10));
    return [...s].sort();
  }, [events]);

  const fxKey = currency === "USD" || claimDates.length === 0
    ? null
    : `/api/fx/historical?currency=${currency}&dates=${claimDates.join(",")}`;
  const { data: fxData } = useSWR<{ currency: string; rates: Record<string, number> }>(
    fxKey,
    (url: string) => fetch(url, { credentials: "include", cache: "no-store" }).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const fxRates = fxData?.currency === currency ? fxData.rates : undefined;

  // USD→chosen-currency multiplier for a claim date (ISO string). Live rate is
  // the transient/last-resort fallback while the dated map loads or when the
  // provider couldn't price that specific day.
  const rateForDate = useCallback((iso: string): number => {
    if (currency === "USD") return 1;
    return fxRates?.[iso.slice(0, 10)] ?? liveRate ?? 1;
  }, [currency, fxRates, liveRate]);

  // Localised money at a per-date historical rate (value column + summary card).
  const fmtMoneyAt = useCallback(
    (usd: number | null | undefined, iso: string): string =>
      formatMoney(usd ?? null, currency, rateForDate(iso)),
    [currency, rateForDate],
  );
  // Localised unit price — keeps extra precision for sub-unit prices, mirroring
  // the old USD price format but with the chosen currency's symbol.
  const fmtPriceAt = useCallback((usd: number | null, iso: string): string => {
    if (usd == null) return "—";
    const local = usd * rateForDate(iso);
    if (local < 1) return `${ccyMeta.symbol}${local.toPrecision(3)}`;
    return `${ccyMeta.symbol}${local.toLocaleString(ccyMeta.locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }, [rateForDate, ccyMeta]);
  const isNonUsd = currency !== "USD";

  // ── Client-side date filter (the Report Period) ──────────────────────────
  // since/until are "YYYY-MM-DD" strings (empty = open-ended). We filter the
  // already-fetched events here so switching period is instant AND always
  // reflects in the UI.
  // Distinct filter options derived from the FULL event set (stable as the
  // user narrows), each with a display label. Token key is symbol-or-address.
  const filterOptions = useMemo(() => {
    const protos = new Map<string, string>();
    const chains = new Map<string, string>();
    const tokens = new Map<string, string>();
    for (const e of events) {
      protos.set(e.protocol, getProtocol(e.protocol)?.name ?? e.protocol);
      chains.set(String(e.chainId), CHAIN_NAMES[e.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${e.chainId}`);
      const tkey = e.tokenSymbol ?? e.tokenAddress;
      tokens.set(tkey, e.tokenSymbol ?? `${e.tokenAddress.slice(0, 6)}…${e.tokenAddress.slice(-4)}`);
    }
    const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);
    return {
      protos: [...protos].sort(byLabel),
      chains: [...chains].sort(byLabel),
      tokens: [...tokens].sort(byLabel),
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    const lo = since ? new Date(`${since}T00:00:00`).getTime() : -Infinity;
    const hi = until ? new Date(`${until}T23:59:59.999`).getTime() : Infinity;
    return events.filter((e) => {
      const t = new Date(e.claimedAt).getTime();
      if (t < lo || t > hi) return false;
      if (fProtocol && e.protocol !== fProtocol) return false;
      if (fChain && String(e.chainId) !== fChain) return false;
      if (fToken && (e.tokenSymbol ?? e.tokenAddress) !== fToken) return false;
      return true;
    });
  }, [events, since, until, fProtocol, fChain, fToken]);

  // Header totals are recomputed from the FILTERED set so the cards always
  // match the visible rows (Total claims / Total USD / Years covered).
  const summary: Summary | null = useMemo(() => {
    if (!historyData) return null;
    const byYear: Record<string, YearSummary> = {};
    let totalUsd = 0, totalLocal = 0;
    for (const e of filteredEvents) {
      const usd = e.usdValueAtClaim ? Number(e.usdValueAtClaim) : 0;
      const local = usd * rateForDate(e.claimedAt);
      totalUsd   += usd;
      totalLocal += local;
      const y = String(new Date(e.claimedAt).getUTCFullYear());
      (byYear[y] ??= { rows: 0, usd: 0, local: 0 });
      byYear[y].rows  += 1;
      byYear[y].usd   += usd;
      byYear[y].local += local;
    }
    return { totalRows: filteredEvents.length, totalUsd, totalLocal, byYear };
  }, [historyData, filteredEvents, rateForDate]);

  // In-memory sort of the claim table — same pattern as the explorer's
  // ExplorerTable (click a header → reorder instantly, zero round-trip).
  const [sortCol, setSortCol] = useState<ClaimSortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const sortedEvents = useMemo(() => {
    const copy = [...filteredEvents];
    copy.sort((a, b) => {
      const x = claimSortValue(a, sortCol);
      const y = claimSortValue(b, sortCol);
      let cmp: number;
      if (typeof x === "string" || typeof y === "string") cmp = String(x).localeCompare(String(y));
      else cmp = x < y ? -1 : x > y ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredEvents, sortCol, sortDir]);
  function toggleSort(next: ClaimSortCol, defaultDir: SortDir) {
    if (next === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(next); setSortDir(defaultDir); }
  }

  // Headline figures count up on first paint.
  const animTotalRows  = useCountUp(summary?.totalRows  ?? 0);
  const animTotalLocal = useCountUp(summary?.totalLocal ?? 0);
  const animYears      = useCountUp(summary ? Object.keys(summary.byYear).length : 0);

  // Auto-index on first visit if the user has never refreshed before.
  // Saves the "why is this page empty?" confusion — on mount, if the
  // initial load completes with zero events and we haven't auto-refreshed
  // yet this session, kick off the indexer automatically.
  useEffect(() => {
    if (!loading && events.length === 0 && !autoRefreshed.current && !refreshing) {
      autoRefreshed.current = true;
      refresh();
    }
    // refresh is defined below but stable across renders (no deps change it)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, events.length]);

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/claims/history?action=refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRefreshMsg(data.error ?? "Refresh failed");
        toast.error(data.error ?? "Refresh failed");
        return;
      }
      setRefreshMsg(data.message ?? "Indexing complete");
      toast.success(data.message ?? "Indexing complete");
      setCoverage(data.coverage ?? []);
      setPending((data.perProtocol ?? []).filter((r: IngestResult) => r.notImplemented).map((r: IngestResult) => r.protocol));
      setPerProtocol(data.perProtocol ?? []);
      track("cta_clicked", { cta_id: "exports_refresh", inserted: data.inserted });
      // SWR-aware revalidate of the history cache so the events list
      // reflects the new ingest. Replaces the previous explicit await load().
      await mutateHistory();
    } catch {
      setRefreshMsg("Network error");
      toast.error("Network error");
    } finally {
      setRefreshing(false);
    }
  }

  // Build + download a CSV. Fetched as a blob (not a bare <a download>) so the
  // button can show a pending spinner until the file is actually ready — the
  // server spends a few seconds pricing + assembling the CSV, and a plain
  // <a download> gives the user no signal that anything is happening.
  // Reports always honour the Report Period (since/until) in date order; the
  // view-only protocol/chain/token filters never narrow the exported file.
  async function downloadCsv(format: string) {
    if (downloadingFormat) return; // one build at a time — ignore double-clicks
    const sp = new URLSearchParams({ format });
    if (since) sp.set("since", since);
    if (until) sp.set("until", until);
    track("cta_clicked", { cta_id: "exports_download", format, since: since || "all", until: until || "all" });
    setDownloadingFormat(format);
    try {
      const res = await fetch(`/api/claims/export?${sp.toString()}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Honour the server's Content-Disposition filename.
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m  = /filename="?([^"]+)"?/i.exec(cd);
      const filename = m?.[1] ?? `vestream-${format}.csv`;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't build that CSV — please try again.");
    } finally {
      setDownloadingFormat(null);
    }
  }


  return (
    <div className="flex flex-1 overflow-hidden" style={{ background: "var(--preview-bg)" }}>
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 w-full">

        {/* Hero */}
        <div className="mb-5">
          <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <span>Tax</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
            Tax Exports
          </h1>
          <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
            Every vesting claim priced at the moment of receipt. Export to your accountant or import directly into Koinly, CoinTracker, or TurboTax.
          </p>
        </div>

        {/* Coverage banner — honest about what's indexed */}
        <div className="rounded-2xl p-4 mb-5"
          style={{
            background: "rgba(28,184,184,0.05)",
            border: "1px solid rgba(28,184,184,0.18)",
          }}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0F8A8A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--preview-text)" }}>
                Supported:{" "}
                <span style={{ color: "#0F8A8A" }}>Sablier, Hedgey, UNCX, PinkSale, Unvest, Superfluid</span>
                <span style={{ color: "var(--preview-text-3)" }}> · Solana (Streamflow &amp; Jupiter Lock) coming soon</span>
              </p>
              <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                Hit refresh to index your claim history. Each claim is priced at the date of
                receipt — the right figure for US / Canada / EU / Germany tax purposes.{" "}
                <strong>UK (HMRC)</strong> and <strong>Australia (ATO)</strong> filers may need to
                re-attribute to unlock dates with their accountant.{" "}
                <Link href="/resources/token-vesting-tax-guide" className="underline" style={{ color: "#0F8A8A" }}>
                  Tax guide →
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Vestings-first: one row per token the user vests, with claimed-to-date
            income and an expandable per-token claim history. */}
        <VestingsList />

        {/* Action row */}
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Report period</span>
            {/* Preset chips — calendar years + UK tax years (Apr 6–Apr 5).
                For anything else (a single quarter, an arbitrary span) use the
                From/To inputs below. */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(() => {
                const now = new Date();
                const yr  = now.getUTCFullYear();
                // Which UK tax year does "today" fall in? It rolls over on Apr 6.
                const afterApr6 = now.getUTCMonth() > 3 || (now.getUTCMonth() === 3 && now.getUTCDate() >= 6);
                const ukStart = afterApr6 ? yr : yr - 1;
                const yy = (n: number) => String(n).slice(2);
                const presets: Array<{ label: string; since: string; until: string }> = [
                  { label: "All time", since: "", until: "" },
                  { label: `${yr}`,     since: `${yr}-01-01`,     until: `${yr}-12-31` },
                  { label: `${yr - 1}`, since: `${yr - 1}-01-01`, until: `${yr - 1}-12-31` },
                  { label: `UK ${yy(ukStart)}/${yy(ukStart + 1)}`,     since: `${ukStart}-04-06`,     until: `${ukStart + 1}-04-05` },
                  { label: `UK ${yy(ukStart - 1)}/${yy(ukStart)}`, since: `${ukStart - 1}-04-06`, until: `${ukStart}-04-05` },
                ];
                return presets.map((p) => {
                  const active = since === p.since && until === p.until;
                  return (
                    <button key={p.label} type="button" onClick={() => { setSince(p.since); setUntil(p.until); }}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors"
                      style={{
                        background: active ? "rgba(28,184,184,0.14)" : "var(--preview-card)",
                        color:      active ? "#0F8A8A" : "var(--preview-text-2)",
                        border:     `1px solid ${active ? "rgba(28,184,184,0.30)" : "var(--preview-border)"}`,
                      }}>
                      {p.label}
                    </button>
                  );
                });
              })()}
            </div>
            {/* Custom range */}
            <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: "var(--preview-text-3)" }}>
              <span>From</span>
              <input type="date" value={since} max={until || undefined} onChange={(e) => setSince(e.target.value)}
                className="text-xs px-2 py-1 rounded-lg outline-none"
                style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }} />
              <span>to</span>
              <input type="date" value={until} min={since || undefined} onChange={(e) => setUntil(e.target.value)}
                className="text-xs px-2 py-1 rounded-lg outline-none"
                style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }} />
              {(since || until) && (
                <button type="button" onClick={() => { setSince(""); setUntil(""); }} className="underline" style={{ color: "var(--preview-text-2)" }}>
                  clear
                </button>
              )}
            </div>
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

        {/* View filters — refine the on-screen table + summary (not the export) */}
        {events.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider mr-0.5" style={{ color: "var(--preview-text-3)" }}>
              Filter view
            </span>
            <FilterSelect value={fProtocol} onChange={setFProtocol} allLabel="All protocols" options={filterOptions.protos} />
            <FilterSelect value={fChain}    onChange={setFChain}    allLabel="All chains"    options={filterOptions.chains} />
            <FilterSelect value={fToken}    onChange={setFToken}    allLabel="All tokens"    options={filterOptions.tokens} />
            {(fProtocol || fChain || fToken) && (
              <button
                type="button"
                onClick={() => { setFProtocol(""); setFChain(""); setFToken(""); }}
                className="text-xs underline"
                style={{ color: "var(--preview-text-2)" }}
              >
                Clear
              </button>
            )}
            {(fProtocol || fChain || fToken) && (
              <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                {filteredEvents.length} of {events.length} claims
              </span>
            )}
          </div>
        )}

        {/* Summary card */}
        {summary && summary.totalRows > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <SummaryCard
              label="Total claims"
              value={Math.round(animTotalRows).toLocaleString()}
            />
            <SummaryCard
              label={isNonUsd ? `Total ${currency} at claim` : "Total USD at claim"}
              value={`${ccyMeta.symbol}${Math.round(animTotalLocal).toLocaleString(ccyMeta.locale, { maximumFractionDigits: 0 })}`}
            />
            <SummaryCard
              label="Years covered"
              value={Math.round(animYears).toString()}
            />
          </div>
        )}

        {/* Historical-FX note — only when displaying a non-USD currency */}
        {isNonUsd && summary && summary.totalRows > 0 && (
          <p className="text-xs mb-3 -mt-2" style={{ color: "var(--preview-text-3)" }}>
            Amounts shown in {currency}, converted from USD at the FX rate on each
            claim date (tax-correct). CSV exports remain in USD for import compatibility.
          </p>
        )}

        {/* Table */}
        {loading ? (
          <ClaimTableSkeleton />
        ) : events.length === 0 ? (
          <div className="rounded-2xl p-8 text-center mb-6"
            style={{ background: "var(--preview-card)", border: "1px dashed var(--preview-border)", color: "var(--preview-text-3)" }}>
            <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: "rgba(28,184,184,0.1)", border: "1px solid rgba(28,184,184,0.2)" }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text)" }}>No claim history indexed yet</p>
            <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>
              Hit <strong>&ldquo;↻ Refresh claims&rdquo;</strong> above — Vestream will index your Sablier
              vesting payouts and price each one at the date of receipt.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden mb-6"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="overflow-x-auto" style={{ maxHeight: 560 }}>
              <table className="w-full text-sm" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
                    <ClaimTh label="Date"         col="date"     active={sortCol} dir={sortDir} onClick={() => toggleSort("date", "desc")} />
                    <ClaimTh label="Token"        col="token"    active={sortCol} dir={sortDir} onClick={() => toggleSort("token", "asc")} />
                    <ClaimTh label="Amount"       col="amount"   active={sortCol} dir={sortDir} onClick={() => toggleSort("amount", "desc")} align="right" />
                    <ClaimTh label="Price"        col="price"    active={sortCol} dir={sortDir} onClick={() => toggleSort("price", "desc")} align="right" />
                    <ClaimTh label={isNonUsd ? `${currency} at claim` : "USD at claim"} col="usd" active={sortCol} dir={sortDir} onClick={() => toggleSort("usd", "desc")} align="right" />
                    <ClaimTh label="Protocol"     col="protocol" active={sortCol} dir={sortDir} onClick={() => toggleSort("protocol", "asc")} />
                    <ClaimTh label="Chain"        col="chain"    active={sortCol} dir={sortDir} onClick={() => toggleSort("chain", "asc")} />
                  </tr>
                </thead>
                <tbody>
                  {sortedEvents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-xs" style={{ color: "var(--preview-text-3)" }}>
                        No claims match these filters.{" "}
                        <button
                          type="button"
                          onClick={() => { setFProtocol(""); setFChain(""); setFToken(""); }}
                          className="underline"
                          style={{ color: "var(--preview-text-2)" }}
                        >
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  )}
                  {sortedEvents.map((e, i) => (
                    <tr key={e.id} style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--preview-text)" }}>
                        {new Date(e.claimedAt).toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--preview-text)" }}>
                        {e.tokenSymbol ?? (
                          <CopyButton
                            value={e.tokenAddress}
                            display={`${e.tokenAddress.slice(0, 6)}…${e.tokenAddress.slice(-4)}`}
                            style={{ color: "var(--preview-text)" }}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap" style={{ color: "var(--preview-text)" }}>
                        {tokensWhole(e.amount, e.tokenDecimals)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap" style={{ color: claimUnitPrice(e) != null ? "var(--preview-text-2)" : "var(--preview-text-3)" }}>
                        {fmtPriceAt(claimUnitPrice(e), e.claimedAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: e.usdValueAtClaim ? "var(--preview-text)" : "var(--preview-text-3)" }}>
                        {e.usdValueAtClaim
                          ? fmtMoneyAt(Number(e.usdValueAtClaim), e.claimedAt)
                          : "—"}
                        {e.priceConfidence === "nearest" && (
                          <span className="ml-1 text-[10px]" title="Used nearest available price within ±7 days" style={{ color: "#d97706" }}>~</span>
                        )}
                        {e.priceConfidence === "missing" && (
                          <span className="ml-1 text-[10px]" title="No historical price found — set cost basis manually" style={{ color: "#B3322E" }}>!</span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--preview-text-2)" }}>{getProtocol(e.protocol)?.name ?? e.protocol}</td>
                      <td className="px-4 py-3" style={{ color: "var(--preview-text-2)" }}>
                        {CHAIN_NAMES[e.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${e.chainId}`}
                      </td>
                    </tr>
                  ))}
                  {sortedEvents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--preview-text-3)" }}>
                        No claims in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Coverage warning previously rendered here was a duplicate of the
            "Verified: …" panel at the top of the page (same protocols, same
            "verify before filing" message). Removed 2026-06-12 to cut alarm
            fatigue. The top panel is the single source of truth for what
            we've confirmed vs what's still indexing. */}

        {/* Download formats — always visible so users understand what's available
            before they hit refresh. Cards are slightly muted when no data exists
            yet; downloads still work (they produce an empty CSV). */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Download formats</h2>
            {events.length === 0 && !loading && (
              <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                Refresh claims above to populate data
              </span>
            )}
          </div>
          <div className="grid gap-3" style={{ opacity: events.length === 0 ? 0.65 : 1 }}>
            {sortFormatsForAudience(FORMATS, audienceCategory).map((f) => (
              <ExportFormatCard
                key={f.id}
                format={f}
                downloading={downloadingFormat === f.id}
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
      </main>
    </div>
  );
}

// Sortable, sticky claim-table header cell. position:sticky + a solid
// background keeps the header visible while scrolling a long claim list.
function ClaimTh({
  label, col, active, dir, onClick, align = "left",
}: {
  label: string; col: ClaimSortCol; active: ClaimSortCol; dir: SortDir;
  onClick: () => void; align?: "left" | "right";
}) {
  const isActive = active === col;
  return (
    <th
      className={`${align === "right" ? "text-right" : "text-left"} px-4 py-3 text-[10px] font-semibold uppercase tracking-wider`}
      style={{
        color:      isActive ? "#0F8A8A" : "var(--preview-text-3)",
        position:   "sticky",
        top:        0,
        zIndex:     1,
        background: "var(--preview-card)",
        boxShadow:  "inset 0 -1px 0 var(--preview-border-2)",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className="text-[8px]" style={{ color: isActive ? "#0F8A8A" : "transparent" }}>
          {isActive ? (dir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}

// Shimmer skeleton for the claim table — reserves height to avoid layout jump
// while the history loads. Mirrors src/app/dashboard/explorer/loading.tsx.
function ClaimTableSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden mb-6"
      style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
      <div className="flex items-center gap-4 px-4 py-3"
        style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-muted)" }}>
        {["12%", "14%", "12%", "14%", "12%", "12%"].map((w, i) => (
          <div key={i} style={{ width: w }}>
            <div style={{ width: "70%", height: 9, borderRadius: 6, background: "var(--preview-muted)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: `${0.3 + i * 0.03}s` }} />
          </div>
        ))}
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3"
          style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
          {[80, 70, 60, 72, 64, 56].map((w, j) => (
            <div key={j} style={{ width: w, height: 13, borderRadius: 6, background: "var(--preview-muted)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: `${0.35 + i * 0.04 + j * 0.01}s` }} />
          ))}
        </div>
      ))}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.85; } }`}</style>
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

// Small spinning indicator for the "Preparing…" download state.
function DownloadSpinner() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Native-select view filter (Protocol / Chain / Token). Styled to match the
// page; the empty value is the "All …" pass-through.
function FilterSelect({
  value, onChange, allLabel, options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: Array<[string, string]>; // [value, label]
}) {
  const active = value !== "";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer"
      style={{
        background:  "var(--preview-card)",
        color:       active ? "var(--preview-text)" : "var(--preview-text-2)",
        border:      `1px solid ${active ? "rgba(28,184,184,0.4)" : "var(--preview-border)"}`,
      }}
    >
      <option value="">{allLabel}</option>
      {options.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
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
  downloading,
  onDownload,
}: {
  format:      ExportFormat;
  downloading: boolean;
  onDownload:  () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Formats pre-built for a specific tax tool show ONLY the "Send to <tool>"
  // action — it downloads the same CSV AND opens the importer, so a separate
  // "Download CSV" button was redundant. Generic / accountant formats keep the
  // plain download.
  const isGuided = Boolean(format.importUrl);

  function handleGuidedSend() {
    // Order matters. Open the import tab FIRST, while the click's user gesture
    // is still "fresh" — browsers blank out popups initiated after an async
    // download. window.open is synchronous here, so the gesture is preserved;
    // the (async) download then runs with its own spinner.
    if (format.importUrl) {
      window.open(format.importUrl, "_blank", "noopener,noreferrer");
    }
    onDownload();
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
        <div className="flex items-center gap-2 flex-shrink-0">
          {isGuided ? (
            <button
              onClick={handleGuidedSend}
              disabled={downloading}
              className="text-xs font-semibold py-2 rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1.5 w-[168px]"
              style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)", cursor: downloading ? "wait" : "pointer", opacity: downloading ? 0.75 : 1 }}
            >
              {downloading
                ? <><DownloadSpinner /> Preparing…</>
                : <>Send to {format.name.replace(" CSV", "")} →</>}
            </button>
          ) : (
            <button
              onClick={onDownload}
              disabled={downloading}
              className="text-xs font-semibold py-2 rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1.5 w-[150px]"
              style={{ background: "transparent", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)", cursor: downloading ? "wait" : "pointer", opacity: downloading ? 0.75 : 1 }}
            >
              {downloading
                ? <><DownloadSpinner /> Preparing…</>
                : "Download CSV"}
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
