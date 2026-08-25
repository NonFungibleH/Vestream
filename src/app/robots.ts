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
        // Allow Googlebot the render resources it needs. Blocking /_next/
        // wholesale hid every JS chunk, CSS and font from the crawler (they
        // showed up as "Blocked by robots.txt" in GSC), which degrades
        // render-based indexing — Google explicitly discourages blocking
        // page resources. Allow /_next/static/ (hashed, immutable JS/CSS/
        // fonts) and /_next/image (optimised images); the more-specific
        // Allow wins over the /_next/ Disallow below. /_next/data and other
        // internals stay blocked.
        allow: ["/", "/_next/static/", "/_next/image"],
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
