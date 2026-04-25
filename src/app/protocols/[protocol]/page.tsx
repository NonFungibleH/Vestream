// src/app/protocols/[protocol]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Per-protocol SEO landing page.
//
// Theme: B2C light (matches the homepage `/` — #F5F5F3 page, white cards).
// Brand nod: each page is dominated by the protocol's own accent colour —
// the primary CTA, hero gradient, live-dot, stat highlights and unlock card
// borders all take their cue from PROTOCOLS[slug].color. Vestream stays the
// container; the protocol gets the visual attention.
//
// Rendering: ISR with revalidate=60. Stats + latest/upcoming unlock are
// re-fetched from vestingStreamsCache every minute so crawlers + LLMs see
// genuinely fresh content. dynamicParams=false locks routes to the curated 7.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import {
  getProtocol,
  listProtocols,
  PROTOCOL_SLUGS,
  type ProtocolMeta,
} from "@/lib/protocol-constants";
import {
  chainLabel,
  formatAmountCompact,
  getLatestUnlock,
  getNextUpcomingUnlock,
  getProtocolStats,
  getUpcomingUnlocksForProtocol,
  relativeFreshness,
  relativeTimeSince,
  relativeTimeUntil,
  toDateSafe,
  truncateAddress,
  type ProtocolStats,
  type UnlockSummary,
} from "@/lib/vesting/protocol-stats";

// Render on-demand instead of pre-rendering all 7 protocol pages at build
// time. The previous ISR setup (revalidate = 60 + dynamicParams = false)
// forced `next build` to query Postgres for every protocol during the
// static-export phase. That worked on Vercel with a warm cache, but broke
// on every cold build — Vercel's first build after a cache wipe AND GitHub
// Actions CI (which has no DB at all). Postgres-js hangs for 60s retrying
// ECONNREFUSED even with connect_timeout:10 set, and Next's build worker
// gives up after 3 attempts of 60s each = 3-minute build timeout per page.
//
// force-dynamic renders each page on request, where the runtime env DOES
// have DATABASE_URL + subgraph keys. First-request latency lands ~200ms on
// a warm lambda. Edge cache (Cache-Control: s-maxage=60) still caches the
// rendered HTML, so subsequent visitors in the same minute pay zero cost
// just like ISR did. Net: same user experience, builds that actually succeed.
export const dynamic = "force-dynamic";
export const dynamicParams = false;

// Per-slug data load wrapped in Vercel Data Cache. 5-min TTL — same as
// /protocols index. Without this, EVERY visit triggered live subgraph
// round-trips via getGlobalStats(aid) per adapter (UNCX = 2 adapters,
// each ~5-10s on cold lambdas). User-facing symptom: clicking a protocol
// card on /protocols felt like the browser hung — page just sat there
// for 10-20s before rendering.
//
// getGlobalStats has been DROPPED entirely (same as the /protocols index
// rewrite) — the cache count from getProtocolStats is the canonical
// source. Subgraph live counts were redundant + slow.
const CACHE_TTL_SECONDS = 300;

interface ProtocolPageData {
  stats:        ProtocolStats | null;
  latest:       UnlockSummary | null;
  upcoming:     UnlockSummary | null;
  upcomingList: UnlockSummary[];
}

const loadProtocolData = unstable_cache(
  async (adapterIds: readonly string[]): Promise<ProtocolPageData> => {
    try {
      const [stats, latest, upcoming, upcomingList] = await Promise.all([
        getProtocolStats(adapterIds),
        getLatestUnlock(adapterIds),
        getNextUpcomingUnlock(adapterIds),
        getUpcomingUnlocksForProtocol(adapterIds, 6),
      ]);
      return { stats, latest, upcoming, upcomingList };
    } catch (err) {
      console.error(`[protocol-page] data fetch failed for ${adapterIds.join(",")}:`, err);
      return { stats: null, latest: null, upcoming: null, upcomingList: [] };
    }
  },
  ["protocol-page-data-v1"],
  { revalidate: CACHE_TTL_SECONDS, tags: ["protocol-page"] },
);

