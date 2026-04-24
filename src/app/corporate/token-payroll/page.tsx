// src/app/corporate/token-payroll/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Corporate → Token Payroll — B2B landing page for companies paying their
// employees/contractors/KOLs in stablecoins or project tokens.
//
// Theme: "professional in-between" — sits between the retail light theme
// (#f8fafc, consumer-bright) and the developer navy (#0d1b35, technical).
// Background is soft slate (#f1f5f9), navy/indigo accents signal enterprise
// trust, a green accent ties in the payroll/money semantic.
//
// Content framing: frame the product as "give your people an app to see
// their salary vesting in real time". Company sets up the vestings, adds
// optional branding, loads wallet addresses; employees download the
// Corporate TokenVest app and watch their compensation tick live, with
// local-currency conversion for people paid globally.
//
// Layout mirrors the established /ai + /developer page cadence:
//   1. Hero (badge + H1 + subtext + dual CTA)
//   2. Three-column value prop
//   3. How it works (4-step flow with numbered cards)
//   4. What employees see (visual callout — app preview sketch)
//   5. Why token payroll now (market-moment pitch)
//   6. Pricing teaser / contact CTA
//   7. Footer
//
// No signup required to land here — this is a top-of-funnel SEO page for
// enterprise search. Conversion target is the contact form, not /early-access.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Token Payroll — pay global employees in stablecoins & tokens · TokenVest",
  description:
    "Run crypto payroll for your team, contractors and KOLs. Set up vesting, add your branding, load wallets — they download the TokenVest Corporate app and watch their salary vest live, in any local currency. Built for companies paying in USDC, USDT, and project tokens.",
  alternates: { canonical: "https://vestream.io/corporate/token-payroll" },
  openGraph: {
    title: "Token Payroll — crypto salaries your team can actually read · TokenVest",
    description:
      "White-label vesting, a branded mobile app for your recipients, and live local-currency conversion. The cleanest way to pay global talent in stablecoins or project tokens.",
    url: "https://vestream.io/corporate/token-payroll",
    siteName: "TokenVest",
    type: "website",
  },
};

// Page palette — defined once and reused inline so the "corporate" theme
// stays consistent across every section. Centralising it means if you later
// decide a section should shift one shade cooler/warmer, you change it here.
const THEME = {
  pageBg:         "#f1f5f9",         // slate-100 — between white (retail) and navy (dev)
  surface:        "white",            // card background
  navyDeep:       "#0f172a",          // body text / headings
  navyMid:        "#1e293b",          // hero ink
  slateBody:      "#475569",          // supporting text
  slateFaint:     "#94a3b8",          // labels
  border:         "rgba(15,23,42,0.08)",
  accentIndigo:   "#4f46e5",          // "trust" accent — indigo
  accentIndigoBg: "rgba(79,70,229,0.08)",
  accentIndigoBr: "rgba(79,70,229,0.22)",
  accentGreen:    "#10b981",          // "payroll/money" accent — green
  accentGreenBg:  "rgba(16,185,129,0.08)",
  accentGreenBr:  "rgba(16,185,129,0.22)",
  heroGradFrom:   "#0f172a",          // hero headline gradient starts dark
  heroGradVia:    "#1e3a8a",          // through deep navy
  heroGradTo:     "#4f46e5",          // into indigo accent
} as const;

