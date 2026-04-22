// src/app/sitemap.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sitemap generator consumed by search engines and LLMs.
//
// Strategy:
// - Public, SEO-relevant routes only — never gated routes (/dashboard, /admin,
//   /settings, /api-docs, etc.)
// - `lastModified` on /unlocks/[protocol] pages uses the cached stream table's
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
import { getProtocolStats } from "@/lib/vesting/protocol-stats";

const SITE = "https://vestream.io";

// Regenerate once per hour — sitemap freshness matters for crawlers but
// there's no need to hit the DB on every robot hit.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const protocols = listProtocols();
  const articles = getAllArticles();

  // Fetch last-indexed timestamp per protocol in parallel. Failures degrade
  // gracefully to `now` — never let a DB outage break the sitemap.
  const protocolLastModified = await Promise.all(
    protocols.map(async (p) => {
      try {
        const stats = await getProtocolStats(p.adapterIds);
        return stats.lastIndexedAt ?? now;
      } catch {
        return now;
      }
    }),
  );

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,              lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE}/unlocks`,       lastModified: now, changeFrequency: "daily",   priority: 0.95 },
    { url: `${SITE}/developer`,     lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/ai`,            lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/pricing`,       lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/resources`,     lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/early-access`,  lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacy`,       lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/terms`,         lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];

  const protocolEntries: MetadataRoute.Sitemap = protocols.map((p, i) => ({
    url:             `${SITE}/unlocks/${p.slug}`,
    lastModified:    protocolLastModified[i],
    changeFrequency: "daily",
    priority:        0.9,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url:             `${SITE}/resources/${a.slug}`,
    lastModified:    new Date(a.updatedAt || a.publishedAt),
    changeFrequency: "monthly",
    priority:        0.6,
  }));

  return [...staticEntries, ...protocolEntries, ...articleEntries];
}
