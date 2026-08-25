// src/app/robots.ts
// ─────────────────────────────────────────────────────────────────────────────
// robots.txt generator. Allows all crawlers on public routes, blocks gated
// and internal routes, and advertises the sitemap.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";

const SITE = "https://www.vestream.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/api-docs",
          "/admin",
          "/admin/",
          "/dashboard",
          "/dashboard/",
          "/settings",
          "/settings/",
          "/developer/account",
          "/developer/portal",
          "/login",
          "/_next/",
        ],
      },
    ],
    // Two sitemaps (split Aug 2026): core human-authored pages + the
    // high-volume programmatic token pages. Listed separately so GSC reports
    // indexing coverage per section.
    sitemap: [`${SITE}/sitemap.xml`, `${SITE}/sitemap-tokens.xml`],
    host: SITE,
  };
}
