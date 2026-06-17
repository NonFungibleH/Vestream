"use client";

// src/app/dashboard/explorer/ExplorerTable.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Client-side sortable results table for the Vesting Explorer (calendar mode).
//
// Why client-side: the page is force-dynamic, so the old top-of-table sort
// buttons changed the URL → full server re-render → a LIVE DexScreener price
// batch before anything redrew. Sorting now happens IN-MEMORY here — click a
// column header and the rows reorder instantly, zero round-trip. Filters
// (chain/protocol/search/date/amount/wallet) stay server-side because they
// change WHICH rows load; only sorting + column display moved here.
//
// Columns (all sortable; the narrow ones auto-hide below md):
//   Token · Locked amount · USD value · Wallets · Rounds · Risk · Next unlock
// Mobile collapses to Token · USD · Wallets.
//
// The server passes a flat, serialisable ExplorerRow[] (no bigints as values —
// `amount` is a stringified bigint). USD + wallet/round counts are already
// resolved server-side; we just render + sort them.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import Link from "next/link";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { getProtocol } from "@/lib/protocol-constants";
import { WatchButton } from "./WatchButton";

export interface ExplorerRow {
  groupKey:          string;
  protocol:          string;
  protocolCount?:    number;          // distinct protocols vesting this token (≥2 → "N protocols")
  chainId:           number;
  tokenSymbol:       string | null;
  tokenAddress:      string;
  tokenDecimals:     number;
  amount:            string | null;   // stringified bigint (locked)
  usdValue:          number | null;
  usdConfidence:     "high" | "medium" | "low" | null;
  walletCount:       number;          // per-bucket fallback
  tokenWalletCount?: number;          // true uncapped count
  tokenRoundCount?:  number;
  vestStart?:        number | null;   // earliest active start (unix sec) — progress bar
  vestEnd?:          number | null;   // latest active end (unix sec)
  hasCliff?:         boolean;         // any active stream has a lump-unlock cliff → ⚠️
  eventTime:         number;
  absorptionRatio:   number | null;
  supplyShare:       number | null;
}

type SortCol = "token" | "amount" | "usd" | "wallets" | "rounds" | "risk" | "progress" | "date";
type SortDir = "asc" | "desc";

// ── Sort accessors ───────────────────────────────────────────────────────────
function walletsOf(r: ExplorerRow): number { return r.tokenWalletCount ?? r.walletCount; }
/** Fraction (0–1) of the token's whole vesting span that has elapsed, or null
 *  if we lack a valid start/end span. Clamped so pre-start = 0, past-end = 1. */
function progressOf(r: ExplorerRow): number | null {
  const s = r.vestStart, e = r.vestEnd;
  if (s == null || e == null || e <= s) return null;
  const now = Date.now() / 1000;
  return Math.max(0, Math.min(1, (now - s) / (e - s)));
}
function amountNum(r: ExplorerRow): number {
  if (!r.amount) return 0;
  try { return Number(BigInt(r.amount)) / 10 ** Math.min(r.tokenDecimals, 18); } catch { return 0; }
}
function riskRank(r: ExplorerRow): number {
  const b = classifyRisk(r);
  return b === "HIGH" ? 3 : b === "MED" ? 2 : b === "LOW" ? 1 : 0;
}
function sortValue(r: ExplorerRow, col: SortCol): number | string {
  switch (col) {
    case "token":   return (r.tokenSymbol ?? r.tokenAddress).toLowerCase();
    case "amount":  return amountNum(r);
    case "usd":     return r.usdValue ?? -Infinity;       // unpriced sort last (desc) / first (asc)
    case "wallets": return walletsOf(r);
    case "rounds":  return r.tokenRoundCount ?? 0;
    case "risk":    return riskRank(r);
    case "progress": return progressOf(r) ?? -Infinity;   // unknown span sorts last (desc)
    case "date":    return r.eventTime || Infinity;
  }
}

