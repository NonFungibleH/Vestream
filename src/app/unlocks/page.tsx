// src/app/unlocks/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Index hub for all per-protocol landing pages. Lists the 7 protocols we
// index with a live "last indexed" stamp per row pulled from cache — so this
// page itself is also a freshness signal.
//
// Light B2C theme to match the individual per-protocol pages — each card
// preserves its own protocol-brand accent so the grid feels like a rainbow
// of real integrations rather than generic tiles.
//
// Revalidates every 60s. Feeds the sitemap and cross-links back from every
// individual protocol page.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { listProtocols, type ProtocolMeta } from "@/lib/protocol-constants";
import {
  getProtocolStats,
  relativeTimeSince,
  type ProtocolStats,
} from "@/lib/vesting/protocol-stats";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Token unlock trackers — Vestream",
  description:
    "Live on-chain unlock trackers for Sablier, Hedgey, Superfluid, UNCX, Team Finance, Unvest and PinkSale — across Ethereum, Base, BSC and Polygon.",
  alternates: { canonical: "https://vestream.io/unlocks" },
  openGraph: {
    title: "Token unlock trackers — Vestream",
    description:
      "Live on-chain unlock trackers for every major vesting protocol. Track your wallet, get alerts before every cliff.",
    url: "https://vestream.io/unlocks",
    siteName: "Vestream",
    type: "website",
  },
};

