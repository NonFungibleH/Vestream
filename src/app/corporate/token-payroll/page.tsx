// src/app/corporate/token-payroll/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Corporate → Token Payroll — B2B landing page for companies paying their
// employees, contractors, and KOLs in stablecoins or project tokens.
//
// Positioning (important — this is NOT a full payroll setup tool):
//
//   Vestream does NOT create vesting contracts. Companies already create
//   vestings on the protocol of their choice (Sablier, Hedgey, UNCX, Unvest,
//   Team Finance, Superfluid, PinkSale). What Vestream provides is the
//   EMPLOYEE-FACING LAYER — a branded mobile app their recipients use to
//   see their salary vest live, get notifications before each unlock, and
//   convert to their local currency anywhere in the world.
//
//   Previous draft of this page accidentally read like we run the vesting
//   contracts too. Rewritten copy across hero, value props, and how-it-works
//   now makes clear the split: you set up vestings wherever you already do,
//   we make them consumable by the people receiving them.
//
// Theme: "professional in-between" — slate-100 bg, deep navy / indigo
// accents, green accent for payroll/money. Sits between retail's bright
// light theme and developer's deep navy.
//
// Lifecycle stage: pre-launch, validating demand. The CTA deliberately
// avoids "book a demo" (implies we have a product ready to sell) and
// frames the page as early-access interest capture.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Live salary feed for crypto payroll · Vestream",
  description:
    "Give your employees, contractors, and KOLs a real-time view of their vesting salary. Live to the second, with push notifications before every unlock and local-currency conversion anywhere in the world — regardless of which protocol you used to set up the vestings.",
  alternates: { canonical: "https://vestream.io/corporate/token-payroll" },
  openGraph: {
    title: "Live salary feed for crypto payroll · Vestream",
    description:
      "Branded mobile app for your team to watch their crypto salary vest in real time. 24/7, anywhere, any currency.",
    url: "https://vestream.io/corporate/token-payroll",
    siteName: "Vestream",
    type: "website",
  },
};

const THEME = {
  pageBg:         "#f1f5f9",         // slate-100 — between retail white and dev navy
  surface:        "white",
  navyDeep:       "#1A1D20",
  navyMid:        "#1e293b",
  slateBody:      "#475569",
  slateFaint:     "#B8BABD",
  border:         "rgba(15,23,42,0.08)",
  accentIndigo:   "#3FA568",         // enterprise / trust — forest green for premium signal
  accentIndigoBg: "rgba(63,165,104,0.08)",
  accentIndigoBr: "rgba(63,165,104,0.22)",
  accentGreen:    "#0F8A8A",         // payroll / money — deep teal pairs with brand
  accentGreenBg:  "rgba(15,138,138,0.08)",
  accentGreenBr:  "rgba(15,138,138,0.22)",
  heroGradFrom:   "#1A1D20",
  heroGradVia:    "#0F8A8A",
  heroGradTo:     "#1CB8B8",
} as const;

// ─── Icon primitives (inline SVG, stroke-based lucide-style) ────────────────
//
// Swapping emojis for these feels measurable on the eye — an emoji renders
// at font-size so it fights for vertical alignment with the surrounding
// text; a sized stroke-icon lives inside a 48×48 tile that controls its
// own rhythm. Also renders consistently across OSes (Android / Windows
// emoji differ from Apple's).

function IconPulse({ size = 24, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* Live-pulse signal — matches the "live TVL" dot vocabulary */}
      <path d="M3 12h3l2-6 4 12 2-6h3" />
      <circle cx="20" cy="12" r="1.5" fill={color} />
    </svg>
  );
}

