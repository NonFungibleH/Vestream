// /unlocks – index page for all date-windowed unlock landing pages.
//
// Why this exists: Google ranks date-stamped, time-sensitive pages well, but
// only when there's a clear hub linking them. This index serves as the parent
// for all /unlocks/[range] pages, surfacing each window's live count so the
// page itself isn't thin.

import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ALL_WINDOW_SLUGS, WINDOWS, getUnlocksInWindow, EMPTY_WINDOW_RESULT } from "@/lib/vesting/unlock-windows";
import { withTimeout } from "@/lib/with-timeout";

// Render on-demand at request time – NOT statically prerendered.
// Static prerendering baked "–" into every window count (the DB is unreachable
// during `next build`, so getUnlocksInWindow returns empty), and the 15-min ISR
// fill was unreliable + reset by every deploy – the index intermittently showed
// dashes (looked like "empty on mobile"). The counts stay wrapped in
// unstable_cache (15-min) below so a request reads cached numbers, not 8 live
// window scans. Mirrors the /protocols/[slug]/unlocks fix.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title:       "Token Unlock Calendar – All Upcoming Vesting Events | Vestream",
  description: "Live calendar of upcoming token unlocks across 10 vesting protocols and 7 chains. View by today, this week, this month, or rolling 30/60/90-day windows.",
  alternates:  { canonical: "https://www.vestream.io/unlocks" },
  openGraph: {
    title:       "Token Unlock Calendar – Vestream",
    description: "Live calendar of upcoming token unlocks across 10 vesting protocols and 7 chains.",
    url:         "https://www.vestream.io/unlocks",
    siteName:    "Vestream",
    type:        "website",
  },
};

// Wrapped in unstable_cache (15-min) so the force-dynamic page reads cached
// counts instead of firing 8 window scans on every request. Returns a plain
// array (unstable_cache JSON-serialises – a Map wouldn't round-trip); the page
// rebuilds the Map. THROW during the build phase so the empty result is never
// cached (unstable_cache doesn't cache throws) – the first runtime request
// fills real data.
const getCachedWindowCounts = unstable_cache(
  async () => {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      throw new Error("build-phase: skipping unlock-window counts – ISR fills at runtime");
    }
    // Run all window queries in parallel. Cap the SQL pool at 500/window so 8
    // concurrent scans stay cheap; counts beyond 500 read as "500+". withTimeout
    // so a stalled window degrades to "–" instead of hanging the page → 524.
    return Promise.all(
      ALL_WINDOW_SLUGS.map(async (slug) => {
        const def   = WINDOWS[slug];
        const range = def.range();
        const result = await withTimeout(
          getUnlocksInWindow(range.startSec, range.endSec, 500),
          8_000,
          EMPTY_WINDOW_RESULT,
          `unlocks-index:${slug}`,
        );
        return {
          slug,
          unlockCount: result.stats.unlockCount,
          tokenCount:  result.stats.tokenCount,
          chainCount:  result.stats.chainCount,
        };
      }),
    );
  },
  ["unlocks-index-window-counts-v1"],
  { revalidate: 900, tags: ["upcoming-unlocks"] },
);

async function getWindowCounts() {
  try {
    const counts = await getCachedWindowCounts();
    return new Map(counts.map((c) => [c.slug, c]));
  } catch {
    // Build-phase throw (or a DB blip) – render the empty state; ISR fills it
    // on the first real request.
    return new Map<string, { slug: string; unlockCount: number; tokenCount: number; chainCount: number }>();
  }
}

export default async function UnlocksIndex() {
  const counts = await getWindowCounts();

  const indexJsonLd = {
    "@context": "https://schema.org",
    "@type":    "CollectionPage",
    name:       "Token Unlock Calendar",
    url:        "https://www.vestream.io/unlocks",
    description: "Live calendar of upcoming token unlocks across vesting protocols and chains.",
    hasPart: ALL_WINDOW_SLUGS.map((slug) => ({
      "@type": "WebPage",
      name:    WINDOWS[slug].label,
      url:     `https://www.vestream.io/unlocks/${slug}`,
    })),
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(indexJsonLd) }}
      />

      <SiteNav theme="light" />

      {/* ── Hero (breadcrumb integrated, no separate bordered bar) ─────── */}
      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-12 md:pb-16 max-w-5xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li><Link href="/" className="hover:underline" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Unlocks</li>
          </ol>
        </nav>
        <div className="text-center mb-6">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>
            Live Unlock Calendar
          </p>
          <h1 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
            Every upcoming token unlock,<br />
            <span style={{ color: "#1CB8B8" }}>indexed live.</span>
          </h1>
          <p className="text-base md:text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: "#475569" }}>
            View upcoming unlocks across 10 vesting protocols and 7 chains. Pick a window – today, this week, this month, or rolling 30/60/90-day – to see exactly what unlocks when.
          </p>
        </div>
      </section>

      {/* ── Window cards ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 md:pb-28 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ALL_WINDOW_SLUGS.map((slug) => {
            const def = WINDOWS[slug];
            const c   = counts.get(slug);
            const hasData = c && c.unlockCount > 0;
            return (
              <Link
                key={slug}
                href={`/unlocks/${slug}`}
                className="rounded-2xl p-5 transition-all hover:-translate-y-0.5"
                style={{
                  background: "white",
                  border:     "1px solid rgba(21,23,26,0.10)",
                  boxShadow:  "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
                }}
              >
                <h2 className="text-base font-bold mb-1" style={{ color: "#1A1D20" }}>
                  {def.dynamicLabel?.() ?? def.label}
                </h2>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "#8B8E92" }}>
                  {def.dynamicDescription?.() ?? def.description}
                </p>
                <div className="flex items-baseline gap-3 pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  <div>
                    <div className="font-semibold text-lg tabular-nums" style={{ color: hasData ? "#0F8A8A" : "#B8BABD" }}>
                      {hasData ? c.unlockCount : "–"}
                    </div>
                    <div className="text-[10px]" style={{ color: "#B8BABD" }}>
                      unlock{c?.unlockCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  {hasData && (
                    <>
                      <div>
                        <div className="font-semibold text-sm tabular-nums" style={{ color: "#1A1D20" }}>{c.tokenCount}</div>
                        <div className="text-[10px]" style={{ color: "#B8BABD" }}>token{c.tokenCount === 1 ? "" : "s"}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-sm tabular-nums" style={{ color: "#1A1D20" }}>{c.chainCount}</div>
                        <div className="text-[10px]" style={{ color: "#B8BABD" }}>chain{c.chainCount === 1 ? "" : "s"}</div>
                      </div>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
