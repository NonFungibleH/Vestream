// src/app/api/unlocks/tvl/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Returns per-protocol TVL across every indexed protocol. Cached at the edge
// for 5 minutes — TVL is slow-changing (driven by cache seeding + price moves)
// so a longer TTL keeps DexScreener traffic proportional to real user demand.
//
// The /unlocks page calls `getAllProtocolsTvl()` directly as a Server
// Component, so this route is a convenience for external/MCP consumption and
// for any future client-side chart.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { listProtocols } from "@/lib/protocol-constants";
import { getAllProtocolsTvl, type ProtocolTvl } from "@/lib/vesting/tvl";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

export interface TvlResponse {
  ok:          true;
  totalTvlUsd: number;
  protocols: Array<{
    slug: string;
    name: string;
    tvl:  ProtocolTvl;
  }>;
  computedAt:  string;
}

export async function GET() {
  try {
    const protocols = listProtocols();
    const byId      = Object.fromEntries(protocols.map((p) => [p.slug, p.adapterIds] as const));
    const tvlMap    = await getAllProtocolsTvl(byId);

    const protoResults = protocols.map((p) => ({
      slug: p.slug,
      name: p.name,
      tvl:  tvlMap[p.slug],
    }));
    const totalTvlUsd = protoResults.reduce((s, r) => s + (r.tvl?.tvlUsd ?? 0), 0);

    return NextResponse.json(
      {
        ok:          true,
        totalTvlUsd,
        protocols:   protoResults,
        computedAt:  new Date().toISOString(),
      } satisfies TvlResponse,
      {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      },
    );
  } catch (err) {
    console.error("[tvl api] failed:", err);
    return NextResponse.json({ error: "Failed to compute TVL" }, { status: 500 });
  }
}
