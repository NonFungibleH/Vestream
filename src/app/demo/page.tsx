// src/app/demo/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Live 15-minute vesting demo. Light B2C theme.
//
// Sections:
//   1. Hero      — title + description + demo widget
//   2. How it works
//   3. Google Cloud Sepolia faucet card (testnet ETH)
//   4. Mobile app CTA — primary conversion
//   5. Footer (global convention)
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { VestingDemo } from "@/components/VestingDemo";
import { SEPOLIA_CONFIG } from "@/lib/demo/config";

export const metadata: Metadata = {
  title: "Live vesting demo — 15 minutes · Vestream",
  description: "See how Vestream tracks and claims token unlocks in real time. Watch 1,000 DEMO tokens vest over 15 minutes. No wallet or signup required.",
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
            Interactive · 15 minutes · Works without a wallet
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
            See a token unlock<br className="hidden md:block" /> in real time
          </h1>
          <p className="text-base md:text-lg max-w-2xl mx-auto" style={{ color: "#64748b", lineHeight: 1.6 }}>
            Every 0.6 seconds, another <span className="font-semibold" style={{ color: "#0f172a" }}>0.66 DEMO</span> tokens
            unlock. Watch Vestream&rsquo;s unlock engine tick in your browser — identical to what powers your production portfolio.
          </p>
        </div>

        {/* Demo widget */}
        <VestingDemo />

        {/* Secondary CTAs */}
        <div className="mt-8 flex items-center justify-center gap-4 flex-wrap text-sm">
          <Link
            href="/"
            className="font-medium hover:underline"
            style={{ color: "#2563eb" }}
          >
            ← Back to portfolio
          </Link>
          <span style={{ color: "#cbd5e1" }}>·</span>
          <Link
            href="/find-vestings"
            className="font-medium hover:underline"
            style={{ color: "#2563eb" }}
          >
            Find your own vestings →
          </Link>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
            What&rsquo;s happening behind the scenes
          </h2>
          <p className="text-sm md:text-base max-w-2xl mx-auto" style={{ color: "#64748b" }}>
            The demo uses the exact same indexing, normalisation, and claim logic that backs Vestream&rsquo;s live portfolio.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step
            n="1"
            title="Schedule starts"
            body="A vesting schedule is created with a total of 1,000 DEMO, a 15-minute duration, and no cliff — identical to an OpenZeppelin VestingWallet."
          />
          <Step
            n="2"
            title="Linear unlock"
            body="Every second, vested amount increases proportionally. Claimable balance = vested – already-claimed. You can claim as many times as you like."
          />
          <Step
            n="3"
            title="Gas-free UX"
            body="Claims are executed by our server — users see unlocks tick in real time without signing transactions. Same pattern Vestream exposes via MCP & the REST API."
          />
        </div>
      </section>

      {/* ── Sepolia faucet card ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <div
          className="rounded-3xl p-6 md:p-10 grid grid-cols-1 md:grid-cols-5 gap-8 items-center"
          style={{
            background: "linear-gradient(135deg, rgba(37,99,235,0.03), rgba(124,58,237,0.03))",
            border: "1px solid rgba(37,99,235,0.12)",
          }}
        >
          <div className="md:col-span-3">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
              style={{
                background: "rgba(245,158,11,0.1)",
                color: "#d97706",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              Optional · For advanced users
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
              Want to try with your own wallet?
            </h2>
            <p className="text-sm md:text-base mb-5" style={{ color: "#64748b", lineHeight: 1.6 }}>
              When Vestream is running in Sepolia mode, the demo vesting lives at a real contract on Sepolia testnet.
              Grab some free testnet ETH from Google Cloud&rsquo;s faucet and you can interact with it directly from your own wallet.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href={SEPOLIA_CONFIG.faucetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: "white",
                  boxShadow: "0 4px 20px rgba(37,99,235,0.25)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2v6m0 8v6m-9-9h6m8 0h6" />
                </svg>
                Open Google Cloud Sepolia faucet ↗
              </a>
              <a
                href={SEPOLIA_CONFIG.explorerBase}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-80 transition-opacity"
                style={{
                  background: "white",
                  border: "1px solid rgba(0,0,0,0.08)",
                  color: "#2563eb",
                }}
              >
                Sepolia Etherscan →
              </a>
            </div>
          </div>

          <div className="md:col-span-2">
            <ul className="space-y-3 text-sm" style={{ color: "#64748b" }}>
              <FaucetStep n="1">Sign in to Google Cloud (no card required)</FaucetStep>
              <FaucetStep n="2">Paste your wallet address</FaucetStep>
              <FaucetStep n="3">Receive 0.05 Sepolia ETH — enough for 100+ claim txs</FaucetStep>
              <FaucetStep n="4">Return here and claim on-chain</FaucetStep>
            </ul>
          </div>
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
              📱 Get instant push alerts
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Never miss a real unlock again
            </h2>
            <p className="text-sm md:text-base max-w-xl mx-auto mb-7" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
              This demo took 15 minutes. Real unlocks take months — but they drop in seconds. Get push alerts the moment your tokens unlock.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="/early-access"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: "white",
                  boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
                }}
              >
                Get early access →
              </a>
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
            © 2026 Vestream. Live demo — data is simulated unless Sepolia env vars are set.
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

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold mb-3"
        style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}
      >
        {n}
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

function FaucetStep({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
        style={{ background: "white", color: "#2563eb", border: "1px solid rgba(37,99,235,0.2)" }}
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
