// src/app/api/cron/tvl-snapshot/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Daily TVL snapshot cron — the source of truth for every TVL number on the
// platform. Writes one row per (protocol, chainId) in `protocolTvlSnapshots`.
//
// Dispatch rules (per protocol):
//   - externalTvl present in protocol-constants.ts → DefiLlama passthrough
//     (Sablier, Hedgey, Streamflow — where DefiLlama publishes a
//     vesting-specific chainTvls.vesting breakdown).
//   - externalTvl absent → run the exhaustive walker + price with our own
//     DexScreener+CoinGecko pipeline (UNCX, Unvest, Superfluid, Team Finance,
//     PinkSale, Jupiter Lock).
//
// Invocation modes:
//   - No query params → runs ALL protocols in parallel. Ideal daily cron.
//   - ?protocol=uncx → runs just one. Used for ad-hoc reruns + slow protocols
//     that may exceed the global 5-min timeout.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` — same pattern as seed-cache.
//
// Schedule: vercel.json registers this at 03:15 UTC daily (offset by 15 min
// from seed-cache so both crons don't pile onto the same instance slot).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { listProtocols, type ProtocolMeta } from "@/lib/protocol-constants";
import {
  runWalkerSnapshot,
  runDefiLlamaSnapshot,
  type WalkerSnapshotSummary,
  type DefiLlamaSnapshotSummary,
} from "@/lib/vesting/tvl-snapshot";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

// Snapshot runs are slow — PinkSale + UNCX-VM walk large event windows.
// Raise the function timeout to the Vercel max (300s on Pro).
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

type Summary = WalkerSnapshotSummary | DefiLlamaSnapshotSummary;

/**
 * Snapshot one protocol — dispatches to the right mode based on its
 * `externalTvl` metadata.
 *
 * For walker-mode protocols with multiple adapter IDs (e.g. UNCX displays
 * `["uncx", "uncx-vm"]` as one card), we run the walker for each adapter
 * separately. Each walker writes its own row in `protocolTvlSnapshots`
 * keyed by adapter ID; the /protocols page already aggregates rows whose
 * `protocol` column appears in the meta's `adapterIds` array.
 */
async function snapshotProtocol(p: ProtocolMeta): Promise<{ slug: string; kind: "defillama" | "walker"; summary: Summary }> {
  if (p.externalTvl) {
    const summary = await runDefiLlamaSnapshot(p.slug, p.externalTvl.slug, p.externalTvl.category);
    return { slug: p.slug, kind: "defillama", summary };
  }

  // Walker mode — fan out across every adapter ID, collect results.
  const perAdapter = await Promise.all(
    p.adapterIds.map((adapterId) => runWalkerSnapshot(adapterId, p.chainIds)),
  );

  // Combine into a single summary that surfaces aggregate health for the
  // protocol-level UI display.
  const combined: WalkerSnapshotSummary = {
    protocol:    p.slug,
    chainsRun:   perAdapter.reduce((s, x) => s + x.chainsRun,  0),
    chainsOk:    perAdapter.reduce((s, x) => s + x.chainsOk,   0),
    totalUsd:    perAdapter.reduce((s, x) => s + x.totalUsd,   0),
    streamCount: perAdapter.reduce((s, x) => s + x.streamCount, 0),
    durationMs:  perAdapter.reduce((s, x) => s + x.durationMs, 0),
    errors:      perAdapter.flatMap((x) => x.errors.map((e) => `${x.protocol}: ${e}`)),
  };

  return { slug: p.slug, kind: "walker", summary: combined };
}

