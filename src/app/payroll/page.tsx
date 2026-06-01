import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { AppStoreBadges } from "@/components/AppStoreBadges";

// ─────────────────────────────────────────────────────────────────────────────
// /payroll — Vestream for crypto payroll recipients.
//
// Audience: DAO contributors, remote workers, contractors paid via Sablier
// Flow, LlamaPay, or Superfluid. The "payroll brand" is now backed by real
// protocol support — these streams are already indexed and appear in the app
// alongside vesting positions.
//
// Updated 2026-06-01: removed "coming soon" framing. The feature is live.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       "Crypto Payroll Tracker — Sablier Flow, LlamaPay & Superfluid | Vestream",
  description: "Track your crypto salary in real time. Vestream indexes Sablier Flow, LlamaPay, and Superfluid streams so DAO contributors and crypto contractors see every accrued balance, upcoming stream end, and income export in one dashboard.",
  alternates:  { canonical: "https://www.vestream.io/payroll" },
  openGraph: {
    title:       "Crypto Payroll Tracker | Vestream",
    description: "One dashboard for your Sablier Flow, LlamaPay and Superfluid salary streams — live balances, alerts, and tax exports.",
    type:        "website",
    url:         "https://www.vestream.io/payroll",
  },
  robots: { index: true, follow: true },
};

const PROTOCOLS = [
  {
    name:    "Sablier Flow",
    color:   "#F0992E",
    bg:      "rgba(240,153,46,0.08)",
    border:  "rgba(240,153,46,0.22)",
    tagline: "Per-second streaming for salaries and grants",
    detail:  "Sablier Flow drips tokens continuously per second — the most common protocol for DAO contributor pay and payroll streams. Vestream shows your live accrued-but-unclaimed balance, next stream end date, and push alerts when your stream is about to expire.",
    href:    "/protocols/sablier-flow",
  },
  {
    name:    "LlamaPay",
    color:   "#A26B3F",
    bg:      "rgba(162,107,63,0.08)",
    border:  "rgba(162,107,63,0.22)",
    tagline: "Zero-fee payroll streaming across EVM chains",
    detail:  "LlamaPay is a favourite for teams that want minimal overhead on salary streams. Vestream indexes your incoming streams and surfaces the running claimable balance so you know exactly what's available without manually checking the protocol UI.",
    href:    "/protocols/llamapay",
  },
  {
    name:    "Superfluid",
    color:   "#28B895",
    bg:      "rgba(40,184,149,0.08)",
    border:  "rgba(40,184,149,0.22)",
    tagline: "Real-time money streams with cliff scheduling",
    detail:  "Superfluid's vesting scheduler wraps its streaming primitives with cliff + linear release — often used for team token allocations that also function as a streaming payroll. Vestream tracks both the cliff date and the running stream balance.",
    href:    "/protocols/superfluid",
  },
];

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title:  "Live accrued balance",
    body:   "See exactly how many tokens have streamed to you right now — not at the last claim, right now. Updates every time you open the app.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    title:  "Push alerts before it matters",
    body:   "Get notified before your stream runs dry or a cliff unlocks. Set alerts at 30d, 7d, 24h, or 1h out — you choose the cadence.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title:  "Unified unlock calendar",
    body:   "Your payroll streams and token vestings share one calendar. See salary drips, grant cliffs, and investor unlocks in the same view.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title:  "Tax-ready income exports",
    body:   "Export your streaming income as a Koinly or CoinTracker CSV, or as a Vestream income statement — with token symbol, date, and USD value at time of receipt.",
  },
];

