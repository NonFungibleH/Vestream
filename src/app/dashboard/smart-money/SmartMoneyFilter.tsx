"use client";

// /dashboard/smart-money/SmartMoneyFilter.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Client-side filter pills + leaderboard list rendering.
//
// We rejected path-segment filters (/smart-money/evm) because the page is
// ISR-cached and reading searchParams would dynamicize the route — same
// landmine documented in CLAUDE.md. Instead, the parent server component
// passes the full 100-row payload (small, ~30KB serialised), and this
// client island toggles the slice based on the active filter.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { formatUsdCompact } from "@/lib/vesting/quick-prices";
import { CopyButton } from "@/components/CopyButton";
import { useCountUp } from "@/lib/use-count-up";

interface SnapshotRow {
  rank:               number;
  recipient:          string;
  chainEcosystem:     "evm" | "solana";
  distinctTokenCount: number;
  streamCount:        number;
  totalLockedUsd:     string | null;
  topTokensJson:      Array<{
    chainId:      number;
    tokenAddress: string;
    symbol:       string | null;
    usdValue:     number | null;
  }>;
}

type Filter = "all" | "evm" | "solana" | "top10" | "top25";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all",    label: "All" },
  { id: "evm",    label: "EVM" },
  { id: "solana", label: "Solana" },
  { id: "top10",  label: "10+ tokens" },
  { id: "top25",  label: "25+ tokens" },
];

function shortAddr(a: string): string {
  if (!a) return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// ── In-memory column sort ────────────────────────────────────────────────────
// "rank" is the default — rows arrive rank-ordered (locked-USD desc), so the
// rank IS the locked-desc order. The three numeric column labels toggle between
// asc/desc; clicking the active one flips direction, clicking a new one resets
// to that column's natural default (desc — biggest first).
type SortCol = "rank" | "locked" | "streams" | "tokens";
type SortDir = "asc" | "desc";

function lockedOf(r: SnapshotRow): number {
  return r.totalLockedUsd ? Number(r.totalLockedUsd) : -Infinity; // unpriced sort last on desc
}
function sortValue(r: SnapshotRow, col: SortCol): number {
  switch (col) {
    case "locked":  return lockedOf(r);
    case "streams": return r.streamCount;
    case "tokens":  return r.distinctTokenCount;
    case "rank":    return r.rank; // rank 1 = best; asc → #1 first
  }
}

// Persist the active filter across navigation. Clicking a wallet leaves the
// page (→ /dashboard/explorer); hitting Back re-mounts this island, which
// otherwise reset to "all" and threw away the user's selection. sessionStorage
// (not URL params) keeps it simple — no Suspense boundary or ISR-dynamization
// concerns, and it survives same-tab back-navigation.
const FILTER_STORAGE_KEY = "vestream-smart-money-filter";
function isFilter(v: string | null): v is Filter {
  return v === "all" || v === "evm" || v === "solana" || v === "top10" || v === "top25";
}

export function SmartMoneyFilter({ rows }: { rows: SnapshotRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  // Default sort = rank/locked-desc (rows arrive in that order).
  const [col, setCol] = useState<SortCol>("rank");
  const [dir, setDir] = useState<SortDir>("asc"); // rank asc = "best first" (see sortValue)

  // Restore on mount (after SSR renders "all", so no hydration mismatch).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (isFilter(saved)) setFilter(saved);
    } catch { /* sessionStorage disabled — keep default */ }
  }, []);

  function selectFilter(f: Filter) {
    setFilter(f);
    try { sessionStorage.setItem(FILTER_STORAGE_KEY, f); } catch { /* ignore */ }
  }

  function toggleSort(next: SortCol, defaultDir: SortDir) {
    if (next === col) { setDir((d) => (d === "asc" ? "desc" : "asc")); }
    else { setCol(next); setDir(defaultDir); }
  }

  const filtered = useMemo(
    () => rows.filter((r) => {
      if (filter === "all")    return true;
      if (filter === "evm")    return r.chainEcosystem === "evm";
      if (filter === "solana") return r.chainEcosystem === "solana";
      if (filter === "top10")  return r.distinctTokenCount >= 10;
      if (filter === "top25")  return r.distinctTokenCount >= 25;
      return true;
    }),
    [rows, filter],
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const x = sortValue(a, col);
      const y = sortValue(b, col);
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, col, dir]);

  const animatedCount = useCountUp(filtered.length);

  return (
    <>
      {/* Filter pills */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: "var(--preview-text-3)" }}>
          Filter
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => selectFilter(f.id)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors"
            style={{
              background: filter === f.id ? "rgba(28,184,184,0.14)" : "var(--preview-card)",
              color:      filter === f.id ? "#0F8A8A" : "var(--preview-text-2)",
              border:     `1px solid ${filter === f.id ? "rgba(28,184,184,0.30)" : "var(--preview-border)"}`,
            }}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-2 text-[11px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>
          {Math.round(animatedCount).toLocaleString()} {filtered.length === 1 ? "wallet" : "wallets"}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--preview-border)" }}>
          <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
            No wallets match this filter.
          </p>
          {filter !== "all" && (
            <button
              type="button"
              onClick={() => selectFilter("all")}
              className="mt-2 text-[13px] font-semibold transition-colors"
              style={{ color: "#0F8A8A" }}
            >
              Show all →
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border"
          style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
          {/* Sortable header — three numeric columns toggle in-memory sort. */}
          <div
            className="grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-2"
            style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-muted)" }}
          >
            <div className="w-8" aria-hidden />
            <SortTh label="Wallet" active={false} dir={dir} onClick={() => toggleSort("rank", "asc")} />
            <SortTh label="Locked"  active={col === "locked"}  dir={dir} onClick={() => toggleSort("locked", "desc")}  align="right" className="hidden md:flex" />
            <SortTh label="Streams" active={col === "streams"} dir={dir} onClick={() => toggleSort("streams", "desc")} align="right" />
            <SortTh label="Tokens"  active={col === "tokens"}  dir={dir} onClick={() => toggleSort("tokens", "desc")}  align="right" />
          </div>
          {sorted.map((r, i) => (
            <WalletRow row={r} showTopBorder={i > 0} key={r.rank} />
          ))}
        </div>
      )}
    </>
  );
}

