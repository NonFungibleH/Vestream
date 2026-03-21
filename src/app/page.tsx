import Link from "next/link";
import { WaitlistForm } from "@/components/WaitlistForm";
import { SiteNav } from "@/components/SiteNav";

export default function Home() {
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
        <div className="relative flex items-center gap-3 mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#b45309" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#f59e0b" }} />
            Beta Testing
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
          Vestream is the <strong style={{ color: "#334155" }}>data layer for your vesting positions</strong> — aggregating
          real-time streams from every major protocol into one unified dashboard.
        </p>
        <p className="relative text-base max-w-xl mb-10 leading-relaxed" style={{ color: "#94a3b8" }}>
          Track unlocks, analyse P&amp;L, set email alerts, and export clean reports. All in one place.
        </p>

        <div className="relative flex flex-col items-center gap-3 w-full">
          <WaitlistForm />
        </div>

        {/* Protocol strip */}
        <div className="relative mt-14">
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-4 text-center" style={{ color: "#94a3b8" }}>Integrated with</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {[
              { name: "Sablier",      color: "#f97316", bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.15)"  },
              { name: "Hedgey",       color: "#3b82f6", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.15)"  },
              { name: "UNCX",         color: "#f59e0b", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.15)"  },
              { name: "Team Finance", color: "#10b981", bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.15)"  },
              { name: "Unvest",       color: "#06b6d4", bg: "rgba(6,182,212,0.07)",   border: "rgba(6,182,212,0.15)"   },
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
              { name: "Sepolia",   color: "#94a3b8", bg: "rgba(148,163,184,0.07)", border: "rgba(148,163,184,0.16)"  },
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
              body: "Real-time positions pulled directly from Sablier, Hedgey, UNCX, and Unvest — across Ethereum, Base, BSC, and Polygon.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
              color: "#7c3aed", bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.14)",
              title: "Unlock alerts",
              body: "Get emailed before every token unlock so you never leave claimable tokens sitting on the table.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
              color: "#059669", bg: "rgba(5,150,105,0.08)", border: "rgba(5,150,105,0.14)",
              title: "Multi-chain dashboard",
              body: "Ethereum, Base, BSC, and Polygon in one view. Filter by token, protocol, or wallet with a single click.",
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
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
              color: "#0891b2", bg: "rgba(8,145,178,0.07)", border: "rgba(8,145,178,0.13)",
              title: "Token Vesting Explorer",
              body: "See every wallet vesting a token globally — not just yours. Understand the full unlock schedule and selling pressure before it hits.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.35-4.35"/><circle cx="11" cy="11" r="6"/><path d="M11 8v6M8 11h6"/></svg>,
              color: "#0d9488", bg: "rgba(13,148,136,0.07)", border: "rgba(13,148,136,0.13)",
              title: "Find hidden vestings",
              body: "Forgotten which protocol holds your allocation? One-click scan across all 6 platforms and 3 chains automatically surfaces every active vesting and configures Vestream to watch only what matters.",
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
              a: "Vestream supports Sablier (streaming), Hedgey (vesting plans), UNCX Network (locker & VestingManager), and Unvest — on Ethereum, Base, BSC, and Polygon. Ethereum Sepolia and Base Sepolia are supported for testing. More chains on the roadmap.",
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
              a: "The core dashboard is free. Pro and Fund tiers (coming soon) will unlock additional tracked wallets, priority support, and advanced reporting. If you're a fund or protocol managing large vesting programmes, get in touch.",
            },
          ].map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
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
        <div className="flex items-center gap-5">
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
