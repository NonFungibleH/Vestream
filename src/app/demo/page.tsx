// src/app/demo/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Two-demo walkthrough of the product:
//
//   A. Interactive demo (90 seconds, no signup)
//      A fully client-side, 3-step guided walkthrough of the claim flow:
//      Scan → Alerted → Claim. Good for visitors in a hurry.
//
//   B. Live demo (15 minutes, real state)
//      A real vesting schedule that ticks in real time. In production (Sepolia
//      mode) it's a real VestingWallet on Sepolia with an actual on-chain
//      release() tx; locally / without env vars it runs as pure-math
//      simulation. Either way, the user can tap through, claim, and see
//      state change — including a push alert arriving on their phone.
//
// The two are stacked vertically with guiding copy between them so the user
// understands what they're looking at.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { InteractiveDemo } from "@/components/InteractiveDemo";
import { VestingDemo } from "@/components/VestingDemo";

export const metadata: Metadata = {
  title: "Interactive + live vesting demo · Vestream",
  description: "Two demos in one page — a 90-second interactive walkthrough of the claim flow, and a real 15-minute vesting schedule on Sepolia you can watch and claim yourself.",
  alternates: { canonical: "https://vestream.io/demo" },
};

const SEPOLIA_FAUCET = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";

export default function DemoPage() {
  return (
    <main className="min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>
      <SiteNav theme="light" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pt-24 md:pt-32 pb-8 md:pb-10">
        <div className="text-center mb-6 md:mb-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{
              background: "rgba(37,99,235,0.06)",
              color: "#2563eb",
              border: "1px solid rgba(37,99,235,0.2)",
            }}
          >
            Two demos · No signup · ~90s + 15min
          </div>

          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-bold mb-5"
            style={{
              letterSpacing: "-0.03em",
              background: "linear-gradient(135deg, #0f172a 0%, #2563eb 50%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            See the claim flow,<br className="hidden md:block" /> then try it live
          </h1>
          <p className="text-base md:text-lg max-w-2xl mx-auto" style={{ color: "#64748b", lineHeight: 1.6 }}>
            Start with the 90-second interactive walkthrough to understand what Vestream does.
            Then drop down to the live demo &mdash; a real vesting schedule you can watch tick and claim yourself.
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

        {/* Small divider with hand-off copy */}
        <div className="flex items-center justify-center gap-4 mt-10 md:mt-12 mb-2">
          <div className="h-px flex-1 max-w-[120px]" style={{ background: "rgba(0,0,0,0.08)" }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#94a3b8" }}>
            Now try the real thing
          </span>
          <div className="h-px flex-1 max-w-[120px]" style={{ background: "rgba(0,0,0,0.08)" }} />
        </div>
      </section>

      {/* ── Demo B — Live 15-min vesting ──────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <DemoIntro
          letter="B"
          eyebrow="Demo B · 15 minutes · Live state"
          title="Spin up a real vesting schedule"
          copy="This is a real 15-minute vesting schedule &mdash; in production, a VestingWallet deployed on Sepolia that unlocks 1,000 DEMO tokens linearly. Press Start, watch the bar tick, and claim whenever you like. If you have our app installed, you'll get a push notification the moment tokens unlock."
        />

        <VestingDemo />

        {/* Guidance — what to do after starting */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <GuideCard
            n="1"
            title="Press Start"
            body="Kicks off a 15-minute linear vest of 1,000 DEMO. No wallet connection required — your session lives in a cookie."
          />
          <GuideCard
            n="2"
            title="Watch it tick"
            body="The bar updates every 2 seconds. If you install the mobile app and scan this demo wallet, the same unlock triggers a real push alert."
          />
          <GuideCard
            n="3"
            title="Claim anytime"
            body="You don't have to wait. Hit Claim at any point to release whatever's currently vested — simulating a mid-stream withdrawal."
          />
        </div>

        {/* Sepolia-only helper — faucet + how to get the on-chain version */}
        <div
          className="mt-6 rounded-2xl p-5 md:p-6 flex items-start gap-4 flex-wrap"
          style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <div
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.15)", color: "#d97706" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="text-sm font-bold mb-1" style={{ color: "#0f172a" }}>
              Want the real on-chain version?
            </div>
            <p className="text-xs md:text-sm mb-3" style={{ color: "#64748b", lineHeight: 1.55 }}>
              When the Sepolia demo contracts are configured, the same widget above broadcasts a real{" "}
              <code className="font-mono px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.05)" }}>release()</code>{" "}
              transaction on Sepolia and a tx link appears inline. You can grab free Sepolia ETH for gas from the Google Cloud faucet.
            </p>
            <a
              href={SEPOLIA_FAUCET}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
              style={{ color: "#d97706" }}
            >
              Get Sepolia ETH from the Google Cloud faucet ↗
            </a>
          </div>
        </div>

        {/* Secondary CTAs under live demo */}
        <div className="mt-8 flex items-center justify-center gap-4 flex-wrap text-sm">
          <Link
            href="/find-vestings"
            className="font-medium hover:underline"
            style={{ color: "#2563eb" }}
          >
            Scan your own wallet →
          </Link>
          <span style={{ color: "#cbd5e1" }}>·</span>
          <Link
            href="/early-access"
            className="font-medium hover:underline"
            style={{ color: "#2563eb" }}
          >
            Get the app (early access) →
          </Link>
        </div>
      </section>

      {/* ── Why this matters ────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
            What you just saw, in real life
          </h2>
          <p className="text-sm md:text-base max-w-2xl mx-auto" style={{ color: "#64748b" }}>
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
            body="One address, seven protocols, four mainnets. Vestream indexes Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid and PinkSale in parallel."
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
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
          }}
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 20% 30%, rgba(37,99,235,0.4), transparent 40%), radial-gradient(circle at 80% 70%, rgba(124,58,237,0.4), transparent 40%)",
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
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: "white",
                  boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
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
      <SiteFooter theme="light" note="The interactive demo uses illustrative data; the live demo runs a real schedule (Sepolia when configured)." />
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
          background: "linear-gradient(135deg, #2563eb, #7c3aed)",
          color: "white",
          boxShadow: "0 4px 20px rgba(37,99,235,0.25)",
        }}
      >
        {letter}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: "#94a3b8" }}>
          {eyebrow}
        </div>
        <h2 className="text-xl md:text-2xl font-bold mb-1.5" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
          {title}
        </h2>
        <p className="text-sm md:text-base" style={{ color: "#64748b", lineHeight: 1.55 }}>
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
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
        >
          {n}
        </div>
        <div className="text-sm font-semibold" style={{ color: "#0f172a" }}>
          {title}
        </div>
      </div>
      <p className="text-xs" style={{ color: "#64748b", lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}

function Step({ n, title, body, icon }: { n: string; title: string; body: string; icon: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}
        >
          {icon}
        </div>
        <div
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "#94a3b8" }}
        >
          Step {n}
        </div>
      </div>
      <h3 className="text-base font-semibold mb-1.5" style={{ color: "#0f172a" }}>
        {title}
      </h3>
      <p className="text-sm" style={{ color: "#64748b", lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}