export default function PayrollPage() {
  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <SiteNav theme="light" />

      <main className="pt-24 md:pt-28 pb-16 md:pb-24">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 md:px-8 text-center mb-16 md:mb-20">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
            style={{
              background: "rgba(28,184,184,0.08)",
              border: "1px solid rgba(28,184,184,0.25)",
              color: "#0F8A8A",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#1CB8B8" }} />
            Live now · iOS &amp; Android
          </div>

          <h1
            className="font-bold mb-5"
            style={{
              fontSize: "clamp(2.25rem, 4.5vw, 3.5rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              color: "#0f172a",
            }}
          >
            Your crypto payroll,<br className="hidden md:inline" />{" "}
            <span style={{ color: "#1CB8B8" }}>tracked in one place.</span>
          </h1>

          <p
            className="max-w-2xl mx-auto text-base md:text-lg mb-8"
            style={{ color: "#475569", lineHeight: 1.6 }}
          >
            Vestream tracks Sablier Flow, LlamaPay, and Superfluid streams for DAO contributors,
            crypto contractors, and remote workers — live accrued balance, push alerts, and
            tax-ready income exports. Free on iOS and Android.
          </p>

          <AppStoreBadges align="center" />
        </section>

        {/* ── Supported protocols ──────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 mb-16 md:mb-20">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
              Supported streaming protocols
            </p>
            <h2 className="text-2xl md:text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>
              Three payroll protocols, one dashboard
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {PROTOCOLS.map((p) => (
              <div
                key={p.name}
                className="rounded-2xl p-6"
                style={{
                  background: "white",
                  border: `1px solid ${p.border}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold mb-4"
                  style={{ background: p.bg, color: p.color }}
                >
                  {p.name.charAt(0)}
                </div>
                <h3 className="font-bold mb-1" style={{ color: "#0f172a" }}>{p.name}</h3>
                <p className="text-xs font-medium mb-3" style={{ color: p.color }}>{p.tagline}</p>
                <p className="text-sm leading-relaxed mb-4" style={{ color: "#64748b" }}>{p.detail}</p>
                <Link
                  href={p.href}
                  className="text-xs font-semibold"
                  style={{ color: p.color }}
                >
                  View {p.name} tracker →
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 mb-16 md:mb-20">
          <div
            className="rounded-3xl p-8 md:p-10"
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="text-center mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#1CB8B8" }}>
                What you get
              </p>
              <h2 className="text-2xl md:text-3xl font-bold" style={{ color: "white", letterSpacing: "-0.02em" }}>
                Built for how workers, not investors, think
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl p-5"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}
                  >
                    {f.icon}
                  </div>
                  <h3 className="font-semibold mb-1.5" style={{ color: "white" }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.60)" }}>{f.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-8 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
                Free for up to 3 wallets · Pro unlocks 10 wallets, unlimited alerts, web dashboard, and tax exports
              </p>
              <AppStoreBadges align="center" />
            </div>
          </div>
        </section>

        {/* ── Who it's for ─────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 md:px-8 mb-16 md:mb-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>
              Who uses Vestream Payroll
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: "DAO contributors",
                body:  "You work for a DAO that pays in tokens via Sablier or LlamaPay. You want to see your accrued balance and get a heads-up before the stream expires.",
              },
              {
                label: "Crypto contractors",
                body:  "You invoice in USDC or ETH and receive payment as a Superfluid stream. Vestream gives you an income statement at year-end — no spreadsheet needed.",
              },
              {
                label: "Grant recipients",
                body:  "Your foundation grant drips monthly over 24 months. Vestream tracks the cliff, the current balance, and each upcoming tranche in your calendar.",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl p-5"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                <div className="text-sm font-bold mb-2" style={{ color: "#1CB8B8" }}>{item.label}</div>
                <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-4 md:px-8 text-center">
          <p className="text-sm mb-6" style={{ color: "#64748b" }}>
            Tracking <strong style={{ color: "#0f172a" }}>vesting</strong> instead of payroll?{" "}
            <Link href="/invest" className="underline" style={{ color: "#2563eb" }}>
              Vestream Invest →
            </Link>
          </p>
        </section>

      </main>

      <SiteFooter theme="light" />
    </div>
  );
}
