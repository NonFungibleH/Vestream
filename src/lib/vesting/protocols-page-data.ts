// src/lib/vesting/protocols-page-data.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-protocol stream counts + TVL for every listed protocol, wrapped in the
// Vercel Data Cache. Moved out of app/protocols/page.tsx (2026-10-31) so the
// /token-vesting-platforms comparison page reads the same cached numbers.
// Callers catch a throw and fall back to getLastGoodProtocolsData().
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { listProtocols } from "@/lib/protocol-constants";
import {
  getAllProtocolStatsMap,
  foldProtocolStats,
  type ProtocolStats,
} from "@/lib/vesting/protocol-stats";
import type { ProtocolTvl } from "@/lib/vesting/tvl";
import { readAllSnapshots } from "@/lib/vesting/tvl-snapshot";

const CACHE_TTL_SECONDS = 1800;

/**
 * All DB work the /protocols page needs, wrapped in Vercel Data Cache. Pure
 * DB reads – no external API calls on the render path.
 *
 * Hardened: the entire body runs inside a try/catch so a DB outage,
 * snapshot-table-missing, or any other downstream failure can NEVER crash
 * the page render. Worst case the user sees the marketing layout with
 * placeholder values for stream counts and TVL – which is strictly better
 * than a Server Components hard error.
 */
