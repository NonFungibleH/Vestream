// src/app/demo/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Three-demo walkthrough of the product:
//
//   A. Interactive demo (90 seconds, no signup)
//      A fully client-side, 3-step guided walkthrough of the claim flow:
//      Scan → Alerted → Claim. Good for visitors in a hurry.
//
//   B. Design-a-vesting + App Store funnel (no signup)
//      User designs a sample schedule (token symbol, amount, duration) and is
//      funnelled to the App Store to see it tick live on the mobile app.
//      Browser simulation is available as a hidden "Run simulation" expander
//      for QA + power users, but the hero path is the App Store.
//
//   C. Deploy-your-own on Sepolia via thirdweb (~10 min, real on-chain)
//      Three deep-links to the Google Cloud Sepolia faucet, a thirdweb
//      ERC-20 token deploy, and a thirdweb vesting contract. Vestream
//      auto-indexes VestingWallet contracts on Sepolia, so once deployed
//      the user can verify the full indexing loop end-to-end.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { InteractiveDemo } from "@/components/InteractiveDemo";
import { VestingDemo } from "@/components/VestingDemo";

export const metadata: Metadata = {
  title: "Interactive + live vesting demo · Vestream",
  description: "Three demos in one page — a 90-second walkthrough of the claim flow, a downloadable app demo to watch a live vesting on your phone, and a build-your-own Sepolia vesting you can deploy with thirdweb.",
  alternates: { canonical: "https://vestream.io/demo" },
};

// External deep-links used by Demo C. The flow is now unified on Team Finance
// for steps 2 + 3, so the user minting a token and creating a vesting is the
// same thing a real team would do in production — not a faucet-and-Sablier
// workaround. Team Finance is one of our indexed protocols on Sepolia (see
// supportedChainIds in adapters/team-finance.ts), so the tokens AND the
// vesting both land in Vestream automatically, closing the loop end-to-end.
//
//   SEPOLIA_ETH_FAUCET    → free Sepolia ETH for gas (Google Cloud faucet)
//   TEAM_FINANCE_MINT     → Token Mint — deploy a real ERC-20 on Sepolia
//                           with a custom name, symbol, and supply, no
//                           contract code required
//   TEAM_FINANCE_VESTING  → Create the vesting using the token just minted
const SEPOLIA_ETH_FAUCET    = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";
const TEAM_FINANCE_MINT     = "https://www.team.finance/mint";
const TEAM_FINANCE_VESTING  = "https://www.team.finance/vesting";

