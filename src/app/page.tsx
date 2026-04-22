import Link from "next/link";
import { WaitlistForm } from "@/components/WaitlistForm";
import { SiteNav } from "@/components/SiteNav";
import ContactTrigger from "@/components/ContactTrigger";
import { listProtocols } from "@/lib/protocol-constants";
import {
  getProtocolStats,
  relativeTimeSince,
  type ProtocolStats,
} from "@/lib/vesting/protocol-stats";

// ISR — re-render at most once a minute so the live freshness strip stays
// current without hammering the DB on every hit.
export const revalidate = 60;

async function getHomepageLiveStats() {
  // Aggregate across all 7 protocols. Any single-protocol failure must not
  // sink the homepage render — silently fall back to nulls.
  try {
    const protocols = listProtocols();
    const results = await Promise.all(
      protocols.map(async (p) => {
        try {
          return await getProtocolStats(p.adapterIds);
        } catch {
          return null;
        }
      }),
    );
    const valid = results.filter((s): s is ProtocolStats => !!s);
    const totalStreams = valid.reduce((sum, s) => sum + s.totalStreams, 0);
    const lastIndexedAt = valid.reduce<Date | null>((latest, s) => {
      if (!s.lastIndexedAt) return latest;
      if (!latest || s.lastIndexedAt > latest) return s.lastIndexedAt;
      return latest;
    }, null);
    return {
      totalStreams,
      lastIndexedAt,
      protocolCount: protocols.length,
    };
  } catch {
    return { totalStreams: 0, lastIndexedAt: null, protocolCount: 7 };
  }
}