export default async function UnlocksIndexPage() {
  const protocols = listProtocols();

  // Fetch stats for all protocols in parallel. Each fetch is independent and
  // wrapped so one failure doesn't sink the whole page.
  const statsByslug = await Promise.all(
    protocols.map(async (p) => {
      try {
        return [p.slug, await getProtocolStats(p.adapterIds)] as const;
      } catch (err) {
        console.error(`[unlocks] stats failed for ${p.slug}:`, err);
        return [p.slug, null as ProtocolStats | null] as const;
      }
    }),
  );
  const statsMap = new Map(statsByslug);

  const grandTotal = Array.from(statsMap.values())
    .filter((s): s is ProtocolStats => !!s)
    .reduce((sum, s) => sum + s.totalStreams, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Token unlock trackers",
    url: "https://vestream.io/unlocks",
    hasPart: protocols.map((p) => ({
      "@type": "WebPage",
      name: `${p.name} unlock tracker`,
      url: `https://vestream.io/unlocks/${p.slug}`,
    })),
  };

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#f8fafc", color: "#0f172a" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav theme="light" />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-14 md:pt-36 md:pb-20 px-4 md:px-8 text-center">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.08) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(37,99,235,0.3), transparent)",
          }}
        />

        <div className="relative max-w-4xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{
              background: "rgba(37,99,235,0.06)",
              borderColor: "rgba(37,99,235,0.2)",
              color: "#2563eb",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#2563eb" }} />
            Live · {protocols.length} protocols · {grandTotal.toLocaleString()} streams indexed
          </div>

          <h1
            className="font-bold tracking-tight mb-6"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "#0f172a",
            }}
          >
            Every major token unlock,<br />
            <span
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              in one live index
            </span>
          </h1>

          <p
            className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-10"
            style={{ color: "#64748b" }}
          >
            Vestream tracks every vesting schedule on Sablier, Hedgey, Superfluid, UNCX, Team Finance,
            Unvest and PinkSale — across Ethereum, Base, BSC and Polygon. Pick a protocol below to see
            live activity.
          </p>

          <div className="flex items-center justify-center gap-3 md:gap-4 flex-wrap">
            <Link
              href="/early-access"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: "white",
                boxShadow: "0 4px 20px rgba(37,99,235,0.25)",
              }}
            >
              Track your wallet →
            </Link>
            <Link
              href="/developer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:bg-slate-50"
              style={{
                background: "white",
                border: "1px solid rgba(0,0,0,0.1)",
                color: "#0f172a",
              }}
            >
              View the API →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Protocol grid ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 md:pb-28 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {protocols.map((p) => {
            const s = statsMap.get(p.slug);
            return <ProtocolCard key={p.slug} protocol={p} stats={s ?? null} />;
          })}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-24 max-w-5xl mx-auto">
        <div
          className="rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1a1040 0%, #0f1525 100%)",
            border: "1px solid rgba(124,58,237,0.25)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(124,58,237,0.18) 0%, transparent 70%)",
            }}
          />
          <div className="relative">
            <h2
              className="text-2xl md:text-3xl font-bold mb-4"
              style={{ letterSpacing: "-0.02em", color: "white" }}
            >
              Ready to get alerted on your unlocks?
            </h2>
            <p
              className="text-sm md:text-base mb-8 max-w-xl mx-auto"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Track your wallet across all 7 protocols. Get an email and push notification
              the moment any of your tokens unlock — no matter the chain or schedule.
            </p>
            <Link
              href="/early-access"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #2563eb)",
                color: "white",
                boxShadow: "0 4px 24px rgba(124,58,237,0.4)",
              }}
            >
              Get early access →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-4 md:px-8 py-8 max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4"
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
      >
        <p className="text-xs" style={{ color: "#94a3b8" }}>
          © {new Date().getFullYear()} Vestream. All rights reserved.
        </p>
        <div className="flex items-center gap-6 flex-wrap">
          <Link
            href="/"
            className="text-xs hover:opacity-80 transition-opacity"
            style={{ color: "#64748b" }}
          >
            Home
          </Link>
          <Link
            href="/developer"
            className="text-xs hover:opacity-80 transition-opacity"
            style={{ color: "#64748b" }}
          >
            Developer API
          </Link>
          <Link
            href="/ai"
            className="text-xs hover:opacity-80 transition-opacity"
            style={{ color: "#64748b" }}
          >
            AI Agents
          </Link>
          <Link
            href="/privacy"
            className="text-xs hover:opacity-80 transition-opacity"
            style={{ color: "#64748b" }}
          >
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function ProtocolCard({ protocol, stats }: { protocol: ProtocolMeta; stats: ProtocolStats | null }) {
  const liveLabel = stats?.lastIndexedAt
    ? `Indexed ${relativeTimeSince(stats.lastIndexedAt)}`
    : `${protocol.chainIds.length} chains`;

  // Protocol-colour hover accent — we intensify the tint on hover by upgrading
  // the rgba 0.08 base into a 0.14 halo, purely via CSS.
  const accentHalo = protocol.bg.replace("0.08", "0.18");

  return (
    <Link
      href={`/unlocks/${protocol.slug}`}
      className="rounded-2xl p-5 relative overflow-hidden transition-all hover:-translate-y-0.5"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
      }}
    >
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${accentHalo} 0%, transparent 65%)`,
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold"
            style={{
              background: protocol.bg,
              border: `1px solid ${protocol.border}`,
              color: protocol.color,
            }}
          >
            {protocol.name.charAt(0)}
          </div>
          <span
            className="text-[10px] font-semibold tracking-wider uppercase"
            style={{ color: protocol.color }}
          >
            {liveLabel}
          </span>
        </div>

        <h3 className="text-base font-bold mb-1" style={{ color: "#0f172a" }}>
          {protocol.name}
        </h3>
        <p className="text-xs leading-relaxed mb-4" style={{ color: "#64748b" }}>
          {protocol.tagline}
        </p>

        <div
          className="flex items-center gap-4 text-xs pt-3"
          style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}
        >
          <div>
            <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
              {stats ? stats.totalStreams.toLocaleString() : "—"}
            </div>
            <div style={{ color: "#94a3b8" }}>streams</div>
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
              {stats ? stats.activeStreams.toLocaleString() : "—"}
            </div>
            <div style={{ color: "#94a3b8" }}>active</div>
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
              {protocol.chainIds.length}
            </div>
            <div style={{ color: "#94a3b8" }}>chains</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