export default function DemoPage() {
  return (
    <main className="min-h-screen" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pt-24 md:pt-32 pb-8 md:pb-10">
        <div className="text-center mb-6 md:mb-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{
              background: "rgba(28,184,184,0.06)",
              color: "#1CB8B8",
              border: "1px solid rgba(28,184,184,0.2)",
            }}
          >
            Three demos · No signup for A + B · ~90s → ~10min
          </div>

          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-bold mb-5"
            style={{ letterSpacing: "-0.03em", color: "#1A1D20" }}
          >
            See the claim flow,<br className="hidden md:block" />{" "}
            <span style={{ color: "#1CB8B8" }}>then try it live</span>
          </h1>
          <p className="text-base md:text-lg max-w-2xl mx-auto" style={{ color: "#8B8E92", lineHeight: 1.6 }}>
            <strong style={{ color: "#1A1D20" }}>A.</strong> A 90-second interactive walkthrough.{" "}
            <strong style={{ color: "#1A1D20" }}>B.</strong> Design a vesting and watch it live on the mobile app.{" "}
            <strong style={{ color: "#1A1D20" }}>C.</strong> Deploy a real on-chain vesting on Sepolia via thirdweb.
          </p>
        </div>
      </section>

      {/* ── Demo A — Interactive walkthrough ─────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-10 md:pb-14">
        <DemoIntro
          letter="A"
          eyebrow="Demo A · 90 seconds"
          title="Interactive walkthrough"
          copy="A guided, 3-step tour of how Vestream finds vestings, pushes alerts to your phone, and takes you to claim. Everything is mocked so you can click through without signing anything."
        />
        <InteractiveDemo />

        {/* Small divider with hand-off copy. Dividers hide at < sm so the
            label gets full width and doesn't wrap awkwardly between two
            shrunken rules at 375px. */}
        <div className="flex items-center justify-center gap-4 mt-10 md:mt-12 mb-2">
          <div className="hidden sm:block h-px flex-1 max-w-[120px]" style={{ background: "rgba(21,23,26,0.10)" }} />
          <span className="text-xs font-semibold uppercase tracking-widest text-center" style={{ color: "#B8BABD" }}>
            Now try the real thing
          </span>
          <div className="hidden sm:block h-px flex-1 max-w-[120px]" style={{ background: "rgba(21,23,26,0.10)" }} />
        </div>
      </section>

      {/* ── Demo B — Design a vesting, see it live on the app ─────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <DemoIntro
          letter="B"
          eyebrow="Demo B · Design your vesting · See it live on the app"
          title="Spin up a sample vesting schedule"
          copy="Pick the token name, amount, and duration below. Then download the Vestream app to watch that vesting tick down in real time on your phone &mdash; including native push notifications the moment tokens unlock. No Sepolia ETH, no wallet signature, nothing to sign up for."
        />

        <VestingDemo />

        {/* Guidance — 3 steps that match the new B flow */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <GuideCard
            n="1"
            title="Design your vesting"
            body="Pick a token symbol, amount, and duration. VEST and NOVA are our canonical demo tokens — whatever you set here will be your sandbox on the app."
          />
          <GuideCard
            n="2"
            title="Download the app"
            body="Install Vestream from the App Store or Google Play. Sign in with your email and your designed vesting is ready to watch from the dashboard."
          />
          <GuideCard
            n="3"
            title="See it tick + claim"
            body="Your vesting ticks down in the app with native push alerts on every unlock milestone. Hit Claim at any point to simulate a mid-stream withdrawal."
          />
        </div>

        {/* Secondary CTAs under the design-your-vesting card */}
        <div className="mt-8 flex items-center justify-center gap-4 flex-wrap text-sm">
          <Link
            href="/find-vestings"
            className="font-medium hover:underline"
            style={{ color: "#1CB8B8" }}
          >
            Scan your own wallet →
          </Link>
          <span style={{ color: "#cbd5e1" }}>·</span>
          <Link
            href="/early-access"
            className="font-medium hover:underline"
            style={{ color: "#1CB8B8" }}
          >
            Get early access on web →
          </Link>
        </div>

        {/* Divider into Demo C. Same mobile rule as above. */}
        <div className="flex items-center justify-center gap-4 mt-12 md:mt-14 mb-2">
          <div className="hidden sm:block h-px flex-1 max-w-[120px]" style={{ background: "rgba(21,23,26,0.10)" }} />
          <span className="text-xs font-semibold uppercase tracking-widest text-center" style={{ color: "#B8BABD" }}>
            Or deploy a real vesting on Sepolia
          </span>
          <div className="hidden sm:block h-px flex-1 max-w-[120px]" style={{ background: "rgba(21,23,26,0.10)" }} />
        </div>
      </section>

      {/* ── Demo C — Deploy a live Sepolia vesting via thirdweb ──────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <DemoIntro
          letter="C"
          eyebrow="Demo C · ~10 minutes · Real on-chain"
          title="Create a real Sepolia vesting Vestream will index"
          copy="If you want to see Vestream track a real on-chain vesting end-to-end &mdash; not a simulation &mdash; the three steps below walk you from zero to an indexed Sepolia vesting in about ten minutes. Grab some Sepolia ETH for gas, mint a test token with Team Finance, then create a vesting schedule for it &mdash; all on Team Finance&rsquo;s Sepolia app, which Vestream indexes automatically."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DeployStep
            n="1"
            title="Get Sepolia ETH"
            body="You'll need a tiny bit of Sepolia ETH (~0.01 ETH) to cover gas for minting the token and creating the vesting. The Google Cloud faucet drops test ETH instantly, once per day, straight to any address you paste in."
            href={SEPOLIA_ETH_FAUCET}
            cta="Open the Google Cloud faucet"
            accent="#C47A1A"
            accentBg="rgba(245,158,11,0.08)"
            accentBorder="rgba(245,158,11,0.22)"
          />

          <DeployStep
            n="2"
            title="Mint your test token"
            body="Team Finance's Token Mint deploys a real ERC-20 on Sepolia with a custom name, symbol, and supply. Connect, switch chain to Sepolia, name your token, and mint — you now have something to vest in step 3."
            href={TEAM_FINANCE_MINT}
            cta="Open Team Finance Mint"
            accent="#1CB8B8"
            accentBg="rgba(28,184,184,0.08)"
            accentBorder="rgba(28,184,184,0.22)"
          />

          <DeployStep
            n="3"
            title="Create a vesting schedule"
            body="Same app, different tab. Pick the token you just minted, set a recipient + duration, and submit. Within a minute Vestream auto-indexes the vesting — scan the recipient wallet on /find-vestings to see it live."
            href={TEAM_FINANCE_VESTING}
            cta="Open Team Finance Vesting"
            accent="#2D8A4A"
            accentBg="rgba(45,138,74,0.08)"
            accentBorder="rgba(45,138,74,0.22)"
          />
        </div>

        {/* Note on why the whole flow sits on Team Finance (mint + vesting):
            thirdweb blocks iframe embedding (wallet-signing security) and even
            their deep-linked deploy is a 4-step shuffle (deploy contract →
            mint → fund vesting → configure) that stalls pre-launch demo
            users. Team Finance's Sepolia app handles mint + vesting in the
            same UI, and because we already index Team Finance on Sepolia the
            tokens AND the vesting appear in Vestream automatically — no
            separate block-explorer step. */}
        <div
          className="mt-6 rounded-2xl p-4 text-xs flex items-start gap-3"
          style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(21,23,26,0.10)", color: "#8B8E92" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p style={{ lineHeight: 1.55 }}>
            All three steps open in a new tab (each tool requires its own wallet connection and can&rsquo;t be iframed for security reasons). Once your vesting is live on Team Finance, scan the recipient wallet on <Link href="/find-vestings" className="font-semibold underline" style={{ color: "#1CB8B8" }}>Find vestings</Link> to watch Vestream index it.
          </p>
        </div>
      </section>

      {/* ── Why this matters ────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
            What you just saw, in real life
          </h2>
          <p className="text-sm md:text-base max-w-2xl mx-auto" style={{ color: "#8B8E92" }}>
            The demos are compressed &mdash; here&rsquo;s what each step actually looks like once you&rsquo;re using Vestream day-to-day.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step
            n="1"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
              </svg>
            }
            title="Scan any wallet, across every protocol"
            body="One address, every integrated protocol, four mainnets. Vestream pings every supported vesting platform in parallel so you never have to check them one by one."
          />
          <Step
            n="2"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
            }
            title="Push alerts the moment tokens unlock"
            body="The #1 reason our users stay &mdash; no more missed unlocks. Get a notification on your phone the instant a stream makes new tokens claimable."
          />
          <Step
            n="3"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              </svg>
            }
            title="Claim on the source protocol"
            body="Vestream never touches your tokens. We deep-link straight to Sablier, Hedgey, or wherever the stream lives &mdash; you claim on their audited contract."
          />
        </div>
      </section>

      {/* ── Mobile app CTA ─────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14 md:pb-24">
        <div
          className="rounded-3xl p-8 md:p-12 text-center overflow-hidden relative"
          style={{
            background: "linear-gradient(135deg, #1A1D20 0%, #1e293b 100%)",
            boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
          }}
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 20% 30%, rgba(28,184,184,0.4), transparent 40%), radial-gradient(circle at 80% 70%, rgba(15,138,138,0.4), transparent 40%)",
            }}
          />
          <div className="relative">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-5"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              📱 iOS + Android
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "white", letterSpacing: "-0.02em" }}>
              This, on your phone &mdash; for every unlock
            </h2>
            <p className="text-sm md:text-base max-w-xl mx-auto mb-7" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
              The demo you just ran is exactly what the real app does &mdash; except it runs 24/7 on your wallets, in the background, and pings you the second a token unlocks.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/early-access"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{
                  background: "#1CB8B8",
                  color: "white",
                  boxShadow: "0 4px 20px rgba(28,184,184,0.4)",
                }}
              >
                Get early access →
              </Link>
              <Link
                href="/find-vestings"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                Scan my wallet →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <SiteFooter theme="light" note="Demo A + B use illustrative data so you can explore without signing anything. Demo C deploys real contracts on Sepolia testnet via thirdweb — no real money, no mainnet risk." />
    </main>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function DemoIntro({
  letter, eyebrow, title, copy,
}: {
  letter: string; eyebrow: string; title: string; copy: string;
}) {
  return (
    <div className="mb-6 md:mb-8 flex items-start gap-4">
      <div
        className="flex-shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center text-lg md:text-xl font-extrabold"
        style={{
          background: "#1CB8B8",
          color: "white",
          boxShadow: "0 4px 20px rgba(28,184,184,0.25)",
        }}
      >
        {letter}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: "#B8BABD" }}>
          {eyebrow}
        </div>
        <h2 className="text-xl md:text-2xl font-bold mb-1.5" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
          {title}
        </h2>
        <p className="text-sm md:text-base" style={{ color: "#8B8E92", lineHeight: 1.55 }}>
          {copy}
        </p>
      </div>
    </div>
  );
}

function GuideCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: "#1CB8B8" }}
        >
          {n}
        </div>
        <div className="text-sm font-semibold" style={{ color: "#1A1D20" }}>
          {title}
        </div>
      </div>
      <p className="text-xs" style={{ color: "#8B8E92", lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}

function DeployStep({
  n, title, body, href, cta, accent, accentBg, accentBorder,
}: {
  n:            string;
  title:        string;
  body:         string;
  href:         string;
  cta:          string;
  accent:       string;
  accentBg:     string;
  accentBorder: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold"
          style={{ background: accentBg, color: accent, border: `1px solid ${accentBorder}` }}
        >
          {n}
        </div>
        <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#B8BABD" }}>
          Step {n}
        </div>
      </div>
      <h3 className="text-base font-semibold mb-1.5" style={{ color: "#1A1D20", letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p className="text-sm flex-1 mb-4" style={{ color: "#8B8E92", lineHeight: 1.55 }}>
        {body}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-all hover:-translate-y-0.5"
        style={{ background: accentBg, color: accent, border: `1px solid ${accentBorder}` }}
      >
        {cta} ↗
      </a>
    </div>
  );
}

function Step({ n, title, body, icon }: { n: string; title: string; body: string; icon: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(28,184,184,0.08)", color: "#1CB8B8" }}
        >
          {icon}
        </div>
        <div
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "#B8BABD" }}
        >
          Step {n}
        </div>
      </div>
      <h3 className="text-base font-semibold mb-1.5" style={{ color: "#1A1D20" }}>
        {title}
      </h3>
      <p className="text-sm" style={{ color: "#8B8E92", lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}

