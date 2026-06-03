import Link from "next/link";
import { AppStoreBadges } from "@/components/AppStoreBadges";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { PricingComparisonTable } from "@/components/PricingComparisonTable";
import { PhoneClock } from "@/components/PhoneClock";
import { listProtocols } from "@/lib/protocol-constants";
import {
  getProtocolStats,
  toDateSafe,
  type ProtocolStats,
} from "@/lib/vesting/protocol-stats";

// ISR — re-render at most once every 10 minutes. Bumped 60→600 on
// 2026-05-10 as part of the egress-reduction pass after Supabase Free
// hit 244% of its 5 GB/month quota. Homepage live stats (total streams,
// last-indexed timestamp) move on minute-to-hour scale; serving a 10-min-
// old snapshot to the next visitor saves five DB aggregations per stale
// minute without any visible UX impact.
export const revalidate = 600;

async function getHomepageLiveStats() {
  // Skip DB work during the build phase. Postgres-js hangs for 60s on
  // ECONNREFUSED / mid-build connection drops (e.g. May 2 2026 build —
  // FATAL XX000 mid-collect, then `/page: /` retried 3× and exited 1).
  // Returning the empty shape lets the build finish in seconds; ISR fills
  // it with real data on the first runtime request after deploy. Same
  // pattern as /protocols/[protocol] — see its loadProtocolData comment.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return { totalStreams: 0, lastIndexedAt: null, protocolCount: listProtocols().length };
  }

  // Aggregate across all 9 protocols. Any single-protocol failure must not
  // sink the homepage render — silently fall back to nulls.
  try {
    const protocols = listProtocols();
    const results = await Promise.all(
      protocols.map(async (p) => {
        try {
          return await getProtocolStats(p.adapterIds);
        } catch {
          return null;
        }
      }),
    );
    const valid = results.filter((s): s is ProtocolStats => !!s);
    const totalStreams = valid.reduce((sum, s) => sum + s.totalStreams, 0);
    // Defensive coercion: lastIndexedAt is typed Date | string | null because
    // some upstream code paths run inside unstable_cache which serializes
    // Dates to ISO strings. toDateSafe normalizes to Date | null.
    const lastIndexedAt = valid.reduce<Date | null>((latest, s) => {
      const d = toDateSafe(s.lastIndexedAt);
      if (!d) return latest;
      if (!latest || d > latest) return d;
      return latest;
    }, null);
    return {
      totalStreams,
      lastIndexedAt,
      protocolCount: protocols.length,
    };
  } catch {
    return { totalStreams: 0, lastIndexedAt: null, protocolCount: 7 };
  }
}

// JSON-LD entity graph for the homepage. Linked sub-schemas via @id:
//   - Organization        → entity recognition + sitelinks logo
//   - WebSite             → enables Google sitelinks search box (the search
//                           action targets /find-vestings, our actual scan flow)
//   - WebApplication      → describes the dashboard product itself; powers app
//                           cards in SERPs and feeds Google's app-graph
//   - MobileApplication   → iOS app card in SERPs. Conditionally rendered:
//                           App is LIVE (2026-05-31):
//                           https://apps.apple.com/us/app/vestream-token-unlocks/id6769799911
//                           Set NEXT_PUBLIC_IOS_APP_URL in Vercel to activate
//                           the rich Google SERP install card (structured data).
const iosAppUrl = process.env.NEXT_PUBLIC_IOS_APP_URL;
const androidAppUrl = process.env.NEXT_PUBLIC_ANDROID_APP_URL;

const homepageJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type":   "Organization",
      "@id":     "https://www.vestream.io/#organization",
      name:      "Vestream",
      url:       "https://www.vestream.io",
      logo:      "https://www.vestream.io/logo.svg",
      sameAs:    ["https://x.com/Vestream_"],
    },
    {
      "@type":   "WebSite",
      "@id":     "https://www.vestream.io/#website",
      name:      "Vestream",
      url:       "https://www.vestream.io",
      publisher: { "@id": "https://www.vestream.io/#organization" },
      potentialAction: {
        "@type":       "SearchAction",
        target:        "https://www.vestream.io/find-vestings?address={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type":              "WebApplication",
      "@id":                "https://www.vestream.io/#app",
      name:                 "Vestream",
      url:                  "https://www.vestream.io",
      applicationCategory:  "FinanceApplication",
      operatingSystem:      "Web",
      browserRequirements:  "Requires JavaScript and modern browser",
      offers: {
        "@type":       "Offer",
        price:         "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Track token vestings across 9+ protocols",
        "Real-time unlock alerts via push and email",
        "Multi-chain coverage: Ethereum, Base, BNB, Polygon, Arbitrum, Optimism, Solana",
        "P&L tracking and CSV export",
        "Protocol-by-protocol TVL transparency",
      ],
    },
    ...(iosAppUrl
      ? [{
          "@type":             "MobileApplication",
          "@id":               "https://www.vestream.io/#ios-app",
          name:                "Vestream — Token Vesting Tracker",
          url:                 iosAppUrl,
          installUrl:          iosAppUrl,
          applicationCategory: "FinanceApplication",
          operatingSystem:     "iOS 16.0",
          // Free download; in-app subscription via RevenueCat (Apple billing).
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          publisher: { "@id": "https://www.vestream.io/#organization" },
        }]
      : []),
    ...(androidAppUrl
      ? [{
          "@type":             "MobileApplication",
          "@id":               "https://www.vestream.io/#android-app",
          name:                "Vestream — Token Vesting Tracker",
          url:                 androidAppUrl,
          installUrl:          androidAppUrl,
          applicationCategory: "FinanceApplication",
          operatingSystem:     "Android",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          publisher: { "@id": "https://www.vestream.io/#organization" },
        }]
      : []),
  ],
};

function formatStreamCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`;
  if (n >= 1_000)     return `${Math.floor(n / 1_000)}K+`;
  return `${n}`;
}

export default async function Home() {
  const liveStats = await getHomepageLiveStats();
  const streamLabel = liveStats.totalStreams > 0
    ? formatStreamCount(liveStats.totalStreams)
    : "150K+";
  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd) }}
      />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <SiteNav />

      {/* ── Hero ──────────────────────────────────────────────────────────
          Split-layout hero: copy left, phone-mockup right. Per the May 5
          2026 design pass:
            - Original copy restored ("Every token you're owed, in one
              place" + the two original subheads — the experimental
              loss-aversion variant moved to a follow-up A/B test rather
              than the default).
            - Floating side widgets removed — they cluttered a centred
              composition and are anyway a duplicate of the dashboard
              preview shown deeper down the page.
            - Mobile (<lg) stacks: copy on top, phone below.
            - Desktop (lg+): two columns, copy left + phone right. */}
      <section className="relative px-5 pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `radial-gradient(circle, rgba(21,23,26,0.10) 1px, transparent 1px)`, backgroundSize: "28px 28px" }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top, rgba(28,184,184,0.07) 0%, transparent 65%)" }} />
        <div className="absolute top-24 left-1/4 w-72 h-72 pointer-events-none rounded-full"
          style={{ background: "radial-gradient(circle, rgba(15,138,138,0.06) 0%, transparent 70%)" }} />

        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 lg:gap-12 lg:items-center">

          {/* ── Left: copy + CTAs ───────────────────────────────────── */}
          <div className="text-center lg:text-left">
            {/* Live indicator — small pulsing pill above the H1 signals
                "active product, currently watching the chains" without
                returning to the institutional stat-flex of the previous
                "1.4M streams indexed" strip. The dot animates via the
                Tailwind `animate-pulse` class. */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
              style={{
                background: "rgba(28,184,184,0.07)",
                border: "1px solid rgba(28,184,184,0.20)",
              }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                  style={{ background: "#1CB8B8" }} />
                <span className="relative inline-flex rounded-full h-2 w-2"
                  style={{ background: "#1CB8B8" }} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "#0F8A8A", letterSpacing: "0.12em" }}>
                {streamLabel} streams · $3.4B+ tracked
              </span>
            </div>

            <h1 className="text-[2.4rem] md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-6"
              style={{ letterSpacing: "-0.03em", color: "#1A1D20" }}>
              Never miss a <br />
              <span style={{ color: "#1CB8B8" }}>
                token unlock.
              </span>
            </h1>

            <p className="text-lg max-w-xl mb-3 leading-relaxed mx-auto lg:mx-0" style={{ color: "#8B8E92" }}>
              Find and track every token vesting you&rsquo;re owed - across all chains and protocols. Get notified the moment the token is claimable.
            </p>
            <p className="text-base max-w-xl mb-10 leading-relaxed mx-auto lg:mx-0" style={{ color: "#B8BABD" }}>
              9+ protocols. Seven chains. Mobile app and desktop dashboard.
            </p>

            {/* CTAs — app badges lead (mobile is the primary product),
                scanner below as the no-install discovery path. */}
            <div className="flex flex-col items-center lg:items-start gap-5">
              <div className="flex flex-col items-center lg:items-start gap-2">
                <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "#B8BABD" }}>
                  Get the app - iOS &amp; Android
                </p>
                <AppStoreBadges align="start" />
              </div>

              <div className="flex flex-col items-center lg:items-start gap-1.5">
                <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "#B8BABD" }}>
                  Or search in browser
                </p>
                <Link
                  href="/find-vestings"
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-semibold text-sm transition-all hover:-translate-y-0.5"
                  style={{
                    background: "#1CB8B8",
                    color: "white",
                    boxShadow: "0 8px 24px rgba(28,184,184,0.35)",
                  }}
                >
                  Find my vestings →
                </Link>
              </div>
            </div>
          </div>

          {/* ── Right: phone mockup ─────────────────────────────────────
              Stylized iPhone frame with a Vestream lock-screen
              notification rendered inside. CSS-only — no image asset, so
              stays sharp at every density and tracks theme changes.

              Sized to MATCH the text column's natural height (~440px).
              Previously 260×520 dominated the row and forced
              `items-center` to centre-vertically, which orphaned the
              text at the top of an oversized row with empty space below.
              At 220×440 with `items-start` (set on the grid container),
              the text and phone now sit alongside each other — both
              top-aligned — exactly the "two columns of equal weight"
              hero pattern Apple / Linear / Things use. */}
          {/* Phone visible on every viewport. On <md it stacks below the
              text (single-column grid); on md+ it sits to the right.
              Slight tilt (rotate(4deg)) gives the device-shot energy
              Apple / Linear / Things use in their hero phones — without
              it the rectangle reads as too-flat / engineered, with it
              the page feels alive. */}
          <div className="flex flex-col items-center lg:justify-self-end">
            <div
              style={{
                width: 220,
                height: 440,
                background: "#0a0e14",
                borderRadius: 36,
                padding: 6,
                boxShadow: "0 28px 64px rgba(15,23,42,0.35), 0 0 0 1px rgba(255,255,255,0.06) inset",
                transform: "rotate(4deg)",
                transformOrigin: "center center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "#0f1218",
                  borderRadius: 30,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* iOS-style status bar — signal/wifi/battery glyphs at
                    the top right. Subtle but tells the eye "real phone
                    UI" before the brain reads anything. */}
                <div
                  className="flex items-center justify-end gap-1"
                  style={{ paddingTop: 10, paddingRight: 18, color: "rgba(255,255,255,0.75)" }}
                >
                  {/* Signal bars */}
                  <svg width="13" height="9" viewBox="0 0 17 11" fill="currentColor">
                    <rect x="0"  y="7" width="3" height="3" rx="0.5"/>
                    <rect x="4.5" y="5" width="3" height="5" rx="0.5"/>
                    <rect x="9"  y="2.5" width="3" height="7.5" rx="0.5"/>
                    <rect x="13.5" y="0" width="3" height="10" rx="0.5"/>
                  </svg>
                  {/* WiFi */}
                  <svg width="12" height="9" viewBox="0 0 13 9" fill="currentColor">
                    <path d="M6.5 8.5l1.5-1.5a2.1 2.1 0 0 0-3 0l1.5 1.5z"/>
                    <path d="M6.5 5L8.7 7.2a3.1 3.1 0 0 0-4.4 0L6.5 5z" opacity="0.85"/>
                    <path d="M6.5 1.5L9.9 4.9a4.8 4.8 0 0 0-6.8 0L6.5 1.5z" opacity="0.7"/>
                  </svg>
                  {/* Battery */}
                  <div
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 1.5,
                      marginLeft: 2,
                    }}
                  >
                    <div
                      style={{
                        width: 18, height: 8, borderRadius: 2,
                        border: "1px solid rgba(255,255,255,0.55)",
                        position: "relative",
                        padding: 1,
                      }}
                    >
                      <div style={{ width: "85%", height: "100%", background: "rgba(255,255,255,0.85)", borderRadius: 1 }} />
                    </div>
                    <div style={{ width: 1.5, height: 4, background: "rgba(255,255,255,0.55)", borderRadius: 1 }} />
                  </div>
                </div>

                {/* Date + giant time — rendered by a client component so
                    it always reflects the visitor's current date/time. */}
                <PhoneClock />

                {/* ── Notification stack ─────────────────────────────────
                    Three iOS lock-screen cards:
                      1. (now)        Vestream — NOVA unlocked just now
                      2. (5m)         Vestream — Unlock in 5 minutes
                      3. (yesterday)  Vestream Mail — Email · 24h preview sent
                    Removed from the App Store ref: the 7-day heads-up and
                    the 1-hour-to-unlock email — keep the stack short
                    enough to read at hero size. */}
                <div className="absolute left-2 right-2 flex flex-col gap-1.5" style={{ top: 168 }}>
                  {/* Primary card — VESTREAM · NOVA unlocked just now */}
                  <div
                    style={{
                      background: "rgba(255,255,255,0.96)",
                      backdropFilter: "blur(18px)",
                      WebkitBackdropFilter: "blur(18px)",
                      borderRadius: 14,
                      padding: "9px 11px",
                      boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        style={{
                          width: 22, height: 22, borderRadius: 5,
                          background: "linear-gradient(155deg, #2DD4D4 0%, #1CB8B8 45%, #0F8A8A 100%)",
                          flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.30)",
                        }}
                      >
                        <span style={{ color: "white", fontWeight: 800, fontSize: 11, letterSpacing: "-0.03em" }}>V</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center justify-between" style={{ marginBottom: 1 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.04em" }}>VESTREAM</span>
                          <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 500 }}>now</span>
                        </div>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#0f172a", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
                          NOVA unlocked just now
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.3, marginTop: 1 }}>
                          $4,200 streaming to 0x3f5C — tap to claim
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2 — VESTREAM · Unlock in 5 minutes */}
                  <div
                    style={{
                      background: "rgba(255,255,255,0.92)",
                      backdropFilter: "blur(16px)",
                      WebkitBackdropFilter: "blur(16px)",
                      borderRadius: 14,
                      padding: "9px 11px",
                      boxShadow: "0 4px 14px rgba(0,0,0,0.14)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        style={{
                          width: 22, height: 22, borderRadius: 5,
                          background: "linear-gradient(155deg, #2DD4D4 0%, #1CB8B8 45%, #0F8A8A 100%)",
                          flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.30)",
                        }}
                      >
                        <span style={{ color: "white", fontWeight: 800, fontSize: 11, letterSpacing: "-0.03em" }}>V</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center justify-between" style={{ marginBottom: 1 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.04em" }}>VESTREAM</span>
                          <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 500 }}>5m</span>
                        </div>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#0f172a", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
                          Unlock in 5 minutes
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.3, marginTop: 1 }}>
                          NOVA · final countdown · push + email
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 3 — VESTREAM MAIL · Email · 24h preview sent.
                      Orange envelope icon distinguishes the email channel
                      from push notifications above. */}
                  <div
                    style={{
                      background: "rgba(255,255,255,0.88)",
                      backdropFilter: "blur(14px)",
                      WebkitBackdropFilter: "blur(14px)",
                      borderRadius: 14,
                      padding: "9px 11px",
                      boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        style={{
                          width: 22, height: 22, borderRadius: 5,
                          background: "linear-gradient(155deg, #FBBF24 0%, #F59E0B 45%, #D97706 100%)",
                          flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.30)",
                        }}
                      >
                        <svg width="11" height="9" viewBox="0 0 14 11" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="1" y="1.5" width="12" height="8" rx="1.4"/>
                          <path d="M1.5 2.5l5.5 4 5.5-4"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center justify-between" style={{ marginBottom: 1 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.04em" }}>VESTREAM MAIL</span>
                          <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 500 }}>yesterday</span>
                        </div>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#0f172a", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
                          Email · 24h preview sent
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.3, marginTop: 1 }}>
                          NOVA · cliff ends tomorrow 09:00 UTC
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Protocol strip — centred under the hero grid (text + phone).
            Lives inside the same hero <section> so the radial-gradient
            backgrounds bleed underneath it. mt-16 gives clear visual
            separation from the hero so it reads as its own block, not
            an appendage to the right column. */}
        <div className="relative mt-16">
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-4 text-center" style={{ color: "#B8BABD" }}>Integrated with</p>
          {/* Logo wall — uniform white cards so the mixed third-party logos
              (different backgrounds / aspect ratios / whitespace) read as an
              even grid. Sablier…LlamaPay are wordmark logos; Streamflow +
              Jupiter Lock are icon-only marks (rendered a touch larger). */}
          <div className="flex items-center justify-center gap-2.5 flex-wrap max-w-3xl mx-auto">
            {[
              { name: "Sablier",      src: "/protocols/sablier.jpeg" },
              { name: "Hedgey",       src: "/protocols/hedgey.png" },
              { name: "UNCX",         src: "/protocols/uncx.png" },
              { name: "LlamaPay",     src: "/protocols/llamapay.png" },
              { name: "Unvest",       src: "/protocols/unvest.png" },
              { name: "Superfluid",   src: "/protocols/superfluid.png" },
              { name: "PinkSale",     src: "/protocols/pinksale.png" },
              { name: "Streamflow",   src: "/protocols/streamflow.png", icon: true },
              { name: "Jupiter Lock", src: "/protocols/jupiter-lock.png", icon: true },
            ].map((p) => (
              <div key={p.name} className="flex items-center justify-center rounded-xl"
                style={{
                  width: 132, height: 56,
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  padding: p.icon ? "8px" : "10px 14px",
                }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.name} className="object-contain"
                  style={{ maxHeight: p.icon ? 36 : 24, maxWidth: "100%", width: "auto" }} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#cbd5e1" }}>on</p>
            {[
              { name: "Ethereum",  color: "#6366f1", bg: "rgba(28,184,184,0.07)",   border: "rgba(28,184,184,0.16)"   },
              { name: "BNB Chain", color: "#eab308", bg: "rgba(234,179,8,0.07)",    border: "rgba(234,179,8,0.16)"    },
              { name: "Base",      color: "#3b82f6", bg: "rgba(59,130,246,0.07)",   border: "rgba(59,130,246,0.16)"   },
              { name: "Polygon",   color: "#8b5cf6", bg: "rgba(139,92,246,0.07)",   border: "rgba(139,92,246,0.16)"   },
              { name: "Arbitrum",  color: "#28A0F0", bg: "rgba(40,160,240,0.07)",   border: "rgba(40,160,240,0.16)"   },
              { name: "Optimism",  color: "#FF0420", bg: "rgba(255,4,32,0.07)",     border: "rgba(255,4,32,0.16)"     },
              { name: "Solana",    color: "#5DCE9D", bg: "rgba(93,206,157,0.08)",   border: "rgba(93,206,157,0.22)"   },
            ].map((c) => (
              <div key={c.name} className="flex items-center px-3 py-1 rounded-full"
                style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                <span className="text-[11px] font-semibold" style={{ color: c.color }}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mobile App section ─────────────────────────────────────────────
          The first of two surface-specific feature blocks (the second is
          the desktop dashboard further down). Tells the user "Vestream
          lives on your phone first" — push alerts, live countdowns,
          one-tap claim links, calendar view. Phone mockup on the right
          (or stacked below on mobile) shows a Portfolio-tab screenshot
          mock so the visual matches the words.

          The `id="download"` anchor is the scroll target the pricing-
          card "Get Mobile" / "Get Pro" CTAs point at — both plans
          require the mobile app to subscribe (RevenueCat IAP), so the
          buttons send users straight to where they can pick their
          platform. */}
      <section id="download" className="px-4 md:px-8 pt-12 md:pt-20 pb-16 md:pb-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 lg:gap-16 items-center">

          {/* Left: copy + features */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
              style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.20)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F8A8A" strokeWidth={2.2} strokeLinecap="round">
                <rect x="6" y="2" width="12" height="20" rx="3" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#0F8A8A", letterSpacing: "0.12em" }}>
                Mobile app
              </span>
            </div>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] mb-5"
              style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
              Track your unlocks <br />
              on the go.
            </h2>

            <p className="text-base md:text-lg max-w-xl mb-8 leading-relaxed mx-auto lg:mx-0" style={{ color: "#8B8E92" }}>
              Vestream is built mobile-first. Push alerts the moment a token unlocks, a live countdown to your next claim, and one tap to the protocol&rsquo;s claim page — all in your pocket.
            </p>

            <ul className="space-y-3 mb-8 max-w-md mx-auto lg:mx-0 text-left">
              {[
                "Push alerts the moment a token unlocks",
                "Live countdown to your next claim",
                "One-tap links straight to the protocol claim page",
                "Calendar view of every upcoming unlock",
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm md:text-base" style={{ color: "#1A1D20" }}>
                  <svg className="flex-shrink-0 mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth={2.6} strokeLinecap="round">
                    <path d="M5 12.5l4.2 4.2L19 7" />
                  </svg>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

          </div>

          {/* Right: phone mockup — Portfolio-tab snapshot, distinct from
              the lock-screen-flavoured hero phone. Same outer frame
              (consistency) but the inner content is the Portfolio screen
              mock: greeting, big "$ vesting" headline, two stat cards,
              a stream row preview. CSS-only. Tilted 4deg the OTHER way
              from the hero (-4deg) so the two phones on the page lean
              toward each other rather than the same direction. */}
          <div className="flex flex-col items-center lg:justify-self-end">
            <div
              style={{
                width: 230,
                height: 460,
                background: "#0f172a",
                borderRadius: 38,
                padding: 8,
                boxShadow: "0 28px 64px rgba(15,23,42,0.30), 0 0 0 1px rgba(255,255,255,0.05) inset",
                transform: "rotate(-4deg)",
                transformOrigin: "center center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "white",
                  borderRadius: 30,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Top of-screen padding */}
                <div className="px-4 pt-6">
                  <p className="text-[10px] font-medium" style={{ color: "#94a3b8", letterSpacing: "0.04em" }}>
                    Good evening
                  </p>
                  <p className="text-[22px] font-bold" style={{ color: "#0f172a", letterSpacing: "-0.03em", marginTop: 2 }}>
                    Portfolio
                  </p>
                </div>

                {/* Hero card — same gradient as the real PortfolioHero */}
                <div className="mx-3 mt-4 rounded-xl p-3"
                  style={{ background: "linear-gradient(135deg, #0F8A8A 0%, #1CB8B8 100%)" }}>
                  <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.65)" }}>
                    Total vesting
                  </p>
                  <p className="text-[22px] font-bold" style={{ color: "white", letterSpacing: "-0.02em", marginTop: 2 }}>
                    $4,238
                  </p>
                  <div className="flex gap-2 mt-3">
                    <div className="flex-1 rounded-lg p-2"
                      style={{ background: "rgba(255,255,255,0.15)" }}>
                      <p className="text-[7px] font-bold uppercase" style={{ color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em" }}>
                        Claimable
                      </p>
                      <p className="text-[11px] font-bold" style={{ color: "white" }}>$215</p>
                    </div>
                    <div className="flex-1 rounded-lg p-2"
                      style={{ background: "rgba(255,255,255,0.15)" }}>
                      <p className="text-[7px] font-bold uppercase" style={{ color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em" }}>
                        Next
                      </p>
                      <p className="text-[11px] font-bold" style={{ color: "white" }}>14d 6h</p>
                    </div>
                  </div>
                </div>

                {/* Stream row preview */}
                <div className="px-3 mt-4">
                  <p className="text-[8px] font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
                    Active vestings
                  </p>
                  {[
                    { sym: "NOVA", protocol: "Sablier",  pct: 45, pctColor: "#F0992E", value: "$1,920" },
                    { sym: "OP",   protocol: "Hedgey",   pct: 60, pctColor: "#8169E0", value: "$1,270" },
                    { sym: "LAYER", protocol: "Unvest",  pct: 25, pctColor: "#0BA0CB", value: "$1,050" },
                  ].map((s) => (
                    <div key={s.sym} className="rounded-lg mb-1.5 p-2"
                      style={{ background: "#f8fafc", border: "1px solid rgba(15,23,42,0.06)" }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded flex items-center justify-center"
                            style={{ background: s.pctColor + "22" }}>
                            <span style={{ fontSize: 7, fontWeight: 700, color: s.pctColor }}>{s.sym[0]}</span>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#0f172a" }}>{s.sym}</span>
                          <span style={{ fontSize: 8, color: "#94a3b8" }}>· {s.protocol}</span>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#0f172a" }}>{s.value}</span>
                      </div>
                      <div className="rounded-full h-1" style={{ background: "rgba(15,23,42,0.06)" }}>
                        <div className="rounded-full h-1" style={{ width: `${s.pct}%`, background: s.pctColor }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Desktop Dashboard section ───────────────────────────────────────
          Second surface-specific feature block. Title above the existing
          dashboard mockup tells the user the web is for power-tools work
          (tax exports, Discover/explorer, multi-wallet portfolio,
          search-all-holders). Mockup itself is the existing browser-
          chromed Vestream dashboard render below. */}
      <section className="px-4 md:px-8 pt-8 md:pt-12 pb-8 md:pb-10">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.22)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth={2.2} strokeLinecap="round">
              <rect x="2" y="4" width="20" height="14" rx="2" />
              <line x1="8" y1="22" x2="16" y2="22" />
              <line x1="12" y1="18" x2="12" y2="22" />
            </svg>
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#4f46e5", letterSpacing: "0.12em" }}>
              Desktop dashboard
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] mb-4"
            style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Power tools when <br />
            you&rsquo;re at your desk.
          </h2>
          <p className="text-base md:text-lg max-w-2xl mx-auto mb-6 leading-relaxed" style={{ color: "#8B8E92" }}>
            The mobile app handles your day-to-day. The web dashboard is where you do tax season, dig into the Vesting Explorer, and search any wallet&rsquo;s positions.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-2">
            {[
              "Tax-ready CSV exports",
              "Vesting Explorer",
              "Search any wallet",
              "Multi-wallet portfolio",
            ].map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", color: "#475569" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth={2.6} strokeLinecap="round">
                  <path d="M5 12.5l4.2 4.2L19 7" />
                </svg>
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard preview (updated to match real UI) ─────────────────── */}
      <section className="px-3 md:px-8 pb-16 md:pb-24 flex justify-center">
        <div className="relative w-full max-w-5xl rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(21,23,26,0.12)", boxShadow: "0 32px 80px rgba(15,23,42,0.14), 0 4px 16px rgba(15,23,42,0.06)" }}>
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3"
            style={{ background: "#f1f5f9", borderBottom: "1px solid rgba(21,23,26,0.10)" }}>
            <div className="flex gap-1.5">
              {["#ff5f57","#febc2e","#28c840"].map((c) => (
                <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <div className="flex-1 mx-4">
              <div className="max-w-xs mx-auto h-5 rounded-md flex items-center px-3"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.1)" }}>
                <span className="text-[10px]" style={{ color: "#B8BABD" }}>app.vestream.io/dashboard</span>
              </div>
            </div>
            {/* Export badge in chrome */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-medium" style={{ background: "rgba(28,184,184,0.08)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.15)" }}>
              <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV / PDF
            </div>
          </div>

          {/* Mock dashboard — light theme to match the actual app */}
          <div className="flex" style={{ background: "white", minHeight: 280 }}>
            {/* Sidebar — hidden on mobile */}
            <div className="hidden md:flex w-44 flex-shrink-0 flex-col" style={{ background: "#FAFAFA", borderRight: "1px solid rgba(21,23,26,0.07)" }}>
              <div className="px-4 py-3.5 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(21,23,26,0.07)" }}>
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "#1CB8B8" }}>
                  <span className="text-white text-[9px] font-bold">T</span>
                </div>
                <span className="text-xs font-bold" style={{ color: "#1A1D20" }}>Vestream</span>
              </div>
              <div className="px-2 py-3 space-y-0.5">
                {[
                  { label: "Dashboard", active: true,  icon: "▦" },
                  { label: "History",   active: false, icon: "◷" },
                  { label: "Wallets",   active: false, icon: "◈" },
                  { label: "Settings",  active: false, icon: "⚙" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                    style={item.active ? { background: "rgba(28,184,184,0.12)", color: "#0F8A8A" } : { color: "#8B8E92" }}>
                    <span className="text-[10px]">{item.icon}</span>{item.label}
                  </div>
                ))}
              </div>
              <div className="px-2 mt-1" style={{ borderTop: "1px solid rgba(21,23,26,0.07)", paddingTop: "0.75rem" }}>
                <p className="px-2.5 text-[8px] font-bold tracking-widest uppercase mb-1.5" style={{ color: "#B8BABD" }}>Wallets</p>
                {["My Wallet", "Team Vesting"].map((w) => (
                  <div key={w} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px]" style={{ color: "#8B8E92" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />{w}
                  </div>
                ))}
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 p-4 space-y-3 overflow-hidden">
              {/* PortfolioHero gradient card — kept as the brand-defining element */}
              <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg,#1A1D20,#0F8A8A 55%,#1CB8B8)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[8px] font-bold tracking-widest uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>Your vestings</p>
                <p className="text-2xl font-bold text-white tabular-nums">$4,238</p>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(168,242,200,1)" }}>● $215 claimable now · 2 wallets tracked</p>
                <div className="flex gap-2 mt-3">
                  {[
                    { l: "Claimable", v: "$215",     c: "rgba(52,211,153,0.18)"  },
                    { l: "Locked",    v: "$4,023",   c: "rgba(255,255,255,0.10)" },
                    { l: "Streams",   v: "3 active", c: "rgba(240,184,61,0.18)"  },
                    { l: "Next",      v: "14d 6h",   c: "rgba(240,184,61,0.18)"  },
                  ].map((s) => (
                    <div key={s.l} className="rounded-lg px-2.5 py-1.5 flex-1" style={{ background: s.c, border: "1px solid rgba(255,255,255,0.10)" }}>
                      <p className="text-[7px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.55)" }}>{s.l}</p>
                      <p className="text-[11px] font-bold text-white tabular-nums">{s.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Two-col: snapshot + table */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {/* Token snapshot */}
                <div className="md:col-span-2 rounded-xl p-3" style={{ background: "#FAFAFA", border: "1px solid rgba(21,23,26,0.07)" }}>
                  <p className="text-[9px] font-semibold mb-2.5" style={{ color: "#1A1D20" }}>Token Snapshot</p>
                  <div className="space-y-2">
                    {[
                      { s: "NOVA",  clPct: 12, lkPct: 88, color: "#F0992E", total: "$1,920" },
                      { s: "OP",    clPct:  8, lkPct: 92, color: "#1CB8B8", total: "$1,270" },
                      { s: "LAYER", clPct:  5, lkPct: 95, color: "#0F8A8A", total: "$1,050" },
                    ].map((t) => (
                      <div key={t.s}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                          <span style={{ color: "#475569", fontSize: "9px", fontWeight: 600 }}>{t.s}</span>
                          <span style={{ color: "#8B8E92", fontSize: "9px" }}>{t.total}</span>
                        </div>
                        <div style={{ background: "rgba(21,23,26,0.06)", borderRadius: "4px", height: "5px", overflow: "hidden" }}>
                          <div style={{ display: "flex", height: "100%" }}>
                            <div style={{ width: `${t.clPct}%`, background: "#0F8A4A" }} />
                            <div style={{ width: `${t.lkPct}%`, background: t.color + "60" }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vesting table */}
                <div className="md:col-span-3 rounded-xl overflow-hidden" style={{ background: "#FAFAFA", border: "1px solid rgba(21,23,26,0.07)" }}>
                  <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(21,23,26,0.07)" }}>
                    <p className="text-[9px] font-semibold" style={{ color: "#1A1D20" }}>Vesting Schedules</p>
                    <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(15,138,74,0.12)", color: "#0F8A4A" }}>4 streams</span>
                  </div>
                  {[
                    // `color` is the TOKEN avatar tint (free pick per token),
                    // `proto` is the PROTOCOL badge — must match canonical palette.
                    { token: "NOVA",  protocol: "Sablier",  claimable: "$162", locked: "$1,758", color: "#F0992E", proto: "#F0992E", prog: 15 },
                    { token: "OP",    protocol: "Hedgey",   claimable: "$53",  locked: "$1,217", color: "#1CB8B8", proto: "#8169E0", prog: 35 },
                    { token: "LAYER", protocol: "Unvest",   claimable: "—",    locked: "$1,050", color: "#0F8A8A", proto: "#0BA0CB", prog: 5  },
                  ].map((row, i) => (
                    <div key={row.token} className="flex items-center gap-2 px-3 py-2"
                      style={{ borderTop: i > 0 ? "1px solid rgba(21,23,26,0.06)" : undefined }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: row.color + "1A", border: `1px solid ${row.color}30` }}>
                        <span className="text-[7px] font-bold" style={{ color: row.color }}>{row.token.slice(0,2)}</span>
                      </div>
                      <span className="text-[9px] font-semibold w-10 flex-shrink-0" style={{ color: "#1A1D20" }}>{row.token}</span>
                      <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: row.proto + "15", color: row.proto }}>{row.protocol}</span>
                      {/* Progress bar */}
                      <div className="flex-1 mx-1">
                        <div style={{ background: "rgba(21,23,26,0.06)", borderRadius: "3px", height: "3px" }}>
                          <div style={{ width: `${row.prog}%`, height: "3px", borderRadius: "3px", background: row.color }} />
                        </div>
                      </div>
                      <span className="text-[9px] tabular-nums w-12 text-right flex-shrink-0" style={{ color: row.claimable === "—" ? "#B8BABD" : "#0F8A4A" }}>{row.claimable}</span>
                      <div className="w-9 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{ background: row.claimable !== "—" ? `linear-gradient(135deg,${row.color},${row.color}aa)` : "rgba(21,23,26,0.06)" }}>
                        <span className="text-[7px] font-bold" style={{ color: row.claimable !== "—" ? "white" : "#B8BABD" }}>
                          {row.claimable !== "—" ? "Claim" : "View"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature showcase panels ──────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>Deeper than a simple tracker</p>
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Built for the full lifecycle
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "#8B8E92" }}>
            From the first cliff to the final claim — forecast cashflows, track every sale, and export your records.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Panel 1: Monthly Forecast */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)" }}>
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#B8BABD" }}>Monthly Forecast</p>
              <p className="text-xs font-semibold" style={{ color: "#1A1D20" }}>Unlock cashflow by month</p>
            </div>
            <div className="px-4 pb-4">
              {/* Cashflow numbers calibrated to the everyday-investor
                  audience (Maya persona, ~$4k vesting). Previous values
                  ranged $12k–$52k/month — implied a wealthy investor
                  unlocking tens of thousands per cliff. Realistic
                  individual values: $200–$1,200/month. The display
                  formats both ranges identically (`$Xk` if ≥$1k, plain
                  `$X` otherwise) so the visual is unchanged; only the
                  numbers match the actual user. */}
              <div className="space-y-1.5 mt-2">
                {[
                  { m: "Mar 2025", v: 920,  w: 85 },
                  { m: "Apr 2025", v: 640,  w: 60 },
                  { m: "May 2025", v: 380,  w: 35 },
                  { m: "Jun 2025", v: 1080, w: 98 },
                  { m: "Jul 2025", v: 560,  w: 53 },
                  { m: "Aug 2025", v: 240,  w: 23 },
                ].map((r) => (
                  <div key={r.m} className="flex items-center gap-2">
                    <span style={{ color: "#8B8E92", fontSize: "9px", width: "52px", flexShrink: 0 }}>{r.m}</span>
                    <div style={{ flex: 1, background: "rgba(21,23,26,0.04)", borderRadius: "3px", height: "14px", overflow: "hidden" }}>
                      <div style={{ width: `${r.w}%`, height: "100%", background: "#1CB8B8", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "5px" }}>
                        <span style={{ color: "rgba(255,255,255,0.95)", fontSize: "8px", fontWeight: 700 }}>
                          {r.v >= 1000 ? `$${(r.v/1000).toFixed(1)}k` : `$${r.v}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ color: "#B8BABD", fontSize: "9px", marginTop: "10px" }}>USD value at current prices</p>
            </div>
          </div>

          {/* Panel 2: P&L Tracker */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)" }}>
            <div className="px-4 pt-4 pb-2 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#B8BABD" }}>P&L Tracker</p>
                <p className="text-xs font-semibold" style={{ color: "#1A1D20" }}>Log sales · track realized P&L</p>
              </div>
              <div style={{ background: "rgba(15,138,74,0.10)", border: "1px solid rgba(15,138,74,0.22)", borderRadius: "8px", padding: "4px 8px", textAlign: "right" }}>
                <p style={{ color: "#8B8E92", fontSize: "8px" }}>Total</p>
                <p style={{ color: "#0F8A4A", fontSize: "12px", fontWeight: 800, lineHeight: 1 }}>+$4,275</p>
              </div>
            </div>
            <div className="px-4 pb-4">
              {/* Token row */}
              <div style={{ background: "#FAFAFA", border: "1px solid rgba(21,23,26,0.06)", borderRadius: "10px", padding: "10px", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "7px", background: "rgba(28,184,184,0.18)", border: "1px solid rgba(28,184,184,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#0F8A8A", fontSize: "8px", fontWeight: 800 }}>PRI</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: "#1A1D20", fontSize: "10px", fontWeight: 700 }}>PRISM</p>
                    <p style={{ color: "#8B8E92", fontSize: "9px" }}>Entry $0.50 · Now $0.95</p>
                  </div>
                </div>
                {/* Transactions */}
                {[
                  { date: "15 Jan", amt: "1,000", px: "$0.60", pnl: "+$100" },
                  { date: "20 Feb", amt: "500",   px: "$0.80", pnl: "+$150" },
                ].map((tx) => (
                  <div key={tx.date} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0", borderTop: "1px solid rgba(21,23,26,0.05)" }}>
                    <span style={{ color: "#8B8E92", fontSize: "8px", width: "32px" }}>{tx.date}</span>
                    <span style={{ color: "#475569", fontSize: "8px", flex: 1 }}>{tx.amt} @ {tx.px}</span>
                    <span style={{ color: "#0F8A4A", fontSize: "9px", fontWeight: 700 }}>{tx.pnl}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(21,23,26,0.05)" }}>
                  <span style={{ color: "#8B8E92", fontSize: "8px" }}>Unrealized</span>
                  <span style={{ color: "#0F8A4A", fontSize: "9px", fontWeight: 700 }}>+$4,025</span>
                  <span style={{ color: "#8B8E92", fontSize: "8px" }}>· Total</span>
                  <span style={{ color: "#0F8A4A", fontSize: "10px", fontWeight: 800 }}>+$4,275</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <div style={{ flex: 1, background: "rgba(28,184,184,0.08)", border: "1px solid rgba(28,184,184,0.22)", borderRadius: "7px", padding: "5px 8px" }}>
                  <p style={{ color: "#8B8E92", fontSize: "8px" }}>Realized</p>
                  <p style={{ color: "#0F8A8A", fontSize: "10px", fontWeight: 800 }}>+$250</p>
                </div>
                <div style={{ flex: 1, background: "rgba(15,138,74,0.08)", border: "1px solid rgba(15,138,74,0.22)", borderRadius: "7px", padding: "5px 8px" }}>
                  <p style={{ color: "#8B8E92", fontSize: "8px" }}>Unrealized</p>
                  <p style={{ color: "#0F8A4A", fontSize: "10px", fontWeight: 800 }}>+$4,025</p>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 3: Tax-ready exports */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)" }}>
            <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#B8BABD" }}>Tax-Ready Exports</p>
                <p className="text-xs font-semibold" style={{ color: "#1A1D20" }}>Income statement &amp; broker CSVs</p>
              </div>
              <span style={{ background: "rgba(28,184,184,0.10)", border: "1px solid rgba(28,184,184,0.22)", color: "#0F8A8A", fontSize: "8px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: "999px" }}>Pro</span>
            </div>
            <div className="px-4 pb-4 space-y-2">
              {/* Tax-year summary — single-line so the panel total height
                  matches the surrounding P&L Tracker / Monthly Forecast
                  cards (was 320px vs 255px when this was 2-line). */}
              <div style={{ background: "#FAFAFA", border: "1px solid rgba(21,23,26,0.06)", borderRadius: "9px", padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#8B8E92", fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Tax year 2025 · 14 claims</span>
                <span style={{ color: "#0F8A4A", fontSize: "13px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>$12,580</span>
              </div>

              {/* Example claim events (cost-basis at receipt) — single-line
                  rows to match the surrounding panels' compact rhythm. */}
              {[
                { date: "15 Jan", sym: "NOVA", amt: "1,000 @ $1.00",  usd: "+$1,000", color: "#F0992E" },
                { date: "20 Feb", sym: "FLUX", amt: "0.5 @ $3,241",   usd: "+$1,620", color: "#0F8A8A" },
              ].map((r) => (
                <div key={r.date + r.sym} style={{ background: "#FAFAFA", border: "1px solid rgba(21,23,26,0.06)", borderRadius: "9px", padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0, flex: 1 }}>
                    <div style={{ width: "18px", height: "18px", borderRadius: "5px", background: r.color + "1F", border: `1px solid ${r.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ color: r.color, fontSize: "6px", fontWeight: 800 }}>{r.sym.slice(0,2)}</span>
                    </div>
                    <span style={{ color: "#1A1D20", fontSize: "10px", fontWeight: 700, flexShrink: 0 }}>{r.date}</span>
                    <span style={{ color: "#8B8E92", fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sym} · {r.amt}</span>
                  </div>
                  <span style={{ color: "#0F8A4A", fontSize: "10px", fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{r.usd}</span>
                </div>
              ))}

              {/* Broker-format export pills */}
              <div style={{ display: "flex", gap: "5px", marginTop: "4px" }}>
                {["Koinly", "CoinTracker", "TurboTax"].map((b) => (
                  <div key={b} style={{ flex: 1, background: "rgba(28,184,184,0.10)", border: "1px solid rgba(28,184,184,0.22)", borderRadius: "8px", padding: "6px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#0F8A8A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span style={{ color: "#0F8A8A", fontSize: "8.5px", fontWeight: 700 }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Features grid ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Everything in one place
          </h2>
          <p className="text-base" style={{ color: "#8B8E92" }}>
            Built for teams and individuals managing token allocations across multiple protocols.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
              color: "#1CB8B8", bg: "rgba(28,184,184,0.08)", border: "rgba(28,184,184,0.14)",
              title: "Live on-chain data",
              body: "Real-time positions pulled from Sablier, Hedgey, Superfluid, LlamaPay, UNCX, Unvest, PinkSale, Streamflow, and Jupiter Lock — across Ethereum, Base, BSC, Polygon, Arbitrum, Optimism, and Solana.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
              color: "#0F8A8A", bg: "rgba(15,138,138,0.08)", border: "rgba(15,138,138,0.14)",
              title: "Push + email alerts",
              body: "Native push notifications on iOS & Android, plus email — so you always know when a token is ready to claim, before you open the app.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
              color: "#059669", bg: "rgba(5,150,105,0.08)", border: "rgba(5,150,105,0.14)",
              title: "Mobile app + web dashboard",
              body: "Track unlocks on the go with the iOS & Android app, then go deeper on the web dashboard — advanced filters, exports, and P&L analysis.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
              color: "#db2777", bg: "rgba(219,39,119,0.07)", border: "rgba(219,39,119,0.13)",
              title: "Monthly cashflow forecast",
              body: "Bar chart showing your expected USD unlock value month-by-month across all tokens and protocols.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
              color: "#0369a1", bg: "rgba(3,105,161,0.07)", border: "rgba(3,105,161,0.13)",
              title: "P&L tracker",
              body: "Log your purchase price and individual sales. Vestream splits your P&L into realized and unrealized — all stored locally.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
              color: "#b45309", bg: "rgba(180,83,9,0.07)", border: "rgba(180,83,9,0.13)",
              title: "CSV &amp; PDF export",
              body: "Download a full CSV of vesting positions and sell transactions — or print a PDF report — directly from the dashboard.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl p-5 transition-all duration-200 hover:shadow-md"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                style={{ background: f.bg, border: `1px solid ${f.border}`, color: f.color }}>
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "#1A1D20" }} dangerouslySetInnerHTML={{ __html: f.title }} />
              <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Search feature ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto overflow-hidden">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
          {/* Text */}
          <div className="flex-1 md:max-w-[420px]">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(28,184,184,0.08)", border: "1px solid rgba(28,184,184,0.14)", color: "#1CB8B8" }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
              Find every vesting in one search
            </h2>
            <p className="text-base leading-relaxed mb-7" style={{ color: "#8B8E92" }}>
              Enter any wallet address and Vestream simultaneously scans every integrated protocol across all supported chains — returning every active vesting in seconds. No switching between platforms, no missed positions.
            </p>

            {/* Protocol pill grid — explicit list of every platform we scan, each
                with its brand accent. Matches the 7 rows in the mockup on the right
                so a visitor can't accidentally assume we've quietly dropped one. */}
            <div className="mb-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#B8BABD" }}>
                Protocols scanned on every search
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: "Sablier",      color: "#F0992E" },
                  { name: "Hedgey",       color: "#8169E0" },
                  { name: "UNCX",         color: "#3D7FD0" },
                  { name: "Unvest",       color: "#0BA0CB" },
                  { name: "LlamaPay",     color: "#A26B3F" },
                  { name: "Superfluid",   color: "#28B895" },
                  { name: "PinkSale",     color: "#E063A0" },
                  { name: "Streamflow",   color: "#5DCE9D" },
                  { name: "Jupiter Lock", color: "#F0B83D" },
                ].map((p) => (
                  <span
                    key={p.name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{
                      background: `${p.color}14`,     // ~8% alpha
                      border: `1px solid ${p.color}33`, // ~20% alpha
                      color: p.color,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                    {p.name}
                  </span>
                ))}
              </div>
            </div>

            <ul className="flex flex-col gap-3.5">
              {[
                "9+ protocols scanned simultaneously - every one listed above",
                "Ethereum, Base, BNB Chain, Polygon, Arbitrum, Optimism & Solana",
                "Results surface in under 3 seconds",
              ].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm font-medium" style={{ color: "#1A1D20" }}>
                  <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(28,184,184,0.1)", color: "#1CB8B8" }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          {/* Mockup */}
          <div className="flex-1 w-full rounded-2xl p-5 md:p-6" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)" }}>
            {/* Search bar */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl mb-4" style={{ background: "#FAFAFA", border: "1px solid rgba(21,23,26,0.10)" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#8B8E92" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span style={{ color: "#475569", fontSize: 12, fontFamily: "monospace" }}>0x3f5CE...8b2e</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-md font-semibold" style={{ background: "rgba(28,184,184,0.14)", color: "#0F8A8A" }}>Scan all</span>
            </div>
            {/* Result rows — one per supported protocol so a visitor sees all 7
                integrations represented, not just a convenient subset. */}
            {[
              // 2026-05-15: aligned to the canonical palette in
              // src/lib/protocol-constants.ts. Previous mock had Hedgey
              // as blue (#3b82f6) and UNCX as orange (same as Sablier),
              // both collisions that contradicted what the actual app
              // renders. Marketing visuals must match in-app reality
              // or the screenshot fails the "same product?" sniff test.
              { protocol: "Sablier",      chain: "Base",       token: "NOVA",  amount: "1,250", color: "#F0992E" },
              { protocol: "Hedgey",       chain: "Ethereum",   token: "FLUX",  amount: "420",   color: "#8169E0" },
              { protocol: "UNCX",         chain: "BNB Chain",  token: "VEST",  amount: "875",   color: "#3D7FD0" },
              { protocol: "Unvest",       chain: "Polygon",    token: "KLAR",  amount: "240",   color: "#0BA0CB" },
              { protocol: "LlamaPay",     chain: "Arbitrum",   token: "NOVA",  amount: "630",   color: "#A26B3F" },
              { protocol: "Superfluid",   chain: "Optimism",   token: "VEST",  amount: "310",   color: "#28B895" },
              { protocol: "PinkSale",     chain: "BNB Chain",  token: "FLUX",  amount: "500",   color: "#E063A0" },
              { protocol: "Streamflow",   chain: "Solana",     token: "JUP",   amount: "1,800", color: "#5DCE9D" },
              { protocol: "Jupiter Lock", chain: "Solana",     token: "WEN",   amount: "12,000", color: "#F0B83D" },
            ].map((r) => (
              <div key={r.protocol + r.token} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl mb-2"
                style={{ background: "#FAFAFA", border: "1px solid rgba(21,23,26,0.07)" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold"
                  style={{ background: r.color, fontSize: 10 }}>{r.protocol[0]}</div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: "#1A1D20", fontSize: 12, fontWeight: 600 }}>{r.protocol}</p>
                  <p style={{ color: "#8B8E92", fontSize: 11 }}>{r.chain}</p>
                </div>
                <div className="text-right">
                  <p style={{ color: "#0F8A4A", fontSize: 12, fontWeight: 600 }}>{r.amount} {r.token}</p>
                </div>
              </div>
            ))}
            <p className="text-center mt-3" style={{ color: "#B8BABD", fontSize: 11 }}>9 vestings found across 9 protocols scanned</p>
          </div>
        </div>
      </section>

      {/* ── Token Vesting Explorer ───────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto overflow-hidden">
        <div className="flex flex-col md:flex-row-reverse items-center gap-10 md:gap-16">
          {/* Text */}
          <div className="flex-1 md:max-w-[420px]">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(11,160,203,0.08)", border: "1px solid rgba(11,160,203,0.14)", color: "#0BA0CB" }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
              See who else is vesting your token
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "#8B8E92" }}>
              Search any token and see the complete global picture — every wallet, every protocol, every upcoming unlock. Large unlock events create selling pressure. Spotting a cluster 30 days out lets you hedge, hold, or exit with conviction — not guesswork.
            </p>
          </div>
          {/* Mockup */}
          <div className="flex-1 w-full rounded-2xl p-5 md:p-6" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)" }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p style={{ color: "#1A1D20", fontSize: 13, fontWeight: 700 }}>NOVA — All Vestings</p>
                <p style={{ color: "#8B8E92", fontSize: 11 }}>Global unlock schedule</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(179,50,46,0.10)", color: "#B3322E" }}>
                47.2M NOVA in 14d
              </span>
            </div>
            {/* Wallet rows */}
            {[
              { wallet: "0x1a4c...f2d8", protocol: "Sablier", unlock: "14 days", amount: "12.5M NOVA", pct: 82 },
              { wallet: "0x9b2e...c401", protocol: "Hedgey", unlock: "21 days", amount: "8.1M NOVA", pct: 54 },
              { wallet: "0x5f7a...3c9e", protocol: "UNCX", unlock: "30 days", amount: "6.4M NOVA", pct: 42 },
              { wallet: "0x2d8b...a71f", protocol: "Sablier", unlock: "45 days", amount: "20.2M NOVA", pct: 100 },
            ].map((w) => (
              <div key={w.wallet} className="mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: "#475569", fontSize: 11, fontFamily: "monospace" }}>{w.wallet}</span>
                    <span style={{ color: "#8B8E92", fontSize: 10, background: "rgba(21,23,26,0.05)", padding: "1px 6px", borderRadius: 4 }}>{w.protocol}</span>
                  </div>
                  <div className="text-right">
                    <span style={{ color: "#1A1D20", fontSize: 11, fontWeight: 600 }}>{w.amount}</span>
                    <span style={{ color: "#8B8E92", fontSize: 10, marginLeft: 6 }}>{w.unlock}</span>
                  </div>
                </div>
                <div className="h-1 rounded-full" style={{ background: "rgba(21,23,26,0.06)" }}>
                  <div className="h-1 rounded-full" style={{ width: `${w.pct}%`, background: "linear-gradient(90deg, #0BA0CB, #1CB8B8)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Income mode — stablecoin payroll tracking ────────────────────────
          Pitches the new Investment vs Income segmentation. Targets the
          freelancer / DAO contributor / remote-worker segment who get
          paid in USDC and need to track salary for taxes. Same product,
          different lens — one toggle switches the whole app.
          2026-05-15 */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto overflow-hidden">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
          {/* Text */}
          <div className="flex-1 md:max-w-[420px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
              style={{ background: "rgba(45,179,106,0.08)", color: "#2DB36A", border: "1px solid rgba(45,179,106,0.18)" }}>
              New · For stablecoin earners
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
              Get paid in stablecoins? Track it like a salary.
            </h2>
            <p className="text-base leading-relaxed mb-6" style={{ color: "#8B8E92" }}>
              Flip Vestream into <span className="font-semibold" style={{ color: "#1A1D20" }}>Income mode</span> with one tap. Sablier, Superfluid, LlamaPay streams paying USDC, USDT, DAI — all filtered into one view. Monthly income, 30-day forecast, year-to-date totals. Tag each source — Salary, Contract, Bonus, Grant — and the breakdown surfaces automatically.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>
              Tax-ready CSV when filing time comes. Switch back to Investment mode any time — same wallets, different lens.
            </p>
          </div>
          {/* Mockup */}
          <div className="flex-1 w-full rounded-2xl p-5 md:p-6" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)" }}>
            {/* Segmented toggle */}
            <div className="flex rounded-full p-1 mb-5" style={{ background: "rgba(21,23,26,0.04)", border: "1px solid rgba(21,23,26,0.06)" }}>
              <div className="flex-1 text-center py-1.5 rounded-full text-xs font-semibold" style={{ color: "#8B8E92" }}>
                Investment
              </div>
              <div className="flex-1 text-center py-1.5 rounded-full text-xs font-bold text-white" style={{ background: "#1CB8B8" }}>
                Income
              </div>
            </div>
            {/* Income totals */}
            <div className="rounded-2xl p-5 mb-4" style={{ background: "linear-gradient(135deg, rgba(45,179,106,0.10), rgba(28,184,184,0.08))", border: "1px solid rgba(45,179,106,0.18)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#2DB36A" }}>
                Income · 2026
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "This month", value: "$5,200", sub: "received" },
                  { label: "Next 30 days", value: "$5,800", sub: "forecast", highlight: true },
                  { label: "Year to date", value: "$42,500", sub: "2026 so far" },
                ].map(s => (
                  <div key={s.label}>
                    <p style={{ color: "#8B8E92", fontSize: 10, fontWeight: 600, marginBottom: 4 }}>{s.label}</p>
                    <p style={{ color: s.highlight ? "#2DB36A" : "#1A1D20", fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>{s.value}</p>
                    <p style={{ color: "#B8BABD", fontSize: 9, marginTop: 1 }}>{s.sub}</p>
                  </div>
                ))}
              </div>
              {/* Source breakdown bar */}
              <div className="mt-4 mb-3 flex h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(21,23,26,0.06)" }}>
                <div style={{ flex: 65, background: "#1CB8B8" }} />
                <div style={{ flex: 22, background: "#7c3aed" }} />
                <div style={{ flex: 13, background: "#F0992E" }} />
              </div>
              <div className="flex gap-3 flex-wrap text-[10px]">
                <span style={{ color: "#0F8A8A", fontWeight: 600 }}>● Salary 65%</span>
                <span style={{ color: "#7c3aed", fontWeight: 600 }}>● Contract 22%</span>
                <span style={{ color: "#F0992E", fontWeight: 600 }}>● Bonus 13%</span>
              </div>
            </div>
            {/* Stablecoin stream rows */}
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#B8BABD" }}>
              Active income streams
            </p>
            {[
              { source: "Acme DAO", protocol: "Sablier",    token: "USDC", monthly: "$4,000/mo",  tag: "Salary",   tagColor: "#1CB8B8" },
              { source: "0xClient", protocol: "Superfluid", token: "USDT", monthly: "$1,200/mo",  tag: "Contract", tagColor: "#7c3aed" },
              { source: "Grant",    protocol: "LlamaPay",   token: "DAI",  monthly: "$600/mo",    tag: "Grant",    tagColor: "#28B895" },
            ].map(r => (
              <div key={r.source} className="flex items-center justify-between py-2 px-3 rounded-xl mb-1.5"
                style={{ background: "#FAFAFA", border: "1px solid rgba(21,23,26,0.05)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-white font-bold" style={{ background: "#2DB36A", fontSize: 9 }}>
                    {r.token[0]}
                  </div>
                  <div>
                    <p style={{ color: "#1A1D20", fontSize: 11, fontWeight: 700 }}>{r.source} · {r.token}</p>
                    <p style={{ color: "#8B8E92", fontSize: 9 }}>{r.protocol}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: r.tagColor + "1A", color: r.tagColor }}>
                    {r.tag}
                  </span>
                  <span style={{ color: "#0F8A4A", fontSize: 11, fontWeight: 700 }}>{r.monthly}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mobile app ──────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="rounded-3xl overflow-hidden relative flex flex-col md:flex-row items-center gap-8 md:gap-0 p-8 md:p-12"
          style={{ background: "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)", border: "1px solid rgba(28,184,184,0.25)" }}>

          {/* Gradient glow — teal halo on the right where the phone sits, so the
              device shadow reads against the warm-ink-to-teal field. */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 55% 60% at 85% 50%, rgba(28,184,184,0.22) 0%, transparent 70%)",
          }} />

          {/* Text */}
          <div className="relative flex-1 md:pr-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-5"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "white" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#2DB36A" }} />
              Available on iOS &amp; Android
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Your vestings, in your pocket
            </h2>
            <p className="text-base leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.8)" }}>
              The Vestream mobile app tracks every token unlock in real time — and sends push notifications to your phone the moment a claim is ready.
            </p>
            <p className="text-sm leading-relaxed mb-8" style={{ color: "rgba(255,255,255,0.55)" }}>
              Sign up for early access to the web dashboard — the mobile app is included with your account.
            </p>
            <ul className="flex flex-col gap-3.5">
              {[
                "Native push notifications for every unlock",
                "Full portfolio view, calendar & alerts on mobile",
                "Web dashboard for deep analysis, exports & P&L",
              ].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
                  <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* iPhone illustration */}
          <div className="relative flex-shrink-0">
            <svg width={150} height={310} viewBox="0 0 150 310" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="iconGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#1CB8B8"/>
                  <stop offset="1" stopColor="#0F8A8A"/>
                </linearGradient>
              </defs>
              {/* Phone body — light frame to match the actual mobile app */}
              <rect x="4" y="4" width="142" height="302" rx="26" fill="#F5F5F3" stroke="rgba(28,184,184,0.55)" strokeWidth="1.5"/>
              {/* Side button (right) */}
              <rect x="146" y="95" width="3" height="38" rx="1.5" fill="rgba(28,184,184,0.45)"/>
              {/* Volume buttons (left) */}
              <rect x="1" y="84" width="3" height="22" rx="1.5" fill="rgba(28,184,184,0.45)"/>
              <rect x="1" y="114" width="3" height="22" rx="1.5" fill="rgba(28,184,184,0.45)"/>
              {/* Screen */}
              <rect x="10" y="10" width="130" height="290" rx="20" fill="#FAFAFA"/>
              {/* Dynamic Island — stays dark, it's a hardware element */}
              <rect x="51" y="17" width="48" height="12" rx="6" fill="#1A1D20"/>
              {/* App bar */}
              <rect x="10" y="40" width="130" height="34" fill="white"/>
              <line x1="10" y1="74" x2="140" y2="74" stroke="rgba(21,23,26,0.06)" strokeWidth="1"/>
              {/* App icon — slab mark on a white tile to match current
                  brand. Three stacked parallelograms; bottom one teal. */}
              <rect x="18" y="47" width="20" height="20" rx="5" fill="white" stroke="rgba(21,23,26,0.10)" strokeWidth="0.75"/>
              <path d="M22 53 L31 53 L33 55 L22 55 Z" fill="#1A1D20" fillOpacity="0.35"/>
              <path d="M22 57.5 L33 57.5 L35 59.5 L22 59.5 Z" fill="#1A1D20" fillOpacity="0.65"/>
              <path d="M22 62 L35 62 L37 64 L22 64 Z" fill="#1CB8B8"/>
              {/* App title — single-fill ink to match the lockup */}
              <text x="42" y="60" fontSize="10.5" fontWeight="700" fill="#1A1D20" fontFamily="system-ui">Vestream</text>
              {/* Notification banner */}
              <rect x="14" y="82" width="122" height="46" rx="10" fill="white" stroke="rgba(28,184,184,0.32)" strokeWidth="1"/>
              {/* Bell icon background */}
              <rect x="21" y="89" width="22" height="22" rx="7" fill="rgba(28,184,184,0.18)"/>
              {/* Bell SVG path */}
              <path d="M32 92.5c-2.2 0-4 1.8-4 4v.8c-.8.4-1 1-1 1.7h10c0-.7-.2-1.3-1-1.7v-.8c0-2.2-1.8-4-4-4z" fill="#0F8A8A"/>
              <path d="M30.5 99h3a1.5 1.5 0 0 1-3 0z" fill="#0F8A8A"/>
              {/* Notification text */}
              <text x="49" y="98" fontSize="8" fontWeight="700" fill="#1A1D20" fontFamily="system-ui">Token Unlock</text>
              {/* Short copy required — the banner has ~87px of inner space
                  for this line (after the icon + "now" stamp on the right).
                  Previous "NOVA · 12,500 ready to claim" overflowed and got
                  clipped to "...ready to clai" on narrow phones. */}
              <text x="49" y="109" fontSize="7" fill="#8B8E92" fontFamily="system-ui">NOVA · 12.5K claimable</text>
              <text x="128" y="98" fontSize="6.5" fill="#0F8A8A" textAnchor="end" fontFamily="system-ui">now</text>
              {/* Divider */}
              <line x1="14" y1="142" x2="136" y2="142" stroke="rgba(21,23,26,0.06)" strokeWidth="1"/>
              {/* Section label */}
              <text x="14" y="157" fontSize="7.5" fontWeight="600" fill="#B8BABD" fontFamily="system-ui" letterSpacing="1">PORTFOLIO</text>
              {/* Portfolio rows */}
              {[
                { y: 178, label: "NOVA", val: "$4,218", color: "#F0992E" },
                { y: 206, label: "FLUX", val: "$1,840", color: "#3b82f6" },
                { y: 234, label: "VEST", val: "$920",   color: "#2DB36A" },
              ].map(r => (
                <g key={r.label}>
                  <rect x="14" y={r.y - 14} width="122" height="22" rx="8" fill="white" stroke="rgba(21,23,26,0.06)" strokeWidth="0.75"/>
                  <circle cx="28" cy={r.y - 3} r="6.5" fill={r.color + "28"}/>
                  <text x="28" y={r.y} fontSize="7" fontWeight="700" fill={r.color} textAnchor="middle">{r.label[0]}</text>
                  <text x="41" y={r.y} fontSize="8" fontWeight="600" fill="#1A1D20" fontFamily="system-ui">{r.label}</text>
                  <text x="128" y={r.y} fontSize="8" fontWeight="700" fill="#0F8A4A" textAnchor="end" fontFamily="system-ui">{r.val}</text>
                </g>
              ))}
              {/* Home indicator */}
              <rect x="55" y="295" width="40" height="4" rx="2" fill="rgba(21,23,26,0.18)"/>
            </svg>
          </div>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>Built for</p>
          <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Who uses Vestream?
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "#8B8E92" }}>
            Token vesting spans multiple protocols, chains, and wallets. We make it simple for anyone with tokens on a schedule.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
              color: "#1CB8B8", bg: "rgba(28,184,184,0.07)", border: "rgba(28,184,184,0.12)",
              audience: "Investors & Community Members",
              description: "You hold token allocations from projects you backed or contributed to. Whether you're a retail investor, community participant, or early supporter, you shouldn't need to read smart contracts to know when you can claim.",
              bullets: ["Check claimable balance across every major protocol in seconds", "See exact unlock dates — cliff events, streaming rates, tranches", "Get notified before every unlock event by email"],
            },
            {
              icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
              color: "#059669", bg: "rgba(5,150,105,0.07)", border: "rgba(5,150,105,0.12)",
              audience: "Advisors & Contributors",
              description: "You've worked with multiple projects and hold token grants across different wallets and protocols. Manually checking each protocol dashboard every month isn't a system.",
              bullets: ["All your vesting grants in one unified view — across any wallet", "Label each wallet and add notes to stay organised", "Export to CSV for your accountant or tax records"],
            },
            {
              icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
              color: "#0F8A8A", bg: "rgba(15,138,138,0.07)", border: "rgba(15,138,138,0.12)",
              audience: "VCs & Funds",
              description: "Your portfolio spans dozens of projects, chains, and wallets. Missing a liquidity event or miscalculating claimable balances isn't an option — you need a system that scales.",
              bullets: ["Track every portfolio wallet and token allocation in one place", "Real-time claimable value with entry price and P&L tracking", "Bulk CSV export for compliance, LP reporting, and audit trails"],
            },
          ].map((card) => (
            <div key={card.audience} className="rounded-2xl p-6"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: card.bg, border: `1px solid ${card.border}`, color: card.color }}>
                {card.icon}
              </div>
              <h3 className="text-base font-bold mb-2.5" style={{ color: "#1A1D20" }}>{card.audience}</h3>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "#8B8E92" }}>{card.description}</p>
              <ul className="space-y-2">
                {card.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm" style={{ color: "#475569" }}>
                    <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: card.bg, color: card.color }}>
                      <svg width={9} height={9} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* B2B / Developer callout removed — the homepage is now strictly B2C.
          Developer and AI-agent audiences land directly on /developer and /ai
          via the top nav + footer, so a dark navy section in the middle of the
          retail narrative was off-theme. Those pages still exist unchanged. */}

      {/* ── How it works ──────────────────────────────────────────────────
          Reflects the actual user journey we want: download the app →
          paste a wallet → push alerts. The previous "Connect wallet →
          Add wallets → Never miss" flow was web-dashboard-flavoured;
          users coming through the funnel should land on the App Store,
          not the SIWE login page. */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>Simple by design</p>
          <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Up and running in 60 seconds
          </h2>
          <p className="text-base" style={{ color: "#8B8E92" }}>Download. Paste. Done. No sign-up forms, no email verification, no KYC.</p>
        </div>

        <div className="relative">
          <div className="absolute top-8 left-[calc(16.67%+16px)] right-[calc(16.67%+16px)] h-px hidden md:block"
            style={{ background: "linear-gradient(90deg, rgba(28,184,184,0.2), rgba(15,138,138,0.2))" }} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01", color: "#1CB8B8", bg: "rgba(28,184,184,0.08)", border: "rgba(28,184,184,0.18)",
                title: "Download the app",
                body: "Free on the App Store and Google Play. No account, no email, no KYC. Open the app and you're already signed in.",
                icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
              },
              {
                step: "02", color: "#0F8A8A", bg: "rgba(15,138,138,0.08)", border: "rgba(15,138,138,0.18)",
                title: "Paste a wallet address",
                body: "Add any wallet you want to track — yours, your team's, an investor's. We instantly scan every chain and protocol for active vestings.",
                icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M8 14h4"/></svg>,
              },
              {
                step: "03", color: "#059669", bg: "rgba(5,150,105,0.08)", border: "rgba(5,150,105,0.18)",
                title: "Never miss an unlock",
                body: "Get a push alert the moment a token unlocks. Tap the notification, claim it on the protocol's site, done.",
                icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
              },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
                    {s.icon}
                  </div>
                  <div className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: s.color }}>
                    {s.step.replace("0", "")}
                  </div>
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: "#1A1D20" }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tax exports — mid-page, below hero/features/onboarding.
            Deliberately not in the hero: the headline value of Vestream is
            tracking, not taxes. Tax is the secondary feature that turns
            tracking users into yearly returners. Surface it where readers
            who scrolled this far are already engaged. ───────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="rounded-3xl p-8 md:p-12"
          style={{
            background: "linear-gradient(135deg, rgba(28,184,184,0.06), rgba(124,58,237,0.04))",
            border: "1px solid rgba(28,184,184,0.18)",
          }}>
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-8 md:gap-12 items-center">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>
                Tax season? Sorted.
              </p>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
                Six hours of January spreadsheets, in 60 seconds.
              </h2>
              <p className="text-base mb-7 leading-relaxed" style={{ color: "#5C6066" }}>
                Every vesting claim, valued in USD at the moment it hit your wallet —
                ready to drop into Koinly, CoinTracker or TurboTax.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/find-vestings"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", boxShadow: "0 4px 16px rgba(28,184,184,0.25)" }}>
                  Scan a wallet to start →
                </Link>
                <Link href="/resources/token-vesting-tax-guide"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: "white", border: "1px solid rgba(28,184,184,0.25)", color: "#0F8A8A" }}>
                  Tax guide →
                </Link>
              </div>
            </div>
            <div className="hidden md:block">
              {/* Mock report card — purely illustrative, no real data. */}
              <div className="rounded-2xl p-5"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 8px 24px rgba(28,184,184,0.10)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "#0F8A8A" }}>Tax year 2025</p>
                  <span className="text-[10px] font-mono" style={{ color: "#94A3B8" }}>VESTING_INCOME.pdf</span>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#94A3B8" }}>Total income</p>
                <p className="text-3xl font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>$8,420.00</p>
                <div className="space-y-2 pt-3" style={{ borderTop: "1px solid #f1f5f9" }}>
                  {[
                    { label: "Sablier",      value: "$4,470.00", pct: "53%" },
                    { label: "Hedgey",       value: "$1,940.00", pct: "23%" },
                    { label: "UNCX",         value: "$1,340.00", pct: "16%" },
                    { label: "Streamflow",   value: "$670.00",   pct: "8%"  },
                  ].map((r) => (
                    <div key={r.label} className="flex justify-between items-center text-xs">
                      <span style={{ color: "#3A3D42" }}>{r.label}</span>
                      <div className="text-right">
                        <span className="font-semibold" style={{ color: "#1A1D20" }}>{r.value}</span>
                        <span className="ml-2 text-[10px]" style={{ color: "#94A3B8" }}>{r.pct}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[10px] mt-3 text-center" style={{ color: "#94A3B8" }}>
                Illustrative. Your actual report uses on-chain claim data.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>Got questions</p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>Frequently asked</h2>
        </div>

        <div className="space-y-3">
          {[
            {
              q: "Do I need to connect a wallet to use Vestream?",
              a: "No wallet connection required. Paste any address into Find My Vestings to scan it free — no signup. To save wallets and get unlock alerts, install the mobile app and sign in with email — we'll send a one-time code, no password needed. You never sign transactions or expose any keys.",
            },
            {
              q: "How do I get to the desktop dashboard?",
              a: "The desktop dashboard is part of the Pro plan. Subscribe in the iOS or Android app, then visit vestream.io/login on your computer and scan the QR code from the app's Settings → Connect Desktop. No password, no email — your phone authenticates the desktop session.",
            },
            {
              q: "Can Vestream access or move my funds?",
              a: "Never. Vestream is strictly read-only. We only read publicly available on-chain data — we never request your private key, can't initiate transactions, and have no ability to move tokens. The mobile app authenticates with email; we never see your wallet's keys.",
            },
            {
              q: "Which protocols and chains are supported?",
              a: "Vestream supports 10+ protocols: Sablier (linear & tranched streaming), Sablier Flow, Hedgey (vesting plans), Superfluid (streaming vesting), LlamaPay (per-second token streaming), UNCX Network (locker & VestingManager), Unvest, PinkSale (PinkLock), Streamflow (Solana), and Jupiter Lock (time-released token vesting on Solana) — on Ethereum, Base, BSC, Polygon, Arbitrum, Optimism, and Solana. Ethereum Sepolia is supported for testing. More protocols and chains on the roadmap.",
            },
            {
              q: "How do unlock notifications work?",
              a: "Push notifications are core to the mobile app — every tier gets them (Free gets 10 per calendar month, resets on the 1st; Pro is unlimited). You configure timing per token in the Alerts tab — anything from 'live unlock' to '24 hours before'. Email alerts are a Pro-only feature; enable them in the Alerts tab and enter the address you want notifications sent to.",
            },
            {
              q: "What is the P&L Tracker?",
              a: "The P&L Tracker lets you log your token purchase price (entry price) and any individual sales — date, token amount, and sell price or total USD received. Vestream automatically splits your P&L into realized (already sold) and unrealized (remaining vesting tokens at current market price). Available on the mobile app's token detail screen and on the Pro web dashboard.",
            },
            {
              q: "Can I export my data?",
              a: "Yes — Pro plan only. From the desktop dashboard's Tax Reports section you can download CSV files in formats ready for Koinly, CoinTracker, or TurboTax, plus a year-end PDF report and a vesting income statement. Free tier doesn't include exports — they're a Pro feature.",
            },
            {
              q: "How accurate are the token prices?",
              a: "Prices are fetched live from DexScreener, using the highest-volume trading pair for each token. Market cap and FDV figures match DexScreener's own display. For tokens with no DEX listing (e.g. testnet tokens), prices show as unavailable and the tracker falls back to raw token amounts.",
            },
            {
              q: "Can I track wallets that aren't mine?",
              a: "Yes. You can add any wallet address you want to monitor — useful for tracking team vesting wallets, investor allocations, or advisor grants. All data is public on-chain. Free tier: 3 wallets. Pro tier: 10 wallets.",
            },
            {
              q: "Is Vestream free to use?",
              a: "Yes. Free plan includes 3 wallets on the mobile app, the public web wallet scanner, all 10+ supported protocols, claimable balance tracking, the unlock calendar, and 10 push alerts per month (resets on the 1st). Pro ($9.99/mo or $74.99/year — saves 37%, 14-day trial) adds 10 wallets, unlimited push + email alerts, the desktop dashboard, the Token Vesting Explorer, and tax exports (Koinly / CoinTracker / TurboTax + year-end PDF + income statement).",
            },
            {
              q: "Do you have an API for developers and AI agents?",
              a: "Yes. The Vestream REST API and our MCP server give you programmatic access to the same vesting data that powers the dashboard — cross-protocol, cross-chain, real-time. See the Developer page or contact us about Enterprise access.",
            },
          ].map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto w-full overflow-hidden">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-6"
            style={{ background: "rgba(28,184,184,0.06)", borderColor: "rgba(28,184,184,0.2)", color: "#1CB8B8" }}>
            Simple, transparent pricing
          </div>
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Start free. Scale when you&apos;re ready.
          </h2>
          <p className="text-base" style={{ color: "#8B8E92" }}>
            From solo investors to investment funds — a plan for every stage.
          </p>
        </div>

        {/* Tier cards — Free / Pro (May 2026 pricing simplification).
            The 3-tier Free/Mobile/Pro split was retired: the middle
            "Mobile" tier fractured the conversion funnel for ~$5/mo
            difference, and "3 lifetime push alerts" on the previous
            Free tier made the app feel broken inside a week. New scheme
            optimises for the acquisition story (MAU growth + retention
            curves) over short-term ARPU. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mb-12 max-w-3xl mx-auto">
          {/* Free */}
          <div className="rounded-2xl p-4 md:p-7 min-w-0" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#B8BABD" }}>Free</p>
            <p className="text-3xl font-bold mb-1" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>$0</p>
            <p className="text-sm mb-6" style={{ color: "#8B8E92" }}>Free forever. No credit card needed.</p>
            <Link href="/find-vestings" className="flex items-center justify-center w-full py-2.5 rounded-xl text-sm font-semibold transition-all mb-6"
              style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.2)", color: "#1CB8B8" }}>
              Search a wallet →
            </Link>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              {[
                "3 wallets on the mobile app",
                "Free web wallet scanner — any address",
                "All 10+ vesting protocols",
                "Claimable balance + unlock calendar",
                "10 push alerts / month (resets monthly)",
                "No email alerts (upgrade for email)",
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: "#374151" }}>
                  <svg className="flex-shrink-0 mt-0.5" width={14} height={14} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#1CB8B8" fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke="#1CB8B8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro (featured) — single paid tier with the full feature set. */}
          <div className="relative rounded-2xl p-4 md:p-7 min-w-0 mt-3 md:mt-0" style={{ background: "white", border: "2px solid #1CB8B8", boxShadow: "0 8px 32px rgba(28,184,184,0.18), 0 4px 12px rgba(21,23,26,0.10)" }}>
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-full text-[11px] md:text-xs font-bold text-white whitespace-nowrap"
                style={{ background: "#1CB8B8", boxShadow: "0 4px 12px rgba(28,184,184,0.4)" }}>
                Most popular
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#1CB8B8" }}>Pro</p>
            <p className="text-3xl font-bold mb-1" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
              $9.99<span className="text-base font-semibold" style={{ color: "#8B8E92" }}>/mo</span>
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold mb-3"
              style={{ background: "rgba(45,179,106,0.1)", border: "1px solid rgba(45,179,106,0.25)", color: "#059669" }}>
              14-day free trial
            </div>
            <p className="text-sm mb-1" style={{ color: "#8B8E92" }}>
              Or <span className="font-semibold" style={{ color: "#0F8A8A" }}>$74.99/year</span> — save 37%.
            </p>
            <p className="text-sm mb-6" style={{ color: "#8B8E92" }}>Everything you need to track every unlock.</p>
            <Link href="#download" className="flex items-center justify-center w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all mb-6"
              style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.35)" }}>
              Get the app →
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#B8BABD" }}>Everything in Free, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              {[
                "10 wallet addresses",
                "Unlimited push alerts before every unlock",
                "Email unlock alerts",
                "Web dashboard access (QR sign-in)",
                "Token Vesting Explorer (Discover)",
                "Search any wallet's holdings",
                "Income mode — track stablecoin salary, contracts, grants",
                "Tax-ready CSV exports (Koinly / CoinTracker / TurboTax)",
                "Vesting income statement (P&L)",
                "Year-end PDF tax report",
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: "#374151" }}>
                  <svg className="flex-shrink-0 mt-0.5" width={14} height={14} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#1CB8B8" fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke="#1CB8B8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* How signup + desktop access works — explainer beneath the
            tier cards. Subscriptions happen through the App Store /
            Play Store (RevenueCat IAP); the web dashboard is unlocked
            by scanning a QR from the mobile app. New tier scheme means
            this needs to be explicit because the legacy "sign up on
            web with email" flow has been removed. */}
        <div
          className="rounded-2xl p-4 md:p-5 mb-6 max-w-2xl mx-auto"
          style={{
            background: "rgba(28,184,184,0.04)",
            border: "1px solid rgba(28,184,184,0.18)",
          }}
        >
          <p className="text-sm text-center" style={{ color: "#374151", lineHeight: 1.55 }}>
            <strong style={{ color: "#0F8A8A" }}>How it works:</strong>{" "}
            Subscribe in the iOS or Android app. Pro plan also unlocks the desktop dashboard at{" "}
            <Link href="/login" className="font-semibold underline" style={{ color: "#0F8A8A" }}>
              vestream.io/login
            </Link>{" "}
            — scan a QR from your phone to sign in. No email passwords.
          </p>
        </div>

        {/* B2B / developer nudge — replaces the dropped Enterprise card.
            Same audience (builders, funds, agents) gets the same path
            via the developer page; the homepage just doesn't push
            them through a dedicated tier card. */}
        <p className="text-center text-sm mt-4 mb-8" style={{ color: "#8B8E92" }}>
          Building on Vestream data, or need API access?{" "}
          <Link href="/developer" className="font-semibold" style={{ color: "#1CB8B8" }}>
            See the Developer API →
          </Link>
        </p>

        <PricingComparisonTable />
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 md:pb-32 flex flex-col items-center text-center">
        <div className="relative max-w-2xl w-full rounded-3xl overflow-hidden px-6 md:px-10 py-12 md:py-16"
          style={{ background: "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(147,197,253,0.12) 0%, transparent 70%)" }} />
          <div className="absolute -left-8 bottom-0 w-48 h-48 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(28,184,184,0.12) 0%, transparent 70%)" }} />
          <h2 className="relative text-3xl font-bold text-white mb-3" style={{ letterSpacing: "-0.02em" }}>See every token you&rsquo;re owed.</h2>
          <p className="relative text-base mb-8 max-w-md mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
            Paste any wallet and Vestream returns every active vesting across 10+ protocols in seconds. No sign-up. No KYC.
          </p>
          <div className="relative flex justify-center w-full">
            <Link
              href="/find-vestings"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:-translate-y-0.5"
              style={{
                background: "white",
                color: "#0F8A8A",
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              }}
            >
              Find my vestings →
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />

    </div>
  );
}

// ─── FAQItem ──────────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border overflow-hidden"
      style={{ background: "white", borderColor: "rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none select-none"
        style={{ color: "#1A1D20" }}>
        <span className="text-sm font-semibold">{q}</span>
        <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all group-open:rotate-180"
          style={{ background: "rgba(28,184,184,0.08)", color: "#1CB8B8" }}>
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="px-6 pb-5 pt-1">
        <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>{a}</p>
      </div>
    </details>
  );
}