export function ExplorerTable({
  rows, isFree, totalMatches, hiddenCount,
}: {
  rows:         ExplorerRow[];
  isFree:       boolean;
  totalMatches: number;
  hiddenCount:  number;
}) {
  // Default: soonest unlock first (matches the server's prior default).
  const [col, setCol] = useState<SortCol>("date");
  const [dir, setDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const x = sortValue(a, col);
      const y = sortValue(b, col);
      let cmp: number;
      if (typeof x === "string" || typeof y === "string") cmp = String(x).localeCompare(String(y));
      else cmp = x < y ? -1 : x > y ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, col, dir]);

  function toggle(next: SortCol, defaultDir: SortDir) {
    if (next === col) { setDir((d) => (d === "asc" ? "desc" : "asc")); }
    else { setCol(next); setDir(defaultDir); }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>No upcoming unlocks match your filters.</p>
        <p className="text-xs mt-1" style={{ color: "var(--preview-text-3)" }}>Try widening the date range or clearing a filter.</p>
      </div>
    );
  }

  // Shared grid template: mobile = Token · USD · Wallets (3); desktop adds
  // Amount, Rounds, Risk, Next (7). Desktop-only cells use `hidden md:flex`,
  // so on mobile they're removed from the grid and the 3 visible cells fill
  // the 3-column template.
  // Proportional `fr` columns (NOT auto): the template is deterministic, so
  // the header grid and every row grid resolve to identical column widths and
  // line up — `auto` sized each grid to its own content, which is why headers
  // and values drifted. `fr` units also fill the width evenly instead of one
  // 1fr token column hogging all the slack (the empty space). Mobile shows
  // Token · USD · Wallets; the desktop-only cells are display:none below md so
  // they drop out of the 3-col mobile grid.
  const GRID = "grid grid-cols-[1.7fr_1fr_1fr] md:grid-cols-[2fr_0.9fr_0.9fr_0.7fr_0.6fr_0.6fr_1.3fr_0.95fr] items-center gap-3 px-4 md:px-5";

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>
          {totalMatches} token{totalMatches === 1 ? "" : "s"}
        </p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {/* Sortable header */}
        <div className="flex items-center" style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-muted)" }}>
          <div className={`flex-1 ${GRID} py-2`}>
            <Th label="Token"       active={col === "token"}   dir={dir} onClick={() => toggle("token", "asc")} />
            <Th label="Amount"      active={col === "amount"}  dir={dir} onClick={() => toggle("amount", "desc")} align="right" className="hidden md:flex" />
            <Th label="USD"         active={col === "usd"}     dir={dir} onClick={() => toggle("usd", "desc")} align="right" minW={64} />
            <Th label="Wallets"     active={col === "wallets"} dir={dir} onClick={() => toggle("wallets", "desc")} align="right" minW={56} />
            <Th label="Rounds"      active={col === "rounds"}  dir={dir} onClick={() => toggle("rounds", "desc")} align="right" className="hidden md:flex" />
            <Th label="Risk"        active={col === "risk"}    dir={dir} onClick={() => toggle("risk", "desc")} align="right" className="hidden md:flex" minW={48} title={RISK_METHODOLOGY} />
            <Th label="Vested"      active={col === "progress"} dir={dir} onClick={() => toggle("progress", "desc")} className="hidden md:flex" title={PROGRESS_HELP} />
            <Th label="Next unlock" active={col === "date"}    dir={dir} onClick={() => toggle("date", "asc")} align="right" className="hidden md:flex" />
          </div>
          <div className="pr-3 pl-1"><div style={{ width: 26 }} aria-hidden /></div>
        </div>

        {/* Rows */}
        {sorted.map((r, i) => (
          <Row key={r.groupKey} r={r} grid={GRID} showTopBorder={i > 0} />
        ))}
      </div>

      {isFree && hiddenCount > 0 && (
        <div className="mt-4 rounded-2xl px-5 py-4 text-center"
          style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.2)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
            {hiddenCount} more token{hiddenCount === 1 ? "" : "s"} above your free limit
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--preview-text-3)" }}>
            Pro lifts the per-query cap, adds CSV export, multi-filter compose, and saved-search alerts.
          </p>
          <Link href="/pricing" className="inline-block mt-2 text-xs font-semibold" style={{ color: "#0F8A8A" }}>
            View pricing →
          </Link>
        </div>
      )}
    </>
  );
}

