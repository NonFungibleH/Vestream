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
import { ALL_WINDOW_SLUGS } from "@/lib/vesting/unlock-windows";
import { listSitemapTokens } from "@/lib/sitemap-token-cache";
import { computeTokenPageData } from "@/lib/vesting/token-page-data";
import { persistFallbackDb, tokenKey } from "@/lib/vesting/page-data-fallback";
import { normaliseAddress } from "@/lib/address-validation";

export const runtime = "nodejs";
// Raised for the two-pass warm: a STALE page costs an extra 12s wait plus a
// re-fetch, and with ~16 URLs the old 120s budget could be exceeded.
export const maxDuration = 300;

const BASE = "https://www.vestream.io";

export async function GET(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only active (non-disabled) protocols have a live /protocols/[slug] page.
  const slugs = PROTOCOL_SLUGS.filter((s) => !getProtocol(s)?.disabled && !getProtocol(s)?.unlisted);
  const urls = [
    `${BASE}/protocols`,
    `${BASE}/status`,
    // The heavy ISR pages. These bake EMPTY at build time and every deploy
    // resets their ISR clock to that empty snapshot, so without traffic they
    // stay blank: /unlocks showed the window cards with no table for exactly
    // this reason. revalidatePath alone does not fix it either — it only marks
    // the page stale, and stale-while-revalidate then serves the empty version
    // to the next visitor while regenerating behind them. Warming actually
    // renders them, so the cache holds real content before anyone arrives.
    `${BASE}/`,
    `${BASE}/unlocks`,
    `${BASE}/chains`,
    ...slugs.map((s) => `${BASE}/protocols/${s}`),
    // The eight /unlocks/[range] pages bake from their page_fallback rows at
    // build (see the range page). Warming them here is what WRITES those rows
    // — a page nobody visits between deploys would otherwise never have one,
    // and the next build would bake it empty again. ~0.3s each.
    ...ALL_WINDOW_SLUGS.map((r) => `${BASE}/unlocks/${r}`),
    // Monthly reports: the hub plus the same months the page prerenders
    // (last month through two ahead). Same reason as the range pages.
    `${BASE}/unlocks/report`,
    ...reportMonths().map((m) => `${BASE}/unlocks/report/${m}`),
  ];

  // Warm SEQUENTIALLY, not in parallel. Firing 13 heavy renders at once
  // contends on the DB pool + DexScreener pricing — it spiked the two biggest
  // pages to 5–6s and would momentarily slow any real visitor mid-burst.
  // One-at-a-time keeps each render's cost isolated and the site smooth.
  //
  // Bounded (Oct 2026): this cron used to wait 12s on every STALE page and
  // re-fetch it, with no per-page limit. With the DB slow, every run hit the
  // 300s ceiling — ~8h/day of billed function time spent waiting. A STALE hit
  // already starts the regeneration, and every page bakes from its last-good
  // row, so one pass is enough. Each page gets PAGE_TIMEOUT_MS; the whole page
  // pass stops at PAGES_BUDGET_MS so the token slice always gets its turn.
  const warmed: Array<{ url: string; status?: number; ms?: number; error?: string }> = [];
  const pagesStarted = Date.now();
  for (const url of urls) {
    if (Date.now() - pagesStarted > PAGES_BUDGET_MS) {
      warmed.push({ url, error: "skipped: page budget spent" });
      continue;
    }
    const started = Date.now();
    try {
      // no-store on OUR fetch so the warmer never serves itself a cached
      // response — the page still renders server-side and repopulates its own
      // unstable_cache Data Cache. (AbortSignal is safe here: no-store means
      // there is no data-cache entry for it to disable.)
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "x-vestream-warm": "1" },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
      warmed.push({ url, status: res.status, ms: Date.now() - started });
    } catch (err) {
      warmed.push({ url, error: String(err).slice(0, 120) });
    }
  }
  const slow = warmed.filter((w) => typeof w.ms === "number" && w.ms > 1500);

  // ── Token page precompute, one rotating slice per tick ────────────────────
  // The sitemap's ~260 token pages are prerendered at build from their
  // page_fallback rows (see generateStaticParams on the token page). This is
  // what keeps those rows fresh with no extra cron: every hourly tick
  // computes the next TOKEN_SLICE tokens' payloads (data only — no page
  // render, no HTTP) and awaits the upsert, so the whole list turns over
  // roughly every ten hours (the pages themselves refresh daily). Bounded so
  // it can never push this function past its budget; a slow slice just
  // finishes on a later tick.
  const tokens = await computeTokenSlice();

  return NextResponse.json({ ok: true, count: warmed.length, slow, warmed, tokens });
}

function reportMonths(): string[] {
  const now = new Date(); const out: string[] = [];
  for (let offset = -1; offset <= 2; offset++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const PAGE_TIMEOUT_MS   = 20_000;
const PAGES_BUDGET_MS   = 150_000;
// Must match the cron interval in vercel.json: the slice rotation below
// advances one slice per tick, and a mismatched tick length skips slices.
const TICK_MS           = 60 * 60_000;
const TOKEN_SLICE       = 30;
const TOKEN_CONCURRENCY = 3;
const TOKEN_BUDGET_MS   = 90_000;

async function computeTokenSlice(): Promise<{ slice: number; of: number; computed: number; failed: number; ms: number }> {
  const started = Date.now();
  const all = await listSitemapTokens();
  if (all.length === 0) return { slice: 0, of: 0, computed: 0, failed: 0, ms: 0 };
  const slices = Math.ceil(all.length / TOKEN_SLICE);
  // Tick-indexed rotation: successive hourly ticks walk the list in order.
  const slice = Math.floor(Date.now() / TICK_MS) % slices;
  const batch = all.slice(slice * TOKEN_SLICE, (slice + 1) * TOKEN_SLICE);

  let computed = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < batch.length && Date.now() - started < TOKEN_BUDGET_MS) {
      const t = batch[i++];
      const addr = normaliseAddress(t.address);
      try {
        const data = await computeTokenPageData(t.chainId, addr);
        // An empty overview is a real "no vesting" answer, not a last-good.
        if (data.overview) { await persistFallbackDb(tokenKey(t.chainId, addr), data); computed++; }
      } catch (err) {
        failed++;
        console.warn(`[cron/warm] token precompute failed ${t.chainId}/${addr}:`, String(err).slice(0, 120));
      }
    }
  };
  await Promise.all(Array.from({ length: TOKEN_CONCURRENCY }, worker));
  return { slice, of: slices, computed, failed, ms: Date.now() - started };
}