function IconBell({ size = 24, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function IconGlobe({ size = 24, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function IconCheck({ size = 16, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function TokenPayrollPage() {
  return (
    <main className="min-h-screen" style={{ background: THEME.pageBg, color: THEME.navyDeep }}>
      <SiteNav theme="light" />

      {/* ── Hero — "live salary feed" is the wow factor ───────────────────── */}
      <section className="relative overflow-hidden pt-24 md:pt-32 pb-16 md:pb-24 px-4 md:px-8">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(63,165,104,0.12) 0%, transparent 65%)",
          }}
          aria-hidden
        />
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(63,165,104,0.35), transparent)",
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
            Live salary feed · Crypto payroll · 24/7 global access
          </div>

          <h1
            className="text-4xl md:text-6xl font-bold mb-6"
            style={{ letterSpacing: "-0.03em", color: "#1A1D20" }}
          >
            Your team&rsquo;s salary,<br className="hidden md:block" />{" "}
            <span style={{ color: "#1CB8B8" }}>live to the second</span>
          </h1>

          <p
            className="text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ color: THEME.slateBody }}
          >
            The wow factor of crypto payroll: your employees, contractors, and
            KOLs can watch their salary vest in real time, from anywhere in
            the world — with push notifications before every unlock and
            local-currency conversion built in. You set up the vestings on
            whichever protocol you already use. We make them readable.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/contact?subject=token-payroll"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm w-full sm:w-auto"
              style={{
                background: `linear-gradient(135deg, ${THEME.accentIndigo}, #0F8A8A)`,
                color: "white",
                boxShadow: "0 4px 24px rgba(63,165,104,0.3)",
              }}
            >
              Register your interest →
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm w-full sm:w-auto"
              style={{
                background: "white",
                border: `1px solid ${THEME.border}`,
                color: THEME.navyDeep,
              }}
            >
              How it works
            </a>
          </div>

          <p className="text-xs mt-6" style={{ color: THEME.slateFaint }}>
            Early access — not publicly launched yet. Tell us about your team
            and we&rsquo;ll get in touch.
          </p>
        </div>
      </section>

      {/* ── Three-column value prop — employee-view, not vesting-creation ── */}
      <section className="px-4 md:px-8 max-w-5xl mx-auto pb-16 md:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ValueCard
            icon={<IconPulse size={24} color={THEME.accentIndigo} />}
            title="Live, per-second visibility"
            body="Your team opens the app and sees their vesting tick up live — balance, next unlock, claimable right now. No spreadsheet, no Etherscan, no guessing which day tokens land."
          />
          <ValueCard
            icon={<IconBell size={24} color={THEME.accentIndigo} />}
            title="Push alerts before every unlock"
            body="Native mobile notifications fire 24 hours before a cliff or tranche. Your people never miss a claim, and never have to check just in case — we do it for them."
          />
          <ValueCard
            icon={<IconGlobe size={24} color={THEME.accentIndigo} />}
            title="Anywhere, any currency"
            body="Contractors in Lagos, Manila, or São Paulo see their salary in GBP, EUR, PHP, BRL — whichever local currency they set. On-chain in USDC or your token; readable in the money they actually spend."
          />
        </div>
      </section>

      {/* ── What we DO and DON'T do — positioning clarity ──────────────── */}
      <section className="px-4 md:px-8 max-w-4xl mx-auto pb-16 md:pb-24">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: THEME.surface,
            border: `1px solid ${THEME.border}`,
            boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-6 md:p-8">
              <div
                className="text-[10px] font-bold uppercase tracking-widest mb-3"
                style={{ color: THEME.accentIndigo, letterSpacing: "0.12em" }}
              >
                What Vestream is
              </div>
              <h3 className="text-lg font-semibold mb-3" style={{ color: THEME.navyDeep }}>
                The employee-facing layer for your existing payroll stack
              </h3>
              <p className="text-sm leading-relaxed mb-4" style={{ color: THEME.slateBody }}>
                You keep using whichever vesting protocol fits your setup —
                Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid,
                PinkSale, or any combination. Vestream indexes what you&rsquo;ve
                already deployed and gives your team a branded mobile app to
                live with it.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Sablier", "Hedgey", "UNCX", "Unvest", "Team Finance", "Superfluid", "PinkSale"].map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold"
                    style={{
                      background: THEME.accentIndigoBg,
                      color:      THEME.accentIndigo,
                      border:     `1px solid ${THEME.accentIndigoBr}`,
                    }}
                  >
                    <IconCheck size={12} color={THEME.accentIndigo} />
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <div
              className="p-6 md:p-8 border-t md:border-t-0 md:border-l"
              style={{ borderColor: THEME.border, background: "rgba(15,23,42,0.015)" }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-widest mb-3"
                style={{ color: THEME.slateFaint, letterSpacing: "0.12em" }}
              >
                What Vestream is not
              </div>
              <h3 className="text-lg font-semibold mb-3" style={{ color: THEME.navyDeep }}>
                A vesting-contract deployer
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: THEME.slateBody }}>
                We don&rsquo;t create vestings, hold funds, or charge gas to
                deploy contracts. Your existing process for setting those up
                stays exactly as it is — whether that&rsquo;s your legal
                counsel on Sablier, your CFO on Hedgey, or your launchpad
                partner on Team Finance. We&rsquo;re purely the UX layer the
                moment after.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who this is for — personas ──────────────────────────────────
          Widens the audience in the reader's head. "Payroll" reads like
          full-time employees, but the real use case is anyone your org
          pays on a schedule — contractors, advisors, KOLs, grant recipients.
          Four cards, one per persona, each with a concrete scenario. */}
      <section className="px-4 md:px-8 max-w-5xl mx-auto pb-16 md:pb-24">
        <div className="text-center mb-10">
          <h2
            className="text-2xl md:text-3xl font-bold mb-4"
            style={{ letterSpacing: "-0.02em", color: THEME.navyDeep }}
          >
            Built for every shape of on-chain comp
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: THEME.slateBody }}>
            &ldquo;Payroll&rdquo; is shorthand. If your org is sending a vesting
            schedule to anyone, they&rsquo;re your recipients — and they need
            a way to see it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PersonaCard
            label="Full-time team"
            title="Salary + equity"
            body="Base salary in USDC, equity in your project's token. Both vest on schedules they can watch in one app."
          />
          <PersonaCard
            label="Contractors"
            title="Project fees"
            body="Pay a designer in Buenos Aires or a dev in Hanoi with a milestone-based vesting. They see the tokens unlock as work lands."
          />
          <PersonaCard
            label="Advisors & KOLs"
            title="Token grants"
            body="Strategic advisors and KOLs typically vest over 12–24 months. Give them a branded app instead of an expected-claim spreadsheet."
          />
          <PersonaCard
            label="Grantees"
            title="Ecosystem funding"
            body="DAOs and foundations paying grantees via vesting can hand them a recipient app instead of a README pointing at a block explorer."
          />
        </div>
      </section>

      {/* ── How it works — presumes vestings already exist ──────────────── */}
      <section id="how-it-works" className="px-4 md:px-8 max-w-5xl mx-auto pb-16 md:pb-24 scroll-mt-24">
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
            From your existing vestings to a live app your team uses
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: THEME.slateBody }}>
            Assumes you&rsquo;ve already set up the on-chain vestings. If you
            haven&rsquo;t yet, pick any protocol we index and come back.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StepCard
            n={1}
            title="Create your corporate account"
            body="Email sign-in for your org. Add teammates who should manage the payroll surface; the rest of your company doesn't need access here."
          />
          <StepCard
            n={2}
            title="Upload recipient wallets"
            body="Paste the list of wallet addresses you're vesting to, or invite by email and we'll collect wallets during their onboarding. Batch-upload supported for 200+ recipients."
          />
          <StepCard
            n={3}
            title="Customise the app (optional)"
            body="Set your company logo, brand colours, and welcome message. Your team sees Acme Corp branding on the loading screen and throughout the app — not ours."
          />
          <StepCard
            n={4}
            title="Your team downloads and goes live"
            body="Every recipient gets an invite to download the Vestream Corporate app. 24/7 access to their vesting live feed, push notifications before every unlock, and local-currency conversion — whether they're at their desk or on a plane."
          />
        </div>
      </section>

      {/* ── 24/7 access — replaces the old "Monday morning" section ─────── */}
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
              background: "radial-gradient(circle, rgba(63,165,104,0.25) 0%, transparent 65%)",
            }}
            aria-hidden
          />

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 p-8 md:p-12">
            <div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-5"
                style={{
                  background: "rgba(63,165,104,0.2)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  letterSpacing: "0.12em",
                }}
              >
                For your recipients
              </div>
              <h2
                className="text-2xl md:text-3xl font-bold mb-4"
                style={{ letterSpacing: "-0.02em", color: "white" }}
              >
                Payroll visibility that works on their schedule, not yours
              </h2>
              <p
                className="text-sm md:text-base mb-6"
                style={{ color: "rgba(255,255,255,0.75)" }}
              >
                Your team spans time zones. Someone in Berlin checks at 9 AM,
                someone in Seoul at 6 PM, someone in Mexico City at midnight.
                The app is live 24/7 from wherever they are. No payroll
                cut-off, no spreadsheet emailed on the 1st, no &ldquo;I&rsquo;ll
                ask HR tomorrow.&rdquo;
              </p>
              <ul className="space-y-3 text-sm md:text-base" style={{ color: "rgba(255,255,255,0.8)" }}>
                <EmployeeBullet>
                  Current vesting balance, live-counting by the second
                </EmployeeBullet>
                <EmployeeBullet>
                  Next unlock countdown — push-alerted 24 hours out
                </EmployeeBullet>
                <EmployeeBullet>
                  Local-currency conversion (GBP, EUR, PHP, BRL, MXN…)
                </EmployeeBullet>
                <EmployeeBullet>
                  One-tap claim the moment tokens unlock
                </EmployeeBullet>
                <EmployeeBullet>
                  Full vesting schedule — past 12 and next 12 months
                </EmployeeBullet>
                <EmployeeBullet>
                  Tax-ready export at year end (CSV, PDF)
                </EmployeeBullet>
              </ul>
            </div>

            {/* Phone mockup — branded with a placeholder company, showing
                the live-feed panel that's the hero of this pitch. */}
            <div className="flex items-center justify-center">
              <div
                className="rounded-[2rem] overflow-hidden w-[200px] h-[380px] relative"
                style={{
                  background: "white",
                  border: "6px solid #0b1222",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                }}
              >
                <div
                  className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full"
                  style={{ background: "#0b1222" }}
                  aria-hidden
                />
                <div className="pt-7 pb-3 px-3" style={{ background: "#F5F5F3" }}>
                  <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: THEME.slateFaint }}>
                    Acme Corp
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      aria-hidden
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: THEME.accentGreen }}
                    />
                    <div className="text-[9px] font-semibold" style={{ color: THEME.accentGreen }}>LIVE · per-second</div>
                  </div>
                </div>
                <div className="px-3 py-4">
                  <div
                    className="rounded-xl p-3"
                    style={{
                      background: `linear-gradient(135deg, ${THEME.accentIndigo}, #0F8A8A)`,
                      color: "white",
                    }}
                  >
                    <div className="text-[9px] opacity-80 uppercase tracking-widest">Vested right now</div>
                    <div className="text-base font-bold tabular-nums">12,480.32 USDC</div>
                    <div className="text-[9px] opacity-80">≈ £9,850 GBP</div>
                  </div>
                </div>
                <div className="px-3 pb-2">
                  <div
                    className="rounded-lg p-2"
                    style={{ background: "rgba(63,165,104,0.08)", border: `1px solid ${THEME.accentGreenBr}` }}
                  >
                    <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: THEME.accentGreen }}>
                      Next unlock
                    </div>
                    <div className="text-[10px] font-semibold" style={{ color: THEME.navyDeep }}>
                      2,083 USDC · in 4d 17h
                    </div>
                  </div>
                </div>
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

      {/* ── Security posture — pre-empts the #1 B2B objection ───────────
          "We're not adding another custodian" is the single biggest
          concern a finance / security team will have. Address it head-on
          with a dedicated section so the reader doesn't have to infer it
          from marketing copy. */}
      <section className="px-4 md:px-8 max-w-4xl mx-auto pb-16 md:pb-24">
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
            style={{
              background:  THEME.accentGreenBg,
              color:       THEME.accentGreen,
              border:      `1px solid ${THEME.accentGreenBr}`,
              letterSpacing: "0.12em",
            }}
          >
            Security
          </div>
          <h2
            className="text-2xl md:text-3xl font-bold mb-4"
            style={{ letterSpacing: "-0.02em", color: THEME.navyDeep }}
          >
            Your team&rsquo;s money never passes through us
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: THEME.slateBody }}>
            Vestream is a read-only viewer sitting on top of the vesting
            contracts you already trust. Your security team can verify
            every claim below against the contract directly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SecurityPoint
            label="01"
            title="No custody, ever"
            body="We never hold funds, gas, or private keys. Your team claims straight from the vesting contract to their own wallet. We can't transfer, block, or freeze anything."
          />
          <SecurityPoint
            label="02"
            title="Read-only everywhere"
            body="The app connects to public subgraphs and node RPCs to index vesting state. No write permissions, no approval scopes, no way for us to mutate the chain."
          />
          <SecurityPoint
            label="03"
            title="Contract is source of truth"
            body="Every number in the app reconciles to a call against the original vesting contract. When audits happen, the chain shows the truth — we show a readable view of it."
          />
        </div>
      </section>

      {/* ── Why now — market moment ────────────────────────────────────── */}
      <section className="px-4 md:px-8 max-w-4xl mx-auto pb-16 md:pb-24">
        <div className="text-center mb-10">
          <h2
            className="text-2xl md:text-3xl font-bold mb-4"
            style={{ letterSpacing: "-0.02em", color: THEME.navyDeep }}
          >
            Why the live-salary experience matters
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: THEME.slateBody }}>
            Stablecoin payroll is already standard at remote-first crypto teams.
            The bottleneck isn&rsquo;t the on-chain part — it&rsquo;s giving
            recipients a way to actually live with it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RationaleCard
            title="Retention"
            body="Employees who can see their vesting tick in a real app feel paid. Those who get a Notion doc with a claim URL feel like they're chasing their own salary. One of these is going to keep people around longer."
          />
          <RationaleCard
            title="Cross-border reach"
            body="A contractor in Lagos or Manila sees their USDC in minutes — in their local currency, at a price feed they can trust — not $40 eaten at each end of a SWIFT wire five days later."
          />
          <RationaleCard
            title="Compliance-ready"
            body="Auditors, tax authorities, and employees can verify what's been promised and claimed. Exportable records, not a screenshot of Etherscan taken at year end."
          />
          <RationaleCard
            title="Zero added trust"
            body="Vestream never holds funds or custody. The on-chain vesting contract remains the source of truth. We're a read-only viewer with a great UI — not a new party between you and your team."
          />
        </div>
      </section>

      {/* ── Common questions — pre-empt the blockers that stop enquiries
          before they happen. Kept tight (5 items) so the page doesn't
          turn into a help doc — serious questions belong in a follow-up
          conversation. Uses native <details> for accessible accordion. */}
      <section className="px-4 md:px-8 max-w-3xl mx-auto pb-16 md:pb-24">
        <div className="text-center mb-10">
          <h2
            className="text-2xl md:text-3xl font-bold mb-4"
            style={{ letterSpacing: "-0.02em", color: THEME.navyDeep }}
          >
            Common questions
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: THEME.slateBody }}>
            If yours isn&rsquo;t here,{" "}
            <Link href="/contact?subject=token-payroll" className="font-semibold" style={{ color: THEME.accentIndigo }}>
              ask us
            </Link>
            {" "}— we&rsquo;ll reply in under two business days.
          </p>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: THEME.surface, border: `1px solid ${THEME.border}` }}
        >
          <FaqItem
            q="Which vesting protocols do you support?"
            a="Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid, and PinkSale across Ethereum, Base, BSC, and Polygon. If you're using a protocol we don't index yet, tell us — we'll quote a timeline."
          />
          <FaqItem
            q="Can we use this without Vestream touching our payroll?"
            a="Yes. You keep your existing process for creating vestings — legal, finance, whichever protocol fits. Vestream only reads what's already on-chain. You can stop using us at any time without touching a vesting contract."
          />
          <FaqItem
            q="How long to go live once we sign up?"
            a="Typical setup is 3–5 working days after we receive your wallet list and branding. Faster if you don't need custom branding — we can have the stock Vestream Corporate app active for your recipients within 24 hours."
          />
          <FaqItem
            q="What does it cost?"
            a="Pricing is per-recipient-seat per month, with volume brackets for larger teams. We're not publishing a public rate yet while we shape it with early partners. Ballpark: comparable to a standard SaaS HR seat. Reach out and we'll share the current bracket."
          />
          <FaqItem
            q="What happens to our recipients' data?"
            a="Wallet addresses and display preferences are stored in our database. Local-currency conversions happen client-side using public price feeds — we don't track spend patterns. No KYC, no identity verification unless you explicitly configure it for your use case."
          />
          <FaqItem
            q="Can we white-label the app for our company?"
            a="Yes. Logo and brand colours on the loading screen and throughout the app's surfaces. Full custom domain for the invite link is available on the business tier. Native app stores still list it as Vestream Corporate — we're not yet shipping per-company app-store builds."
            isLast
          />
        </div>
      </section>

      {/* ── Final CTA — waitlist / interest-capture, not "book a demo" ── */}
      <section className="px-4 md:px-8 max-w-3xl mx-auto pb-24 md:pb-32">
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
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(63,165,104,0.08) 0%, transparent 70%)",
            }}
            aria-hidden
          />
          <div className="relative">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-5"
              style={{
                background: THEME.accentIndigoBg,
                color:      THEME.accentIndigo,
                border:     `1px solid ${THEME.accentIndigoBr}`,
                letterSpacing: "0.12em",
              }}
            >
              Early access
            </div>
            <h2
              className="text-2xl md:text-3xl font-bold mb-3"
              style={{ letterSpacing: "-0.02em", color: THEME.navyDeep }}
            >
              Want this for your team?
            </h2>
            <p
              className="text-sm md:text-base mb-8 max-w-xl mx-auto"
              style={{ color: THEME.slateBody }}
            >
              Token Payroll isn&rsquo;t publicly launched yet — we&rsquo;re
              working with a small group of companies to shape it. If live
              salary visibility sounds like something your team would use,
              leave your details and we&rsquo;ll get in touch. No demo call,
              no sales pitch — just a 10-minute read-out on whether we&rsquo;d
              be a fit and when you could be live.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/contact?subject=token-payroll"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm"
                style={{
                  background: `linear-gradient(135deg, ${THEME.accentIndigo}, #0F8A8A)`,
                  color: "white",
                  boxShadow: "0 4px 24px rgba(63,165,104,0.3)",
                }}
              >
                Register your interest →
              </Link>
            </div>
            <p className="text-xs mt-5" style={{ color: THEME.slateFaint }}>
              Typical response: within 2 business days. We&rsquo;re not gated
              on enterprise contracts — small teams welcome.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />
    </main>
  );
}

