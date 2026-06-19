// /dashboard/smart-money
// ─────────────────────────────────────────────────────────────────────────────
// Smart Money leaderboard — wallets ranked by a USD-weighted blend of locked
// vesting value and token breadth. Cross-protocol, cross-chain, refreshed
// daily. (Ranking weights live in /api/cron/smart-money.)
//
// Why this page exists: nobody else has cross-protocol recipient data at this
// scale. A wallet receiving vestings of 200 distinct tokens is clearly a
// fund/whale/aggregator — the kind of signal traders pay attention to. This
// is the alpha-discovery surface that gives crypto-native users a reason to
// visit even when their own portfolio is quiet. Mission alignment: "track
// every token unlock" = "see who else is."
//
// Architecture:
//   - Server component (no interactivity beyond Links). ISR-cached with 1h
//     revalidation. The underlying snapshot table updates daily at 03:30
//     UTC via /api/cron/smart-money — the page just reads it.
//   - Filter chips ("All / EVM / Solana") are PATH segments via
//     searchParams which would dynamicize; instead, all three views are
//     server-rendered into one HTML and shown/hidden via the active filter
//     in a tiny client island.
//   - Click a wallet → /dashboard/explorer?mode=wallet&q={addr}. The
//     "Also vesting" strip already exists on that view (sub-project C),
//     so the click-through has somewhere meaningful to land.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { smartMoneySnapshot } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { formatUsdCompact } from "@/lib/vesting/quick-prices";
import { SmartMoneyFilter } from "./SmartMoneyFilter";

export const revalidate = 3600; // page-level ISR — the cron writes every 24h
                                // so anything tighter than ~1h is wasted.

interface SnapshotRow {
  rank:               number;
  recipient:          string;
  chainEcosystem:     "evm" | "solana";
  distinctTokenCount: number;
  streamCount:        number;
  totalLockedUsd:     string | null; // numeric column → drizzle returns string
  topTokensJson:      Array<{
    chainId:      number;
    tokenAddress: string;
    symbol:       string | null;
    usdValue:     number | null;
  }>;
  // Epoch ms (not Date) so the row survives unstable_cache's JSON
  // serialization — a Date would come back as a string and break getTime().
  computedAt:         number;
}

function shortAddr(a: string): string {
  if (!a) return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// The snapshot table is rewritten once a day by the cron, so the query
// result is cacheable for an hour. Wrapping it in unstable_cache means the
// per-request DB round-trip is skipped on warm cache — the dashboard layout
// reads cookies (which dynamicises the route, killing the page-level
// `revalidate`), so without this the leaderboard re-queried Postgres on every
// navigation. Now the heavy read happens at most once per hour across all
// visitors. JSON-serialised payload: computedAt is epoch ms, totalLockedUsd a
// string, topTokensJson plain JSON — no BigInt/Date, so the cache write is safe.
const loadSnapshotCached = unstable_cache(
  async (): Promise<SnapshotRow[]> => {
    const rows = await db
      .select()
      .from(smartMoneySnapshot)
      .orderBy(asc(smartMoneySnapshot.rank));
    return rows.map((r) => ({
      rank:               r.rank,
      recipient:          r.recipient,
      chainEcosystem:     r.chainEcosystem as "evm" | "solana",
      distinctTokenCount: r.distinctTokenCount,
      streamCount:        r.streamCount,
      totalLockedUsd:     r.totalLockedUsd,
      topTokensJson:      r.topTokensJson,
      computedAt:         r.computedAt.getTime(),
    }));
  },
  ["smart-money-snapshot-v1"],
  { revalidate: 3600, tags: ["smart-money"] },
);

async function loadSnapshot(): Promise<SnapshotRow[]> {
  // Build-phase short-circuit — DB-touching helpers must skip the build per
  // CLAUDE.md (Postgres-pooler-drop-mid-build pattern). On runtime the
  // snapshot is served from the 1h cache; on build we bake the empty state
  // and ISR fills on the first revalidation.
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  try {
    return await loadSnapshotCached();
  } catch (err) {
    console.warn("[smart-money] snapshot read failed, rendering empty:", err);
    return [];
  }
}

export const metadata = {
  title: "Smart Money — Vestream",
  description: "Wallets receiving vestings of the most distinct tokens across all indexed protocols. Daily snapshot.",
};

export default async function SmartMoneyPage() {
  const rows = await loadSnapshot();
  const lastComputedAt = rows[0]?.computedAt ?? null;
  const evmCount = rows.filter((r) => r.chainEcosystem === "evm").length;
  const solanaCount = rows.filter((r) => r.chainEcosystem === "solana").length;

  return (
    <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8 w-full">
      {/* Breadcrumb + hero */}
      <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
        <Link href="/dashboard" className="hover:underline">Dashboard</Link>
        <span>/</span>
        <span>Smart Money</span>
      </div>
      <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
        style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
        Smart Money
      </div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1"
        style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
        Who&apos;s vesting everything
      </h1>
      <p className="text-sm mb-6 max-w-2xl" style={{ color: "var(--preview-text-2)" }}>
        Top 100 wallets ranked by a blend of <strong style={{ color: "var(--preview-text)" }}>locked value</strong> and <strong style={{ color: "var(--preview-text)" }}>token breadth</strong> — surfacing funds, treasuries, and aggregators with real positions, not just dust. Sort by any column, and click a wallet to drill into its full positions.
      </p>

      {/* Stats strip */}
      <div className="rounded-2xl border p-4 mb-5 grid grid-cols-2 md:grid-cols-4 gap-3"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        <div>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>Wallets ranked</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>{rows.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>EVM</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>{evmCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>Solana</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>{solanaCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>Updated</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>
            {lastComputedAt ? formatRelative(new Date(lastComputedAt)) : "—"}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--preview-border)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text-2)" }}>
            No snapshot yet
          </p>
          <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>
            The smart-money cron runs daily at 03:30 UTC — check back after the next run.
          </p>
        </div>
      ) : (
        <SmartMoneyFilter rows={rows} />
      )}
    </main>
  );
}

function formatRelative(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)        return "just now";
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export { shortAddr };
