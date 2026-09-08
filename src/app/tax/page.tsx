import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { InkHero } from "@/components/InkHero";
import { GradientCta } from "@/components/GradientCta";
import { AppStoreBadges } from "@/components/AppStoreBadges";
import { PUBLIC_PROTOCOL_COUNT, PUBLIC_CHAIN_COUNT } from "@/lib/protocol-constants";

// ─────────────────────────────────────────────────────────────────────────────
// /tax – Vestream for people who need to work out tax on vested tokens.
//
// Audience: anyone who has claimed vested tokens (investors, founders, team
// members, DAO contributors paid by stream) and now has to tell their
// accountant what those claims were worth. They may not care about alerts at
// all; the tax feature is a product in its own right and this page sells it
// on its own terms.
//
// Every claim on this page is backed by shipped code:
//   - claim_events + the per-protocol ingestors (src/lib/vesting/ingestors/)
//   - getHistoricalPrice → usd_value_at_claim + price_confidence
//   - /api/claims/income-statement (byYear / byProtocol / byToken / confidence)
//   - csv-exports.ts: generic, Koinly, CoinTracker, TurboTax, payroll-income,
//     payroll-summary-us, payroll-summary-uk
//
// Deliberately NOT claimed here, because it is not built: a year-end PDF
// report (listed on /pricing, no generator in the repo) and unlock-basis
// (accrual) income recording (planned, not shipped). Do not add either until
// the code exists.
//
// Fake tokens only (NOVA / FLUX / VEST / KLAR) per CLAUDE.md marketing rules.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       "Crypto Vesting Tax Reports: Income at Claim, Koinly & TurboTax Exports | Vestream",
  description: "Work out tax on vested tokens. Vestream indexes every claim you made, prices it at fair market value on the day, and exports Koinly, CoinTracker and TurboTax files your accountant can use.",
  alternates:  { canonical: "https://www.vestream.io/tax" },
  openGraph: {
    title:       "Tax on vested tokens, worked out from your claims | Vestream",
    description: "Every claim, priced on the day you made it, exported in the format your tax software already imports.",
    type:        "website",
    url:         "https://www.vestream.io/tax",
  },
  robots: { index: true, follow: true },
};

// ── Content ──────────────────────────────────────────────────────────────────

const PAIN = [
  {
    title: "Claims happen on dates you did not choose",
    body:  "A cliff on a Tuesday, a linear stream you claimed eight times, a step release across three chains. Each one is a separate income event at that day's price, and none of them shows up on an exchange statement.",
  },
  {
    title: "The price that matters is the historical one",
    body:  "What a token trades at today is irrelevant. What counts is fair market value at the moment you claimed, which means finding a reliable price for a specific token on a specific day, dozens of times.",
  },
  {
    title: "Your accountant needs a file, not a wallet address",
    body:  "Koinly, CoinTracker and TurboTax each want their own column layout. Building it by hand from block explorers is a weekend you will not get back, and the errors are the expensive kind.",
  },
];

const STEPS = [
  {
    n:     "1",
    title: "Scan your wallet, free",
    body:  `Paste any address. We find every vesting position across ${PUBLIC_PROTOCOL_COUNT} protocols and ${PUBLIC_CHAIN_COUNT} chains, including positions you may have forgotten about.`,
  },
  {
    n:     "2",
    title: "We index every claim and price it on the day",
    body:  "Each claim event is read from the chain, then priced at fair market value on the day it happened. Every row carries a confidence flag so you know how firm the number is.",
  },
  {
    n:     "3",
    title: "Export in the format your software imports",
    body:  "One click for Koinly, CoinTracker or TurboTax. A generic CSV for anything else. Payroll formats for contributors paid by stream. Open the importer in a new tab and you are done.",
  },
];

