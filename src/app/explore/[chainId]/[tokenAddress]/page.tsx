"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import useSWR from "swr";
import { VestingStream } from "@/lib/vesting/normalize";
import { UpsellModal } from "@/components/UpsellModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHAIN_NAMES: Record<number, string> = {
  1:        "Ethereum",
  56:       "BNB Chain",
  8453:     "Base",
  11155111: "Sepolia",
};

const PROTOCOL_LABELS: Record<string, string> = {
  sablier: "Sablier",
  uncx:    "UNCX",
  hedgey:  "Hedgey",
  unvest:  "Unvest",
  "team-finance": "Team Finance",
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtToken(n: number, decimals = 18): string {
  const val = n / Math.pow(10, decimals);
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000)     return `${(val / 1_000).toFixed(2)}K`;
  return val.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});

// ─── Monthly unlock bucketing ─────────────────────────────────────────────────

interface MonthBucket { label: string; month: string; amount: number; }

function buildMonthlyBuckets(streams: VestingStream[], tokenDecimals: number): MonthBucket[] {
  const now   = Math.floor(Date.now() / 1000);
  const map   = new Map<string, number>();

  for (const s of streams) {
    const total   = Number(BigInt(s.totalAmount));
    const start   = s.startTime ?? 0;
    const end     = s.endTime   ?? 0;
    if (end <= now || !start || !end) continue;

    const d = new Date((Math.max(start, now)) * 1000);
    const endD = new Date(end * 1000);

    // Distribute linearly month by month
    const monthMs = 30.44 * 24 * 60 * 60 * 1000;
    const durationSec = end - Math.max(start, now);
    if (durationSec <= 0) continue;

    let cur = new Date(d.getFullYear(), d.getMonth(), 1);
    while (cur <= endD) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const segStart = Math.max(cur.getTime() / 1000, Math.max(start, now));
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const segEnd   = Math.min(nextMonth.getTime() / 1000, end);
      const segFrac  = Math.max(0, segEnd - segStart) / (end - start);
      const segAmt   = total * segFrac;
      map.set(key, (map.get(key) ?? 0) + segAmt);
      cur = nextMonth;
    }

    // Advance to next month, stop after 18 months from now
    const limit = new Date();
    limit.setMonth(limit.getMonth() + 18);
    if (cur > limit) break;
  }

  // Convert to sorted array, limit to next 18 months
  const results: MonthBucket[] = [];
  const start18 = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(start18.getFullYear(), start18.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    results.push({ label, month: key, amount: (map.get(key) ?? 0) / Math.pow(10, tokenDecimals) });
  }
  return results;
}

// ─── Explorer Page ─────────────────────────────────────────────────────────────

type SortKey = "locked" | "claimable" | "end" | "protocol";

