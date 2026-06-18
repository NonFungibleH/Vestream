// src/app/api/dashboard/explorer/dataset/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Full upcoming-unlock dataset for the CLIENT-SIDE explorer. The browser
// fetches this ONCE, then filters/sorts/paginates the whole token universe
// in-memory — zero round-trips per interaction (genuinely instant), unlike the
// old force-dynamic page that re-queried on every filter/sort/page change.
//
// Cacheable: this is the same per-token rollup data the public /explore pages
// already surface (no per-user content), so it's safe to CDN-cache and share
// across users. The client fetches with credentials omitted so the CDN can
// actually store the response (cookied requests aren't cached). The rollup is
// cron-maintained (~hourly), so a few minutes of staleness is fine.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getExplorerDataset } from "@/lib/vesting/token-rollups";

export const dynamic = "force-dynamic"; // computed per-request; CDN caches via headers

export async function GET() {
  try {
    const rows = await getExplorerDataset();
    return NextResponse.json(
      { rows, computedAt: Math.floor(Date.now() / 1000) },
      {
        headers: {
          // CDN-cache 5 min, serve-stale-while-revalidating for 10 more.
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    console.error("[explorer/dataset] failed:", err);
    return NextResponse.json({ rows: [], computedAt: 0 }, { status: 200 });
  }
}
