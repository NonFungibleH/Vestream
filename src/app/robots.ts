// src/app/robots.ts
// ─────────────────────────────────────────────────────────────────────────────
// robots.txt generator. Allows all crawlers on public routes, blocks gated
// and internal routes, and advertises the sitemap.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";

const SITE = "https://vestream.io";

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
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
