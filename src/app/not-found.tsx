// 404 page — designed to retain visitors instead of bouncing them.
//
// Old design was a dead-end: 404 + "Go to dashboard" / "Back to home". Two
// buttons, the dashboard one gated behind an auth cookie most 404 hitters
// don't have.
//
// New design routes to the three destinations a lost visitor most plausibly
// wants:
//   1. Find your vestings  → primary CTA (action-oriented, our strongest UVP)
//   2. Browse protocols    → 9 indexed protocols, the SEO-magnet directory
//   3. Read articles       → 14 long-form guides, lowest-bounce-risk path
//
// Plus the full SiteNav so nothing is one click away. Plus a "report this"
// fallback so genuinely broken links surface rather than vanishing.

import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { listProtocols } from "@/lib/protocol-constants";
import { getAllArticles } from "@/lib/articles";

export const metadata = {
  title: "Page not found — Vestream",
  // Keep noindex: 404 pages should never rank.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  const protocolCount = listProtocols().length;
  const articleCount  = getAllArticles().length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      <SiteNav theme="light" />

      {/* Subtle dot grid — same texture as homepage */}
      <div className="fixed inset-0 pointer-events-none -z-10" style={{
        backgroundImage: `radial-gradient(circle, rgba(21,23,26,0.06) 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
      }} />

      <main className="flex-1 flex flex-col items-center px-4 md:px-8 pt-20 md:pt-28 pb-16 md:pb-24 max-w-5xl mx-auto w-full">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="text-center mb-12 md:mb-16">
          <p
            className="text-7xl md:text-8xl font-bold tabular-nums mb-3 leading-none"
            style={{ color: "#1CB8B8", letterSpacing: "-0.04em" }}
          >
            404
          </p>
          <h1 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
            We can&rsquo;t find that page.
          </h1>
          <p className="text-base max-w-md mx-auto leading-relaxed" style={{ color: "#8B8E92" }}>
            Either the URL was mistyped, or the page has moved. Pick where you want to go next:
          </p>
        </div>

        {/* ── Destination cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mb-10">

          {/* Card 1 — Find vestings (primary action) */}
          <Link
            href="/find-vestings"
            className="rounded-2xl p-6 relative overflow-hidden transition-all hover:-translate-y-0.5"
            style={{
              background:    "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)",
              border:        "1px solid rgba(28,184,184,0.25)",
              boxShadow:     "0 8px 24px rgba(28,184,184,0.18)",
            }}
          >
            <div
              className="absolute -right-8 -top-8 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)" }}
            />
            <div className="relative">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <h2 className="text-base font-bold mb-1.5" style={{ color: "white" }}>
                Find your vestings
              </h2>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>
                Paste any wallet — we scan 9 protocols across 5 chains in seconds.
              </p>
              <span className="inline-flex items-center gap-1 mt-4 text-xs font-semibold" style={{ color: "white" }}>
                Scan a wallet →
              </span>
            </div>
          </Link>

          {/* Card 2 — Protocols */}
          <Link
            href="/protocols"
            className="rounded-2xl p-6 transition-all hover:-translate-y-0.5"
            style={{
              background: "white",
              border:     "1px solid rgba(21,23,26,0.10)",
              boxShadow:  "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "rgba(28,184,184,0.10)", border: "1px solid rgba(28,184,184,0.22)" }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#0F8A8A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </div>
            <h2 className="text-base font-bold mb-1.5" style={{ color: "#1A1D20" }}>
              Browse protocols
            </h2>
            <p className="text-xs leading-relaxed" style={{ color: "#8B8E92" }}>
              Live TVL, stream count, and upcoming unlocks across {protocolCount} indexed protocols.
            </p>
            <span className="inline-flex items-center gap-1 mt-4 text-xs font-semibold" style={{ color: "#0F8A8A" }}>
              See all protocols →
            </span>
          </Link>

          {/* Card 3 — Articles */}
          <Link
            href="/resources"
            className="rounded-2xl p-6 transition-all hover:-translate-y-0.5"
            style={{
              background: "white",
              border:     "1px solid rgba(21,23,26,0.10)",
              boxShadow:  "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "rgba(240,153,46,0.10)", border: "1px solid rgba(240,153,46,0.22)" }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#F0992E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <h2 className="text-base font-bold mb-1.5" style={{ color: "#1A1D20" }}>
              Read the guides
            </h2>
            <p className="text-xs leading-relaxed" style={{ color: "#8B8E92" }}>
              {articleCount} long-form articles on token vesting, cliffs, unlocks and tokenomics.
            </p>
            <span className="inline-flex items-center gap-1 mt-4 text-xs font-semibold" style={{ color: "#F0992E" }}>
              Open the library →
            </span>
          </Link>

        </div>

        {/* ── Tertiary — was the link broken? ─────────────────────────── */}
        <div
          className="rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 max-w-2xl w-full"
          style={{ background: "rgba(21,23,26,0.03)", border: "1px solid rgba(21,23,26,0.06)" }}
        >
          <p className="text-xs flex-1" style={{ color: "#8B8E92" }}>
            <span style={{ color: "#1A1D20", fontWeight: 600 }}>Think this is broken?</span>{" "}
            We&rsquo;d like to know — broken links are usually a deploy mistake on our side.
          </p>
          <Link
            href="/contact"
            className="text-xs font-semibold whitespace-nowrap hover:underline"
            style={{ color: "#0F8A8A" }}
          >
            Report it →
          </Link>
        </div>

      </main>

      <SiteFooter theme="light" />
    </div>
  );
}