async function runAll(protocolFilter: string | null): Promise<{
  runs:     Array<{ slug: string; kind: string; ok: boolean; summary: Summary }>;
  totalUsd: number;
  durationMs: number;
}> {
  const started = Date.now();
  // listProtocols() filters out disabled protocols by default — so paused
  // integrations (e.g. team-finance, May 2026) never get walker calls fired
  // on their behalf, even if a manual `?protocol=team-finance` rerun is
  // attempted. To re-enable, flip `disabled: false` in protocol-constants.ts.
  const protocols = listProtocols().filter((p) => !protocolFilter || p.slug === protocolFilter);
  if (protocolFilter && protocols.length === 0) {
    console.log(`[cron/tvl-snapshot] no enabled protocol matches "${protocolFilter}" — skipping (may be disabled in protocol-constants.ts)`);
  }

  // Serial processing with brief inter-protocol delay (added May 11 2026).
  //
  // Was Promise.all(protocols.map(...)) — every protocol's pricing fan-out
  // (DexScreener + CoinGecko per-token lookups) fired at the same instant.
  // Empirically this overwhelmed both free-tier APIs and produced cascading
  // HTTP 429s for ~50% of tokens, which then degraded the headline (PinkSale
  // $44.6M → $34.9M overnight May 10→11 as the failed-pricing rows landed).
  //
  // Serial sequencing with a INTER_PROTOCOL_DELAY_MS pause spreads the API
  // pressure over ~minutes instead of seconds. Combined with the
  // pricing-failure guard in runWalkerSnapshot (which preserves prior rows
  // when coverage is poor), this should hold even when DexScreener has a
  // bad day.
  //
  // Budget math: 9 protocols × (avg ~20s pricing + 5s delay) = ~225s,
  // fits within Vercel Pro's 300s function limit with margin. If any one
  // protocol exceeds its budget the loop continues to the next — the
  // function only dies if total elapsed exceeds maxDuration.
  const INTER_PROTOCOL_DELAY_MS = 5_000;
  const runs: Array<{ slug: string; kind: string; ok: boolean; summary: Summary }> = [];

  for (let i = 0; i < protocols.length; i++) {
    const p = protocols[i];
    if (i > 0) {
      await new Promise((r) => setTimeout(r, INTER_PROTOCOL_DELAY_MS));
    }
    try {
      const result = await snapshotProtocol(p);
      const ok = "error" in result.summary
        ? result.summary.error === null
        : result.summary.chainsOk > 0;
      runs.push({ slug: result.slug, kind: result.kind, ok, summary: result.summary });
    } catch (err) {
      console.error(`[cron/tvl-snapshot] ${p.slug} failed:`, err);
      runs.push({
        slug: p.slug,
        kind: p.externalTvl ? "defillama" : "walker",
        ok:   false,
        summary: {
          protocol:      p.slug,
          slug:          p.externalTvl?.slug ?? "",
          totalUsd:      0,
          chainsWritten: 0,
          durationMs:    0,
          error:         err instanceof Error ? err.message : String(err),
        } as DefiLlamaSnapshotSummary,
      });
    }
  }

  const totalUsd = runs.reduce((s, r) => {
    const t = "totalUsd" in r.summary ? r.summary.totalUsd : 0;
    return s + (typeof t === "number" ? t : 0);
  }, 0);

  // Snapshot rows just changed → bust the /protocols Data Cache so users
  // see the new figures on their next page load instead of waiting out
  // the 5-min unstable_cache TTL. Same tag is also used by
  // /protocols/[slug] pages.
  try {
    // Next 16 changed revalidateTag to require a cache profile arg.
    // "max" = invalidate immediately, no grace period.
    revalidateTag("protocols-page", "max");
  } catch (err) {
    console.warn("[cron/tvl-snapshot] revalidateTag failed (non-fatal):", err);
  }

  return {
    runs,
    totalUsd,
    durationMs: Date.now() - started,
  };
}

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const protocolFilter = req.nextUrl.searchParams.get("protocol");
  const background     = req.nextUrl.searchParams.get("background") === "true";

  // Background mode — useful for manual invocations of slow walkers (PinkSale
  // event scan) so the caller's HTTP connection doesn't have to stay open for
  // 5 minutes. Returns immediately; work continues via after().
  if (background) {
    after(async () => {
      const result = await runAll(protocolFilter);
      console.log(
        `[cron/tvl-snapshot] background run complete in ${(result.durationMs / 1000).toFixed(1)}s — `
        + `totalUsd=$${result.totalUsd.toLocaleString()}, `
        + `runs=${JSON.stringify(result.runs.map((r) => ({ slug: r.slug, ok: r.ok })))}`,
      );
    });
    return NextResponse.json({
      ok:       true,
      accepted: true,
      message:  "TVL snapshot kicked off in background. Check Vercel logs for completion (2–5 min).",
      filter:   protocolFilter,
    }, { status: 202 });
  }

  const result = await runAll(protocolFilter);
  return NextResponse.json({
    ok:         true,
    filter:     protocolFilter,
    totalUsd:   result.totalUsd,
    elapsedSec: Math.round(result.durationMs / 100) / 10,
    runs:       result.runs,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
