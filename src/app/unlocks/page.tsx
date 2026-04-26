// /unlocks — index page for all date-windowed unlock landing pages.
//
// Why this exists: Google ranks date-stamped, time-sensitive pages well, but
// only when there's a clear hub linking them. This index serves as the parent
// for all /unlocks/[range] pages, surfacing each window's live count so the
// page itself isn't thin.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ALL_WINDOW_SLUGS, WINDOWS, getUnlocksInWindow } from "@/lib/vesting/unlock-windows";

// Re-render at most every 15 min — counts on the index don't need
// per-second freshness; the per-window pages have their own ISR.
export const revalidate = 900;

export const metadata: Metadata = {
  title:       "Token Unlock Calendar — All Upcoming Vesting Events | Vestream",
  description: "Live calendar of upcoming token unlocks across 9 vesting protocols and 5 chains. View by today, this week, this month, or rolling 30/60/90-day windows.",
  alternates:  { canonical: "https://vestream.io/unlocks" },
  openGraph: {
    title:       "Token Unlock Calendar — Vestream",
    description: "Live calendar of upcoming token unlocks across 9 vesting protocols and 5 chains.",
    url:         "https://vestream.io/unlocks",
    siteName:    "Vestream",
    type:        "website",
  },
};

async function getWindowCounts() {
  // Run all window queries in parallel. Each is bounded by its own date
  // range so the DB load stays manageable; `getUnlocksInWindow` itself
  // caps the SQL pool at 500 rows per window. Fail-soft per-window: at
  // build time CI has no DB access, all queries return -1 → page renders
  // with "—" everywhere; ISR fills real numbers on first runtime hit.
  const counts = await Promise.all(
    ALL_WINDOW_SLUGS.map(async (slug) => {
      const def   = WINDOWS[slug];
      const range = def.range();
      try {
        const result = await getUnlocksInWindow(range.startSec, range.endSec);
        return {
          slug,
          unlockCount: result.stats.unlockCount,
          tokenCount:  result.stats.tokenCount,
          chainCount:  result.stats.chainCount,
        };
      } catch {
        return { slug, unlockCount: -1, tokenCount: -1, chainCount: -1 };
      }
    }),
  );
  return new Map(counts.map((c) => [c.slug, c]));
}

export default async function UnlocksIndex() {
  const counts = await getWindowCounts();

  const indexJsonLd = {
    "@context": "https://schema.org",
    "@type":    "CollectionPage",
    name:       "Token Unlock Calendar",
    url:        "https://vestream.io/unlocks",
    description: "Live calendar of upcoming token unlocks across vesting protocols and chains.",
    hasPart: ALL_WINDOW_SLUGS.map((slug) => ({
      "@type": "WebPage",
      name:    WINDOWS[slug].label,
      url:     `https://vestream.io/unlocks/${slug}`,
    })),
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(indexJsonLd) }}
      />

      <SiteNav theme="light" />

      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      <div
        className="w-full pt-16 md:pt-20"
        style={{ borderBottom: "1px solid rgba(21,23,26,0.06)" }}
      >
        <nav aria-label="Breadcrumb" className="px-4 md:px-8 py-3 max-w-5xl mx-auto w-full">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li><Link href="/" className="hover:underline transition-colors" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Unlocks</li>
          </ol>
        </nav>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pt-8 md:pt-12 pb-12 md:pb-16 max-w-5xl mx-auto w-full">
        <div className="text-center mb-6">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>
            Live Unlock Calendar
          </p>
          <h1 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
            Every upcoming token unlock,<br />
            <span style={{ color: "#1CB8B8" }}>indexed live.</span>
          </h1>
          <p className="text-base md:text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: "#475569" }}>
            View upcoming unlocks across 9 vesting protocols and 5 chains. Pick a window — today, this week, this month, or rolling 30/60/90-day — to see exactly what unlocks when.
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
                  {def.label}
                </h2>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "#8B8E92" }}>
                  {def.description}
                </p>
                <div className="flex items-baseline gap-3 pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  <div>
                    <div className="font-semibold text-lg tabular-nums" style={{ color: hasData ? "#0F8A8A" : "#B8BABD" }}>
                      {hasData ? c.unlockCount : "—"}
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