// ── Header cell ──────────────────────────────────────────────────────────────
function Th({
  label, active, dir, onClick, align = "left", minW, className = "", title,
}: {
  label: string; active: boolean; dir: SortDir; onClick: () => void;
  align?: "left" | "right"; minW?: number; className?: string; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""} ${className}`}
      style={{ minWidth: minW }}
      aria-label={`Sort by ${label}`}
      title={title}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider transition-colors"
        style={{ color: active ? "#0F8A8A" : "var(--preview-text-3)" }}>
        {label}
      </span>
      <span className="text-[8px]" style={{ color: active ? "#0F8A8A" : "transparent" }}>
        {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
      </span>
    </button>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────
function Row({ r, grid, showTopBorder }: { r: ExplorerRow; grid: string; showTopBorder: boolean }) {
  const meta      = getProtocol(r.protocol);
  const accent    = meta?.color ?? "#64748b";
  const chainName = CHAIN_NAMES[r.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${r.chainId}`;

  return (
    <div className="flex items-center" style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}>
      <Link href={`/dashboard/explorer/token/${r.chainId}/${r.tokenAddress}`}
        className={`flex-1 ${grid} py-3 transition-colors hover:bg-[var(--preview-muted)]`}>
        {/* Token */}
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0" style={{ background: accent }}>
            {tokenInitial(r.tokenSymbol, r.tokenAddress)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate flex items-center gap-1" style={{ color: "var(--preview-text)" }}>
              <span className="truncate">{r.tokenSymbol ?? shortAddr(r.tokenAddress)}</span>
              {r.hasCliff && (
                <span className="flex-shrink-0 text-[11px] cursor-help" title="Cliff unlock — a lump of tokens unlocks at once rather than gradually." aria-label="Has cliff unlock">⚠️</span>
              )}
            </p>
            <p className="text-xs truncate" style={{ color: "var(--preview-text-3)" }}>
              <span style={{ color: accent }}>
                {r.protocolCount && r.protocolCount > 1 ? `${r.protocolCount} protocols` : (meta?.name ?? r.protocol)}
              </span> · {chainName}
            </p>
          </div>
        </div>
        {/* Amount (desktop) */}
        <div className="text-right tabular-nums hidden md:block">
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>{fmtAmount(r.amount, r.tokenDecimals)}</p>
        </div>
        {/* USD */}
        <div className="text-right tabular-nums" style={{ minWidth: 64 }}>
          {r.usdValue != null ? (
            <p className="text-sm font-bold"
              style={{
                color: "var(--preview-text)",
                fontStyle: r.usdConfidence === "low" ? "italic" : "normal",
                opacity:   r.usdConfidence === "low" ? 0.65 : r.usdConfidence === "medium" ? 0.8 : 1,
              }}
              title={r.usdConfidence === "low" ? "Low liquidity — estimate" : r.usdConfidence === "medium" ? "Medium liquidity — DEX pool < $10k" : undefined}>
              {formatUsdCompact(r.usdValue)}
            </p>
          ) : (
            <p className="text-sm font-bold" style={{ color: "var(--preview-text-3)" }}>—</p>
          )}
        </div>
        {/* Wallets */}
        <div className="text-right tabular-nums" style={{ minWidth: 56 }}>
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>{walletsOf(r).toLocaleString()}</p>
        </div>
        {/* Rounds (desktop) */}
        <div className="text-right tabular-nums hidden md:block">
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>{r.tokenRoundCount ?? "—"}</p>
        </div>
        {/* Risk (desktop) */}
        <div className="text-right hidden md:block" style={{ minWidth: 48 }}>
          <RiskChip r={r} />
        </div>
        {/* Vesting progress (desktop) */}
        <div className="hidden md:block" title={progressTitle(r)}>
          <VestingProgress r={r} />
        </div>
        {/* Next unlock (desktop) */}
        <div className="text-right hidden md:block">
          <p className="text-xs font-semibold tabular-nums" style={{ color: "#0F8A8A" }}>in {relativeUntil(r.eventTime)}</p>
        </div>
      </Link>
      <div className="pr-3 pl-1">
        <WatchButton tokenAddress={r.tokenAddress} chainId={r.chainId} tokenSymbol={r.tokenSymbol} />
      </div>
    </div>
  );
}

// ── Risk classification (mirrors the server's prior classifyRisk) ────────────
function classifyRisk(r: ExplorerRow): "HIGH" | "MED" | "LOW" | null {
  const a = r.absorptionRatio;
  const s = r.supplyShare;
  if (a == null && s == null) return null;
  if ((a != null && a >= 0.5) || (s != null && s >= 0.05)) return "HIGH";
  if ((a != null && a >= 0.1) || (s != null && s >= 0.01)) return "MED";
  return "LOW";
}

