// /protocols/[slug]/unlocks – protocol-specific unlock calendar.
//
// Sits one level beneath the protocol detail page (/protocols/[slug]) and
// targets the long-tail commercial-intent queries:
//   "Sablier upcoming unlocks", "Hedgey unlock calendar",
//   "UNCX next unlock"
//
// We already rank for "[Protocol] vesting" via the parent page; this child
// page captures the unlocks-specific intent which is a distinct query class
// with its own search volume.
//
// Rendering (2026-06-12): on-demand ISR, 1h revalidation. This page used
// to read the chain filter from `searchParams` – a request-time API that
// silently made the route fully dynamic (the old `revalidate = 3600` was
// dead code), so the 2000-row unlock query ran live on EVERY request
// (9.8s TTFB measured in prod) with `no-store` headers – a direct feeder
// of the Cloudflare QUIC-kill timeouts. Chain filters are now path
// segments handled by ./[chain]/page.tsx; this base page renders the
// unfiltered calendar and never touches a request-time API. Legacy
// ?chain= URLs 308-redirect to the path form in src/middleware.ts.
//
// All rendering lives in ./view.tsx, shared with the [chain] variants.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProtocol } from "@/lib/protocol-constants";
import { ProtocolUnlocksView, getCachedProtocolUnlocks } from "./view";

// Render on-demand at request time – NOT statically prerendered.
//
// Why (2026-06-30): this page WAS ISR (revalidate + generateStaticParams).
// But the DB is unreachable during `next build` (build-phase guard), so the
// build baked the EMPTY state into the static HTML for every protocol – and
// since these are low-traffic deep-link pages, the on-demand ISR revalidation
// that was meant to fill them rarely fired, and every new deploy re-baked
// empty. Result: all protocol unlock calendars showed "No upcoming unlocks
// indexed" despite the cache being full.
//
// force-dynamic removes the build-time bake entirely: every request renders at
// runtime, where the query works. It's NOT a return to the old 9.8s-TTFB
// problem – the 2000-row query is wrapped in `getCachedProtocolUnlocks`
// (unstable_cache, 1h, stale-while-revalidate), so requests serve cached data
// (~50ms) and only a cache miss pays the query. Data cache is independent of
// the route's render mode.
export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ protocol: string }>;
}

// ── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta || meta.disabled) return { title: "Not found" };

  const url = `https://www.vestream.io/protocols/${meta.slug}/unlocks`;

  // Live count for the description so SERPs show fresh numbers. Shares the
  // Data Cache entry with the page body's query (same unstable_cache key),
  // so this costs nothing extra per revalidation.
  let countLine = "";
  try {
    const result = await getCachedProtocolUnlocks(meta.slug, meta.adapterIds, null);
    if (result.stats.unlockCount > 0) {
      countLine = `${result.stats.unlockCount} upcoming unlocks across ${result.stats.tokenCount} tokens. `;
    }
  } catch { /* fall through */ }

  const title = `${meta.name} Unlock Calendar – Upcoming Token Unlocks | Vestream`;
  const desc  = `${countLine}Live ${meta.name} unlock calendar – every upcoming token unlock with per-token amounts, dates, and recipient counts.`.slice(0, 160);

  return {
    title,
    description: desc,
    keywords:    [
      `${meta.name} unlock calendar`,
      `${meta.name} upcoming unlocks`,
      `${meta.name} vesting schedule`,
      `${meta.name} token unlocks`,
      "vesting calendar",
      "token unlock tracker",
    ].join(", "),
    alternates:  { canonical: url },
    openGraph: {
      title,
      description: `Live calendar of every upcoming ${meta.name} token unlock.`,
      url,
      siteName:    "Vestream",
      type:        "website",
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description: `Live calendar of every upcoming ${meta.name} token unlock.`,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function ProtocolUnlocksPage({ params }: PageParams) {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta || meta.disabled) notFound();

  return <ProtocolUnlocksView meta={meta} filterChainId={null} />;
}
