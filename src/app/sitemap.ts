// src/app/sitemap.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sitemap generator consumed by search engines and LLMs.
//
// Strategy:
// - Public, SEO-relevant routes only — never gated routes (/dashboard, /admin,
//   /settings, /api-docs, etc.)
// - `lastModified` on /protocols/[slug] pages uses the cached stream table's
//   most recent refresh timestamp — this is the whole point of shipping
//   per-protocol landing pages: search engines see the content changing and
//   re-crawl more aggressively.
// - Article `lastModified` uses the article's own `updatedAt` field.
// - Everything else falls back to "now" so new deploys push a fresh
//   lastModified on a best-effort basis.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/articles";
import { listProtocols } from "@/lib/protocol-constants";
import { getProtocolStats, toDateSafe } from "@/lib/vesting/protocol-stats";
import { ALL_WINDOW_SLUGS } from "@/lib/vesting/unlock-windows";
import { getTopSymbols, getTopTokens } from "@/lib/vesting/token-symbols";

const SITE = "https://www.vestream.io";

// Regenerate every 10 min. The sitemap returns an EMPTY token/symbol list at
// build time (no DB during build), so a long window would strand that empty
// version for up to an hour after every deploy. `revalidatePath("/sitemap.xml")`
// does NOT reliably bust metadata routes (Next quirk — verified 2026-07-06:
// stayed x-vercel-cache HIT after an on-demand call), so we can't force it on
// demand; a short ISR window is the reliable way to let natural revalidation
// repopulate the ~2k token/symbol URLs. The queries read the pre-aggregated
// token_vesting_rollups table (~600ms total), so a 10-min cadence is cheap.
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const protocols = listProtocols();
  const articles = getAllArticles();

  // Build-time guard. During `next build` the sitemap generates statically
  // (revalidate=3600 thereafter via ISR). If we hit the DB here, a single
  // hung pooler connection means the whole Promise.all sits until Vercel's
  // 60s static-generation timeout kills it, the build retries 2× more,
  // then fails — blocking EVERY deploy until the pool recovers. Today
  // (2026-05-13) this exact pattern blocked the resilience-hardening
  // deploy from landing. `now` as lastModified is a fine default — first
  // runtime hit refreshes via ISR with real per-protocol timestamps.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";

  // Fetch last-indexed timestamp per protocol in parallel. Failures degrade
  // gracefully to `now` — never let a DB outage break the sitemap.
  const protocolLastModified = isBuild
    ? protocols.map(() => now)
    : await Promise.all(
        protocols.map(async (p) => {
          try {
            const stats = await getProtocolStats(p.adapterIds);
            return toDateSafe(stats.lastIndexedAt) ?? now;
          } catch {
            return now;
          }
        }),
      );

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,              lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE}/invest`,        lastModified: now, changeFrequency: "weekly",  priority: 0.95 },
    // /payroll is the coming-soon waitlist page — kept indexable so the
    // "crypto payroll tracker" search intent finds the roadmap surface,
    // but priority dropped to 0.5 so it doesn't out-rank /invest or /
    // for queries Vestream actually wants to convert today.
    { url: `${SITE}/payroll`,           lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/corporate/token-payroll`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/protocols`,     lastModified: now, changeFrequency: "daily",   priority: 0.95 },
    { url: `${SITE}/unlocks`,                     lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    // Ranking pages — high-intent commercial queries ("biggest token unlocks
    // this week", "airdrop unlocks"). Same crawl cadence as /unlocks itself.
    { url: `${SITE}/unlocks/biggest-this-week`,   lastModified: now, changeFrequency: "daily",   priority: 0.85 },
    { url: `${SITE}/unlocks/mass-distributions`,  lastModified: now, changeFrequency: "daily",   priority: 0.85 },
    { url: `${SITE}/demo`,          lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE}/find-vestings`, lastModified: now, changeFrequency: "weekly",  priority: 0.85 },
    { url: `${SITE}/developer`,     lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/ai`,            lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/pricing`,       lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/resources`,     lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/early-access`,  lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacy`,       lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/terms`,         lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
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

  // Top-N symbol-routed token pages. Bumped 150 → 500 (May 2026) so the
  // long-tail head still gets crawler priority; ultra-cold symbols fall
  // through to on-demand ISR.
  // Same build-time guard — see protocolLastModified above. Empty list
  // during build; ISR populates with the real top-N on first hit.
  let topSymbols: string[] = [];
  if (!isBuild) {
    try {
      topSymbols = await getTopSymbols(500);
    } catch {
      /* fall through with empty list */
    }
  }
  const symbolEntries: MetadataRoute.Sitemap = topSymbols.map((s) => ({
    url:             `${SITE}/tokens/${s}`,
    lastModified:    now,
    changeFrequency: "weekly",
    priority:        0.7,
  }));

  // Top-N (chainId, address) token pages — the highest-volume long-tail
  // surface (thousands of /token/{chainId}/{address} URLs). Sitemapping
  // the top 1500 ensures Google has them in crawl budget rather than
  // discovering them organically. Stays well under the 50k-URL/sitemap
  // limit even combined with everything else below. Sitemap-index split
  // is the next move when this list exceeds ~30k.
  let topTokens: { chainId: number; address: string }[] = [];
  if (!isBuild) {
    try {
      topTokens = await getTopTokens(1500);
    } catch {
      /* fall through with empty list */
    }
  }
  const tokenAddressEntries: MetadataRoute.Sitemap = topTokens.map((t) => ({
    url:             `${SITE}/token/${t.chainId}/${t.address}`,
    lastModified:    now,
    changeFrequency: "weekly",
    priority:        0.65,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url:             `${SITE}/resources/${a.slug}`,
    lastModified:    new Date(a.updatedAt || a.publishedAt),
    changeFrequency: "monthly",
    priority:        0.6,
  }));

  // Per-window unlock pages — each is a date-stamped landing page that
  // changes daily, so we mark them changeFrequency=daily with high priority.
  // Crawlers will pick up the freshness signal on every recrawl.
  const unlockWindowEntries: MetadataRoute.Sitemap = ALL_WINDOW_SLUGS.map((slug) => ({
    url:             `${SITE}/unlocks/${slug}`,
    lastModified:    now,
    changeFrequency: "daily",
    priority:        0.85,
  }));

  return [
    ...staticEntries,
    ...protocolEntries,
    ...protocolUnlockEntries,
    ...articleEntries,
    ...unlockWindowEntries,
    ...symbolEntries,
    ...tokenAddressEntries,
  ];
}