export default function TokenPayrollPage() {
  return (
    <main className="min-h-screen" style={{ background: THEME.pageBg, color: THEME.navyDeep }}>
      <SiteNav theme="light" />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 md:pt-32 pb-16 md:pb-24 px-4 md:px-8">
        {/* Soft indigo wash behind the hero — signals "enterprise / trust"
            without pushing the whole page into dark mode. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(79,70,229,0.12) 0%, transparent 65%)",
          }}
          aria-hidden
        />
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(79,70,229,0.35), transparent)",
          }}
          aria-hidden
        />

        <div className="relative max-w-4xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-7"
            style={{
              background:  THEME.accentIndigoBg,
              borderColor: THEME.accentIndigoBr,
              color:       THEME.accentIndigo,
            }}
          >
            <span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: THEME.accentIndigo }}
            />
            For teams · For contractors · For KOLs
          </div>

          <h1
            className="text-4xl md:text-6xl font-bold mb-6"
            style={{
              letterSpacing: "-0.03em",
              background: `linear-gradient(135deg, ${THEME.heroGradFrom} 0%, ${THEME.heroGradVia} 50%, ${THEME.heroGradTo} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Crypto payroll your<br className="hidden md:block" /> team can actually read
          </h1>

          <p
            className="text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ color: THEME.slateBody }}
          >
            Set up token vesting for every employee, contractor, advisor, and
            KOL. They download the TokenVest Corporate app and watch their
            salary vest live — with local-currency conversion anywhere in the
            world. White-label it with your logo, on-chain from day one.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm w-full sm:w-auto"
              style={{
                background: `linear-gradient(135deg, ${THEME.accentIndigo}, #7c3aed)`,
                color: "white",
                boxShadow: "0 4px 24px rgba(79,70,229,0.3)",
              }}
            >
              Book a demo →
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm w-full sm:w-auto"
              style={{
                background: "white",
                border: `1px solid ${THEME.border}`,
                color: THEME.navyDeep,
              }}
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ── Three-column value prop ───────────────────────────────────────── */}
      <section className="px-4 md:px-8 max-w-5xl mx-auto pb-16 md:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ValueCard
            icon="🌐"
            title="Pay in any token, anywhere"
            body="USDC, USDT, EURC, or your project's own token — on Ethereum, Base, BSC, Polygon, or any chain your team operates on. No wires, no SWIFT delays, no lost weekends waiting for payroll to clear."
          />
          <ValueCard
            icon="📱"
            title="Your recipients get a real app"
            body="Not a subgraph explorer. Not an email PDF. A native mobile app — your branding on the loading screen — that shows every team member what's vesting, what's claimable, and what it's worth in their local currency."
          />
          <ValueCard
            icon="🔒"
            title="On-chain, verifiable, non-custodial"
            body="Vesting contracts sit on the chain of your choice — Sablier, Hedgey, or any of the 7 protocols TokenVest indexes. TokenVest never holds funds. Your team can verify every allocation independently."
          />
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 max-w-5xl mx-auto pb-16 md:pb-24">
        <div className="text-center mb-12 md:mb-16">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest mb-4"
            style={{
              background:  THEME.accentGreenBg,
              color:       THEME.accentGreen,
              border:      `1px solid ${THEME.accentGreenBr}`,
              letterSpacing: "0.1em",
            }}
          >
            ◆ Four steps
          </div>
          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ letterSpacing: "-0.02em", color: THEME.navyDeep }}
          >
            From sign-up to paid in a week
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: THEME.slateBody }}>
            We handle the on-chain plumbing and the app distribution. You handle
            the list of people to pay and how much.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StepCard
            n={1}
            title="Create your corporate account"
            body="Email sign-in, company profile, optional SSO. Upload your logo and brand colours — the app your team downloads will carry them."
          />
          <StepCard
            n={2}
            title="Design the vesting schedules"
            body="Linear or cliff, monthly tranches or custom milestones. Pick the token (stablecoin or your own), the amount, and the chain. TokenVest provisions the on-chain contract."
          />
          <StepCard
            n={3}
            title="Add your people"
            body="Paste wallet addresses or invite by email — we onboard them. Batch-upload for large teams; granular per-recipient overrides for special cases."
          />
          <StepCard
            n={4}
            title="They download the app"
            body="Every recipient gets a branded TokenVest Corporate mobile app. They see their vesting tick live, convert to local currency, and claim with one tap the moment tokens unlock."
          />
        </div>
      </section>

      {/* ── What employees see (visual callout) ─────────────────────────── */}
      <section className="px-4 md:px-8 max-w-5xl mx-auto pb-16 md:pb-24">
        <div
          className="rounded-3xl overflow-hidden relative"
          style={{
            background: `linear-gradient(135deg, ${THEME.heroGradFrom} 0%, ${THEME.heroGradVia} 100%)`,
            border: `1px solid ${THEME.accentIndigoBr}`,
          }}
        >
          <div
            className="absolute -top-24 -right-24 w-96 h-96 rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(79,70,229,0.25) 0%, transparent 65%)",
            }}
            aria-hidden
          />

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 p-8 md:p-12">
            <div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-5"
                style={{
                  background: "rgba(79,70,229,0.2)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  letterSpacing: "0.12em",
                }}
              >
                The employee view
              </div>
              <h2
                className="text-2xl md:text-3xl font-bold mb-4"
                style={{ letterSpacing: "-0.02em", color: "white" }}
              >
                What your team opens every Monday morning
              </h2>
              <ul className="space-y-3 text-sm md:text-base" style={{ color: "rgba(255,255,255,0.75)" }}>
                <EmployeeBullet>
                  Today&rsquo;s vested balance, live-counting by the second
                </EmployeeBullet>
                <EmployeeBullet>
                  Next unlock date with countdown — push-notified 24 hours out
                </EmployeeBullet>
                <EmployeeBullet>
                  Conversion to their local currency (GBP, EUR, PHP, BRL, …)
                </EmployeeBullet>
                <EmployeeBullet>
                  One-tap claim to their wallet when tokens unlock
                </EmployeeBullet>
                <EmployeeBullet>
                  Full vesting schedule — 12 months past, 12 months ahead
                </EmployeeBullet>
                <EmployeeBullet>
                  Tax-ready export at year end (CSV, PDF)
                </EmployeeBullet>
              </ul>
            </div>

            {/* Simple app preview sketch — inline SVG phone frame + stat
                rows. Avoids shipping a real mockup asset at this stage; still
                visually carries the "branded app" story. */}
            <div className="flex items-center justify-center">
              <div
                className="rounded-[2rem] overflow-hidden w-[200px] h-[360px] relative"
                style={{
                  background: "white",
                  border: "6px solid #0b1222",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                }}
              >
                {/* Top notch */}
                <div
                  className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full"
                  style={{ background: "#0b1222" }}
                  aria-hidden
                />
                {/* "app" header — branded with placeholder company */}
                <div className="pt-7 pb-3 px-3" style={{ background: "#f8fafc" }}>
                  <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: THEME.slateFaint }}>
                    Acme Corp
                  </div>
                  <div className="text-[10px]" style={{ color: THEME.slateBody }}>Your vesting</div>
                </div>
                {/* Vesting balance card */}
                <div className="px-3 py-4">
                  <div
                    className="rounded-xl p-3"
                    style={{
                      background: `linear-gradient(135deg, ${THEME.accentIndigo}, #7c3aed)`,
                      color: "white",
                    }}
                  >
                    <div className="text-[9px] opacity-80 uppercase tracking-widest">Vested today</div>
                    <div className="text-base font-bold tabular-nums">12,480 USDC</div>
                    <div className="text-[9px] opacity-80">≈ £9,850 GBP</div>
                  </div>
                </div>
                {/* Next unlock row */}
                <div className="px-3 pb-2">
                  <div
                    className="rounded-lg p-2"
                    style={{ background: "rgba(16,185,129,0.08)", border: `1px solid ${THEME.accentGreenBr}` }}
                  >
                    <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: THEME.accentGreen }}>
                      Next unlock
                    </div>
                    <div className="text-[10px] font-semibold" style={{ color: THEME.navyDeep }}>
                      2,083 USDC · 4d 17h
                    </div>
                  </div>
                </div>
                {/* Stream list */}
                <div className="px-3 space-y-2">
                  {[
                    { label: "Base salary", amount: "72K USDC", pct: 42 },
                    { label: "Sign-on bonus", amount: "24K USDC", pct: 18 },
                    { label: "Equity ($ACME)", amount: "40K $ACME", pct: 8 },
                  ].map((r) => (
                    <div key={r.label} className="text-[9px]">
                      <div className="flex justify-between" style={{ color: THEME.slateBody }}>
                        <span>{r.label}</span>
                        <span className="tabular-nums">{r.amount}</span>
                      </div>
                      <div className="h-1 rounded-full mt-0.5" style={{ background: "rgba(0,0,0,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${r.pct}%`, background: THEME.accentIndigo }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why token payroll now (market moment) ──────────────────────── */}
      <section className="px-4 md:px-8 max-w-4xl mx-auto pb-16 md:pb-24">
        <div className="text-center mb-10">
          <h2
            className="text-2xl md:text-3xl font-bold mb-4"
            style={{ letterSpacing: "-0.02em", color: THEME.navyDeep }}
          >
            Why companies are switching to token payroll now
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: THEME.slateBody }}>
            Stablecoin payroll is already how remote-first crypto-native teams
            pay contributors in regions where local banking is slow, expensive,
            or broken. The next wave is every tech company paying part of
            salary in project tokens — and their people need a way to read it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RationaleCard
            title="Cross-border by default"
            body="A contractor in Lagos, Manila, or Buenos Aires gets paid in USDC in minutes — not five days via SWIFT with $40 wire fees eaten at both ends."
          />
          <RationaleCard
            title="Aligned incentives"
            body="Paying part of compensation in your project's token aligns long-term holders with the company. Recipients who can see the vesting schedule hold through the vesting cliff."
          />
          <RationaleCard
            title="Proof-of-payroll on-chain"
            body="Auditors, investors, and employees can verify what's been promised and what's been released, without your books being opened. The contract is the receipt."
          />
          <RationaleCard
            title="Regulatory clarity is coming"
            body="The SEC, MiCA, and most major jurisdictions have published guidance on stablecoin and token compensation. Teams that set up the plumbing now will have it working when the rules settle."
          />
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 max-w-4xl mx-auto pb-24 md:pb-32">
        <div
          className="rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{
            background: "white",
            border: `1px solid ${THEME.border}`,
            boxShadow: "0 4px 40px rgba(15,23,42,0.06)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(79,70,229,0.08) 0%, transparent 70%)",
            }}
            aria-hidden
          />
          <div className="relative">
            <h2
              className="text-2xl md:text-3xl font-bold mb-3"
              style={{ letterSpacing: "-0.02em", color: THEME.navyDeep }}
            >
              Talk to us about your payroll
            </h2>
            <p
              className="text-sm md:text-base mb-8 max-w-xl mx-auto"
              style={{ color: THEME.slateBody }}
            >
              Whether you&rsquo;re paying 5 contractors in USDC or a 200-person team
              in your own token, we&rsquo;ll scope the setup and point you at
              the right vesting protocol. Typical first call is 20 minutes.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm"
                style={{
                  background: `linear-gradient(135deg, ${THEME.accentIndigo}, #7c3aed)`,
                  color: "white",
                  boxShadow: "0 4px 24px rgba(79,70,229,0.3)",
                }}
              >
                Book a demo →
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm"
                style={{
                  background: "rgba(15,23,42,0.04)",
                  border: `1px solid ${THEME.border}`,
                  color: THEME.navyDeep,
                }}
              >
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />
    </main>
  );
}

