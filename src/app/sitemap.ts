// src/app/sitemap.ts
// ─────────────────────────────────────────────────────────────────────────────
// CORE sitemap — the high-value, human-authored surface: marketing pages,
// protocol pages, per-protocol unlock calendars, articles, and the unlock
// ranking/window pages. Served at /sitemap.xml.
//
// The high-volume programmatic /token/{chainId}/{address} pages live in a
// SEPARATE sitemap (app/sitemap-tokens.xml/route.ts, served at
// /sitemap-tokens.xml). Splitting them (Aug 2026) concentrates crawl budget on
// this core set and lets GSC report indexing rates per section — the ~190 core
// URLs were previously drowned out by ~1,200 auto-generated token URLs, which
// left even /pricing sitting in "Discovered – currently not indexed".
//
// The /tokens/{symbol} pages were REMOVED from the sitemap entirely: they
// duplicate the canonical /token/{chainId}/{address} pages (a single-chain
// symbol just redirects to it). They stay live and internally linked — we just
// no longer force-submit ~500 redirect/duplicate URLs.
//
// lastModified strategy (Google only trusts lastmod when it's verifiably
// accurate — a render-time `new Date()` on every URL made every page claim it
// changed "now" on every fetch, so Google ignored the signal):
// - Truly-static marketing pages → NO lastmod (avoids a blog-style date byline
//   on the homepage snippet; there's no meaningful per-fetch change to report).
// - Daily-changing data pages (/protocols, /unlocks, ranking/window pages) →
//   TODAY (date-only, stable within a day).
// - /protocols/[slug](/unlocks) → the cached stream table's real last-refresh.
// - Articles → the article's own updatedAt.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/articles";
import { listProtocols, publicChainIds, chainSlug } from "@/lib/protocol-constants";
import { getProtocolStats, toDateSafe } from "@/lib/vesting/protocol-stats";
import { ALL_WINDOW_SLUGS } from "@/lib/vesting/unlock-windows";
import { DOC_SLUGS } from "@/lib/docs";

const SITE = "https://www.vestream.io";