export default async function Home() {
  const liveStats = await getHomepageLiveStats();

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#f8fafc", color: "#0f172a" }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <SiteNav />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center px-5 pt-24 pb-16 md:pt-40 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px)`, backgroundSize: "28px 28px" }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top, rgba(37,99,235,0.07) 0%, transparent 65%)" }} />
        <div className="absolute top-24 left-1/4 w-72 h-72 pointer-events-none rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)" }} />

        {/* Floating left card — portfolio value */}
        <div className="absolute hidden xl:block pointer-events-none"
          style={{ left: "24px", top: "50%", transform: "translateY(-50%) rotate(-6deg)", zIndex: 0 }}>
          <div style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", boxShadow: "0 24px 64px rgba(0,0,0,0.45)", width: "210px", padding: "16px" }}>
            <p style={{ color: "#4b5563", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>Total Portfolio Value</p>
            <p style={{ color: "white", fontSize: "22px", fontWeight: "800", lineHeight: 1.1, marginBottom: "2px" }}>$206,500</p>
            <p style={{ color: "#10b981", fontSize: "11px", fontWeight: "600", marginBottom: "14px" }}>$5,650 claimable now</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {([
                { symbol: "USDC", pct: 67, color: "#2563eb" },
                { symbol: "NOVA", pct: 22, color: "#f97316" },
                { symbol: "FLUX", pct: 11, color: "#7c3aed" },
              ] as const).map((t) => (
                <div key={t.symbol}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                    <span style={{ color: "#9ca3af", fontSize: "10px" }}>{t.symbol}</span>
                    <span style={{ color: "#9ca3af", fontSize: "10px" }}>{t.pct}%</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "4px", height: "4px" }}>
                    <div style={{ width: `${t.pct}%`, height: "4px", borderRadius: "4px", background: t.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: "#4b5563", fontSize: "9px" }}>Live · Updated just now</span>
            </div>
          </div>
        </div>

        {/* Floating right card — token unlock status */}
        <div className="absolute hidden xl:block pointer-events-none"
          style={{ right: "24px", top: "50%", transform: "translateY(-50%) rotate(6deg)", zIndex: 0 }}>
          <div style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", boxShadow: "0 24px 64px rgba(0,0,0,0.45)", width: "210px", padding: "16px" }}>
            <p style={{ color: "#4b5563", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px" }}>Token Unlock Status</p>
            {/* Streaming now */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "10px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", marginBottom: "7px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
              <div>
                <p style={{ color: "#10b981", fontSize: "10px", fontWeight: "700" }}>USDC · Streaming now</p>
                <p style={{ color: "#4b5563", fontSize: "9px", marginTop: "1px" }}>Continuous · claim any time</p>
              </div>
            </div>
            {/* Countdown */}
            <div style={{ padding: "8px 10px", borderRadius: "10px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)" }}>
              <p style={{ color: "#60a5fa", fontSize: "10px", fontWeight: "700", marginBottom: "6px" }}>NOVA · Next unlock</p>
              <div style={{ display: "flex", gap: "5px" }}>
                {([["14", "days"], ["6", "hrs"], ["22", "min"]] as const).map(([v, l]) => (
                  <div key={l} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: "7px", padding: "6px 4px", textAlign: "center" }}>
                    <p style={{ color: "white", fontSize: "16px", fontWeight: "800", lineHeight: 1 }}>{v}</p>
                    <p style={{ color: "#4b5563", fontSize: "8px", marginTop: "2px" }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="relative flex items-center gap-3 mb-8 flex-wrap justify-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#b45309" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#f59e0b" }} />
            Beta Testing
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)", color: "#2563eb" }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.39.07 2.35.82 3.15.85.82-.08 2.43-.99 4.1-.84 1.01.08 3.86.41 5.7 3.14-4.84 2.69-4.07 8.64.05 10.71zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            iOS &amp; Android
          </div>
        </div>

        <h1 className="relative text-[2.4rem] md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] max-w-3xl mb-6"
          style={{ letterSpacing: "-0.03em", color: "#0f172a" }}>
          Never miss a<br />
          <span style={{ background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #6366f1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            token unlock.
          </span>
        </h1>

        <p className="relative text-lg max-w-xl mb-3 leading-relaxed" style={{ color: "#64748b" }}>
          The Vestream mobile app tracks every vesting you&apos;re owed — across all protocols and chains — and sends push notifications the moment a token is ready to claim.
        </p>
        <p className="relative text-base max-w-xl mb-10 leading-relaxed" style={{ color: "#94a3b8" }}>
          Plus a full-featured web dashboard for deeper analysis: P&amp;L tracking, monthly cashflow forecasts, exports, and multi-wallet management.
        </p>

        <div className="relative flex flex-col items-center gap-3 w-full">
          <WaitlistForm />
        </div>

        {/* Live freshness strip — aggregate stream count + last-indexed timestamp
            across all 7 protocols, refreshed every 60s via ISR. Signals to search
            engines and visitors alike that this index is active, not stale. */}
        <div className="relative mt-10 flex justify-center">
          <Link
            href="/unlocks"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all hover:opacity-90"
            style={{
              background: "rgba(37,99,235,0.05)",
              borderColor: "rgba(37,99,235,0.18)",
              color: "#2563eb",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "#2563eb" }}
            />
            Live · {liveStats.totalStreams.toLocaleString()} {liveStats.totalStreams === 1 ? "stream" : "streams"} indexed across {liveStats.protocolCount} protocols
            {liveStats.lastIndexedAt && (
              <span style={{ color: "#64748b", fontWeight: 500 }}>
                · refreshed {relativeTimeSince(liveStats.lastIndexedAt)}
              </span>
            )}
          </Link>
        </div>

        {/* Protocol strip */}
        <div className="relative mt-8">
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-4 text-center" style={{ color: "#94a3b8" }}>Integrated with</p>
          {/* Row 1 */}
          <div className="flex items-center justify-center gap-3 flex-wrap mb-3">
            {[
              { name: "Sablier",      color: "#f97316", bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.15)"  },
              { name: "Hedgey",       color: "#3b82f6", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.15)"  },
              { name: "UNCX",         color: "#f59e0b", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.15)"  },
              { name: "Team Finance", color: "#10b981", bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.15)"  },
            ].map((p) => (
              <div key={p.name} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                style={{ background: p.bg, border: `1px solid ${p.border}` }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: p.color }}>
                  <span className="text-white font-bold text-[11px] leading-none">{p.name[0]}</span>
                </div>
                <p className="text-xs font-bold leading-tight" style={{ color: p.color }}>{p.name}</p>
              </div>
            ))}
          </div>
          {/* Row 2 */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {[
              { name: "Unvest",       color: "#06b6d4", bg: "rgba(6,182,212,0.07)",   border: "rgba(6,182,212,0.15)"   },
              { name: "Superfluid",   color: "#1db954", bg: "rgba(29,185,84,0.07)",   border: "rgba(29,185,84,0.15)"   },
              { name: "PinkSale",     color: "#ec4899", bg: "rgba(236,72,153,0.07)",  border: "rgba(236,72,153,0.15)"  },
            ].map((p) => (
              <div key={p.name} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                style={{ background: p.bg, border: `1px solid ${p.border}` }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: p.color }}>
                  <span className="text-white font-bold text-[11px] leading-none">{p.name[0]}</span>
                </div>
                <p className="text-xs font-bold leading-tight" style={{ color: p.color }}>{p.name}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#cbd5e1" }}>on</p>
            {[
              { name: "Ethereum", color: "#6366f1", bg: "rgba(99,102,241,0.07)",   border: "rgba(99,102,241,0.16)"   },
              { name: "BNB Chain", color: "#eab308", bg: "rgba(234,179,8,0.07)",   border: "rgba(234,179,8,0.16)"    },
              { name: "Base",      color: "#3b82f6", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.16)"   },
              { name: "Polygon",   color: "#8b5cf6", bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.16)"   },
            ].map((c) => (
              <div key={c.name} className="flex items-center px-3 py-1 rounded-full"
                style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                <span className="text-[11px] font-semibold" style={{ color: c.color }}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard preview (updated to match real UI) ─────────────────── */}
      <section className="px-3 md:px-8 pb-16 md:pb-24 flex justify-center">
        <div className="relative w-full max-w-5xl rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(0,0,0,0.09)", boxShadow: "0 32px 80px rgba(15,23,42,0.14), 0 4px 16px rgba(15,23,42,0.06)" }}>
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3"
            style={{ background: "#f1f5f9", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            <div className="flex gap-1.5">
              {["#ff5f57","#febc2e","#28c840"].map((c) => (
                <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <div className="flex-1 mx-4">
              <div className="max-w-xs mx-auto h-5 rounded-md flex items-center px-3"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.1)" }}>
                <span className="text-[10px]" style={{ color: "#94a3b8" }}>app.vestream.io/dashboard</span>
              </div>
            </div>
            {/* Export badge in chrome */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-medium" style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.15)" }}>
              <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV / PDF
            </div>
          </div>

          {/* Mock dashboard — dark theme */}
          <div className="flex" style={{ background: "#0d0f14", minHeight: 280 }}>
            {/* Sidebar — hidden on mobile */}
            <div className="hidden md:flex w-44 flex-shrink-0 flex-col" style={{ background: "#141720", borderRight: "1px solid #1e2330" }}>
              <div className="px-4 py-3.5 flex items-center gap-2" style={{ borderBottom: "1px solid #1e2330" }}>
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)" }}>
                  <span className="text-white text-[9px] font-bold">V</span>
                </div>
                <span className="text-xs font-bold text-white">Vestream</span>
              </div>
              <div className="px-2 py-3 space-y-0.5">
                {[
                  { label: "Dashboard", active: true,  icon: "▦" },
                  { label: "History",   active: false, icon: "◷" },
                  { label: "Wallets",   active: false, icon: "◈" },
                  { label: "Settings",  active: false, icon: "⚙" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                    style={item.active ? { background: "rgba(37,99,235,0.15)", color: "#60a5fa" } : { color: "rgba(255,255,255,0.35)" }}>
                    <span className="text-[10px]">{item.icon}</span>{item.label}
                  </div>
                ))}
              </div>
              <div className="px-2 mt-1" style={{ borderTop: "1px solid #1e2330", paddingTop: "0.75rem" }}>
                <p className="px-2.5 text-[8px] font-bold tracking-widest uppercase mb-1.5" style={{ color: "rgba(255,255,255,0.2)" }}>Wallets</p>
                {["My Wallet", "Team Vesting"].map((w) => (
                  <div key={w} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />{w}
                  </div>
                ))}
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 p-4 space-y-3 overflow-hidden">
              {/* PortfolioHero gradient card */}
              <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg,#0f172a,#1e3a8a 55%,#1d4ed8)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[8px] font-bold tracking-widest uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Total Portfolio Value</p>
                <p className="text-2xl font-bold text-white tabular-nums">$206,500</p>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(52,211,153,0.9)" }}>● $5,650 claimable now · 2 wallets tracked</p>
                <div className="flex gap-2 mt-3">
                  {[
                    { l: "Claimable", v: "$5,650",  c: "rgba(52,211,153,0.15)"  },
                    { l: "Locked",    v: "$200,850", c: "rgba(147,197,253,0.15)" },
                    { l: "Streams",   v: "4 active", c: "rgba(251,191,36,0.12)"  },
                    { l: "Next",      v: "14d 6h",   c: "rgba(251,191,36,0.15)"  },
                  ].map((s) => (
                    <div key={s.l} className="rounded-lg px-2.5 py-1.5 flex-1" style={{ background: s.c, border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-[7px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>{s.l}</p>
                      <p className="text-[11px] font-bold text-white tabular-nums">{s.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Two-col: snapshot + table */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {/* Token snapshot */}
                <div className="md:col-span-2 rounded-xl p-3" style={{ background: "#141720", border: "1px solid #1e2330" }}>
                  <p className="text-[9px] font-semibold text-white mb-2.5">Token Snapshot</p>
                  <div className="space-y-2">
                    {[
                      { s: "USDC", clPct: 12, lkPct: 88, color: "#2563eb", total: "$137,500" },
                      { s: "NOVA", clPct:  8, lkPct: 92, color: "#f97316", total: "$45,000"  },
                      { s: "FLUX", clPct:  5, lkPct: 95, color: "#7c3aed", total: "$24,000"  },
                    ].map((t) => (
                      <div key={t.s}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "9px", fontWeight: 600 }}>{t.s}</span>
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>{t.total}</span>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "4px", height: "5px", overflow: "hidden" }}>
                          <div style={{ display: "flex", height: "100%" }}>
                            <div style={{ width: `${t.clPct}%`, background: "#10b981" }} />
                            <div style={{ width: `${t.lkPct}%`, background: t.color + "60" }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vesting table */}
                <div className="md:col-span-3 rounded-xl overflow-hidden" style={{ background: "#141720", border: "1px solid #1e2330" }}>
                  <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #1e2330" }}>
                    <p className="text-[9px] font-semibold text-white">Vesting Schedules</p>
                    <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}>4 streams</span>
                  </div>
                  {[
                    { token: "USDC", protocol: "Sablier",       claimable: "$4,050", locked: "$133,450", color: "#2563eb", proto: "#a78bfa", prog: 15 },
                    { token: "NOVA", protocol: "Team Finance",   claimable: "$1,600", locked: "$43,400",  color: "#059669", proto: "#34d399", prog: 35 },
                    { token: "FLUX", protocol: "UNCX",           claimable: "—",      locked: "$24,000",  color: "#7c3aed", proto: "#fb923c", prog: 5  },
                  ].map((row, i) => (
                    <div key={row.token} className="flex items-center gap-2 px-3 py-2"
                      style={{ borderTop: i > 0 ? "1px solid #1e2330" : undefined }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: row.color + "20", border: `1px solid ${row.color}30` }}>
                        <span className="text-[7px] font-bold" style={{ color: row.color }}>{row.token.slice(0,2)}</span>
                      </div>
                      <span className="text-[9px] font-semibold text-white w-10 flex-shrink-0">{row.token}</span>
                      <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: row.proto + "15", color: row.proto }}>{row.protocol}</span>
                      {/* Progress bar */}
                      <div className="flex-1 mx-1">
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "3px", height: "3px" }}>
                          <div style={{ width: `${row.prog}%`, height: "3px", borderRadius: "3px", background: row.color }} />
                        </div>
                      </div>
                      <span className="text-[9px] tabular-nums w-12 text-right flex-shrink-0" style={{ color: row.claimable === "—" ? "rgba(255,255,255,0.2)" : "#34d399" }}>{row.claimable}</span>
                      <div className="w-9 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{ background: row.claimable !== "—" ? `linear-gradient(135deg,${row.color},${row.color}aa)` : "rgba(255,255,255,0.06)" }}>
                        <span className="text-[7px] font-bold" style={{ color: row.claimable !== "—" ? "white" : "rgba(255,255,255,0.3)" }}>
                          {row.claimable !== "—" ? "Claim" : "View"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature showcase panels ──────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#94a3b8" }}>Deeper than a simple tracker</p>
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>
            Built for the full lifecycle
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "#64748b" }}>
            From the first cliff to the final claim — forecast cashflows, track every sale, and export your records.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Panel 1: Monthly Forecast */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#0d0f14", border: "1px solid #1e2330", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#4b5563" }}>Monthly Forecast</p>
              <p className="text-xs font-semibold text-white">Unlock cashflow by month</p>
            </div>
            <div className="px-4 pb-4">
              <div className="space-y-1.5 mt-2">
                {[
                  { m: "Mar 2025", v: 45000, w: 85 },
                  { m: "Apr 2025", v: 32000, w: 60 },
                  { m: "May 2025", v: 18500, w: 35 },
                  { m: "Jun 2025", v: 52000, w: 98 },
                  { m: "Jul 2025", v: 28000, w: 53 },
                  { m: "Aug 2025", v: 12000, w: 23 },
                ].map((r) => (
                  <div key={r.m} className="flex items-center gap-2">
                    <span style={{ color: "#4b5563", fontSize: "9px", width: "52px", flexShrink: 0 }}>{r.m}</span>
                    <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: "3px", height: "14px", overflow: "hidden" }}>
                      <div style={{ width: `${r.w}%`, height: "100%", background: "linear-gradient(90deg, #2563eb, #7c3aed)", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "5px" }}>
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "8px", fontWeight: 700 }}>${(r.v/1000).toFixed(0)}k</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ color: "#4b5563", fontSize: "9px", marginTop: "10px" }}>USD value at current prices</p>
            </div>
          </div>

          {/* Panel 2: P&L Tracker */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#0d0f14", border: "1px solid #1e2330", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div className="px-4 pt-4 pb-2 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#4b5563" }}>P&L Tracker</p>
                <p className="text-xs font-semibold text-white">Log sales · track realized P&L</p>
              </div>
              <div style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: "8px", padding: "4px 8px", textAlign: "right" }}>
                <p style={{ color: "#4b5563", fontSize: "8px" }}>Total</p>
                <p style={{ color: "#34d399", fontSize: "12px", fontWeight: 800, lineHeight: 1 }}>+$4,275</p>
              </div>
            </div>
            <div className="px-4 pb-4">
              {/* Token row */}
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "10px", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "7px", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#60a5fa", fontSize: "8px", fontWeight: 800 }}>PRI</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: "white", fontSize: "10px", fontWeight: 700 }}>PRISM</p>
                    <p style={{ color: "#4b5563", fontSize: "9px" }}>Entry $0.50 · Now $0.95</p>
                  </div>
                </div>
                {/* Transactions */}
                {[
                  { date: "15 Jan", amt: "1,000", px: "$0.60", pnl: "+$100" },
                  { date: "20 Feb", amt: "500",   px: "$0.80", pnl: "+$150" },
                ].map((tx) => (
                  <div key={tx.date} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: "#4b5563", fontSize: "8px", width: "32px" }}>{tx.date}</span>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "8px", flex: 1 }}>{tx.amt} @ {tx.px}</span>
                    <span style={{ color: "#34d399", fontSize: "9px", fontWeight: 700 }}>{tx.pnl}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color: "#4b5563", fontSize: "8px" }}>Unrealized</span>
                  <span style={{ color: "#34d399", fontSize: "9px", fontWeight: 700 }}>+$4,025</span>
                  <span style={{ color: "#4b5563", fontSize: "8px" }}>· Total</span>
                  <span style={{ color: "#34d399", fontSize: "10px", fontWeight: 800 }}>+$4,275</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <div style={{ flex: 1, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: "7px", padding: "5px 8px" }}>
                  <p style={{ color: "#4b5563", fontSize: "8px" }}>Realized</p>
                  <p style={{ color: "#60a5fa", fontSize: "10px", fontWeight: 800 }}>+$250</p>
                </div>
                <div style={{ flex: 1, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: "7px", padding: "5px 8px" }}>
                  <p style={{ color: "#4b5563", fontSize: "8px" }}>Unrealized</p>
                  <p style={{ color: "#34d399", fontSize: "10px", fontWeight: 800 }}>+$4,025</p>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 3: Export + Token Market */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#0d0f14", border: "1px solid #1e2330", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#4b5563" }}>Token Market Data</p>
              <p className="text-xs font-semibold text-white">Live prices &amp; export</p>
            </div>
            <div className="px-4 pb-4 space-y-2">
              {[
                { sym: "VOLT", price: "$1.04",    mc: "$38.7B", liq: "$741M", color: "#2563eb" },
                { sym: "NOVA", price: "$1.84",    mc: "$756M",  liq: "$48M",  color: "#f97316" },
                { sym: "FLUX", price: "$3,241.00", mc: "$389B", liq: "$2.1B", color: "#7c3aed" },
              ].map((t) => (
                <div key={t.sym} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "9px", padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "5px", background: t.color + "25", border: `1px solid ${t.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: t.color, fontSize: "6px", fontWeight: 800 }}>{t.sym.slice(0,2)}</span>
                      </div>
                      <span style={{ color: "white", fontSize: "10px", fontWeight: 700 }}>{t.sym}</span>
                    </div>
                    <span style={{ color: "white", fontSize: "10px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t.price}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <span style={{ color: "#4b5563", fontSize: "8px" }}>MCap {t.mc}</span>
                    <span style={{ color: "#4b5563", fontSize: "8px" }}>Liq {t.liq}</span>
                  </div>
                </div>
              ))}
              {/* Export buttons */}
              <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                <div style={{ flex: 1, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: "8px", padding: "6px 8px", display: "flex", alignItems: "center", gap: "5px" }}>
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  <span style={{ color: "#60a5fa", fontSize: "9px", fontWeight: 700 }}>CSV / Excel</span>
                </div>
                <div style={{ flex: 1, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "8px", padding: "6px 8px", display: "flex", alignItems: "center", gap: "5px" }}>
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  <span style={{ color: "#a78bfa", fontSize: "9px", fontWeight: 700 }}>Print / PDF</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Features grid ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>
            Everything in one place
          </h2>
          <p className="text-base" style={{ color: "#64748b" }}>
            Built for teams and individuals managing token allocations across multiple protocols.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
              color: "#2563eb", bg: "rgba(37,99,235,0.08)", border: "rgba(37,99,235,0.14)",
              title: "Live on-chain data",
              body: "Real-time positions pulled from Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid, and PinkSale — across Ethereum, Base, BSC, and Polygon.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
              color: "#7c3aed", bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.14)",
              title: "Push + email alerts",
              body: "Native push notifications on iOS & Android, plus email — so you always know when a token is ready to claim, before you open the app.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
              color: "#059669", bg: "rgba(5,150,105,0.08)", border: "rgba(5,150,105,0.14)",
              title: "Mobile app + web dashboard",
              body: "Track unlocks on the go with the iOS & Android app, then go deeper on the web dashboard — advanced filters, exports, and P&L analysis.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
              color: "#db2777", bg: "rgba(219,39,119,0.07)", border: "rgba(219,39,119,0.13)",
              title: "Monthly cashflow forecast",
              body: "Bar chart showing your expected USD unlock value month-by-month across all tokens and protocols.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
              color: "#0369a1", bg: "rgba(3,105,161,0.07)", border: "rgba(3,105,161,0.13)",
              title: "P&L tracker",
              body: "Log your purchase price and individual sales. Vestream splits your P&L into realized and unrealized — all stored locally.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
              color: "#b45309", bg: "rgba(180,83,9,0.07)", border: "rgba(180,83,9,0.13)",
              title: "CSV &amp; PDF export",
              body: "Download a full CSV of vesting positions and sell transactions — or print a PDF report — directly from the dashboard.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl p-5 transition-all duration-200 hover:shadow-md"
              style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                style={{ background: f.bg, border: `1px solid ${f.border}`, color: f.color }}>
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "#0f172a" }} dangerouslySetInnerHTML={{ __html: f.title }} />
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Search feature ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
          {/* Text */}
          <div className="flex-1 md:max-w-[420px]">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.14)", color: "#2563eb" }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
              Find every vesting in one search
            </h2>
            <p className="text-base leading-relaxed mb-7" style={{ color: "#64748b" }}>
              Enter any wallet address and Vestream simultaneously scans every integrated protocol across all supported chains — returning every active vesting in seconds. No switching between platforms, no missed positions.
            </p>
            <ul className="flex flex-col gap-3.5">
              {[
                "7 protocols scanned simultaneously",
                "Ethereum, Base, BNB Chain & Polygon",
                "Results surface in under 3 seconds",
              ].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm font-medium" style={{ color: "#0f172a" }}>
                  <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb" }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          {/* Mockup */}
          <div className="flex-1 w-full rounded-2xl p-5 md:p-6" style={{ background: "#0d0f14", border: "1px solid #1e2330", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            {/* Search bar */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl mb-4" style={{ background: "#141720", border: "1px solid #2a3040" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span style={{ color: "#6b7280", fontSize: 12, fontFamily: "monospace" }}>0x3f5CE...8b2e</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-md font-semibold" style={{ background: "rgba(37,99,235,0.18)", color: "#60a5fa" }}>Scan all</span>
            </div>
            {/* Result rows */}
            {[
              { protocol: "Sablier",    chain: "Base",       token: "NOVA", amount: "12,500", color: "#f97316" },
              { protocol: "Hedgey",     chain: "Ethereum",   token: "FLUX", amount: "4,200",  color: "#3b82f6" },
              { protocol: "UNCX",       chain: "BNB Chain",  token: "VEST", amount: "8,750",  color: "#f59e0b" },
              { protocol: "Superfluid", chain: "Polygon",    token: "KLAR", amount: "3,100",  color: "#1db954" },
              { protocol: "PinkSale",   chain: "BNB Chain",  token: "NOVA", amount: "5,000",  color: "#ec4899" },
            ].map((r) => (
              <div key={r.protocol + r.token} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl mb-2"
                style={{ background: "#141720", border: "1px solid #1e2330" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold"
                  style={{ background: r.color, fontSize: 10 }}>{r.protocol[0]}</div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: "white", fontSize: 12, fontWeight: 600 }}>{r.protocol}</p>
                  <p style={{ color: "#6b7280", fontSize: 11 }}>{r.chain}</p>
                </div>
                <div className="text-right">
                  <p style={{ color: "#34d399", fontSize: 12, fontWeight: 600 }}>{r.amount} {r.token}</p>
                </div>
              </div>
            ))}
            <p className="text-center mt-3" style={{ color: "#4b5563", fontSize: 11 }}>5 vestings found across 7 protocols</p>
          </div>
        </div>
      </section>

      {/* ── Token Vesting Explorer ───────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row-reverse items-center gap-10 md:gap-16">
          {/* Text */}
          <div className="flex-1 md:max-w-[420px]">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.14)", color: "#0891b2" }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
              See who else is vesting your token
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "#64748b" }}>
              Search any token and see the complete global picture — every wallet, every protocol, every upcoming unlock. Large unlock events create selling pressure. Spotting a cluster 30 days out lets you hedge, hold, or exit with conviction — not guesswork.
            </p>
          </div>
          {/* Mockup */}
          <div className="flex-1 w-full rounded-2xl p-5 md:p-6" style={{ background: "#0d0f14", border: "1px solid #1e2330", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p style={{ color: "white", fontSize: 13, fontWeight: 700 }}>NOVA — All Vestings</p>
                <p style={{ color: "#6b7280", fontSize: 11 }}>Global unlock schedule</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                47.2M NOVA in 14d
              </span>
            </div>
            {/* Wallet rows */}
            {[
              { wallet: "0x1a4c...f2d8", protocol: "Sablier", unlock: "14 days", amount: "12.5M NOVA", pct: 82 },
              { wallet: "0x9b2e...c401", protocol: "Hedgey", unlock: "21 days", amount: "8.1M NOVA", pct: 54 },
              { wallet: "0x5f7a...3c9e", protocol: "UNCX", unlock: "30 days", amount: "6.4M NOVA", pct: 42 },
              { wallet: "0x2d8b...a71f", protocol: "Sablier", unlock: "45 days", amount: "20.2M NOVA", pct: 100 },
            ].map((w) => (
              <div key={w.wallet} className="mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: "#9ca3af", fontSize: 11, fontFamily: "monospace" }}>{w.wallet}</span>
                    <span style={{ color: "#4b5563", fontSize: 10, background: "#1e2330", padding: "1px 6px", borderRadius: 4 }}>{w.protocol}</span>
                  </div>
                  <div className="text-right">
                    <span style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 600 }}>{w.amount}</span>
                    <span style={{ color: "#6b7280", fontSize: 10, marginLeft: 6 }}>{w.unlock}</span>
                  </div>
                </div>
                <div className="h-1 rounded-full" style={{ background: "#1e2330" }}>
                  <div className="h-1 rounded-full" style={{ width: `${w.pct}%`, background: "linear-gradient(90deg, #0891b2, #2563eb)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mobile app ──────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="rounded-3xl overflow-hidden relative flex flex-col md:flex-row items-center gap-8 md:gap-0 p-8 md:p-12"
          style={{ background: "linear-gradient(135deg, #312e81 0%, #4c1d95 50%, #1e3a8a 100%)", border: "1px solid rgba(167,139,250,0.25)" }}>

          {/* Gradient glow */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 55% 60% at 85% 50%, rgba(167,139,250,0.2) 0%, transparent 70%)",
          }} />

          {/* Text */}
          <div className="relative flex-1 md:pr-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-5"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
              Available on iOS &amp; Android
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Your vestings, in your pocket
            </h2>
            <p className="text-base leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.8)" }}>
              The Vestream mobile app tracks every token unlock in real time — and sends push notifications to your phone the moment a claim is ready.
            </p>
            <p className="text-sm leading-relaxed mb-8" style={{ color: "rgba(255,255,255,0.55)" }}>
              Sign up for early access to the web dashboard — the mobile app is included with your account.
            </p>
            <ul className="flex flex-col gap-3.5">
              {[
                "Native push notifications for every unlock",
                "Full portfolio view, calendar & alerts on mobile",
                "Web dashboard for deep analysis, exports & P&L",
              ].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
                  <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* iPhone illustration */}
          <div className="relative flex-shrink-0">
            <svg width={150} height={310} viewBox="0 0 150 310" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="iconGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#2563eb"/>
                  <stop offset="1" stopColor="#7c3aed"/>
                </linearGradient>
              </defs>
              {/* Phone body */}
              <rect x="4" y="4" width="142" height="302" rx="26" fill="#1a1625" stroke="rgba(167,139,250,0.45)" strokeWidth="1.5"/>
              {/* Side button (right) */}
              <rect x="146" y="95" width="3" height="38" rx="1.5" fill="rgba(167,139,250,0.3)"/>
              {/* Volume buttons (left) */}
              <rect x="1" y="84" width="3" height="22" rx="1.5" fill="rgba(167,139,250,0.3)"/>
              <rect x="1" y="114" width="3" height="22" rx="1.5" fill="rgba(167,139,250,0.3)"/>
              {/* Screen */}
              <rect x="10" y="10" width="130" height="290" rx="20" fill="#0d0f14"/>
              {/* Dynamic Island */}
              <rect x="51" y="17" width="48" height="12" rx="6" fill="#1a1625"/>
              {/* App bar */}
              <rect x="10" y="40" width="130" height="34" fill="#141720"/>
              {/* App icon — V-path mark */}
              <rect x="18" y="47" width="20" height="20" rx="5" fill="url(#iconGrad)"/>
              {/* Left arm (solid) */}
              <line x1="22" y1="52" x2="28" y2="62" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              {/* Ghost right arm */}
              <line x1="28" y1="62" x2="34" y2="52" stroke="white" strokeWidth="0.8" strokeLinecap="round" strokeOpacity="0.2"/>
              {/* Valley glow */}
              <circle cx="28" cy="62" r="3.5" fill="white" fillOpacity="0.12"/>
              {/* Valley dot */}
              <circle cx="28" cy="62" r="1.7" fill="white"/>
              {/* Future dots */}
              <circle cx="30" cy="59.5" r="1.3" fill="white" fillOpacity="0.75"/>
              <circle cx="32" cy="57" r="1" fill="white" fillOpacity="0.45"/>
              <circle cx="34" cy="54.5" r="0.7" fill="white" fillOpacity="0.22"/>
              {/* App title */}
              <text x="42" y="60" fontSize="10.5" fontWeight="700" fill="white" fontFamily="system-ui">Vestream</text>
              {/* Notification banner */}
              <rect x="14" y="82" width="122" height="46" rx="10" fill="#201c40" stroke="rgba(167,139,250,0.28)" strokeWidth="1"/>
              {/* Bell icon background */}
              <rect x="21" y="89" width="22" height="22" rx="7" fill="rgba(124,58,237,0.45)"/>
              {/* Bell SVG path */}
              <path d="M32 92.5c-2.2 0-4 1.8-4 4v.8c-.8.4-1 1-1 1.7h10c0-.7-.2-1.3-1-1.7v-.8c0-2.2-1.8-4-4-4z" fill="white" fillOpacity="0.9"/>
              <path d="M30.5 99h3a1.5 1.5 0 0 1-3 0z" fill="white" fillOpacity="0.9"/>
              {/* Notification text */}
              <text x="49" y="98" fontSize="8" fontWeight="700" fill="white" fontFamily="system-ui">Token Unlock</text>
              <text x="49" y="109" fontSize="7" fill="rgba(255,255,255,0.6)" fontFamily="system-ui">NOVA · 12,500 ready to claim</text>
              <text x="128" y="98" fontSize="6.5" fill="#c4b5fd" textAnchor="end" fontFamily="system-ui">now</text>
              {/* Divider */}
              <line x1="14" y1="142" x2="136" y2="142" stroke="#1e2330" strokeWidth="1"/>
              {/* Section label */}
              <text x="14" y="157" fontSize="7.5" fontWeight="600" fill="rgba(255,255,255,0.3)" fontFamily="system-ui" letterSpacing="1">PORTFOLIO</text>
              {/* Portfolio rows */}
              {[
                { y: 178, label: "NOVA", val: "$4,218", color: "#f97316" },
                { y: 206, label: "FLUX", val: "$1,840", color: "#3b82f6" },
                { y: 234, label: "VEST", val: "$920",   color: "#10b981" },
              ].map(r => (
                <g key={r.label}>
                  <rect x="14" y={r.y - 14} width="122" height="22" rx="8" fill="#141720"/>
                  <circle cx="28" cy={r.y - 3} r="6.5" fill={r.color + "28"}/>
                  <text x="28" y={r.y} fontSize="7" fontWeight="700" fill={r.color} textAnchor="middle">{r.label[0]}</text>
                  <text x="41" y={r.y} fontSize="8" fontWeight="600" fill="white" fontFamily="system-ui">{r.label}</text>
                  <text x="128" y={r.y} fontSize="8" fontWeight="700" fill="#34d399" textAnchor="end" fontFamily="system-ui">{r.val}</text>
                </g>
              ))}
              {/* Home indicator */}
              <rect x="55" y="295" width="40" height="4" rx="2" fill="rgba(255,255,255,0.15)"/>
            </svg>
          </div>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#94a3b8" }}>Built for</p>
          <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>
            Who uses Vestream?
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "#64748b" }}>
            Token vesting spans multiple protocols, chains, and wallets. We make it simple for anyone with tokens on a schedule.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
              color: "#2563eb", bg: "rgba(37,99,235,0.07)", border: "rgba(37,99,235,0.12)",
              audience: "Investors & Community Members",
              description: "You hold token allocations from projects you backed or contributed to. Whether you're a retail investor, community participant, or early supporter, you shouldn't need to read smart contracts to know when you can claim.",
              bullets: ["Check claimable balance across every major protocol in seconds", "See exact unlock dates — cliff events, streaming rates, tranches", "Get notified before every unlock event by email"],
            },
            {
              icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
              color: "#059669", bg: "rgba(5,150,105,0.07)", border: "rgba(5,150,105,0.12)",
              audience: "Advisors & Contributors",
              description: "You've worked with multiple projects and hold token grants across different wallets and protocols. Manually checking each protocol dashboard every month isn't a system.",
              bullets: ["All your vesting grants in one unified view — across any wallet", "Label each wallet and add notes to stay organised", "Export to CSV for your accountant or tax records"],
            },
            {
              icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
              color: "#7c3aed", bg: "rgba(124,58,237,0.07)", border: "rgba(124,58,237,0.12)",
              audience: "VCs & Funds",
              description: "Your portfolio spans dozens of projects, chains, and wallets. Missing a liquidity event or miscalculating claimable balances isn't an option — you need a system that scales.",
              bullets: ["Track every portfolio wallet and token allocation in one place", "Real-time claimable value with entry price and P&L tracking", "Bulk CSV export for compliance, LP reporting, and audit trails"],
            },
          ].map((card) => (
            <div key={card.audience} className="rounded-2xl p-6"
              style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: card.bg, border: `1px solid ${card.border}`, color: card.color }}>
                {card.icon}
              </div>
              <h3 className="text-base font-bold mb-2.5" style={{ color: "#0f172a" }}>{card.audience}</h3>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "#64748b" }}>{card.description}</p>
              <ul className="space-y-2">
                {card.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm" style={{ color: "#475569" }}>
                    <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: card.bg, color: card.color }}>
                      <svg width={9} height={9} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── B2B / Developer callout ─────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden px-6 md:px-12 py-12 md:py-16"
          style={{ background: "linear-gradient(135deg, #0d1b35 0%, #0d0f14 100%)", border: "1px solid rgba(99,102,241,0.25)" }}>
          {/* Atmospheric bloom */}
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(99,102,241,0.20) 0%, transparent 70%)" }} />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)" }} />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-5"
                style={{ background: "rgba(99,102,241,0.12)", borderColor: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
                For developers &amp; AI agents
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white" style={{ letterSpacing: "-0.02em" }}>
                The vesting data layer for&nbsp;builders
              </h2>
              <p className="text-base mb-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                Every stream across 7 protocols and 4 chains, normalised behind one REST API and an MCP server.
                Power claim bots, portfolio agents, compliance dashboards, or embed unlock data in your own product.
              </p>
              <div className="flex flex-wrap gap-3 mb-8">
                <Link href="/developer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}>
                  Developer API →
                </Link>
                <Link href="/ai" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "#c7d2fe" }}>
                  MCP for AI agents →
                </Link>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
                  REST + MCP
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#60a5fa" }} />
                  7 protocols · 4 chains
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#a855f7" }} />
                  Cross-protocol normalisation
                </span>
              </div>
            </div>

            {/* Code snippet */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "#0a0d13", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444" }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#f59e0b" }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#10b981" }} />
                <span className="text-xs ml-2" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>vestings.sh</span>
              </div>
              <pre className="px-5 py-4 text-xs overflow-x-auto" style={{ color: "#e2e8f0", fontFamily: "monospace", lineHeight: 1.7 }}>
<span style={{ color: "#64748b" }}># All streams for a wallet — cross-chain, cross-protocol</span>{"\n"}
<span style={{ color: "#c084fc" }}>curl</span> https://api.vestream.io/v1/wallet/\{"\n"}
  <span style={{ color: "#60a5fa" }}>0x3f5CE...8b2e</span>/vestings \{"\n"}
  -H <span style={{ color: "#fbbf24" }}>&quot;Authorization: Bearer vstr_live_...&quot;</span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#94a3b8" }}>Simple by design</p>
          <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>
            Up and running in 60 seconds
          </h2>
          <p className="text-base" style={{ color: "#64748b" }}>No sign-up forms. No email verification. No KYC.</p>
        </div>

        <div className="relative">
          <div className="absolute top-8 left-[calc(16.67%+16px)] right-[calc(16.67%+16px)] h-px hidden md:block"
            style={{ background: "linear-gradient(90deg, rgba(37,99,235,0.2), rgba(124,58,237,0.2))" }} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01", color: "#2563eb", bg: "rgba(37,99,235,0.08)", border: "rgba(37,99,235,0.18)",
                title: "Connect your wallet",
                body: "Click \"Launch App\" and sign a message with your Ethereum wallet. No password, no account, no personal data required.",
                icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
              },
              {
                step: "02", color: "#7c3aed", bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.18)",
                title: "Add wallets to track",
                body: "Paste any Ethereum address — yours, your team's, or an investor's. Track as many wallets as you need with optional labels.",
                icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
              },
              {
                step: "03", color: "#059669", bg: "rgba(5,150,105,0.08)", border: "rgba(5,150,105,0.18)",
                title: "Never miss an unlock",
                body: "Your full vesting timeline appears instantly. Enable email alerts and Vestream will notify you before every token unlock event.",
                icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
              },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
                    {s.icon}
                  </div>
                  <div className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: s.color }}>
                    {s.step.replace("0", "")}
                  </div>
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: "#0f172a" }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#94a3b8" }}>Got questions</p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>Frequently asked</h2>
        </div>

        <div className="space-y-3">
          {[
            {
              q: "Do I need to connect a wallet to use Vestream?",
              a: "No — you can explore the full dashboard with mock data right now, no wallet required. To track your real vesting positions you'll sign in with your Ethereum wallet using SIWE (Sign-In with Ethereum). It's a single cryptographic signature, not a transaction.",
            },
            {
              q: "Can Vestream access or move my funds?",
              a: "Never. Vestream is strictly read-only. We only read publicly available on-chain data — we never request your private key, can't initiate transactions, and have no ability to move tokens. Your wallet is used solely to prove identity.",
            },
            {
              q: "Which protocols and chains are supported?",
              a: "Vestream supports Sablier (linear & tranched streaming), Hedgey (vesting plans), UNCX Network (locker & VestingManager), Unvest, Team Finance, Superfluid (streaming vesting), and PinkSale (PinkLock V2) — on Ethereum, Base, BSC, and Polygon. Ethereum Sepolia is supported for testing. More protocols and chains on the roadmap.",
            },
            {
              q: "How do unlock notifications work?",
              a: "Enable email alerts in Settings and enter your email. Vestream checks hourly for upcoming unlocks across all your tracked wallets, and emails you a configurable window before each event (1 hour to 3 days). You can unsubscribe at any time.",
            },
            {
              q: "What is the P&L Tracker?",
              a: "The P&L Tracker lets you log your token purchase price (entry price) and any individual sales — date, token amount, and sell price or total USD received. Vestream automatically splits your P&L into realized (already sold) and unrealized (remaining vesting tokens at current market price). All data is stored locally in your browser — nothing is sent to any server.",
            },
            {
              q: "Can I export my data?",
              a: "Yes. From the Export button in the dashboard header you can download a CSV file (opens in Excel or Google Sheets) containing all your vesting positions, stream details, and sell transaction history. You can also print a PDF report using your browser's built-in print-to-PDF feature.",
            },
            {
              q: "How accurate are the token prices?",
              a: "Prices are fetched live from DexScreener, using the highest-volume trading pair for each token. Market cap and FDV figures match DexScreener's own display. For tokens with no DEX listing (e.g. testnet tokens), prices show as unavailable and the tracker falls back to raw token amounts.",
            },
            {
              q: "Can I track wallets that aren't mine?",
              a: "Yes. You can add any Ethereum address to your dashboard — useful for tracking team vesting wallets, investor allocations, or advisor grants. All data is public on-chain. You authenticate once with your own wallet, then track as many addresses as you need.",
            },
            {
              q: "Is Vestream free to use?",
              a: "Yes — the Free plan includes 1 wallet, auto-scanned across every supported chain and platform, plus 3 free push alerts so you can try the unlock notifications. Upgrade to Pro ($7.99/mo) for 3 wallets and unlimited push + email alerts, or contact us for Enterprise if you're a fund, team, or building on our data.",
            },
            {
              q: "Do you have an API for developers and AI agents?",
              a: "Yes. The Vestream REST API and our @vestream/mcp MCP server give you programmatic access to the same vesting data that powers the dashboard — cross-protocol, cross-chain, real-time. See the Developer page or contact us about Enterprise access.",
            },
          ].map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-6"
            style={{ background: "rgba(37,99,235,0.06)", borderColor: "rgba(37,99,235,0.2)", color: "#2563eb" }}>
            Simple, transparent pricing
          </div>
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>
            Start free. Scale when you&apos;re ready.
          </h2>
          <p className="text-base" style={{ color: "#64748b" }}>
            From solo investors to investment funds — a plan for every stage.
          </p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mb-12">
          {/* Free */}
          <div className="rounded-2xl p-7" style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>Free</p>
            <p className="text-3xl font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>$0</p>
            <p className="text-sm mb-6" style={{ color: "#64748b" }}>Free forever. No credit card needed.</p>
            <Link href="/early-access" className="flex items-center justify-center w-full py-2.5 rounded-xl text-sm font-semibold transition-all mb-6"
              style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", color: "#2563eb" }}>
              Start free →
            </Link>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              {["1 wallet — auto-scanned across all chains", "All 7 vesting platforms", "Real-time vesting dashboard", "Claimable balance tracking", "Unlock calendar", "3 free push alerts (lifetime)"].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "#374151" }}>
                  <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#2563eb" fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro (featured) */}
          <div className="relative rounded-2xl p-7" style={{ background: "white", border: "2px solid #2563eb", boxShadow: "0 8px 32px rgba(37,99,235,0.18), 0 4px 12px rgba(0,0,0,0.08)" }}>
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 12px rgba(37,99,235,0.4)" }}>
                Most popular
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#2563eb" }}>Pro</p>
            <p className="text-3xl font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
              $7.99<span className="text-base font-semibold" style={{ color: "#64748b" }}>/mo</span>
            </p>
            <p className="text-sm mb-6" style={{ color: "#64748b" }}>For active holders who want every unlock on their radar.</p>
            <Link href="/pricing" className="flex items-center justify-center w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all mb-6"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}>
              Get Pro →
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Everything in Free, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              {["3 wallet addresses", "Unlimited push alerts", "Email unlock alerts", "Token Vesting Explorer (Discover)", "Priority data refresh (60s)", "CSV & PDF export"].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "#374151" }}>
                  <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#2563eb" fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Enterprise (replaces Fund self-serve) */}
          <div className="relative rounded-2xl p-7" style={{ background: "#0d0f14", border: "1px solid rgba(99,102,241,0.3)", boxShadow: "0 4px 40px rgba(37,99,235,0.18), 0 24px 64px rgba(0,0,0,0.16)" }}>
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 4px 12px rgba(99,102,241,0.4)" }}>
                Funds, teams &amp; builders
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#6366f1" }}>Enterprise</p>
            <p className="text-3xl font-bold mb-1 text-white" style={{ letterSpacing: "-0.02em" }}>Custom</p>
            <p className="text-sm mb-6" style={{ color: "#9ca3af" }}>Built around your team — pricing on request.</p>
            <ContactTrigger
              label="Contact us →"
              className="flex items-center justify-center w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all mb-6"
              style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 4px 16px rgba(99,102,241,0.35)", border: "none", cursor: "pointer" }}
            />
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#4b5563" }}>Everything in Pro, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              {["Unlimited wallet addresses", "REST API + MCP server access", "Team workspace", "SSO & custom SLA", "Slack, Telegram & WhatsApp alerts", "Dedicated support channel"].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "#e5e7eb" }}>
                  <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#10b981" fillOpacity={0.15}/><path d="M5 8l2 2 4-4" stroke="#10b981" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* B2B / developer nudge */}
        <p className="text-center text-sm mt-4 mb-8" style={{ color: "#64748b" }}>
          Building on Vestream data?{" "}
          <Link href="/developer" className="font-semibold" style={{ color: "#2563eb" }}>
            See the Developer API →
          </Link>
        </p>

        {/* Comparison table */}
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
          <div className="grid grid-cols-4 px-6 py-4" style={{ background: "#f1f5f9", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#94a3b8" }}>Feature</span>
            <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#94a3b8" }}>Free</span>
            <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#2563eb" }}>Pro</span>
            <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#6366f1" }}>Enterprise</span>
          </div>
          {([
            ["Wallet addresses",           "1",              "3 wallets",    "Unlimited"],
            ["Auto-scan all chains",       true,             true,           true],
            ["Real-time dashboard",        true,             true,           true],
            ["Claimable balance tracking", true,             true,           true],
            ["Unlock calendar",            true,             true,           true],
            ["Push notifications",         "3 lifetime",     "Unlimited",    "Unlimited"],
            ["Email alerts",               false,            true,           true],
            ["Token Vesting Explorer",     false,            true,           true],
            ["CSV & PDF export",           false,            true,           true],
            ["REST API + MCP server",      false,            false,          true],
            ["Team workspace",             false,            false,          true],
            ["SSO & custom SLA",           false,            false,          true],
            ["Support",                    false,            "Ticketing",    "Dedicated"],
          ] as [string, string | boolean, string | boolean, string | boolean][]).map(([feature, free, pro, fund], i, arr) => (
            <div key={feature} className="grid grid-cols-4 px-6 py-3.5 items-center"
              style={{ borderBottom: i < arr.length - 1 ? "1px solid rgba(0,0,0,0.05)" : undefined, background: i % 2 === 0 ? "white" : "rgba(248,250,252,0.6)" }}>
              <span className="text-sm" style={{ color: "#374151" }}>{feature}</span>
              {([free, pro, fund] as (string | boolean)[]).map((val, j) => (
                <div key={j} className="flex justify-center">
                  {typeof val === "boolean" ? (
                    val
                      ? <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill={j === 2 ? "#10b981" : "#2563eb"} fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke={j === 2 ? "#10b981" : "#2563eb"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#94a3b8" fillOpacity={0.08}/><path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ) : (
                    <span className="text-xs font-semibold text-center" style={{ color: j === 0 ? "#374151" : j === 1 ? "#2563eb" : "#6366f1" }}>{val}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 md:pb-32 flex flex-col items-center text-center">
        <div className="relative max-w-2xl w-full rounded-3xl overflow-hidden px-6 md:px-10 py-12 md:py-16"
          style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(147,197,253,0.12) 0%, transparent 70%)" }} />
          <div className="absolute -left-8 bottom-0 w-48 h-48 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(167,139,250,0.12) 0%, transparent 70%)" }} />
          <h2 className="relative text-3xl font-bold text-white mb-3" style={{ letterSpacing: "-0.02em" }}>Be the first in.</h2>
          <p className="relative text-base mb-8" style={{ color: "rgba(255,255,255,0.55)" }}>
            Vestream is launching soon. Register your interest and we&apos;ll reach out as soon as early access opens.
          </p>
          <div className="relative flex justify-center w-full">
            <WaitlistForm dark />
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="px-4 md:px-8 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
        <p className="text-xs" style={{ color: "#94a3b8" }}>© 2026 Vestream. All rights reserved.</p>
        <div className="flex items-center gap-4 md:gap-5 flex-wrap">
          <Link href="/developer" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Developer API</Link>
          <Link href="/ai" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>AI Agents</Link>
          <Link href="/resources" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Resources</Link>
          <Link href="/privacy" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Privacy Policy</Link>
          <Link href="/terms"   className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Terms of Service</Link>
          <Link href="/admin"   className="text-xs transition-colors hover:opacity-60" style={{ color: "rgba(148,163,184,0.3)" }} title="Admin">·</Link>
        </div>
      </footer>

    </div>
  );
}

// ─── FAQItem ──────────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border overflow-hidden"
      style={{ background: "white", borderColor: "rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none select-none"
        style={{ color: "#0f172a" }}>
        <span className="text-sm font-semibold">{q}</span>
        <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all group-open:rotate-180"
          style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}>
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="px-6 pb-5 pt-1">
        <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{a}</p>
      </div>
    </details>
  );
}