// ─── Page-local components ──────────────────────────────────────────────────

function ValueCard({
  icon, title, body,
}: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      {/* Icon tile — sized container gives the stroke icon visual weight
          consistent with the H3 below. Same pattern used on the /developer
          and /ai pages so these cards feel like Vestream, not a stock
          template. */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{
          background: THEME.accentIndigoBg,
          border: `1px solid ${THEME.accentIndigoBr}`,
        }}
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
          background: `linear-gradient(135deg, ${THEME.accentIndigo}, #0F8A8A)`,
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

function PersonaCard({
  label, title, body,
}: { label: string; title: string; body: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-widest mb-3"
        style={{ color: THEME.accentIndigo, letterSpacing: "0.12em" }}
      >
        {label}
      </div>
      <h3 className="text-base font-semibold mb-2" style={{ color: THEME.navyDeep }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: THEME.slateBody }}>
        {body}
      </p>
    </div>
  );
}

function SecurityPoint({
  label, title, body,
}: { label: string; title: string; body: string }) {
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
        className="text-[11px] font-mono font-bold mb-3 tabular-nums"
        style={{ color: THEME.accentGreen }}
      >
        {label}
      </div>
      <h3 className="text-base font-semibold mb-2" style={{ color: THEME.navyDeep }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: THEME.slateBody }}>
        {body}
      </p>
    </div>
  );
}

function FaqItem({
  q, a, isLast,
}: { q: string; a: string; isLast?: boolean }) {
  return (
    <details
      className="group"
      style={{ borderBottom: isLast ? undefined : `1px solid ${THEME.border}` }}
    >
      <summary
        className="px-4 md:px-6 py-4 cursor-pointer select-none flex items-center justify-between gap-4"
        style={{ color: THEME.navyDeep }}
      >
        <span className="text-sm md:text-base font-semibold">{q}</span>
        <span
          aria-hidden
          className="flex-shrink-0 text-xs transition-transform group-open:rotate-180"
          style={{ color: THEME.slateFaint }}
        >
          ▼
        </span>
      </summary>
      <div
        className="px-4 md:px-6 pb-5 text-sm leading-relaxed"
        style={{ color: THEME.slateBody }}
      >
        {a}
      </div>
    </details>
  );
}