// Example rows for the income statement mockup. Fake tokens, fake dates.
const EXAMPLE_ROWS = [
  { token: "NOVA", color: "#F0992E", date: "14 Mar 2026", amount: "12,500",  price: "$0.84", usd: "$10,500.00", conf: "exact"   },
  { token: "FLUX", color: "#5B6CFF", date: "02 Feb 2026", amount: "3,000",   price: "$2.10", usd: "$6,300.00",  conf: "exact"   },
  { token: "VEST", color: "#28B895", date: "19 Dec 2025", amount: "40,000",  price: "$0.12", usd: "$4,800.00",  conf: "nearest" },
  { token: "KLAR", color: "#1CB8B8", date: "30 Sep 2025", amount: "8,750",   price: "$1.36", usd: "$11,900.00", conf: "exact"   },
] as const;

const EXPORTS = [
  { name: "Koinly",           tag: "Native CSV",   body: "Pre-formatted for Koinly's custom CSV importer. We open the import page for you." },
  { name: "CoinTracker",      tag: "Native CSV",   body: "CoinTracker's generic upload layout, validated on import." },
  { name: "TurboTax",         tag: "US",           body: "The TurboTax cryptocurrency CSV, for the Premier and Self-Employed tiers." },
  { name: "Generic CSV",      tag: "Any software", body: "Clean columns that any tax tool with a CSV importer will accept." },
  { name: "Payroll income",   tag: "Contributors", body: "Per-claim ordinary income at fair market value on receipt, for people paid by stream." },
  { name: "Payroll summary",  tag: "US and UK",    body: "Payer-grouped totals shaped for a 1099-NEC summary or an HMRC SA103." },
];

const CONFIDENCE = [
  { flag: "exact",   color: "#0F8A8A", body: "A price for that token on that day. The number you want." },
  { flag: "nearest", color: "#A85D06", body: "No price on the exact day, so we used the closest day within a week and tell you so." },
  { flag: "missing", color: "#A3322E", body: "No usable price. The row is still there with the amount, so nothing is silently dropped. You supply the value." },
];

const AUDIENCES = [
  {
    title: "Investors and advisers",
    body:  "Seed and private round allocations that vested over years. Every claim becomes a dated income row with a cost basis your capital gains calculation can start from.",
  },
  {
    title: "Founders and team members",
    body:  "Team allocations on Sablier, Hedgey, Team Finance or UNCX. Cliffs and step releases, each priced on the day, across every chain the team locked on.",
  },
  {
    title: "Contributors paid by stream",
    body:  "Salary streams on Sablier Flow, LlamaPay or Superfluid. Payroll formats that treat each claim as ordinary income, with payer grouped totals for the year.",
  },
];

const FAQ = [
  {
    q: "Is the claim date the taxable event?",
    a: "It depends where you live. Some jurisdictions tax vested tokens when they become available to you, others when you take them, others only when you sell. Vestream records income at the moment you claimed, priced at fair market value on that day, because that is the event we can verify on chain. Your accountant decides which basis applies to you.",
  },
  {
    q: "Which protocols and chains are covered?",
    a: `Every protocol Vestream indexes, currently ${PUBLIC_PROTOCOL_COUNT} across ${PUBLIC_CHAIN_COUNT} chains including Ethereum, Base, Arbitrum, BNB Chain, Polygon, Optimism, Avalanche and Solana. Claim events are read directly from the chain, so if we index the vesting, we can see the claims.`,
  },
  {
    q: "Where do the historical prices come from?",
    a: "Daily market prices from CoinGecko, looked up for the specific token on the specific claim date. If no price exists for that day we fall back to the nearest day within a week and flag the row as nearest. If nothing usable exists we flag it as missing rather than guess.",
  },
  {
    q: "Does the export give me a cost basis for when I sell?",
    a: "Yes. The fair market value at claim is both your income figure and your cost basis for that lot. Your tax software uses it to work out the gain or loss when you later dispose of the tokens.",
  },
  {
    q: "Is gas included?",
    a: "Gas paid on each claim is recorded in USD alongside the income figure, so your accountant can decide how to treat it.",
  },
  {
    q: "Is this free?",
    a: "Scanning a wallet and seeing your claim history is free with no account. The income statement, the CSV exports and the confidence breakdown are part of Vestream Pro at $9.99 a month or $74.99 a year.",
  },
  {
    q: "Is this tax advice?",
    a: "No. Vestream reports what happened on chain and what it was worth on the day. How it is taxed is a question for a qualified adviser in your jurisdiction.",
  },
];

