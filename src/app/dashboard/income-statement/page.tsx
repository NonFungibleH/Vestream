"use client";

// /dashboard/income-statement
// ─────────────────────────────────────────────────────────────────────────────
// Vesting Income Statement – the headline showcase of the Phase 2 claim
// ingestor pipeline. A consolidated P&L-style view of every vesting claim
// the user has received, segmented by tax year, protocol, and token.
//
// Why this is the highest-value follow-up to Phase 2:
//   - The Exports tab gives users a transactional list + CSV downloads.
//     Useful for accountants. Not a pleasant view for the user themselves.
//   - The Income Statement gives them a "what did vesting actually pay me
//     this year, and where did it come from" answer at a glance – the
//     thing they want to look at on January 1st before doing taxes, on
//     April 1st when the bill comes due, and quarterly to check pacing.
//   - It also surfaces our pricing-confidence mix so users know which
//     numbers are firm and which need a manual cost-basis sanity check.
//
// All amounts USD-anchored at claim time (the canonical tax-event basis).
// The CurrencyProvider (wired into the dashboard layout) lets users see
// the totals in their local currency at TODAY's rate – useful for
// situational awareness, not a substitute for the historical-rate
// settlement that tax software needs.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useCurrency } from "@/lib/use-currency";
import { useCountUp } from "@/lib/use-count-up";

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

/** Centralised copy table – keeps the three audience modes labelled
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
        `Ordinary income received from streams, grants, and contributor pay – broken down by tax year, payer, and token. All amounts USD-anchored at the moment of each on-chain receipt${currency !== "USD" ? `, displayed in ${currency} at today's rate` : ""}.`,
    };
  }
  if (audience === "both") {
    return {
      eyebrow:  "Token income",
      title:    "Token income statement",
      subtitle: (currency) =>
        `Every token you've received – vesting unlocks, salary streams, and grant disbursements – broken down by tax year, source, and token. All amounts USD-anchored at the moment of each on-chain receipt${currency !== "USD" ? `, displayed in ${currency} at today's rate` : ""}.`,
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
  "superfluid":   "Superfluid",
  "pinksale":     "PinkSale",
  "streamflow":   "Streamflow",
  "jupiter-lock": "Jupiter Lock",
};

function pretty(p: string): string {
  return PROTOCOL_LABELS[p] ?? p;
}

// ── In-memory table sorting ──────────────────────────────────────────────────
// Mirrors the Explorer table: a clickable <th> with a ▲/▼ indicator + a
// useMemo sort over data that's already on the client. Columns and their
// value accessors are typed per-table.
type SortDir     = "asc" | "desc";
type YearCol     = "year" | "rows" | "usd" | "gasUsd";
type ProtocolCol = "protocol" | "rows" | "usd" | "pct";
type TokenCol    = "token" | "rows" | "units" | "usd";

function cmpNum(x: number, y: number, dir: SortDir): number {
  const cmp = x < y ? -1 : x > y ? 1 : 0;
  return dir === "asc" ? cmp : -cmp;
}

function yearValue(r: YearRow, col: YearCol): number {
  switch (col) {
    case "year":   return r.year;
    case "rows":   return r.rows;
    case "usd":    return r.usd;
    case "gasUsd": return r.gasUsd;
  }
}

function protocolValue(r: ProtocolRow, col: ProtocolCol): number | string {
  switch (col) {
    case "protocol": return pretty(r.protocol).toLowerCase();
    case "rows":     return r.rows;
    case "usd":      return r.usd;     // pct is monotonic in usd within a fixed total
    case "pct":      return r.usd;
  }
}

// byToken's `units` is a stringified bigint sum that we can't divide by
// decimals without parsing – but for ordering, comparing the raw bigint-as-
// number is monotonic enough across the top-25 set (overflow only matters at
// extreme magnitudes, where relative ordering is preserved). Token symbol
// sorts lexicographically.
function tokenValue(r: TokenRow, col: TokenCol): number | string {
  switch (col) {
    case "token": return (r.tokenSymbol ?? r.tokenAddress).toLowerCase();
    case "rows":  return r.rows;
    case "units": { const n = Number(r.units); return Number.isFinite(n) ? n : 0; }
    case "usd":   return r.usd;
  }
}

/** Sortable table header cell – ▲/▼ shows on the active column; inactive
 *  columns reserve the indicator's width with a transparent ▲ so the layout
 *  doesn't shift. Matches the Explorer table's Th. */
