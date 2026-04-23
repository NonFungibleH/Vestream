"use client";
// ─────────────────────────────────────────────────────────────────────────────
// src/components/LiveActivityTicker.tsx
//
// Live feed of vesting activity indexed across ALL Vestream users, shown on
// /unlocks. Polls /api/unlocks/live-activity every 10 seconds and animates
// new rows sliding in from the top.
//
// Design goals:
//   - Always show *something* moving — even if the latest-indexed rows haven't
//     changed, a "live monitoring" dot pulses and a "seconds ago" clock
//     increments every second on the client.
//   - Degrade gracefully — zero results → "No activity indexed in the last
//     hour — but we're watching 7 protocols across 4 chains" state, not
//     a blank box.
//   - Keep it cheap — 10s poll interval, edge-cached, <1kB of payload.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";

type Activity = {
  streamId:        string;
  protocol:        string;
  chainId:         number;
  tokenSymbol:     string | null;
  tokenDecimals:   number;      // required for correct amount display
  recipient:       string;
  totalAmount:     string | null;
  endTime:         number | null;
  lastRefreshedAt: string;
  firstSeenAt:     string;
};

type Aggregate = {
  protocol:       string;
  totalStreams:   number;
  activeStreams:  number;
  lastIndexedAt:  string | null;
};

type LiveActivityResponse = {
  ok:    true;
  nowMs: number;
  grand: {
    totalStreams:  number;
    activeStreams: number;
    newInLastHour: number;
  };
  aggregate: Aggregate[];
  recent:    Activity[];
};

const POLL_INTERVAL_MS = 10_000;
const MAX_VISIBLE_ROWS = 6;

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
  const fixed = whole.toFixed(4);
  if (fixed === "0.0000" && whole > 0) return `< 0.0001${sym}`;
  return `${fixed}${sym}`;
}

function relTime(iso: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (diffSec < 5)      return "just now";
  if (diffSec < 60)     return `${diffSec}s ago`;
  if (diffSec < 3600)   return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400)  return `${Math.floor(diffSec / 3600)} h ago`;
  return `${Math.floor(diffSec / 86400)} d ago`;
}

export function LiveActivityTicker() {
  const [data, setData]   = useState<LiveActivityResponse | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [err, setErr]     = useState<string | null>(null);

  // ── Poll the API every 10s ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      try {
        const res = await fetch("/api/unlocks/live-activity", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as LiveActivityResponse;
        if (!cancelled) { setData(body); setErr(null); }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    }
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── Tick the "X sec ago" clock every second so numbers feel alive ─────────
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => (data?.recent ?? []).slice(0, MAX_VISIBLE_ROWS), [data]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 4px 24px rgba(37,99,235,0.06)",
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-center justify-between px-4 md:px-5 py-3 gap-3 flex-wrap"
        style={{ background: "linear-gradient(90deg, rgba(37,99,235,0.04), rgba(124,58,237,0.04))", borderBottom: "1px solid rgba(0,0,0,0.05)" }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#2563eb" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#2563eb" }} />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>
            Live platform activity
          </span>
        </div>
        {data && (
          <div className="flex items-center gap-3 text-xs" style={{ color: "#64748b" }}>
            <Stat n={data.grand.totalStreams}  label="indexed" />
            <span style={{ color: "#cbd5e1" }}>·</span>
            <Stat n={data.grand.activeStreams} label="active" />
            {data.grand.newInLastHour > 0 && (
              <>
                <span style={{ color: "#cbd5e1" }}>·</span>
                <span className="font-mono font-semibold" style={{ color: "#059669" }}>
                  +{data.grand.newInLastHour}
                </span>
                <span>this hour</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Rows — animate new entries in */}
      <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        {err && !data && (
          <div className="px-4 md:px-5 py-6 text-center text-sm" style={{ color: "#94a3b8" }}>
            Reconnecting to the live feed…
          </div>
        )}

        {!err && !data && (
          // Skeleton while loading
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
              Watching 7 protocols across 4 chains
            </div>
            <div className="text-xs" style={{ color: "#94a3b8" }}>
              The moment a tracked wallet lands on any protocol, it streams into this feed.
            </div>
          </div>
        )}

        {rows.map((row) => (
          <ActivityRow key={row.streamId} row={row} nowMs={nowMs} />
        ))}
      </div>

      {/* Marquee animation for the "now streaming" footer */}
      <style>{`
        @keyframes activityRowIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span>
      <span className="font-mono font-semibold" style={{ color: "#0f172a" }}>
        {n.toLocaleString()}
      </span>
      <span className="ml-1">{label}</span>
    </span>
  );
}

function ActivityRow({ row, nowMs }: { row: Activity; nowMs: number }) {
  const meta = PROTOCOL_COLORS[row.protocol] ?? { color: "#64748b", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.2)", name: row.protocol };
  const amount = formatAmount(row.totalAmount, row.tokenSymbol, row.tokenDecimals);
  const age    = relTime(row.lastRefreshedAt, nowMs);
  // Pulse extra on rows first seen in the last 30 seconds
  const firstSeenMs = new Date(row.firstSeenAt).getTime();
  const isFresh = nowMs - firstSeenMs < 30_000;

  return (
    <div
      className="px-4 md:px-5 py-2.5 flex items-center gap-3"
      style={{ animation: "activityRowIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both" }}
    >
      {/* Protocol badge */}
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
        {isFresh ? (
          <div
            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#10b981" }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#10b981" }} />
            </span>
            NEW
          </div>
        ) : (
          <div className="text-[10.5px] font-mono tabular-nums" style={{ color: "#94a3b8" }}>
            {age}
          </div>
        )}
      </div>
    </div>
  );
}