// ── Sortable header cell (mirrors ExplorerTable's Th) ────────────────────────
function SortTh({
  label, active, dir, onClick, align = "left", className = "",
}: {
  label: string; active: boolean; dir: SortDir; onClick: () => void;
  align?: "left" | "right"; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""} ${className}`}
      aria-label={`Sort by ${label}`}
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

function WalletRow({ row, showTopBorder }: { row: SnapshotRow; showTopBorder: boolean }) {
  const totalUsd = row.totalLockedUsd ? Number(row.totalLockedUsd) : null;
  return (
    <Link
      href={`/dashboard/explorer?mode=wallet&q=${encodeURIComponent(row.recipient)}`}
      className="grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-3 transition-colors hover:bg-[var(--preview-muted)]"
      style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}
    >
      {/* Rank chip */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[11px] tabular-nums"
        style={{
          background: row.rank <= 10  ? "rgba(28,184,184,0.14)"
                    : row.rank <= 25  ? "rgba(28,184,184,0.08)"
                    : "var(--preview-muted)",
          color:      row.rank <= 10  ? "#0F8A8A" : "var(--preview-text-2)",
        }}>
        #{row.rank}
      </div>
      {/* Address + chips. The CopyButton is a <button>; it sits inside the row's
          <Link>, so we intercept its click (preventDefault + stopPropagation) to
          copy WITHOUT navigating to the wallet explorer. */}
      <div className="min-w-0">
        <span
          className="inline-flex max-w-full"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <CopyButton
            value={row.recipient}
            display={shortAddr(row.recipient)}
            className="text-sm font-semibold truncate"
            style={{ color: "var(--preview-text)" }}
          />
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: "var(--preview-muted)", color: "var(--preview-text-3)" }}>
            {row.chainEcosystem}
          </span>
          {row.topTokensJson.slice(0, 3).map((t) => (
            <span
              key={`${t.chainId}-${t.tokenAddress.toLowerCase()}`}
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "var(--preview-muted)", color: "var(--preview-text-2)" }}
              title={`${t.symbol ?? "?"} on ${CHAIN_NAMES[t.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${t.chainId}`}${t.usdValue != null ? ` · ${formatUsdCompact(t.usdValue)}` : ""}`}
            >
              {t.symbol ?? "?"}
            </span>
          ))}
        </div>
      </div>
      {/* Total USD (hidden on mobile to fit) */}
      <div className="text-right hidden md:block tabular-nums">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Locked</p>
        <p className="text-sm font-bold" style={{ color: "var(--preview-text)" }}>
          {totalUsd != null && totalUsd > 0 ? formatUsdCompact(totalUsd) : "—"}
        </p>
      </div>
      {/* Stream count */}
      <div className="text-right tabular-nums">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Streams</p>
        <p className="text-sm font-bold" style={{ color: "var(--preview-text)" }}>
          {row.streamCount.toLocaleString()}
        </p>
      </div>
      {/* Distinct tokens — the headline metric */}
      <div className="text-right tabular-nums">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Tokens</p>
        <p className="text-sm font-bold" style={{ color: "#0F8A8A" }}>
          {row.distinctTokenCount.toLocaleString()}
        </p>
      </div>
    </Link>
  );
}
