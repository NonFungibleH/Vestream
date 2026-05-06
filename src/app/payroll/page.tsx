import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

// ─────────────────────────────────────────────────────────────────────────────
// /payroll — "TokenVest Payroll" coming-soon page.
//
// May 5 2026 strategy reset: investor TAM is 10x+ payroll TAM today, and
// the dual positioning was diluting the investor messaging that's actually
// converting. We're parking the Payroll product as a roadmap item and
// focusing the marketing surface on vesting.
//
// This page replaces the previous fully-fledged Payroll landing. Reasons
// to keep the URL alive (rather than 404 it):
//   1. Search engines have started crawling it. A 404 invalidates that
//      ranking; a coming-soon page preserves it AND captures intent from
//      anyone searching for "crypto payroll tracker" today, ready to
//      convert when we launch.
//   2. The footer continues to link here as "Payroll · Coming soon" — a
//      visible signal to existing users that we know about that audience
//      and have a roadmap for it.
//   3. The waitlist signup feeds an email list we'll mail when Payroll
//      launches. Free pre-launch acquisition.
//
// Sablier Flow / LlamaPay / Superfluid stream data continues to flow in
// the app — users with those streams see them alongside their vesting
// positions. The Payroll BRAND is what's parked, not the protocol
// support.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       "TokenVest Payroll — Coming soon",
  description: "Crypto payroll tracking for DAO contributors, contractors and remote workers. Sablier Flow, LlamaPay and Superfluid streams in one earnings dashboard. Coming soon — join the waitlist.",
  alternates:  { canonical: "/payroll" },
  openGraph: {
    title:       "TokenVest Payroll — Coming soon",
    description: "An earnings dashboard for crypto contractors. Join the waitlist.",
    type:        "website",
    url:         "https://www.vestream.io/payroll",
  },
  // Soft signal to search engines that this page isn't the priority
  // surface yet — they can index it for the roadmap intent but shouldn't
  // out-rank /invest or / for vesting queries.
  robots: { index: true, follow: true },
};

export default function PayrollComingSoon() {
  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <SiteNav theme="light" />

      <main className="pt-24 md:pt-28 pb-16 md:pb-24">
        <section className="max-w-3xl mx-auto px-4 md:px-8 text-center">
          {/* Status pill */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
            style={{
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.30)",
              color: "#b45309",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }} />
            On the roadmap
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
            TokenVest Payroll <br className="hidden md:inline" />
            is coming.
          </h1>

          <p
            className="max-w-2xl mx-auto text-base md:text-lg mb-10"
            style={{ color: "#475569", lineHeight: 1.6 }}
          >
            An earnings dashboard purpose-built for crypto contractors, DAO contributors and remote workers paid in tokens. We&rsquo;re finishing the investor product first; Payroll is next on the roadmap.
          </p>

          {/* Already-supported signal — the protocols still flow today,
              they're just not the headline product yet. */}
          <div
            className="rounded-2xl p-6 md:p-8 mb-10 text-left"
            style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
          >
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#64748b" }}>
              Already tracking
            </div>
            <p className="text-base mb-4" style={{ color: "#0f172a", lineHeight: 1.5 }}>
              If you receive <strong>Sablier Flow</strong>, <strong>LlamaPay</strong>, or <strong>Superfluid</strong> streams today, TokenVest already indexes them. They show up in your portfolio and calendar alongside your vesting positions.
            </p>
            <p className="text-sm" style={{ color: "#64748b", lineHeight: 1.5 }}>
              When Payroll launches as a dedicated product, you&rsquo;ll get earnings-rate views, gas-aware claim timing, and 1099-NEC / SA103 income exports — same data, framed for how workers think about it.
            </p>
          </div>

          {/* Waitlist CTA — feeds the existing /api/waitlist endpoint with
              a `source` flag we can filter on at launch time. */}
          <div
            className="rounded-2xl p-6 md:p-8 mb-10"
            style={{
              background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",
              boxShadow: "0 12px 32px rgba(6,78,59,0.20)",
            }}
          >
            <h2 className="text-xl md:text-2xl font-bold mb-2" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Want first access?
            </h2>
            <p className="text-sm md:text-base mb-5" style={{ color: "rgba(255,255,255,0.80)", lineHeight: 1.55 }}>
              Join the early-access list. We&rsquo;ll email you the day Payroll opens — no spam, no marketing in between.
            </p>
            <Link
              href="/early-access?source=payroll"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
              style={{ background: "white", color: "#065f46" }}
            >
              Join the Payroll waitlist →
            </Link>
          </div>

          {/* Forward-pointer to the active product so users don't feel
              dead-ended. Investor users tracking vesting can convert
              today; payroll-curious users go on the waitlist. */}
          <p className="text-sm" style={{ color: "#64748b" }}>
            Tracking <strong style={{ color: "#0f172a" }}>vesting</strong> instead?{" "}
            <Link href="/invest" className="underline" style={{ color: "#2563eb" }}>
              TokenVest Invest is live →
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter theme="light" />
    </div>
  );
}
