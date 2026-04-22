// src/app/demo/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Interactive product demo — a ~90 second walkthrough of the real claim flow:
//
//   1. Find     — scan 7 protocols for vestings on a fake wallet
//   2. Alerted  — mock mobile app + push notification
//   3. Claim    — mock Sablier UI + wallet popup + tx success
//
// Pure client-side (no API round-trips). User-paced with auto-animations.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { InteractiveDemo } from "@/components/InteractiveDemo";

export const metadata: Metadata = {
  title: "Interactive product demo · Vestream",
  description: "See Vestream in 90 seconds — scan a wallet, get a push alert when tokens unlock, and claim them on the source protocol. No signup required.",
  alternates: { canonical: "https://vestream.io/demo" },
};

export default function DemoPage() {
  return (
    <main className="min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>
      <SiteNav theme="light" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pt-24 md:pt-32 pb-10 md:pb-14">
        <div className="text-center mb-8 md:mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{
              background: "rgba(37,99,235,0.06)",
              color: "#2563eb",
              border: "1px solid rgba(37,99,235,0.2)",
            }}
          >
            Interactive · 90 seconds · No signup
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
            The whole claim flow,<br className="hidden md:block" /> in one demo
          </h1>
          <p className="text-base md:text-lg max-w-2xl mx-auto" style={{ color: "#64748b", lineHeight: 1.6 }}>
            Walk through the real Vestream experience &mdash; scanning a wallet, getting a push alert when tokens unlock, and claiming on the source protocol. All of it, in under two minutes.
          </p>
        </div>

        {/* The demo widget */}
        <InteractiveDemo />

        {/* Secondary CTAs */}
        <div className="mt-8 flex items-center justify-center gap-4 flex-wrap text-sm">
          <Link
            href="/find-vestings"
            className="font-medium hover:underline"
            style={{ color: "#2563eb" }}
          >
            Try it on your own wallet →
          </Link>
          <span style={{ color: "#cbd5e1" }}>·</span>
          <Link
            href="/early-access"
            className="font-medium hover:underline"
            style={{ color: "#2563eb" }}
          >
            Get early access to the app →
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
            The demo is compressed &mdash; here&rsquo;s what each step actually looks like once you&rsquo;re using Vestream day-to-day.
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
      <footer className="max-w-5xl mx-auto px-4 md:px-8 pb-12">
        <div className="pt-8 flex items-center justify-between flex-wrap gap-4" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
          <p className="text-xs" style={{ color: "#94a3b8" }}>
            © 2026 Vestream. The demo uses illustrative data; real scans index on-chain contracts and subgraphs.
          </p>
          <div className="flex items-center gap-4 md:gap-5 flex-wrap">
            <Link href="/developer" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Developer API</Link>
            <Link href="/ai" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>AI Agents</Link>
            <Link href="/resources" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Resources</Link>
            <Link href="/privacy" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Privacy Policy</Link>
            <Link href="/terms" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Terms of Service</Link>
          </div>
        </div>
      </footer>
    </main>
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