export async function generateStaticParams() {
  return PROTOCOL_SLUGS.map((slug) => ({ protocol: slug }));
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ protocol: string }> },
): Promise<Metadata> {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta) return { title: "Not found" };

  const title = `${meta.name} unlock tracker & alerts — Vestream`;
  const description = meta.description.slice(0, 158).replace(/\s+\S*$/, "") + "…";
  const keywords = meta.searchKeywords;
  const url = `https://vestream.io/protocols/${meta.slug}`;

  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Vestream",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ProtocolLandingPage(
  { params }: { params: Promise<{ protocol: string }> },
) {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta) notFound();

  // Single-cached fetch for the page's data — see CACHE_TTL_SECONDS comment.
  const { stats, latest, upcoming, upcomingList } = await loadProtocolData(meta.adapterIds);

  // Stream counts now come from cache only (getGlobalStats was dropped —
  // see the loadProtocolData comment for the why).
  const effectiveTotal  = stats?.totalStreams  ?? 0;
  const effectiveActive = stats?.activeStreams ?? 0;
  const hasData = effectiveTotal > 0;
  const related = meta.relatedSlugs
    .map((s) => getProtocol(s))
    .filter((p): p is ProtocolMeta => !!p);

  // Stronger tints derived from the base accent — used for hero wash and CTA shadow.
  const accentWash = meta.bg.replace("0.08", "0.12");
  const accentHalo = meta.bg.replace("0.08", "0.22");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `https://vestream.io/protocols/${meta.slug}`,
        name: `${meta.name} unlock tracker & alerts`,
        description: meta.description,
        url: `https://vestream.io/protocols/${meta.slug}`,
        isPartOf: { "@id": "https://vestream.io/#website" },
        dateModified: (toDateSafe(stats?.lastIndexedAt ?? null) ?? new Date()).toISOString(),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://vestream.io/" },
          { "@type": "ListItem", position: 2, name: "Protocols", item: "https://vestream.io/protocols" },
          { "@type": "ListItem", position: 3, name: meta.name, item: `https://vestream.io/protocols/${meta.slug}` },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav theme="light" />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-14 md:pt-36 md:pb-20 px-4 md:px-8 text-center">
        {/* Protocol-coloured wash behind the hero */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${accentHalo} 0%, transparent 70%)`,
        }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{
          background: `linear-gradient(90deg, transparent, ${meta.color}80, transparent)`,
        }} />

        <div className="relative max-w-4xl mx-auto">
          {/* Live indicator in the protocol's colour */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: meta.color }}
            />
            {stats?.lastIndexedAt
              ? `Live · indexed ${relativeFreshness(stats.lastIndexedAt)}`
              : `Live · indexing ${meta.chainIds.length} chains`}
          </div>

          {/* Protocol logo tile */}
          <div className="flex items-center justify-center mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold"
              style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color, boxShadow: `0 6px 20px ${accentWash}` }}
            >
              {meta.name.charAt(0)}
            </div>
          </div>

          <h1
            className="font-bold tracking-tight mb-4"
            style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)", lineHeight: 1.08, letterSpacing: "-0.03em", color: "#1A1D20" }}
          >
            {meta.name} unlock<br />
            <span style={{ color: "#1CB8B8" }}>tracker & alerts</span>
          </h1>

          <p className="text-base md:text-lg mb-3" style={{ color: "#334155" }}>
            {meta.tagline}
          </p>

          <p className="text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-10" style={{ color: "#8B8E92" }}>
            {meta.description}
          </p>

          <div className="flex items-center justify-center gap-3 md:gap-4 flex-wrap">
            {/* Primary CTA uses the protocol's brand colour — strongest brand nod */}
            <Link
              href="/early-access"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
              style={{ background: meta.color, color: "white", boxShadow: `0 6px 20px ${meta.color}55` }}
            >
              Track your {meta.name} wallet →
            </Link>
            <Link
              href="/protocols"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ background: "white", border: `1px solid ${meta.border}`, color: "#1A1D20" }}
            >
              See all trackers →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Live stat strip ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-20 max-w-5xl mx-auto">
        <div
          className="rounded-2xl px-6 py-5 md:px-8 md:py-6 grid grid-cols-2 md:grid-cols-5 gap-5 md:gap-2"
          style={{ background: "white", border: `1px solid ${meta.border}`, boxShadow: `0 2px 10px ${accentWash}` }}
        >
          <Stat
            label="Streams indexed"
            value={hasData ? effectiveTotal.toLocaleString() : "—"}
            color={meta.color}
          />
          <Stat
            label="Active now"
            value={hasData ? effectiveActive.toLocaleString() : "—"}
            color={meta.color}
          />
          <Stat
            label="Chains covered"
            value={meta.chainIds.length.toString()}
            color={meta.color}
          />
          <Stat
            label="Tokens tracked"
            value={hasData ? stats!.tokensTracked.toLocaleString() : "—"}
            color={meta.color}
          />
          <Stat
            label="Last indexed"
            value={stats?.lastIndexedAt ? relativeFreshness(stats.lastIndexedAt) : "—"}
            color={meta.color}
          />
        </div>
      </section>

      {/* ── Latest + upcoming unlock row ─────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: meta.color }}>
            Live activity
          </p>
          <h2 className="text-3xl font-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            What&apos;s happening on {meta.name} right now
          </h2>
          <p className="text-sm max-w-xl mx-auto" style={{ color: "#8B8E92" }}>
            Pulled from Vestream&apos;s index — updated every minute so you see what crawlers see.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <UnlockCard
            variant="latest"
            unlock={latest}
            accent={meta.color}
            bg={meta.bg}
            border={meta.border}
            protocolName={meta.name}
          />
          <UnlockCard
            variant="upcoming"
            unlock={upcoming}
            accent={meta.color}
            bg={meta.bg}
            border={meta.border}
            protocolName={meta.name}
          />
        </div>

        {/* ── Upcoming queue (top 6) ─────────────────────────────────────── */}
        {upcomingList.length > 1 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: meta.color }}>
                Upcoming queue
              </p>
              <p className="text-xs" style={{ color: "#B8BABD" }}>
                next {upcomingList.length} scheduled releases
              </p>
            </div>
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "white", border: `1px solid ${meta.border}` }}
            >
              <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
                {upcomingList.map((u) => (
                  <UpcomingRow key={u.streamId} u={u} accent={meta.color} />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Use cases ────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>
            Why Vestream
          </p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Purpose-built for {meta.name} recipients
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {meta.useCases.map((uc) => (
            <div
              key={uc.title}
              className="rounded-2xl p-5"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 text-sm font-bold"
                style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
              >
                ✓
              </div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "#1A1D20" }}>{uc.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>
                {uc.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>
            From recipients
          </p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            What {meta.name} users say
          </h2>
        </div>

        {meta.testimonials.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {meta.testimonials.map((t, i) => (
              <div
                key={`${meta.slug}-testimonial-${i}`}
                className="rounded-2xl p-6"
                style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill={meta.color} className="mb-4" aria-hidden="true">
                  <path d="M7.17 3C4.31 3 2 5.31 2 8.17v5.68C2 16.71 4.31 19 7.17 19h.34c.55 0 1 .45 1 1 0 .55-.45 1-1 1H5.5c-.55 0-1 .45-1 1s.45 1 1 1h4.17c1.38 0 2.5-1.12 2.5-2.5v-8.33C12.17 6.31 9.86 3 7 3h.17zm10 0c-2.86 0-5.17 2.31-5.17 5.17v5.68c0 2.86 2.31 5.15 5.17 5.15h.34c.55 0 1 .45 1 1 0 .55-.45 1-1 1H15.5c-.55 0-1 .45-1 1s.45 1 1 1h4.17c1.38 0 2.5-1.12 2.5-2.5v-8.33C22.17 6.31 19.86 3 17 3h.17z"/>
                </svg>
                <p className="text-sm leading-relaxed mb-4" style={{ color: "#334155" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-xs" style={{ color: "#B8BABD" }}>
                  <span className="font-semibold" style={{ color: "#1A1D20" }}>{t.author}</span>
                  {t.role ? ` · ${t.role}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: "white", border: `1px dashed ${meta.border}` }}
          >
            <p className="text-sm mb-4" style={{ color: "#475569" }}>
              We&apos;re collecting testimonials from {meta.name} recipients using Vestream for unlock alerts.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: meta.color }}
            >
              Share your story →
            </Link>
          </div>
        )}
      </section>

      {/* ── Related protocols ────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>
            More trackers
          </p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Other protocols we index
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {related.map((r) => (
            <Link
              key={r.slug}
              href={`/protocols/${r.slug}`}
              className="rounded-2xl p-5 transition-all hover:opacity-90"
              style={{ background: "white", border: `1px solid ${r.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 text-sm font-bold"
                style={{ background: r.bg, border: `1px solid ${r.border}`, color: r.color }}
              >
                {r.name.charAt(0)}
              </div>
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: "#1A1D20" }}>{r.name}</h3>
              <p className="text-xs leading-relaxed mb-3" style={{ color: "#8B8E92" }}>
                {r.tagline}
              </p>
              <span className="text-xs font-semibold" style={{ color: r.color }}>
                View tracker →
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/protocols"
            className="text-sm font-semibold"
            style={{ color: "#8B8E92" }}
          >
            Browse all {listProtocols().length} protocol trackers →
          </Link>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-24 max-w-5xl mx-auto">
        <div
          className="rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, white 0%, ${meta.bg} 100%)`, border: `1px solid ${meta.border}`, boxShadow: `0 8px 40px ${accentWash}` }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${accentHalo} 0%, transparent 70%)`,
          }} />
          <div className="relative">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest mb-4"
              style={{ background: "white", border: `1px solid ${meta.border}`, color: meta.color }}
            >
              📱 Mobile alerts for {meta.name}
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
              Never miss another {meta.name} unlock
            </h2>
            <p className="text-sm md:text-base mb-8 max-w-xl mx-auto" style={{ color: "#475569" }}>
              Add your wallet to Vestream and get a push notification the moment any {meta.name} tranche becomes claimable — across every chain you hold on. No checking dashboards. No missed deadlines.
            </p>
            <div className="flex items-center justify-center gap-3 md:gap-4 flex-wrap">
              <Link
                href="/early-access"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: meta.color, color: "white", boxShadow: `0 4px 20px ${meta.color}55` }}
              >
                Get the app →
              </Link>
              <Link
                href="/find-vestings"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:bg-slate-50"
                style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", color: "#1A1D20" }}
              >
                Scan a wallet now →
              </Link>
            </div>
            <p className="text-xs mt-6 max-w-lg mx-auto" style={{ color: "#B8BABD" }}>
              Claims still happen on the audited {meta.name} contract — Vestream never touches your tokens. We&apos;re the alert layer above it.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}

// ─── Small sub-components ────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center md:text-left">
      <div className="font-bold text-xl md:text-2xl tracking-tight" style={{ letterSpacing: "-0.02em", color }}>
        {value}
      </div>
      <div className="text-[11px] md:text-xs mt-0.5" style={{ color: "#B8BABD" }}>
        {label}
      </div>
    </div>
  );
}

function UpcomingRow({ u, accent }: { u: UnlockSummary; accent: string }) {
  const amount = formatAmountCompact(u.amount, u.tokenSymbol, u.tokenDecimals);
  const ttl    = u.endTime ? relativeTimeUntil(u.endTime) : "—";
  // Only link when we know a chain+address — otherwise fall back to a plain row.
  const canLink = !!u.tokenAddress && /^0x[0-9a-f]{40}$/i.test(u.tokenAddress);
  const inner = (
    <div className="px-4 md:px-5 py-2.5 flex items-center gap-3 transition-colors hover:bg-slate-50/60">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate" style={{ color: "#1A1D20" }}>
            {amount}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
            style={{ background: "rgba(0,0,0,0.04)", color: "#8B8E92" }}
          >
            {chainLabel(u.chainId)}
          </span>
          {canLink && (
            <span className="text-[10px] font-semibold" style={{ color: accent, opacity: 0.7 }}>
              view token →
            </span>
          )}
        </div>
        <div className="text-[10.5px] font-mono truncate" style={{ color: "#B8BABD" }}>
          for {truncateAddress(u.recipient)}
        </div>
      </div>
      <div className="flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums"
        style={{ background: `${accent}15`, color: accent }}>
        {ttl}
      </div>
    </div>
  );
  return canLink ? (
    <Link href={`/token/${u.chainId}/${u.tokenAddress}`} className="block">
      {inner}
    </Link>
  ) : inner;
}

function UnlockCard({
  variant,
  unlock,
  accent,
  bg,
  border,
  protocolName,
}: {
  variant: "latest" | "upcoming";
  unlock: UnlockSummary | null;
  accent: string;
  bg: string;
  border: string;
  protocolName: string;
}) {
  const title = variant === "latest" ? "Most recent unlock" : "Next scheduled unlock";
  const emptyTitle = variant === "latest"
    ? `No recent ${protocolName} unlocks indexed yet`
    : `No upcoming ${protocolName} unlocks indexed yet`;
  const emptyBody = variant === "latest"
    ? `As soon as a tracked wallet has its first ${protocolName} stream complete, it'll appear here — live, on every visit.`
    : `Add your ${protocolName} wallet and we'll start tracking upcoming releases here.`;

  if (!unlock) {
    return (
      <div
        className="rounded-2xl p-6"
        style={{ background: "white", border: `1px dashed ${border}` }}
      >
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: accent }}>
          {title}
        </p>
        <h3 className="text-base font-semibold mb-2" style={{ color: "#1A1D20" }}>{emptyTitle}</h3>
        <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>
          {emptyBody}
        </p>
      </div>
    );
  }

  const relative = variant === "latest"
    ? (unlock.endTime ? relativeTimeSince(new Date(unlock.endTime * 1000)) : "—")
    : relativeTimeUntil(unlock.endTime);

  // UnlockSummary now carries tokenDecimals — pulled from the cached JSONB
  // blob. Previously this was hardcoded to 18, which rendered USDC/USDT
  // (6-decimal stablecoins) as "0.0000 USDC" on the Upcoming Unlocks panel.
  const amountDisplay = formatAmountCompact(unlock.amount, unlock.tokenSymbol, unlock.tokenDecimals);

  return (
    <div
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{ background: "white", border: `1px solid ${border}`, boxShadow: `0 2px 12px ${bg.replace("0.08", "0.15")}` }}
    >
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${bg.replace("0.08", "0.22")} 0%, transparent 65%)` }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: accent }}>
            {title}
          </p>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
            style={{ background: bg, color: accent, border: `1px solid ${border}` }}>
            {chainLabel(unlock.chainId)}
          </span>
        </div>
        <p className="text-2xl font-bold mb-1" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
          {amountDisplay}
        </p>
        <p className="text-xs" style={{ color: "#8B8E92" }}>
          for <code style={{ fontFamily: "monospace", color: "#334155" }}>{truncateAddress(unlock.recipient)}</code> · {relative}
        </p>
      </div>
    </div>
  );
}