// Regenerate every 10 min so per-protocol lastmod stays fresh after deploys.
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Date-only "today" (midnight UTC) — stable within a day, so daily data pages
  // advertise a change once per day instead of on every sitemap fetch.
  const today = new Date(new Date().toISOString().slice(0, 10));
  const protocols = listProtocols();
  const articles = getAllArticles();

  // Build-time guard. During `next build` there is no reliable DB — hitting it
  // risks a hung pooler connection blowing the 60s static-gen budget and
  // failing the deploy (2026-05-13 incident). Fall back to `today`.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";

  const protocolLastModified = isBuild
    ? protocols.map(() => today)
    : await Promise.all(
        protocols.map(async (p) => {
          try {
            const stats = await getProtocolStats(p.adapterIds);
            return toDateSafe(stats.lastIndexedAt) ?? today;
          } catch {
            return today;
          }
        }),
      );

  // Static marketing pages deliberately carry NO lastModified. A homepage that
  // advertises a recent change date gets a "N days ago" byline in Google's
  // result snippet — makes a brand homepage look like a dated blog post. With
  // no date in the content, structured data, or sitemap, Google has nothing to
  // anchor a byline to. Daily data pages (protocols/unlocks/rankings) keep a
  // date because freshness is genuinely relevant there.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,              changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE}/invest`,        changeFrequency: "weekly",  priority: 0.95 },
    // /payroll is the coming-soon waitlist page — kept indexable so the
    // "crypto payroll tracker" search intent finds the roadmap surface,
    // but priority dropped to 0.5 so it doesn't out-rank /invest or /
    // for queries Vestream actually wants to convert today.
    { url: `${SITE}/payroll`,                 changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/corporate/token-payroll`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/protocols`,     lastModified: today,       changeFrequency: "daily",   priority: 0.95 },
    { url: `${SITE}/unlocks`,       lastModified: today,       changeFrequency: "daily",   priority: 0.9 },
    { url: `${SITE}/chains`,        lastModified: today,       changeFrequency: "daily",   priority: 0.8 },
    // Ranking pages — high-intent commercial queries ("biggest token unlocks
    // this week", "airdrop unlocks"). Same crawl cadence as /unlocks itself.
    { url: `${SITE}/unlocks/biggest-this-week`,   lastModified: today, changeFrequency: "daily",   priority: 0.85 },
    { url: `${SITE}/unlocks/mass-distributions`,  lastModified: today, changeFrequency: "daily",   priority: 0.85 },
    { url: `${SITE}/demo`,          changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE}/find-vestings`, changeFrequency: "weekly",  priority: 0.85 },
    { url: `${SITE}/developer`,     changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/ai`,            changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/pricing`,       changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/docs`,          changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/resources`,     lastModified: today,       changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/research/vesting-statistics`, lastModified: today, changeFrequency: "daily", priority: 0.75 },
    { url: `${SITE}/methodology`,   lastModified: today,       changeFrequency: "weekly",  priority: 0.6 },
    { url: `${SITE}/early-access`,  changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacy`,       changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/terms`,         changeFrequency: "yearly",  priority: 0.3 },
  ];

  const protocolEntries: MetadataRoute.Sitemap = protocols.map((p, i) => ({
    url:             `${SITE}/protocols/${p.slug}`,
    lastModified:    protocolLastModified[i],
    changeFrequency: "daily",
    priority:        0.9,
  }));

  // Per-protocol unlock calendar pages — one per protocol slug.
  const protocolUnlockEntries: MetadataRoute.Sitemap = protocols.map((p, i) => ({
    url:             `${SITE}/protocols/${p.slug}/unlocks`,
    lastModified:    protocolLastModified[i],
    changeFrequency: "daily",
    priority:        0.85,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url:             `${SITE}/resources/${a.slug}`,
    lastModified:    new Date(a.updatedAt || a.publishedAt),
    changeFrequency: "monthly",
    priority:        0.6,
  }));

  // Per-window unlock pages — date-stamped landing pages that change daily.
  const unlockWindowEntries: MetadataRoute.Sitemap = ALL_WINDOW_SLUGS.map((slug) => ({
    url:             `${SITE}/unlocks/${slug}`,
    lastModified:    today,
    changeFrequency: "daily",
    priority:        0.85,
  }));

  // Monthly Token Unlock Reports — the hub + a window of dated reports
  // (last 3 months through next 6). Pure date math, no DB.
  const nowUtc = new Date();
  const reportEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/unlocks/report`, lastModified: today, changeFrequency: "daily", priority: 0.8 },
  ];
  for (let offset = 6; offset >= -3; offset--) {
    const d = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth() + offset, 1));
    const slug = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    reportEntries.push({
      url:             `${SITE}/unlocks/report/${slug}`,
      lastModified:    today,
      changeFrequency: "weekly",
      priority:        offset >= 0 ? 0.75 : 0.6,
    });
  }

  const docsEntries: MetadataRoute.Sitemap = DOC_SLUGS.map((slug) => ({
    url:             `${SITE}/docs/${slug}`,
    changeFrequency: "monthly",
    priority:        0.6,
  }));

  // Per-chain unlock pages — one per public (mainnet) chain.
  const chainEntries: MetadataRoute.Sitemap = publicChainIds()
    .map((id) => chainSlug(id))
    .filter((s): s is string => !!s)
    .map((slug) => ({
      url:             `${SITE}/chains/${slug}`,
      lastModified:    today,
      changeFrequency: "daily" as const,
      priority:        0.8,
    }));

  return [
    ...staticEntries,
    ...docsEntries,
    ...protocolEntries,
    ...protocolUnlockEntries,
    ...chainEntries,
    ...articleEntries,
    ...unlockWindowEntries,
    ...reportEntries,
  ];
}
