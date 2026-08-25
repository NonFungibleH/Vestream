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
// - Truly-static marketing pages → CONTENT_REV, a fixed date bumped on edits.
// - Daily-changing data pages (/protocols, /unlocks, ranking/window pages) →
//   TODAY (date-only, stable within a day).
// - /protocols/[slug](/unlocks) → the cached stream table's real last-refresh.
// - Articles → the article's own updatedAt.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/articles";
import { listProtocols } from "@/lib/protocol-constants";
import { getProtocolStats, toDateSafe } from "@/lib/vesting/protocol-stats";
import { ALL_WINDOW_SLUGS } from "@/lib/vesting/unlock-windows";

const SITE = "https://www.vestream.io";

// Regenerate every 10 min so per-protocol lastmod stays fresh after deploys.
export const revalidate = 600;

// Fixed content-revision date for genuinely static marketing pages. Bump this
// when their copy materially changes — NOT on every deploy. A stable value is
// the honest signal for pages that rarely change; a render-time date is not.
const CONTENT_REV = new Date("2026-08-25");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Date-only "today" (midnight UTC) — stable within a day, so daily data pages
  // advertise a change once per day instead of on every sitemap fetch.
  const today = new Date(new Date().toISOString().slice(0, 10));
  const protocols = listProtocols();
  const articles = getAllArticles();

  // Build-time guard. During `next build` there is no reliable DB — hitting it
  // risks a hung pooler connection blowing the 60s static-gen budget and
  // failing the deploy (2026-05-13 incident). Fall back to CONTENT_REV.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";

  const protocolLastModified = isBuild
    ? protocols.map(() => CONTENT_REV)
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

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,              lastModified: CONTENT_REV, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE}/invest`,        lastModified: CONTENT_REV, changeFrequency: "weekly",  priority: 0.95 },
    // /payroll is the coming-soon waitlist page — kept indexable so the
    // "crypto payroll tracker" search intent finds the roadmap surface,
    // but priority dropped to 0.5 so it doesn't out-rank /invest or /
    // for queries Vestream actually wants to convert today.
    { url: `${SITE}/payroll`,                 lastModified: CONTENT_REV, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/corporate/token-payroll`, lastModified: CONTENT_REV, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/protocols`,     lastModified: today,       changeFrequency: "daily",   priority: 0.95 },
    { url: `${SITE}/unlocks`,       lastModified: today,       changeFrequency: "daily",   priority: 0.9 },
    // Ranking pages — high-intent commercial queries ("biggest token unlocks
    // this week", "airdrop unlocks"). Same crawl cadence as /unlocks itself.
    { url: `${SITE}/unlocks/biggest-this-week`,   lastModified: today, changeFrequency: "daily",   priority: 0.85 },
    { url: `${SITE}/unlocks/mass-distributions`,  lastModified: today, changeFrequency: "daily",   priority: 0.85 },
    { url: `${SITE}/demo`,          lastModified: CONTENT_REV, changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE}/find-vestings`, lastModified: CONTENT_REV, changeFrequency: "weekly",  priority: 0.85 },
    { url: `${SITE}/developer`,     lastModified: CONTENT_REV, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/ai`,            lastModified: CONTENT_REV, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/pricing`,       lastModified: CONTENT_REV, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/resources`,     lastModified: today,       changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/early-access`,  lastModified: CONTENT_REV, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacy`,       lastModified: CONTENT_REV, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/terms`,         lastModified: CONTENT_REV, changeFrequency: "yearly",  priority: 0.3 },
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

  return [
    ...staticEntries,
    ...protocolEntries,
    ...protocolUnlockEntries,
    ...articleEntries,
    ...unlockWindowEntries,
    ...reportEntries,
  ];
}