// ── Structured data ──────────────────────────────────────────────────────────

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id":   "https://www.vestream.io/tax#page",
      url:     "https://www.vestream.io/tax",
      name:    "Crypto Vesting Tax Reports",
      description: "Tax on vested tokens, worked out from your on-chain claims and priced at fair market value on the day.",
      isPartOf: { "@id": "https://www.vestream.io/#website" },
      about: { "@type": "Thing", name: "Cryptocurrency vesting taxation" },
    },
    {
      "@type": "SoftwareApplication",
      "@id":   "https://www.vestream.io/tax#app",
      name:    "Vestream Tax Reports",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web, iOS, Android",
      offers: { "@type": "Offer", price: "9.99", priceCurrency: "USD", category: "subscription" },
      featureList: [
        "Indexes every vesting claim across supported protocols and chains",
        "Prices each claim at fair market value on the claim date",
        "Confidence flag on every price",
        "Koinly, CoinTracker and TurboTax CSV exports",
        "Payroll income and payer summary exports for US and UK",
        "Income statement by tax year, protocol and token",
      ],
    },
    {
      "@type": "FAQPage",
      "@id":   "https://www.vestream.io/tax#faq",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

// ── Page ─────────────────────────────────────────────────────────────────────

const INK   = "#1A1D20";
const MUTED = "#8B8E92";
const HAIR  = "rgba(21,23,26,0.10)";

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="max-w-2xl mx-auto text-center mb-10 md:mb-12">
      <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] mb-4" style={{ color: "#0F8A8A" }}>
        <span aria-hidden className="block w-6 h-px" style={{ background: "#1CB8B8" }} />
        {eyebrow}
      </div>
      <h2 className="text-2xl md:text-[2rem] font-bold leading-tight" style={{ color: INK, letterSpacing: "-0.025em", textWrap: "balance" }}>
        {title}
      </h2>
      {sub && <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>{sub}</p>}
    </div>
  );
}

