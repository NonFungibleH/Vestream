// /api/cron/warm
// ─────────────────────────────────────────────────────────────────────────────
// Keeps the public page caches HOT on a low-traffic (pre-launch) site.
//
// The /protocols index + each /protocols/[slug] + /status wrap their data in
// unstable_cache (TTL 30–60 min) and are invalidated by the seed-cache /
// tvl-snapshot crons via revalidateTag. With little organic traffic, the
// Data Cache entry is evicted (or freshly invalidated) between visits, so the
// next *real* visitor eats the full cold render (2–4s on the bigger protocols:
// the unlock-list queries + a live DexScreener pricing call).
//
// This cron stands in for the missing organic traffic: it fetches each page on
// a short interval so the render cost is absorbed HERE, in the background, and
// a real visitor always lands on a warm cache. Pages render server-side on the
// fetch, repopulating both the Full Route Cache and the unstable_cache Data
// Cache (shared across the deployment).
//
// Auth: Authorization: Bearer ${CRON_SECRET}.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";
import { PROTOCOL_SLUGS, getProtocol } from "@/lib/protocol-constants";

export const runtime = "nodejs";
export const maxDuration = 120;

const BASE = "https://www.vestream.io";

export async function GET(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only active (non-disabled) protocols have a live /protocols/[slug] page.
  const slugs = PROTOCOL_SLUGS.filter((s) => !getProtocol(s)?.disabled);
  const urls = [
    `${BASE}/protocols`,
    `${BASE}/status`,
    ...slugs.map((s) => `${BASE}/protocols/${s}`),
  ];

  // Warm SEQUENTIALLY, not in parallel. Firing 13 heavy renders at once
  // contends on the DB pool + DexScreener pricing — it spiked the two biggest
  // pages to 5–6s and would momentarily slow any real visitor mid-burst.
  // One-at-a-time keeps each render's cost isolated and the site smooth.
  const warmed: Array<{ url: string; status?: number; ms?: number; error?: string }> = [];
  for (const url of urls) {
    const started = Date.now();
    try {
      // no-store on OUR fetch so the warmer never serves itself a cached
      // response — the page still renders server-side and repopulates its own
      // unstable_cache Data Cache.
      const res = await fetch(url, { cache: "no-store", headers: { "x-vestream-warm": "1" } });
      warmed.push({ url, status: res.status, ms: Date.now() - started });
    } catch (err) {
      warmed.push({ url, error: String(err).slice(0, 120) });
    }
  }
  const slow = warmed.filter((w) => typeof w.ms === "number" && w.ms > 1500);

  return NextResponse.json({ ok: true, count: warmed.length, slow, warmed });
}
