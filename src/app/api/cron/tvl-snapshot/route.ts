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
import { listProtocols, type ProtocolMeta } from "@/lib/protocol-constants";
import {
  runWalkerSnapshot,
  runDefiLlamaSnapshot,
  type WalkerSnapshotSummary,
  type DefiLlamaSnapshotSummary,
} from "@/lib/vesting/tvl-snapshot";
import { env } from "@/lib/env";

// Snapshot runs are slow — PinkSale + UNCX-VM walk large event windows.
// Raise the function timeout to the Vercel max (300s on Pro).
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

type Summary = WalkerSnapshotSummary | DefiLlamaSnapshotSummary;

/**
 * Snapshot one protocol — dispatches to the right mode based on its
 * `externalTvl` metadata.
 */
async function snapshotProtocol(p: ProtocolMeta): Promise<{ slug: string; kind: "defillama" | "walker"; summary: Summary }> {
  if (p.externalTvl) {
    const summary = await runDefiLlamaSnapshot(p.slug, p.externalTvl.slug, p.externalTvl.category);
    return { slug: p.slug, kind: "defillama", summary };
  }
  const summary = await runWalkerSnapshot(p.slug, p.chainIds);
  return { slug: p.slug, kind: "walker", summary };
}

async function runAll(protocolFilter: string | null): Promise<{
  runs:     Array<{ slug: string; kind: string; ok: boolean; summary: Summary }>;
  totalUsd: number;
  durationMs: number;
}> {
  const started = Date.now();
  const protocols = listProtocols().filter((p) => !protocolFilter || p.slug === protocolFilter);

  const runs = await Promise.all(
    protocols.map(async (p) => {
      try {
        const result = await snapshotProtocol(p);
        const ok = "error" in result.summary
          ? result.summary.error === null
          : result.summary.chainsOk > 0;
        return { slug: result.slug, kind: result.kind, ok, summary: result.summary };
      } catch (err) {
        console.error(`[cron/tvl-snapshot] ${p.slug} failed:`, err);
        return {
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
        };
      }
    }),
  );

  const totalUsd = runs.reduce((s, r) => {
    const t = "totalUsd" in r.summary ? r.summary.totalUsd : 0;
    return s + (typeof t === "number" ? t : 0);
  }, 0);

  return {
    runs,
    totalUsd,
    durationMs: Date.now() - started,
  };
}

async function handle(req: NextRequest) {
  const cronSecret = env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