export default function TaxPage() {
  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: INK }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteNav theme="ink" />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <InkHero
        eyebrow="Vesting tax reports"
        title="Every token you claimed,"
        accent="priced on the day you claimed it."
        sub="Vestream reads your vesting claims straight from the chain, works out what each one was worth at the time, and exports the file your tax software already knows how to import."
      >
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/find-vestings"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", color: "white", boxShadow: "0 8px 28px -10px rgba(28,184,184,0.6)" }}>
            Scan my wallet free →
          </Link>
          <Link href="/pricing"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", color: "white" }}>
            See what Pro includes
          </Link>
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" style={{ color: "rgba(255,255,255,0.58)" }}>
          <li>{PUBLIC_PROTOCOL_COUNT} vesting protocols</li>
          <li aria-hidden style={{ color: "rgba(255,255,255,0.2)" }}>·</li>
          <li>{PUBLIC_CHAIN_COUNT} chains</li>
          <li aria-hidden style={{ color: "rgba(255,255,255,0.2)" }}>·</li>
          <li>Koinly, CoinTracker, TurboTax</li>
          <li aria-hidden style={{ color: "rgba(255,255,255,0.2)" }}>·</li>
          <li>Free scan, no account</li>
        </ul>

        <nav aria-label="Breadcrumb" className="mt-7">
          <ol className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.44)" }}>
            <li><Link href="/" className="hover:underline" style={{ color: "rgba(255,255,255,0.44)" }}>Home</Link></li>
            <li aria-hidden style={{ color: "rgba(255,255,255,0.2)" }}>›</li>
            <li aria-current="page" style={{ color: "rgba(255,255,255,0.82)", fontWeight: 600 }}>Tax</li>
          </ol>
        </nav>
      </InkHero>

      {/* ── The problem ───────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-16 md:py-24">
        <div className="max-w-5xl mx-auto">
          <SectionHeading
            eyebrow="Why this is hard"
            title="Vesting income does not look like exchange income."
            sub="Nobody sends you a statement. The events are scattered across chains and dates, and each one needs a historical price."
          />
          {/* One bordered object, not three cards: hairlines between cells,
              stacked on mobile and side by side from md up. */}
          <div className="grid grid-cols-1 md:grid-cols-3 rounded-2xl overflow-hidden" style={{ border: `1px solid ${HAIR}`, background: "white" }}>
            {PAIN.map((p, i) => (
              <div key={p.title}
                className={`p-6 md:p-7 ${i > 0 ? "border-t md:border-t-0 md:border-l" : ""}`}
                style={{ borderColor: HAIR }}>
                <h3 className="text-base font-bold mb-2" style={{ color: INK, letterSpacing: "-0.01em" }}>{p.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Income statement mockup ───────────────────────────────────── */}
      <section className="px-4 md:px-8 py-16 md:py-24" style={{ background: "white", borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}>
        <div className="max-w-5xl mx-auto">
          <SectionHeading
            eyebrow="What you get"
            title="An income statement built from your claims."
            sub="Every claim as a row. Every row priced on its own day, with a flag that says how sure we are."
          />

          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${HAIR}`, boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 18px 40px -24px rgba(16,24,40,.25)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ background: "#F5F5F3", borderBottom: `1px solid ${HAIR}` }}>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: MUTED }}>Income statement</div>
                <div className="text-sm font-semibold" style={{ color: INK }}>0x3f5CE…8b2e · tax year 2025 to 2026</div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.26)" }}>4 claims</span>
                <span className="px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(21,23,26,0.04)", color: MUTED, border: `1px solid ${HAIR}` }}>3 exact · 1 nearest</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums", minWidth: 640 }}>
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                    <th className="text-left font-semibold px-5 py-3">Token</th>
                    <th className="text-left font-semibold px-3 py-3">Claimed</th>
                    <th className="text-right font-semibold px-3 py-3">Amount</th>
                    <th className="text-right font-semibold px-3 py-3">Price on day</th>
                    <th className="text-right font-semibold px-3 py-3">Income</th>
                    <th className="text-left font-semibold px-5 py-3">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLE_ROWS.map((r) => (
                    <tr key={r.token} style={{ borderTop: `1px solid ${HAIR}` }}>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 font-semibold" style={{ color: INK }}>
                          <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                          {r.token}
                        </span>
                      </td>
                      <td className="px-3 py-3" style={{ color: MUTED }}>{r.date}</td>
                      <td className="px-3 py-3 text-right" style={{ color: INK }}>{r.amount}</td>
                      <td className="px-3 py-3 text-right" style={{ color: MUTED }}>{r.price}</td>
                      <td className="px-3 py-3 text-right font-semibold" style={{ color: INK }}>{r.usd}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={r.conf === "exact"
                            ? { background: "rgba(28,184,184,0.10)", color: "#0F8A8A" }
                            : { background: "rgba(217,119,6,0.10)", color: "#A85D06" }}>
                          {r.conf}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `1px solid ${HAIR}`, background: "#F5F5F3" }}>
                    <td className="px-5 py-3 font-semibold" colSpan={4} style={{ color: INK }}>Total ordinary income</td>
                    <td className="px-3 py-3 text-right font-bold" style={{ color: INK }}>$33,500.00</td>
                    <td className="px-5 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-4 text-center text-xs" style={{ color: MUTED }}>Example data. Tokens shown are illustrative, not real integrations.</p>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-16 md:py-24">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow="How it works" title="Three steps, and the first one is free." />
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl p-6" style={{ background: "white", border: `1px solid ${HAIR}` }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mb-4"
                  style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", color: "white" }}>{s.n}</div>
                <h3 className="text-base font-bold mb-2" style={{ color: INK, letterSpacing: "-0.01em" }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Exports ───────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-16 md:py-24" style={{ background: "white", borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}>
        <div className="max-w-5xl mx-auto">
          <SectionHeading
            eyebrow="Exports"
            title="Six formats. Your accountant picks one."
            sub="All built from the same claim rows, so the numbers agree with each other whichever file you send."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {EXPORTS.map((e) => (
              <div key={e.name} className="rounded-2xl p-5" style={{ background: "#F5F5F3", border: `1px solid ${HAIR}` }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-base font-bold" style={{ color: INK }}>{e.name}</h3>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A" }}>{e.tag}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{e.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Confidence ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-16 md:py-24">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
          <div className="lg:col-span-2">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] mb-4" style={{ color: "#0F8A8A" }}>
              <span aria-hidden className="block w-6 h-px" style={{ background: "#1CB8B8" }} />
              Honest numbers
            </div>
            <h2 className="text-2xl md:text-[2rem] font-bold leading-tight" style={{ color: INK, letterSpacing: "-0.025em", textWrap: "balance" }}>
              We tell you how sure we are, row by row.
            </h2>
            <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>
              A tax figure is only as good as the price behind it. Every row carries one of three flags, and the income statement shows the mix up front so a report full of estimates never passes as a report full of facts.
            </p>
          </div>
          <div className="lg:col-span-3 rounded-2xl overflow-hidden" style={{ background: "white", border: `1px solid ${HAIR}` }}>
            {CONFIDENCE.map((c, i) => (
              <div key={c.flag} className="flex gap-4 p-5" style={{ borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}>
                <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold h-fit"
                  style={{ background: `${c.color}1A`, color: c.color }}>{c.flag}</span>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Audiences ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-16 md:py-24" style={{ background: "white", borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}>
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow="Who this is for" title="Anyone who has ever clicked claim." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="rounded-2xl p-6" style={{ background: "#F5F5F3", border: `1px solid ${HAIR}` }}>
                <h3 className="text-base font-bold mb-2" style={{ color: INK, letterSpacing: "-0.01em" }}>{a.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{a.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm" style={{ color: MUTED }}>
            Paid by stream rather than vesting? The <Link href="/payroll" className="underline" style={{ color: "#0F8A8A" }}>payroll tracker</Link> covers Sablier Flow, LlamaPay and Superfluid in more depth.
          </p>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-16 md:py-24">
        <div className="max-w-3xl mx-auto">
          <SectionHeading eyebrow="Questions" title="The ones accountants ask first." />
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: `1px solid ${HAIR}` }}>
            {FAQ.map((f, i) => (
              <details key={f.q} className="group" style={{ borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}>
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 px-5 py-4 text-sm font-semibold" style={{ color: INK }}>
                  {f.q}
                  <span aria-hidden className="shrink-0 transition-transform group-open:rotate-45 text-lg leading-none" style={{ color: MUTED }}>+</span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed" style={{ color: MUTED }}>{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-center" style={{ color: MUTED }}>
            Vestream is not a tax adviser. We report on-chain events and their market value on the day. Whether and how they are taxed depends on your jurisdiction and circumstances; check with a qualified professional.
          </p>
        </div>
      </section>

      {/* ── Closing CTA ───────────────────────────────────────────────── */}
      <GradientCta
        eyebrow="Start with the free scan"
        title="See every claim you made before you decide anything."
        sub="Paste a wallet. If we find claims, the income statement and exports are one upgrade away. If we find nothing, you have lost thirty seconds."
        primary={{ href: "/find-vestings", label: "Scan my wallet →" }}
        secondary={{ href: "/pricing", label: "Compare Free and Pro" }}
      >
        <div className="mt-8">
          <AppStoreBadges align="center" />
        </div>
      </GradientCta>

      <SiteFooter theme="light" />
    </div>
  );
}
