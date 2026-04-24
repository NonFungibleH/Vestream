"use client";
// ─────────────────────────────────────────────────────────────────────────────
// src/components/UpcomingUnlockTicker.tsx
//
// Forward-looking sibling to <LiveActivityTicker/>. Polls /api/unlocks/upcoming
// and shows the next N scheduled unlocks across all protocols — with a live
// countdown that decrements every second on the client.
//
// Design goals:
//   - Visual contrast with the "recent activity" ticker (different hue, orange
//     accents instead of blue) so the two feeds clearly mean different things.
//   - Countdown never goes stale — tick(1s) even between API polls.
//   - Empty state stays useful: "Indexing… first unlocks will appear here".
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type UpcomingRow = {
  streamId:      string;
  protocol:      string;
  chainId:       number;
  tokenSymbol:   string | null;
  tokenAddress:  string;
  tokenDecimals: number;   // needed to scale `amount` — defaults upstream to 18
  recipient:     string;
  amount:        string | null;
  endTime:       number | null;
};

type UpcomingResponse = {
  ok:    true;
  nowMs: number;
  unlocks: UpcomingRow[];
};

const POLL_MS     = 30_000;
// Matches the number of protocol rows rendered on the sibling
// TvlComparisonBar (9: one per supported protocol). Keeping the two
// columns on /protocols at equal row counts so they line up visually.
// API is still queried with limit=10 — we ignore the 10th if all 9
// protocols are represented in the result; the slice+cap makes this a
// no-op when the set is smaller.
const MAX_VISIBLE = 9;

// Protocol colour map matches LiveActivityTicker — keep them in sync or extract.
const PROTOCOL_COLORS: Record<string, { color: string; bg: string; border: string; name: string }> = {
  sablier:        { color: "#f97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.22)",  name: "Sablier" },
  hedgey:         { color: "#7c3aed", bg: "rgba(124,58,237,0.08)",  border: "rgba(124,58,237,0.22)",  name: "Hedgey" },
  uncx:           { color: "#2563eb", bg: "rgba(37,99,235,0.08)",   border: "rgba(37,99,235,0.22)",   name: "UNCX" },
  "uncx-vm":      { color: "#2563eb", bg: "rgba(37,99,235,0.08)",   border: "rgba(37,99,235,0.22)",   name: "UNCX" },
  unvest:         { color: "#0891b2", bg: "rgba(8,145,178,0.08)",   border: "rgba(8,145,178,0.22)",   name: "Unvest" },
  "team-finance": { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.22)",  name: "Team Finance" },
  superfluid:     { color: "#1db954", bg: "rgba(29,185,84,0.08)",   border: "rgba(29,185,84,0.22)",   name: "Superfluid" },
  pinksale:       { color: "#ec4899", bg: "rgba(236,72,153,0.08)",  border: "rgba(236,72,153,0.22)",  name: "PinkSale" },
};

function chainLabel(id: number): string {
  switch (id) {
    case 1:         return "Ethereum";
    case 56:        return "BNB Chain";
    case 137:       return "Polygon";
    case 8453:      return "Base";
    case 11155111:  return "Sepolia";
    default:        return `Chain ${id}`;
  }
}