function Th({
  label, active, dir, onClick, align = "left",
}: {
  label: string; active: boolean; dir: SortDir; onClick: () => void; align?: "left" | "right";
}) {
  return (
    <th className={`px-5 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}
        aria-label={`Sort by ${label}`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider transition-colors"
          style={{ color: active ? "#0F8A8A" : "var(--preview-text-3)" }}>
          {label}
        </span>
        <span className="text-[8px]" style={{ color: active ? "#0F8A8A" : "transparent" }}>
          {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}

/** Pulsing placeholder block – copied from the Explorer loading skeleton
 *  (background var(--preview-muted) + the pulse keyframes injected below). */
function Shimmer({ w, h, rounded = 6, className = "", delay = "0s" }: {
  w: string | number; h: number; rounded?: number; className?: string; delay?: string;
}) {
  return (
    <div
      className={className}
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: rounded,
        background: "var(--preview-muted)",
        animation: "pulse 1.6s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}

/** A card-shaped table skeleton with a header strip + N shimmer rows, used to
 *  reserve vertical space while the income statement loads so the page doesn't
 *  pop/jump when real tables arrive. */
function TableSkeleton({ title, rows = 5 }: { title: string; rows?: number }) {
  return (
    <div className="rounded-2xl mb-5 overflow-hidden"
      style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
      <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider"
        style={{ borderColor: "var(--preview-border)", color: "var(--preview-text-3)" }}>
        {title}
      </div>
      <div className="px-5 py-2 flex items-center gap-6"
        style={{ borderBottom: "1px solid var(--preview-border)" }}>
        {["18%", "12%", "14%", "12%"].map((w, i) => (
          <Shimmer key={i} w={w} h={9} delay={`${0.3 + i * 0.03}s`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-3.5 flex items-center justify-between gap-6"
          style={{ borderTop: i > 0 ? "1px solid var(--preview-border)" : undefined }}>
          <Shimmer w="22%" h={13} delay={`${0.35 + i * 0.04}s`} />
          <div className="flex items-center gap-6">
            <Shimmer w={48} h={13} delay={`${0.4 + i * 0.04}s`} />
            <Shimmer w={64} h={13} delay={`${0.45 + i * 0.04}s`} />
            <Shimmer w={40} h={13} delay={`${0.5 + i * 0.04}s`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function IncomeStatementPage() {
  const { format, formatCompact, currency } = useCurrency();
  // Report period – empty string = open-ended. Replaces the old year-only
  // dropdown with preset chips + a custom from/to range (the same UX the Tax
  // Exports tab uses). The /api/claims/income-statement endpoint already
  // accepts since/until, so this is purely a UI change. "All time" = both
  // empty; an exact single-calendar-year range still unlocks the year-end PDF.
  const [since, setSince] = useState<string>("");
  const [until, setUntil] = useState<string>("");
  const isAllTime = !since && !until;

  // SWR-cached per range. Navigating away and back with the same range renders
  // instantly from cache; changing the range swaps in the new cached slice (or
  // kicks a fetch if it's the first time). The dashboard's SWRConfig provider
  // sets the 60s dedupe window globally.
  const sp = new URLSearchParams();
  if (since) sp.set("since", since);
  if (until) sp.set("until", until);
  const qs = sp.toString();
  const swrKey = qs
    ? `/api/claims/income-statement?${qs}`
    : "/api/claims/income-statement";
  const { data, isLoading } = useSWR<IncomeStatement>(swrKey, async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<IncomeStatement>;
  });
  const loading = isLoading;

  // If the selected range is exactly one calendar year (Jan 1 – Dec 31), that
  // year unlocks the year-end PDF (the print route takes ?year=). Any other
  // span (a quarter, a UK tax year, all-time) hides the link.
  const pdfYear: string | null = (() => {
    if (!since || !until) return null;
    const m = /^(\d{4})-01-01$/.exec(since);
    if (m && until === `${m[1]}-12-31`) return m[1];
    return null;
  })();

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

  // ── Count-up on the three headline figures ─────────────────────────────────
  // Animate 0 → target once data lands (easeOutCubic, respects reduced-motion).
  const totalUsdAnim = useCountUp(data?.totals.usd ?? 0);
  const gasUsdAnim   = useCountUp(data?.totals.gasUsd ?? 0);
  const exactPctAnim = useCountUp(exactPct);

  // ── In-memory sort state for the four data tables ──────────────────────────
  // Click a header to sort; click again to flip direction. Sorting is purely
  // client-side (the data is already here) – no re-fetch. Mirrors the
  // Explorer table's Th + useMemo pattern.
  const [yearSort,     setYearSort]     = useState<{ col: YearCol;     dir: SortDir }>({ col: "year",   dir: "desc" });
  const [protocolSort, setProtocolSort] = useState<{ col: ProtocolCol; dir: SortDir }>({ col: "usd",    dir: "desc" });
  const [tokenSort,    setTokenSort]    = useState<{ col: TokenCol;    dir: SortDir }>({ col: "usd",    dir: "desc" });
  const [pivotSort,    setPivotSort]    = useState<{ dir: SortDir }>({ dir: "desc" });

  const totalUsd = data?.totals.usd ?? 0;

  const sortedByYear = useMemo(() => {
    const rows = [...(data?.byYear ?? [])];
    rows.sort((a, b) => cmpNum(yearValue(a, yearSort.col), yearValue(b, yearSort.col), yearSort.dir));
    return rows;
  }, [data?.byYear, yearSort]);

  const sortedByProtocol = useMemo(() => {
    const rows = [...(data?.byProtocol ?? [])];
    rows.sort((a, b) => {
      const x = protocolValue(a, protocolSort.col);
      const y = protocolValue(b, protocolSort.col);
      return typeof x === "string" || typeof y === "string"
        ? (protocolSort.dir === "asc" ? 1 : -1) * String(x).localeCompare(String(y))
        : cmpNum(x as number, y as number, protocolSort.dir);
    });
    return rows;
  }, [data?.byProtocol, protocolSort]);

  const sortedByToken = useMemo(() => {
    const rows = [...(data?.byToken ?? [])];
    rows.sort((a, b) => {
      const x = tokenValue(a, tokenSort.col);
      const y = tokenValue(b, tokenSort.col);
      return typeof x === "string" || typeof y === "string"
        ? (tokenSort.dir === "asc" ? 1 : -1) * String(x).localeCompare(String(y))
        : cmpNum(x as number, y as number, tokenSort.dir);
    });
    return rows;
  }, [data?.byToken, tokenSort]);

  // The pivot table sorts by year (clicking the Year header flips direction).
  const sortedPivotYears = useMemo(() => {
    const rows = [...(data?.byYear ?? [])];
    rows.sort((a, b) => cmpNum(a.year, b.year, pivotSort.dir));
    return rows;
  }, [data?.byYear, pivotSort]);

  function toggleSort<C extends string>(
    cur: { col: C; dir: SortDir },
    set: (v: { col: C; dir: SortDir }) => void,
    col: C,
    defaultDir: SortDir,
  ) {
    if (cur.col === col) set({ col, dir: cur.dir === "asc" ? "desc" : "asc" });
    else set({ col, dir: defaultDir });
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--preview-bg)" }}>
      <main className="flex-1 px-4 md:px-8 py-6 w-full">

        {/* Hero */}
        <div className="mb-5">
          <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <Link href="/dashboard/exports" className="hover:underline">Tax</Link>
            <span>/</span>
            <span>Income Statement</span>
          </div>
          {(() => {
            const copy = copyForAudience(data?.audienceCategory);
            return (
              <>
                <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
                  {copy.title}
                </h1>
                <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
                  {copy.subtitle(currency)}
                </p>
              </>
            );
          })()}
        </div>

        {/* Sub-tab nav – matches the Tax Exports tab */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
          style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border)" }}>
          <Link href="/dashboard/exports"
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--preview-text-3)" }}>
            Tax Exports
          </Link>
          <span className="px-4 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "var(--preview-card)", color: "#1CB8B8", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
            Income Statement
          </span>
        </div>

        {/* Jurisdiction caveat – UK / AU users may need to map claim-date data
            to unlock-date tax events. Surfaced inline so it's not buried at
            the bottom of the page where the user might miss it. */}
        <div className="mb-6 rounded-lg p-3 text-[11px] flex gap-2.5 items-start"
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
            Australia (ATO) filers may owe income tax at the <em>unlock</em> date instead – your
            accountant can map claim records to unlock dates using the per-stream schedules on
            the <Link href="/dashboard" className="underline" style={{ color: "#0F8A8A" }}>main dashboard</Link>.{" "}
            <Link href="/resources/token-vesting-tax-guide" className="underline" style={{ color: "#0F8A8A" }}>Read the full guide →</Link>
          </span>
        </div>

        {/* Report period – preset chips + custom from/to range (mirrors the
            Tax Exports tab). Calendar years + UK tax years (Apr 6–Apr 5);
            anything else goes in the From/To inputs. The endpoint already
            takes since/until, so this is purely a UI change. */}
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Report period</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(() => {
                const now = new Date();
                const yr  = now.getUTCFullYear();
                const afterApr6 = now.getUTCMonth() > 3 || (now.getUTCMonth() === 3 && now.getUTCDate() >= 6);
                const ukStart = afterApr6 ? yr : yr - 1;
                const yy = (n: number) => String(n).slice(2);
                const presets: Array<{ label: string; since: string; until: string }> = [
                  { label: "All time",  since: "", until: "" },
                  { label: "This year", since: `${yr}-01-01`,     until: `${yr}-12-31` },
                  { label: "Last year", since: `${yr - 1}-01-01`, until: `${yr - 1}-12-31` },
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
          <div className="flex items-center gap-3 flex-wrap">
            {pdfYear && (
              <Link
                href={`/dashboard/income-statement/print?year=${pdfYear}`}
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
              className="text-xs font-semibold"
              style={{ color: "#0F8A8A" }}
            >
              Export to CSV →
            </Link>
          </div>
        </div>

        {/* Headline cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-2xl p-5"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--preview-text-3)" }}>
              Total income
            </div>
            <div className="text-3xl font-bold" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
              {loading ? <Shimmer w={120} h={30} rounded={8} /> : format(totalUsdAnim)}
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
              {loading ? <Shimmer w={100} h={30} rounded={8} /> : format(gasUsdAnim)}
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
              {loading ? <Shimmer w={64} h={30} rounded={8} /> : `${Math.round(exactPctAnim)}%`}
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
            <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: "rgba(28,184,184,0.1)", border: "1px solid rgba(28,184,184,0.2)" }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text)" }}>No claim history indexed yet</p>
            <p className="text-xs mb-1" style={{ color: "var(--preview-text-3)" }}>
              This page shows income once your on-chain claim history has been indexed.
            </p>
            <p className="text-xs mb-4" style={{ color: "var(--preview-text-3)" }}>
              Head to Tax Reports and hit <strong>&ldquo;Refresh claims&rdquo;</strong> – Vestream will pull your
              Sablier claim history automatically. Income + totals populate immediately after.
            </p>
            <Link href="/dashboard/exports"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}>
              Go to Tax Reports →
            </Link>
          </div>
        )}

        {/* Loading skeletons – reserve the table area so the page doesn't
            pop/jump when real data arrives. */}
        {loading && (
          <>
            <TableSkeleton title="Income by tax year" rows={3} />
            <TableSkeleton title="Income by protocol" rows={4} />
            <TableSkeleton title="Top tokens by income" rows={6} />
          </>
        )}

        {/* By year */}
        {!loading && data && data.byYear.length > 0 && isAllTime && (
          <div className="rounded-2xl mb-5 overflow-hidden"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider"
              style={{ borderColor: "var(--preview-border)", color: "var(--preview-text-3)" }}>
              Income by tax year
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--preview-text-3)" }}>
                  <Th label="Year"   active={yearSort.col === "year"}   dir={yearSort.dir} onClick={() => toggleSort(yearSort, setYearSort, "year", "desc")} />
                  <Th label="Claims" active={yearSort.col === "rows"}   dir={yearSort.dir} onClick={() => toggleSort(yearSort, setYearSort, "rows", "desc")} align="right" />
                  <Th label="Income" active={yearSort.col === "usd"}    dir={yearSort.dir} onClick={() => toggleSort(yearSort, setYearSort, "usd", "desc")} align="right" />
                  <Th label="Gas"    active={yearSort.col === "gasUsd"} dir={yearSort.dir} onClick={() => toggleSort(yearSort, setYearSort, "gasUsd", "desc")} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedByYear.map((y) => (
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
                  <Th label="Protocol"   active={protocolSort.col === "protocol"} dir={protocolSort.dir} onClick={() => toggleSort(protocolSort, setProtocolSort, "protocol", "asc")} />
                  <Th label="Claims"     active={protocolSort.col === "rows"}     dir={protocolSort.dir} onClick={() => toggleSort(protocolSort, setProtocolSort, "rows", "desc")} align="right" />
                  <Th label="Income"     active={protocolSort.col === "usd"}      dir={protocolSort.dir} onClick={() => toggleSort(protocolSort, setProtocolSort, "usd", "desc")} align="right" />
                  <Th label="% of total" active={protocolSort.col === "pct"}      dir={protocolSort.dir} onClick={() => toggleSort(protocolSort, setProtocolSort, "pct", "desc")} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedByProtocol.map((p) => {
                  const pct = totalUsd > 0
                    ? (p.usd / totalUsd) * 100
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
                    <Th label="Token"  active={tokenSort.col === "token"} dir={tokenSort.dir} onClick={() => toggleSort(tokenSort, setTokenSort, "token", "asc")} />
                    <Th label="Claims" active={tokenSort.col === "rows"}  dir={tokenSort.dir} onClick={() => toggleSort(tokenSort, setTokenSort, "rows", "desc")} align="right" />
                    <Th label="Units"  active={tokenSort.col === "units"} dir={tokenSort.dir} onClick={() => toggleSort(tokenSort, setTokenSort, "units", "desc")} align="right" />
                    <Th label="Income" active={tokenSort.col === "usd"}   dir={tokenSort.dir} onClick={() => toggleSort(tokenSort, setTokenSort, "usd", "desc")} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedByToken.map((t, i) => {
                    // Convert stringified bigint sum → human units, capped to 4 decimals.
                    let humanUnits = "–";
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

        {/* Year × Protocol pivot – only meaningful in "all time" view */}
        {!loading && data && isAllTime && data.byYear.length > 1 && protocolsInPivot.length > 0 && (
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
                    <Th label="Year" active dir={pivotSort.dir}
                      onClick={() => setPivotSort((s) => ({ dir: s.dir === "asc" ? "desc" : "asc" }))} />
                    {protocolsInPivot.map((p) => (
                      <th key={p} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">{pretty(p)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPivotYears.map((y) => (
                    <tr key={y.year} className="border-t" style={{ borderColor: "var(--preview-border)" }}>
                      <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--preview-text)" }}>{y.year}</td>
                      {protocolsInPivot.map((p) => {
                        const v = pivotByYear.get(y.year)?.get(p) ?? 0;
                        return (
                          <td key={p} className="px-3 py-3 text-right text-xs"
                            style={{ color: v > 0 ? "var(--preview-text)" : "var(--preview-text-3)" }}>
                            {v > 0 ? formatCompact(v) : "–"}
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
              data for that token – your accountant or tax software will need a manual cost basis entered.
            </p>
          </div>
        )}

        <p className="text-[10px] mt-6 text-center" style={{ color: "var(--preview-text-3)" }}>
          USD values are anchored at the moment of each on-chain claim. This is the canonical
          tax basis for the US (IRS), Canada (CRA), Germany, and most of the EU. UK (HMRC) and
          Australia (ATO) filers should verify with an accountant – their tax basis can be the
          unlock date rather than the claim date.
          {currency !== "USD" && (
            <> Display in {currency} uses today&apos;s exchange rate (situational awareness only –
              tax software needs historical-rate settlement at each event date).</>
          )}
        </p>

        {/* Skeleton shimmer animation (used by the loading placeholders). */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50%      { opacity: 0.85; }
          }
        `}</style>
      </main>
    </div>
  );
}