export default function ExplorePage() {
  const router                = useRouter();
  const params                = useParams();
  const chainId               = Number(params.chainId as string);
  const tokenAddress          = (params.tokenAddress as string).toLowerCase();

  const [tier,    setTier]    = useState<string | null>(null); // null = loading
  const [upsell,  setUpsell]  = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("locked");
  const [sortAsc, setSortAsc] = useState(false);

  // ── Auth + tier check ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/wallets").then(async (r) => {
      if (r.status === 401) { router.push("/login"); return; }
      const j = await r.json();
      setTier(j.tier ?? "free");
    }).catch(() => router.push("/login"));
  }, [router]);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const apiUrl = tier && tier !== "free"
    ? `/api/explore?token=${tokenAddress}&chainId=${chainId}`
    : null; // don't fetch until we know tier and it's Pro+

  const { data, isLoading } = useSWR<{ streams: VestingStream[] }>(apiUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const streams = data?.streams ?? [];

  // ── Derived stats ──────────────────────────────────────────────────────────
  const { tokenSymbol, tokenDecimals, totalLocked, totalClaimable, nextUnlock } = useMemo(() => {
    if (!streams.length) return { tokenSymbol: "…", tokenDecimals: 18, totalLocked: 0n, totalClaimable: 0n, nextUnlock: null as number | null };
    const s0 = streams[0];
    const dec = s0.tokenDecimals ?? 18;
    const sym = s0.tokenSymbol ?? "TOKEN";
    let locked = 0n, claimable = 0n;
    let nxt: number | null = null;
    for (const s of streams) {
      locked    += BigInt(s.lockedAmount ?? "0");
      claimable += BigInt(s.claimableNow ?? "0");
      if (s.nextUnlockTime && (!nxt || s.nextUnlockTime < nxt)) nxt = s.nextUnlockTime;
    }
    return { tokenSymbol: sym, tokenDecimals: dec, totalLocked: locked, totalClaimable: claimable, nextUnlock: nxt };
  }, [streams]);

  const recipients = useMemo(() => streams.length, [streams]);
  const chainName  = CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;

  // ── Monthly chart ──────────────────────────────────────────────────────────
  const monthBuckets = useMemo(() => buildMonthlyBuckets(streams, tokenDecimals), [streams, tokenDecimals]);
  const maxMonth     = Math.max(1, ...monthBuckets.map((b) => b.amount));

  // ── Sorted recipient table ─────────────────────────────────────────────────
  const sortedStreams = useMemo(() => {
    const dec = tokenDecimals;
    return [...streams].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === "locked") {
        av = Number(BigInt(a.lockedAmount ?? "0")) / Math.pow(10, dec);
        bv = Number(BigInt(b.lockedAmount ?? "0")) / Math.pow(10, dec);
      } else if (sortKey === "claimable") {
        av = Number(BigInt(a.claimableNow ?? "0")) / Math.pow(10, dec);
        bv = Number(BigInt(b.claimableNow ?? "0")) / Math.pow(10, dec);
      } else if (sortKey === "end") {
        av = a.endTime ?? 0;
        bv = b.endTime ?? 0;
      } else if (sortKey === "protocol") {
        av = 0; bv = 0;
        return sortAsc
          ? (a.protocol ?? "").localeCompare(b.protocol ?? "")
          : (b.protocol ?? "").localeCompare(a.protocol ?? "");
      }
      return sortAsc ? av - bv : bv - av;
    });
  }, [streams, sortKey, sortAsc, tokenDecimals]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span style={{ opacity: sortKey === k ? 1 : 0.3, fontSize: 9, marginLeft: 3 }}>
      {sortKey === k ? (sortAsc ? "▲" : "▼") : "▼"}
    </span>
  );

  // ─────────────────────────────────────────────────────────────────────────

  // Still loading tier
  if (tier === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f1117" }}>
        <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Free tier gate
  if (tier === "free") {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-6" style={{ background: "#0f1117" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
            🔍
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Token Vesting Explorer</h1>
            <p className="text-gray-400 max-w-md">
              See every vesting schedule for <span className="text-white font-semibold">{tokenAddress.slice(0, 10)}…</span> on {chainName} — all recipients, unlock timelines, and claimable amounts.
            </p>
          </div>
          <button
            onClick={() => setUpsell(true)}
            className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 20px rgba(99,102,241,0.4)" }}>
            Upgrade to Pro to unlock →
          </button>
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to dashboard
          </button>
        </div>
        {upsell && <UpsellModal featureName="Token Vesting Explorer" requiredTier="pro" onClose={() => setUpsell(false)} />}
      </>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0f1117", color: "#e2e8f0" }}>

      {/* ── Header bar ── */}
      <header className="sticky top-0 z-20 border-b px-6 py-3 flex items-center justify-between"
        style={{ background: "rgba(15,17,23,0.9)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white text-sm font-bold">V</span>
            Vestream
          </a>
          <span className="text-gray-600">/</span>
          <span className="text-sm text-gray-400">Token Explorer</span>
          <span className="text-gray-600">/</span>
          <span className="text-sm font-semibold text-white">{isLoading ? "…" : tokenSymbol}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.25)" }}>
            {chainName}
          </span>
          <button onClick={() => router.back()}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            ← Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Token hero ── */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(99,102,241,0.08))", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="px-8 py-7">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#818cf8" }}>
                  Token Vesting Explorer
                </p>
                <h1 className="text-4xl font-bold text-white mb-1">
                  {isLoading ? <span className="opacity-30">Loading…</span> : tokenSymbol}
                </h1>
                <p className="text-sm font-mono" style={{ color: "#64748b" }}>{tokenAddress}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-3 py-1.5 rounded-full font-semibold"
                  style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}>
                  {chainName}
                </span>
                <span className="text-xs px-3 py-1.5 rounded-full font-semibold"
                  style={{ background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}>
                  Sablier · UNCX · Team Finance
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl p-5 animate-pulse"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", height: 88 }} />
            ))}
          </div>
        )}

        {/* ── Stats ── */}
        {!isLoading && streams.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Total Locked",
                value: fmtToken(Number(totalLocked), tokenDecimals) + " " + tokenSymbol,
                sub:   "across all recipients",
                color: "#818cf8",
              },
              {
                label: "Claimable Now",
                value: fmtToken(Number(totalClaimable), tokenDecimals) + " " + tokenSymbol,
                sub:   "available to claim",
                color: "#34d399",
              },
              {
                label: "Recipients",
                value: recipients.toLocaleString(),
                sub:   `on ${chainName}`,
                color: "#60a5fa",
              },
              {
                label: "Next Unlock",
                value: nextUnlock ? fmtDate(nextUnlock) : "—",
                sub:   nextUnlock ? new Date(nextUnlock * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC" : "no upcoming unlocks",
                color: "#f59e0b",
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl p-5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#64748b" }}>
                  {stat.label}
                </p>
                <p className="text-xl font-bold leading-tight" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-[11px] mt-1" style={{ color: "#475569" }}>{stat.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Monthly unlock chart ── */}
        {!isLoading && streams.length > 0 && (
          <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-sm font-semibold text-white">Monthly Unlock Schedule</h2>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  Token supply unlocking per month across all vesting schedules — next 18 months
                </p>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.15)" }}>
                {tokenSymbol}
              </span>
            </div>
            <div className="flex items-end gap-1.5 h-40">
              {monthBuckets.map((b) => {
                const pct = b.amount / maxMonth;
                const isNow = b.month === (() => {
                  const d = new Date();
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                })();
                return (
                  <div key={b.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{ whiteSpace: "nowrap" }}>
                      <div className="text-[10px] px-2 py-1 rounded-lg font-semibold"
                        style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}>
                        {b.amount > 0 ? `${b.amount >= 1000 ? `${(b.amount / 1000).toFixed(1)}K` : b.amount.toFixed(0)} ${tokenSymbol}` : "none"}
                      </div>
                    </div>
                    <div className="w-full rounded-t-sm transition-all"
                      style={{
                        height:     `${Math.max(pct * 100, b.amount > 0 ? 4 : 0)}%`,
                        background: isNow
                          ? "linear-gradient(180deg, #6366f1, #4f46e5)"
                          : "rgba(99,102,241,0.4)",
                        minHeight:  b.amount > 0 ? 3 : 0,
                      }} />
                    <span className="text-[9px] rotate-45 origin-left translate-x-2 -translate-y-1 whitespace-nowrap"
                      style={{ color: isNow ? "#818cf8" : "#475569" }}>
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recipient table ── */}
        {!isLoading && streams.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <h2 className="text-sm font-semibold text-white">All Recipients</h2>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{recipients} vesting schedules found</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>Recipient</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest cursor-pointer select-none"
                      style={{ color: "#64748b" }} onClick={() => toggleSort("protocol")}>
                      Protocol <SortIcon k="protocol" />
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest cursor-pointer select-none"
                      style={{ color: "#64748b" }} onClick={() => toggleSort("locked")}>
                      Locked <SortIcon k="locked" />
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest cursor-pointer select-none"
                      style={{ color: "#64748b" }} onClick={() => toggleSort("claimable")}>
                      Claimable <SortIcon k="claimable" />
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest cursor-pointer select-none"
                      style={{ color: "#64748b" }} onClick={() => toggleSort("end")}>
                      Vests Until <SortIcon k="end" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStreams.map((s, i) => {
                    const dec     = s.tokenDecimals ?? 18;
                    const locked  = Number(BigInt(s.lockedAmount  ?? "0")) / Math.pow(10, dec);
                    const claim   = Number(BigInt(s.claimableNow  ?? "0")) / Math.pow(10, dec);
                    const isYours = false; // could cross-ref user wallets in future
                    return (
                      <tr key={s.id}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                        }}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {isYours && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                                style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>YOU</span>
                            )}
                            <a
                              href={`https://etherscan.io/address/${s.recipient}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs hover:underline"
                              style={{ color: "#60a5fa" }}>
                              {shortAddr(s.recipient)}
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                            style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.15)" }}>
                            {PROTOCOL_LABELS[s.protocol] ?? s.protocol}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs font-medium" style={{ color: "#e2e8f0" }}>
                          {fmtToken(locked * Math.pow(10, dec), dec)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs font-medium" style={{ color: claim > 0 ? "#34d399" : "#475569" }}>
                          {claim > 0 ? fmtToken(claim * Math.pow(10, dec), dec) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs" style={{ color: "#64748b" }}>
                          {fmtDate(s.endTime)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && streams.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-lg font-semibold text-white mb-2">No vesting schedules found</p>
            <p className="text-sm" style={{ color: "#64748b" }}>
              No active Sablier, UNCX, or Team Finance vestings found for this token on {chainName}.
              <br />The token may use Hedgey or Unvest, which are not yet indexed by the explorer.
            </p>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className="text-center py-4">
          <p className="text-[11px]" style={{ color: "#334155" }}>
            Data sourced from Sablier, UNCX, and Team Finance subgraphs · updates every 2 minutes ·{" "}
            <a href="/dashboard" className="hover:underline">← Back to dashboard</a>
          </p>
        </footer>

      </main>
    </div>
  );
}