export const loadProtocolsData = unstable_cache(
  async (): Promise<{
    statsEntries:   Array<readonly [string, ProtocolStats | null]>;
    tvlMap:         Record<string, ProtocolTvl>;
    methodologyMap: Record<string, string>;
    computedAtMap:  Record<string, string>;
  }> => {
    const protocols = listProtocols();

    // Empty-shape default – returned on any failure so the render path
    // always receives a valid object. The page handles missing tvl rows
    // gracefully via `tvlMap[slug] ?? null` everywhere.
    const empty = {
      statsEntries:   protocols.map((p) => [p.slug, null as ProtocolStats | null] as const),
      tvlMap:         {} as Record<string, ProtocolTvl>,
      methodologyMap: {} as Record<string, string>,
      computedAtMap:  {} as Record<string, string>,
    };

    try {
      // Block-explorer-fast render path: TWO small pre-aggregated reads only,
      // never the 176k-row vesting_streams_cache. Previously this fanned out N
      // parallel getProtocolStats() calls (each able to fall into a ~5–8s
      // GROUP-BY over that raw table) which saturated the Supabase pooler and
      // produced 8s+ TTFB. Now: one bulk protocol_summaries read folded in
      // memory + one snapshots read.
      const [summariesMap, snapshotRows] = await Promise.all([
        getAllProtocolStatsMap().catch((err) => {
          console.error("[protocols] summaries read failed:", err);
          return new Map<string, ProtocolStats>();
        }),
        readAllSnapshots().catch((err) => {
          console.error("[unlocks] snapshot read failed:", err);
          return [] as Awaited<ReturnType<typeof readAllSnapshots>>;
        }),
      ]);

      const statsEntries: Array<readonly [string, ProtocolStats | null]> =
        protocols.map((p) => [p.slug, foldProtocolStats(summariesMap, p.adapterIds)] as const);

      // Aggregate snapshot rows by protocol – sum across chains.
      const tvlMap: Record<string, ProtocolTvl> = {};
      const methodologyMap: Record<string, string> = {};
      const computedAtMap: Record<string, string> = {};

      for (const p of protocols) {
        const rows = snapshotRows.filter((r) => {
          // Protocol may be aggregated from multiple adapter IDs (e.g. UNCX
          // displays uncx + uncx-vm). Match any of them.
          return p.adapterIds.includes(r.protocol);
        });
        if (rows.length === 0) continue;

        let tvlUsd = 0;
        let tvlHigh = 0;
        let tvlMedium = 0;
        let tvlLow = 0;
        let tokensPriced = 0;
        let tokensTotal  = 0;
        const perChainMap = new Map<number, number>();
        let latestComputedAt: Date | null = null;
        // Methodology: if ANY row is defillama-vesting, mark the protocol as
        // externally sourced for the UI tag. Walker rows win for display of
        // methodology if there's a mix (unlikely but possible).
        let methodology = rows[0].methodology;
        for (const r of rows) {
          tvlUsd    += r.tvlUsd;
          tvlHigh   += r.tvlHigh;
          tvlMedium += r.tvlMedium;
          tvlLow    += r.tvlLow;
          tokensPriced += r.tokensPriced;
          tokensTotal  += r.tokensTotal;
          perChainMap.set(r.chainId, (perChainMap.get(r.chainId) ?? 0) + r.tvlUsd);
          if (!latestComputedAt || r.computedAt > latestComputedAt) {
            latestComputedAt = r.computedAt;
          }
          // Prefer the less-precise methodology tag for display – if we have
          // both defillama and walker rows for the same protocol, the walker
          // methodology is the more "accurate" label to show.
          if (r.methodology !== "defillama-vesting") methodology = r.methodology;
        }

        methodologyMap[p.slug] = methodology;
        computedAtMap[p.slug] = (latestComputedAt ?? new Date()).toISOString();

        tvlMap[p.slug] = {
          adapterIds:      p.adapterIds,
          tvlUsd,
          tvlByBand:       { high: tvlHigh, medium: tvlMedium, low: tvlLow },
          pricingSources:  { dexscreener: 0, defillama: 0, coingecko: 0 }, // aggregate-level – per-token not stored
          perChain:        Array.from(perChainMap.entries())
            .map(([chainId, usd]) => ({ chainId, tvlUsd: usd }))
            .sort((a, b) => b.tvlUsd - a.tvlUsd),
          tokensPriced,
          tokensSkipped:   Math.max(0, tokensTotal - tokensPriced),
          totalTokens:     tokensTotal,
          coverage:        tokensTotal > 0 ? tokensPriced / tokensTotal : (tvlUsd > 0 ? 1 : 0),
          topContributors: [],   // available in snapshot row.topContributors if needed
          computedAt:      (latestComputedAt ?? new Date()).toISOString(),
        };
      }

      // Guard against caching a degraded result. If the bulk summaries read
      // failed (caught → empty map), every foldProtocolStats() returns null.
      // Caching that – or saving it as last-good – makes the page show "0
      // streams indexed" for 5 min and poisons the fallback. Throw instead:
      // unstable_cache skips the write, the caller keeps the previous last-good
      // (real counts), and the next request retries fresh.
      if (statsEntries.length > 0 && statsEntries.every(([, s]) => s === null)) {
        throw new Error("all protocol stats null – skipping cache to avoid serving 0 streams");
      }
      // Same guard for TVL (2026-06-26). The snapshot read is wrapped in
      // `.catch(() => [])`, so a transient pooler blip OR the build-phase
      // short-circuit returns zero rows – which the old code cached as a
      // "legitimately empty" tvlMap, blanking the TVL bar ("Pricing indexed
      // tokens…") for the full 5-min TTL. In steady state every protocol has a
      // snapshot row, so zero rows means a degraded read, never legitimate:
      // throw to skip the cache and fall back to last-good (now durable in
      // Postgres – see page-data-fallback.ts) instead of caching emptiness.
      if (snapshotRows.length === 0) {
        throw new Error("zero TVL snapshot rows – skipping cache to avoid blanking the TVL bar");
      }

      return { statsEntries, tvlMap, methodologyMap, computedAtMap };
    } catch (err) {
      // Throw – don't cache this empty result. unstable_cache doesn't
      // persist thrown errors, so the next request retries fresh. The
      // page component catches this and falls back to last-known-good
      // from Redis (page-data-fallback.ts). See /protocols/[slug] page
      // for the matching pattern.
      console.error("[unlocks] loadProtocolsData fatal – throwing to skip cache write:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
  // v6 = bump after the May 5 2026 DefiLlama chain-filtering + sanity-cap
  // pivot. Numbers materially shifted (Sablier $5.48B → $1.69B with
  // Arbitrum-vesting outlier capped, Streamflow $552M restored from a
  // wrongly-clamped $78M, etc.). Key bump force-flushes Vercel's Data
  // Cache so users see the new figures immediately rather than waiting
  // out the 5-min TTL. v5 lasted from the page-data-fallback work.
  // v11 = flush the poisoned all-null-stats entry that rendered "0 streams
  // indexed" (2026-06-04). Paired with the all-null guard above.
  ["protocols-page-data-v11"],
  {
    revalidate: CACHE_TTL_SECONDS,
    tags: ["protocols-page"],
  },
);

export type ProtocolsPageData = Awaited<ReturnType<typeof loadProtocolsData>>;
