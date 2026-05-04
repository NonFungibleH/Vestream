import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { AppStoreBadges } from "@/components/AppStoreBadges";

// ─────────────────────────────────────────────────────────────────────────────
// /payroll — Vestream Payroll landing page.
//
// Audience: DAO contributors, remote contractors, grant recipients, full-
// time crypto employees getting paid in streamed tokens. The salary mental
// model. Pairs with the "Vestream Payroll" mode in the mobile app — same
// naming, same promise, separate funnel.
//
// SEO target: queries like "crypto payroll tracker", "LlamaPay alerts",
// "Sablier Flow contractor pay", "Superfluid earnings dashboard",
// "DAO contributor income tracking". Distinct from /invest which targets
// vesting-unlock queries.
//
// Conversion path: same /find-vestings pipeline, same App Store funnel.
// The difference is the messaging is pre-targeted to the worker audience
// — "$312 earned this week" instead of "Next NOVA cliff in 65d", "1099-NEC
// ready" instead of "capital gains CSV".
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       "Vestream Payroll — Track your streamed crypto income",
  description: "Earnings dashboard for crypto contractors, DAO contributors and remote workers. Track Sablier Flow, LlamaPay and Superfluid streams across every chain. Push alerts when streams hit, gas-aware claim timing, year-end 1099-NEC / SA103 ready exports. Free.",
  alternates:  { canonical: "/payroll" },
  openGraph: {
    title:       "Vestream Payroll — Crypto income, accounted for",
    description: "Sablier Flow · LlamaPay · Superfluid. One earnings inbox for every stream paying you.",
    type:        "website",
    url:         "https://www.vestream.io/payroll",
  },
};

const PROTOCOLS = [
  { name: "Sablier Flow",  tagline: "Continuous streaming pay" },
  { name: "LlamaPay",      tagline: "Per-second token streams" },
  { name: "Superfluid",    tagline: "Programmable money streams" },
];

export default function PayrollLanding() {
  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <SiteNav theme="light" />

      <main className="pt-24 md:pt-28 pb-16 md:pb-24">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#059669" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
            Vestream Payroll
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
            See every stream <br className="hidden md:inline" /> paying you.
          </h1>
          <p
            className="max-w-2xl text-base md:text-lg mb-8"
            style={{ color: "#475569", lineHeight: 1.6 }}
          >
            Vestream tracks every Sablier Flow, LlamaPay and Superfluid stream paying tokens into your wallet. Live earnings rate. Push alert when a stream hits. Gas-aware claim suggestions. Year-end income statement formatted for 1099-NEC, UK SA103 or your accountant&rsquo;s preferred software.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Link
              href="/find-vestings"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm md:text-base"
              style={{
                background: "linear-gradient(135deg, #059669, #10b981)",
                color: "white",
                boxShadow: "0 6px 20px rgba(16,185,129,0.30)",
              }}
            >
              Find my streams →
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
            <Link href="/invest" className="underline" style={{ color: "#475569" }}>
              tracking vesting unlocks instead?
            </Link>
          </p>
        </section>

        {/* ── Three value bullets ─────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 mt-16 md:mt-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[
              {
                icon: "💸",
                title: "Live earnings rate",
                body:  "Watch your hourly / weekly / monthly take live as the stream accrues. No more guessing whether you've actually been paid this week.",
              },
              {
                icon: "⏱",
                title: "Gas-smart claim timing",
                body:  "We tell you when claiming is worth it given current gas. No more burning $40 to claim $50 of accrued USDC at 11pm on a Friday.",
              },
              {
                icon: "🧾",
                title: "Income exports",
                body:  "Year-end statement in 1099-NEC (US contractor), SA103 (UK self-assessment), or generic per-event CSV. Your accountant will thank you.",
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

        {/* ── Who it's for ──────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 mt-16 md:mt-24">
          <div className="text-center mb-8">
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#64748b" }}>
              Built for
            </div>
            <h2
              className="font-semibold"
              style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", letterSpacing: "-0.02em", color: "#0f172a" }}
            >
              The way crypto actually pays people now.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: "DAO contributors",
                body:  "Streamed in stablecoins from a multisig. Vestream gives you a personal earnings dashboard without exposing your wallet to the org.",
              },
              {
                title: "Remote contractors",
                body:  "Paid weekly in USDC over LlamaPay. Pull-to-refresh shows the latest rate; year-end CSV maps cleanly to your 1099 or SA103.",
              },
              {
                title: "Grant recipients",
                body:  "Funded over a 12-month Sablier Flow stream. Track accrual without doing math; claim when gas is reasonable; report income correctly.",
              },
              {
                title: "Crypto employees",
                body:  "Salary in tokens via Superfluid. Live earnings counter on your home screen. Withdraw on a schedule that minimises gas + tax friction.",
              },
            ].map(p => (
              <div
                key={p.title}
                className="rounded-2xl p-6"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
              >
                <h3 className="font-semibold mb-2" style={{ color: "#0f172a", fontSize: 17 }}>
                  {p.title}
                </h3>
                <p className="text-sm" style={{ color: "#64748b", lineHeight: 1.55 }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Protocols indexed ──────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-4 md:px-8 mt-16 md:mt-24 text-center">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#64748b" }}>
            Streams indexed
          </div>
          <div className="flex flex-wrap justify-center gap-3 mb-3">
            {PROTOCOLS.map(p => (
              <div
                key={p.name}
                className="px-4 py-2 rounded-full text-sm"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", color: "#0f172a" }}
              >
                <strong className="font-semibold">{p.name}</strong>
                <span className="ml-1.5" style={{ color: "#94a3b8" }}>· {p.tagline}</span>
              </div>
            ))}
          </div>
          <p className="text-xs" style={{ color: "#94a3b8" }}>
            More streaming protocols added monthly — request integration{" "}
            <Link href="/contact" className="underline" style={{ color: "#475569" }}>here</Link>.
          </p>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-4 md:px-8 mt-16 md:mt-24">
          <div
            className="rounded-3xl p-8 md:p-12 text-center"
            style={{
              background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",
              boxShadow: "0 20px 50px rgba(6,78,59,0.25)",
            }}
          >
            <h3
              className="font-bold mb-3"
              style={{ color: "white", fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.02em" }}
            >
              Stop guessing what you&rsquo;re owed.
            </h3>
            <p className="text-sm md:text-base max-w-xl mx-auto mb-6" style={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
              Free to scan. Free to install. Pro upgrade only if you want unlimited wallets and the income-statement exports for tax season.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mb-5">
              <Link
                href="/find-vestings"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
                style={{ background: "white", color: "#065f46" }}
              >
                Find my streams →
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