// Shown on the "Risk" header (hover) so the score is self-explanatory.
const RISK_METHODOLOGY =
  "Risk = the worse of two signals for this unlock:\n" +
  "• Absorption — its USD value vs the token's 24h trading volume\n" +
  "• Supply share — its size vs all of the token's locked supply\n" +
  "HIGH: ≥50% of a day's volume or ≥5% of locked supply\n" +
  "MED: ≥10% of volume or ≥1% of supply · LOW: below that";

/** Per-row tooltip — the methodology plus THIS row's actual numbers. */
function riskTitle(r: ExplorerRow): string {
  const band = classifyRisk(r);
  if (!band) return "Not scored — no USD price or locked-supply data for this token yet.";
  const absorption = r.absorptionRatio == null ? "—" : `${Math.round(r.absorptionRatio * 100)}% of a day's volume`;
  const share = r.supplyShare == null ? "—" : `${(r.supplyShare * 100).toFixed(r.supplyShare < 0.01 ? 2 : 1)}% of locked supply`;
  return `Risk: ${band}\n\n${RISK_METHODOLOGY}\n\nThis unlock: ${absorption} · ${share}`;
}

function RiskChip({ r }: { r: ExplorerRow }) {
  const band = classifyRisk(r);
  const title = riskTitle(r);
  if (!band) return <span className="text-xs cursor-help" style={{ color: "var(--preview-text-3)" }} title={title}>—</span>;
  const style =
    band === "HIGH" ? { bg: "rgba(220,38,38,0.12)", fg: "#dc2626" } :
    band === "MED"  ? { bg: "rgba(217,119,6,0.12)", fg: "#d97706" } :
                      { bg: "rgba(28,184,184,0.10)", fg: "#0F8A8A" };
  return (
    <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider cursor-help"
      style={{ background: style.bg, color: style.fg }}
      title={title}>
      {band}
    </span>
  );
}

// ── Vesting progress (whole-token span elapsed) ──────────────────────────────
// Shown on the "Vested" header (hover).
const PROGRESS_HELP =
  "How far through its full vesting span the token is — from the earliest " +
  "active start to the latest active end.\n0% = just started · 100% = fully unlocked.";

function fmtMonthYear(sec: number | null | undefined): string {
  if (!sec) return "—";
  return new Date(sec * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Per-row tooltip: the full start→end span plus elapsed %. */
function progressTitle(r: ExplorerRow): string {
  const p = progressOf(r);
  if (p == null) return "Vesting span unavailable for this token.";
  return `Vesting: ${fmtMonthYear(r.vestStart)} → ${fmtMonthYear(r.vestEnd)}\n${Math.round(p * 100)}% elapsed`;
}

function VestingProgress({ r }: { r: ExplorerRow }) {
  const p = progressOf(r);
  if (p == null) return <p className="text-xs cursor-help" style={{ color: "var(--preview-text-3)" }}>—</p>;
  const pct = Math.round(p * 100);
  return (
    <div className="flex items-center gap-2 cursor-help">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--preview-muted-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#0F8A8A" }} />
      </div>
      <span className="text-[11px] tabular-nums font-semibold" style={{ color: "var(--preview-text-3)" }}>{pct}%</span>
    </div>
  );
}

// ── Presentation helpers (mirrors page.tsx) ──────────────────────────────────
function tokenInitial(symbol: string | null, address: string): string {
  if (symbol && symbol !== "UNKNOWN") return symbol.slice(0, 2).toUpperCase();
  return address.slice(2, 4).toUpperCase();
}
function shortAddr(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function fmtAmount(raw: string | null, decimals: number): string {
  if (!raw) return "—";
  try {
    const n = Number(BigInt(raw)) / 10 ** Math.min(decimals, 18);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)   return n.toFixed(2);
    return n.toFixed(4);
  } catch {
    return "—";
  }
}
// Inlined (not imported from quick-prices.ts — that module pulls in the
// Upstash Redis SDK, which must not enter the client bundle).
function formatUsdCompact(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  if (usd >= 1)   return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
function relativeUntil(unix: number | null): string {
  if (!unix) return "—";
  const diff = Math.max(0, unix - Math.floor(Date.now() / 1000));
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}