function truncAddr(a: string): string {
  return a.length < 10 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatAmount(raw: string | null, symbol: string | null, decimals = 18): string {
  if (!raw) return symbol ?? "—";
  let whole: number;
  try { whole = Number(BigInt(raw)) / 10 ** decimals; }
  catch { return symbol ?? "—"; }
  const sym = symbol ? ` ${symbol}` : "";
  if (whole >= 1_000_000) return `${(whole / 1_000_000).toFixed(2)}M${sym}`;
  if (whole >= 1_000)     return `${(whole / 1_000).toFixed(1)}K${sym}`;
  if (whole >= 1)         return `${whole.toFixed(2)}${sym}`;
  // Sub-1 amounts: show up to 4 decimals, but if rounding gives exactly 0,
  // bump to "< 0.0001" so we never render a misleading "0.0000 USDC".
  const fixed = whole.toFixed(4);
  if (fixed === "0.0000" && whole > 0) return `< 0.0001${sym}`;
  return `${fixed}${sym}`;
}

function countdown(unlockSec: number | null, nowMs: number): string {
  if (!unlockSec) return "—";
  const deltaSec = Math.max(0, unlockSec - Math.floor(nowMs / 1000));
  if (deltaSec < 60)       return `${deltaSec}s`;
  if (deltaSec < 3600)     return `${Math.floor(deltaSec / 60)} min`;
  if (deltaSec < 86400) {
    const h = Math.floor(deltaSec / 3600);
    const m = Math.floor((deltaSec % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(deltaSec / 86400);
  const h = Math.floor((deltaSec % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function UpcomingUnlockTicker() {
  const [data, setData]   = useState<UpcomingResponse | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [err, setErr]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/unlocks/upcoming?limit=10", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as UpcomingResponse;
        if (!cancelled) { setData(body); setErr(null); }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "load failed");
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Tick countdown every second so numbers feel live even without an API call
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => (data?.unlocks ?? []).slice(0, MAX_VISIBLE), [data]);

  // Aggregate stats for the sub-header — matches the confidence-band
  // sub-header on TvlComparisonBar so the two columns line up visually.
  // Soonest = countdown to the nearest upcoming unlock; "N protocols"
  // = distinct protocols represented in the current set.
  const soonestMs = useMemo(() => {
    if (rows.length === 0) return null;
    const first = rows[0];
    if (!first?.endTime) return null;
    return first.endTime * 1000 - nowMs;
  }, [rows, nowMs]);
  const uniqueProtocols = useMemo(
    () => new Set(rows.map((r) => (r.protocol === "uncx-vm" ? "uncx" : r.protocol))).size,
    [rows],
  );

  function formatCountdown(ms: number): string {
    if (ms <= 0) return "now";
    const sec = Math.floor(ms / 1000);
    if (sec < 3600)   return `${Math.floor(sec / 60)} min`;
    if (sec < 86400)  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
    return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
  }

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col h-full"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 4px 24px rgba(249,115,22,0.07)",
      }}
    >
      {/* Header strip — orange to contrast with the blue "live activity" feed */}
      <div
        className="flex items-center justify-between px-4 md:px-5 py-3 gap-3 flex-wrap"
        style={{
          background:   "linear-gradient(90deg, rgba(249,115,22,0.06), rgba(236,72,153,0.04))",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#f97316" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#f97316" }} />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#f97316" }}>
            Upcoming unlocks
          </span>
        </div>
        {data && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#64748b" }}>
            <span>showing next</span>
            <span className="font-mono font-semibold tabular-nums" style={{ color: "#0f172a" }}>
              {data.unlocks.length}
            </span>
          </div>
        )}
      </div>

      {/* Sub-header — mirrors the confidence-band strip on the TvlComparisonBar
          sibling so the two columns line up visually. Shows the soonest unlock
          countdown + protocol diversity of the current set. */}
      {rows.length > 0 && (
        <div
          className="px-4 md:px-5 py-1.5 flex items-center gap-2 text-[11px]"
          style={{
            borderBottom: "1px solid rgba(0,0,0,0.04)",
            background:   "rgba(249,115,22,0.02)",
            color:        "#64748b",
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "#f97316" }}
          />
          <span>
            {soonestMs != null && (
              <>
                Next in{" "}
                <span className="font-semibold tabular-nums" style={{ color: "#0f172a" }}>
                  {formatCountdown(soonestMs)}
                </span>
              </>
            )}
            <span className="mx-1.5" style={{ color: "#cbd5e1" }}>·</span>
            <span className="font-semibold tabular-nums" style={{ color: "#334155" }}>
              {uniqueProtocols}
            </span>
            <span className="ml-1">{uniqueProtocols === 1 ? "protocol" : "protocols"}</span>
          </span>
        </div>
      )}

      {/* Rows — flex-1 so the list stretches to match the sibling column */}
      <div className="divide-y flex-1" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        {err && !data && (
          <div className="px-4 md:px-5 py-6 text-center text-sm" style={{ color: "#94a3b8" }}>
            Reconnecting…
          </div>
        )}

        {!err && !data && (
          <div className="px-4 md:px-5 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-3 animate-pulse">
                <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(0,0,0,0.06)" }} />
                <div className="flex-1 h-3 rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
                <div className="w-16 h-3 rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
              </div>
            ))}
          </div>
        )}

        {data && rows.length === 0 && (
          <div className="px-4 md:px-5 py-6 text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: "#0f172a" }}>
              Indexing upcoming unlocks…
            </div>
            <div className="text-xs" style={{ color: "#94a3b8" }}>
              The next scheduled unlock on any protocol will appear here in real time.
            </div>
          </div>
        )}

        {rows.map((row) => (
          <UpcomingRow key={row.streamId} row={row} nowMs={nowMs} />
        ))}
      </div>
    </div>
  );
}

function UpcomingRow({ row, nowMs }: { row: UpcomingRow; nowMs: number }) {
  const meta   = PROTOCOL_COLORS[row.protocol] ?? { color: "#64748b", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.2)", name: row.protocol };
  const amount = formatAmount(row.amount, row.tokenSymbol, row.tokenDecimals);
  const ttl    = countdown(row.endTime, nowMs);
  const imminent = row.endTime != null && (row.endTime - Math.floor(nowMs / 1000)) < 3600; // under 1 h
  const canLink  = !!row.tokenAddress && /^0x[0-9a-f]{40}$/i.test(row.tokenAddress);

  const inner = (
    <div className="px-4 md:px-5 py-2.5 flex items-center gap-3 transition-colors hover:bg-slate-50/60">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold"
        style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
      >
        {meta.name.charAt(0)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold truncate" style={{ color: "#0f172a" }}>
            {amount}
          </span>
          <span className="text-xs" style={{ color: "#94a3b8" }}>on</span>
          <span className="text-xs font-semibold" style={{ color: meta.color }}>
            {meta.name}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
            style={{ background: "rgba(0,0,0,0.04)", color: "#64748b" }}
          >
            {chainLabel(row.chainId)}
          </span>
        </div>
        <div className="text-[10.5px] font-mono truncate" style={{ color: "#94a3b8" }}>
          for {truncAddr(row.recipient)}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <div
          className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums"
          style={{
            background: imminent ? "rgba(236,72,153,0.1)" : "rgba(249,115,22,0.1)",
            color:      imminent ? "#db2777"              : "#ea580c",
          }}
        >
          {imminent && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#ec4899" }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#ec4899" }} />
            </span>
          )}
          in {ttl}
        </div>
      </div>
    </div>
  );

  return canLink ? (
    <Link href={`/token/${row.chainId}/${row.tokenAddress}`} className="block">
      {inner}
    </Link>
  ) : inner;
}
