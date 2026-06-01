import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { AppStoreBadges } from "@/components/AppStoreBadges";

// ─────────────────────────────────────────────────────────────────────────────
// /invest — Vestream Invest landing page.
//
// Audience: token holders / investors / founders / contributors waiting on
// vesting cliffs, TGE unlocks, linear releases. The dollar-per-event mental
// model. Pairs with the "Vestream Invest" mode in the mobile app — same
// naming, same promise, separate funnel.
//
// SEO target: queries like "track token vesting", "vesting unlock alerts",
// "$NOVA cliff date tracker", "Sablier vesting tracker", "Hedgey unlock
// calendar". Distinct from /payroll which targets streaming-payment
// queries ("crypto payroll tracker", "LlamaPay alerts").
//
// Conversion path:
//   landing → /find-vestings → results page (with sticky app CTA) →
//   App Store / Play Store. Same funnel as the homepage but with messaging
//   pre-targeted to the investor audience, so the in-results CTAs land on
//   a user already primed for that mental model.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       "Vestream Invest — Track every token vesting unlock you're owed",
  description: "Watch every token vesting unlock you're owed across 9 protocols and 7 chains. Push alerts the second a cliff hits, one-tap claim links, tax-ready exports. Free.",
  alternates:  { canonical: "https://www.vestream.io/invest" },
  openGraph: {
    title:       "Vestream Invest — Track every vesting unlock",
    description: "9 protocols. 7 chains. One inbox for every cliff, TGE and linear unlock you're entitled to.",
    type:        "website",
    url:         "https://www.vestream.io/invest",
  },
};

const PROTOCOLS = [
  { name: "Sablier",      tagline: "Linear + tranched vesting" },
  { name: "Hedgey",       tagline: "NFT-based vesting plans"   },
  { name: "UNCX",         tagline: "Token vesting + LP locks"  },
  { name: "Unvest",       tagline: "Step / milestone vesting"  },
  { name: "PinkSale",     tagline: "Launchpad TGE locks"       },
  { name: "Streamflow",   tagline: "Solana vesting"            },
  { name: "Jupiter Lock", tagline: "Solana team allocations"   },
];

export default function InvestLanding() {
  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <SiteNav theme="light" />

      <main className="pt-24 md:pt-28 pb-16 md:pb-24">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", color: "#2563eb" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#2563eb" }} />
            Vestream Invest
          </div>
          <h1
            className="font-bold mb-5"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              color: "#0f172a",
            }}
          >
            Never miss another <br className="hidden md:inline" /> token unlock.
          </h1>
          <p
            className="max-w-2xl text-base md:text-lg mb-8"
            style={{ color: "#475569", lineHeight: 1.6 }}
          >
            Vestream tracks every cliff, TGE and linear unlock you&rsquo;re owed across nine vesting protocols and seven chains. Push alerts to your phone the second something unlocks. One-tap claim links straight to the protocol. Tax-ready CSV at year-end.
          </p>

          {/* Primary funnel CTA */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Link
              href="/find-vestings"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm md:text-base"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: "white",
                boxShadow: "0 6px 20px rgba(37,99,235,0.30)",
              }}
            >
              Find my vestings →
            </Link>
            <span className="text-sm" style={{ color: "#64748b" }}>
              Free · paste a wallet · no signup
            </span>
          </div>

          <p className="text-xs" style={{ color: "#94a3b8" }}>
            Or browse{" "}
            <Link href="/protocols" className="underline" style={{ color: "#475569" }}>
              every supported protocol
            </Link>
            {" · "}
            <Link href="/payroll" className="underline" style={{ color: "#475569" }}>
              looking for crypto payroll instead?
            </Link>
          </p>
        </section>

        {/* ── Three value bullets ─────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 mt-16 md:mt-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[
              {
                icon: "🔔",
                title: "Alerts the second it unlocks",
                body:  "Push notification + email the moment any of your tokens releases. Set it once; we'll watch every chain forever.",
              },
              {
                icon: "🔗",
                title: "One-tap claim",
                body:  "We can't claim for you (and we never see your keys), but we link straight into the protocol's claim UI so it's two taps from notification to claimed.",
              },
              {
                icon: "📑",
                title: "Tax-ready exports",
                body:  "Capital gains CSV in Koinly / CoinTracker / TurboTax format. Plus an annotated PDF of every unlock event for your accountant.",
              },
            ].map(b => (
              <div
                key={b.title}
                className="rounded-2xl p-6"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                <div className="text-3xl mb-3">{b.icon}</div>
                <h3 className="font-semibold mb-2" style={{ color: "#0f172a", fontSize: 18, letterSpacing: "-0.01em" }}>
                  {b.title}
                </h3>
                <p className="text-sm" style={{ color: "#64748b", lineHeight: 1.55 }}>
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Protocols indexed ──────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 mt-16 md:mt-24">
          <div className="text-center mb-8">
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#64748b" }}>
              Protocols indexed
            </div>
            <h2
              className="font-semibold"
              style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", letterSpacing: "-0.02em", color: "#0f172a" }}
            >
              Every major vesting protocol, in one inbox.
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PROTOCOLS.map(p => (
              <div
                key={p.name}
                className="rounded-xl p-4 text-center"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)" }}
              >
                <div className="font-semibold text-sm mb-1" style={{ color: "#0f172a" }}>{p.name}</div>
                <div className="text-xs" style={{ color: "#94a3b8" }}>{p.tagline}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs mt-4" style={{ color: "#94a3b8" }}>
            Across Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism and Solana.
          </p>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-4 md:px-8 mt-16 md:mt-24">
          <div
            className="rounded-3xl p-8 md:p-12 text-center"
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              boxShadow: "0 20px 50px rgba(15,23,42,0.20)",
            }}
          >
            <h3
              className="font-bold mb-3"
              style={{ color: "white", fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.02em" }}
            >
              Stop missing your unlocks.
            </h3>
            <p className="text-sm md:text-base max-w-xl mx-auto mb-6" style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
              Free to scan. Free to install. Pro upgrade only if you want unlimited wallets, the Discover page and tax exports.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mb-5">
              <Link
                href="/find-vestings"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
                style={{ background: "white", color: "#0f172a" }}
              >
                Find my vestings →
              </Link>
            </div>
            <AppStoreBadges />
          </div>
        </section>
      </main>

      <SiteFooter theme="light" />
    </div>
  );
}