// ─── Page-local components ──────────────────────────────────────────────────
// Kept inline because they're bespoke to this page's theme — lifting them
// into /src/components would invite cross-page reuse that would erode the
// corporate theme's distinct "in-between" look.

function ValueCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4"
        style={{
          background: THEME.accentIndigoBg,
          border: `1px solid ${THEME.accentIndigoBr}`,
        }}
        aria-hidden
      >
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: THEME.navyDeep, letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: THEME.slateBody }}>
        {body}
      </p>
    </div>
  );
}

function StepCard({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div
      className="rounded-2xl p-6 flex items-start gap-4"
      style={{
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold tabular-nums"
        style={{
          background: `linear-gradient(135deg, ${THEME.accentIndigo}, #7c3aed)`,
          color: "white",
        }}
      >
        {n}
      </div>
      <div>
        <h3 className="text-base md:text-lg font-semibold mb-1.5" style={{ color: THEME.navyDeep }}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: THEME.slateBody }}>
          {body}
        </p>
      </div>
    </div>
  );
}

function RationaleCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
      }}
    >
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-2"
        style={{ color: THEME.accentIndigo, letterSpacing: "0.08em" }}
      >
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: THEME.slateBody }}>
        {body}
      </p>
    </div>
  );
}

function EmployeeBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full"
        style={{ background: THEME.accentGreen }}
      />
      <span>{children}</span>
    </li>
  );
}
