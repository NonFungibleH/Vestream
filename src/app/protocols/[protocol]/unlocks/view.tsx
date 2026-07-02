// /protocols/[slug]/unlocks/view.tsx – shared renderer for the protocol
// unlock calendar, used by BOTH the unfiltered base page (./page.tsx) and
// the per-chain variants ([chain]/page.tsx).
//
// Why the split exists (2026-06-12): the chain filter used to be a
// ?chain= query param read via `searchParams` in the page – a request-time
// API that silently opted the route into dynamic rendering, turning its
// `revalidate = 3600` into dead code. Every request then ran the 2000-row
// getUnlocksInWindow query live (measured 9.8s TTFB in prod) with zero
// HTTP caching, which is what fed the Cloudflare QUIC-kill timeouts.
// Chain filters are now path segments (/unlocks/1, /unlocks/ethereum), so
// every variant is its own ISR-cached route and no render ever touches a
// request-time API.

import Link from "next/link";
import { unstable_cache } from "next/cache";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { PaywallTeaser } from "@/components/PaywallTeaser";
import type { ProtocolMeta } from "@/lib/protocol-constants";
import { getUnlocksInWindow, type WindowUnlockGroup } from "@/lib/vesting/unlock-windows";
import { CHAIN_NAMES } from "@/lib/vesting/types";

// Marketing-page tease: every visitor (anon, free, paid) sees the same
// top-N rows on this page and a "Sign up free → see all in dashboard"
// teaser below. Full calendar lives inside the authenticated dashboard.
const TEASER_VISIBLE_ROWS = 10;

const FIVE_YEARS_SEC = 5 * 365 * 86400;

// Parse a chain path/query param. Accepts numeric chain id ("1", "137") or
// a short slug ("ethereum", "bsc", "polygon", "base"). Returns null when
// missing or unrecognised – callers treat null as "all chains".
const CHAIN_SLUG_TO_ID: Record<string, number> = {
  ethereum: 1,    eth: 1,    mainnet: 1,
  bsc:      56,   bnb: 56,   "bnb-chain": 56,
  polygon:  137,  matic: 137,
  base:     8453,
  arbitrum: 42161, arb: 42161,
  optimism: 10,   op: 10,
  solana:   101,  sol: 101,
};
export function parseChainParam(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return CHAIN_SLUG_TO_ID[trimmed] ?? null;
}

/**
 * The page's single data dependency, in Vercel's Data Cache.
 *
 * 5-year forward window – broad enough to capture multi-year team vests
 * (typical 2-4 year linear schedules don't have discrete "events" before
 * completion, so a 365-day window misses 90%+ of active positions). Pool
 * of 2000 is sized to stay under gateway timeouts for Sablier-scale
 * protocols; the SQL endTime pre-filter and ORDER BY in
 * `getUnlocksInWindow` ensure those 2000 are the soonest-ending streams.
 *
 * Wrapped in unstable_cache so (a) generateMetadata and the page body
 * share one query per revalidation window instead of two, and (b) ISR
 * revalidations across the base + per-chain variants of the same protocol
 * stay cheap. `now` is computed INSIDE the callback – putting it in the
 * key would bust the cache every second.
 */
export const getCachedProtocolUnlocks = unstable_cache(
  async (slug: string, adapterIds: readonly string[], chainId: number | null) => {
    // THROW (don't return empty) during the build phase. unstable_cache never
    // caches a thrown error, so the first runtime request re-runs the query and
    // caches REAL data. Previously getUnlocksInWindow's own build-phase guard
    // returned EMPTY_WINDOW_RESULT, which got committed to this Data Cache entry
    // – and on these low-traffic deep-link pages the empty snapshot was served
    // ~indefinitely (every protocol's /unlocks page showed "No upcoming unlocks
    // indexed" despite the cache being full). Mirrors loadProtocolData in
    // ../page.tsx, which is why the detail page never had this bug.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      throw new Error("build-phase: skipping unlocks query – ISR fills at runtime");
    }
    const now = Math.floor(Date.now() / 1000);
    const result = await getUnlocksInWindow(
      now,
      now + FIVE_YEARS_SEC,
      2000,
      adapterIds,
      chainId ? [chainId] : undefined,
    );
    // unstable_cache JSON-serialises its payload, and stats.byToken carries
    // raw `bigint` amounts – JSON.stringify throws "Do not know how to
    // serialize a BigInt", the cache write rejects, and the query silently
    // re-runs on every request. Stringify the amounts (this page doesn't
    // render byToken anyway; /unlocks/[range] consumes it uncached).
    return {
      groups: result.groups,
      stats: {
        ...result.stats,
        byToken: result.stats.byToken.map((t) => ({ ...t, amount: t.amount.toString() })),
      },
    };
  },
  ["protocol-unlocks-v1"],
  { revalidate: 3600, tags: ["protocol-unlocks"] },
);

type UnlocksResult = Awaited<ReturnType<typeof getCachedProtocolUnlocks>>;

const EMPTY_RESULT: UnlocksResult = {
  groups: [],
  stats:  { unlockCount: 0, tokenCount: 0, chainCount: 0, walletCount: 0, byToken: [] },
};

// ── Formatting helpers (mirror /unlocks/[range] – kept colocated for now;
//    extract to a shared lib once a third surface needs them) ──────────────

function isMissingSymbol(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  return t === "" || t.toLowerCase() === "unknown";
}

function tokenLabel(symbol: string | null, address: string): string {
  if (!isMissingSymbol(symbol)) return symbol!;
  if (address && address.length >= 10) return `${address.slice(0, 6)}…${address.slice(-4)}`;
  return address || "Unknown";
}

function tokenInitial(symbol: string | null, address: string): string {
  if (!isMissingSymbol(symbol)) return symbol!.slice(0, 2).toUpperCase();
  if (address && address.length >= 4) {
    const start = address.startsWith("0x") ? 2 : 0;
    return address.slice(start, start + 2).toUpperCase();
  }
  return "?";
}

function fmtTokenAmount(amount: string | null, decimals: number): string {
  if (!amount) return "–";
  try {
    const n = Number(BigInt(amount)) / Math.pow(10, decimals);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)   return n.toFixed(2);
    return n.toFixed(4);
  } catch {
    return "–";
  }
}

function relativeTimeUntil(endTimeSec: number | null): string {
  if (!endTimeSec) return "–";
  const diff = endTimeSec - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "now";
  if (diff < 3600)    return `in ${Math.round(diff / 60)}m`;
  if (diff < 86400)   return `in ${Math.round(diff / 3600)}h`;
  return `in ${Math.round(diff / 86400)}d`;
}

function fmtDateUtc(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export { tokenLabel };

// ── View ──────────────────────────────────────────────────────────────────

export async function ProtocolUnlocksView({
  meta,
  filterChainId,
}: {
  meta:          ProtocolMeta;
  filterChainId: number | null;
}) {
  // Fail-soft: at build time CI has no DB access, and a runtime DB blip
  // shouldn't 500 a marketing page – render the empty state; ISR retries
  // on the next revalidation.
  let result: UnlocksResult;
  try {
    result = await getCachedProtocolUnlocks(meta.slug, meta.adapterIds, filterChainId);
  } catch (err) {
    console.warn(`[protocol-unlocks] DB unavailable for ${meta.slug}; rendering empty state:`, err);
    result = EMPTY_RESULT;
  }
  // Top N visible to everyone, rest blurred behind the signup CTA.
  // Pre-computed here (not inside JSX) – Turbopack mishandles IIFE-scoped
  // references to outer-function `const` bindings inside RSC-compiled JSX.
  const visibleRows = result.groups.slice(0, TEASER_VISIBLE_ROWS);
  const gatedRows   = result.groups.slice(TEASER_VISIBLE_ROWS);

  // Chain pills should only offer chains that ACTUALLY have an upcoming unlock —
  // otherwise an integrated-but-idle chain (e.g. Team Finance on Base, 0 upcoming
  // unlocks) shows a filter chip that leads to an empty page and contradicts the
  // "Chains" stat. Derived UNFILTERED so the pill set is identical on every
  // per-chain view; when already unfiltered we reuse `result` (no extra query).
  let allGroups = result.groups;
  if (filterChainId != null) {
    try {
      allGroups = (await getCachedProtocolUnlocks(meta.slug, meta.adapterIds, null)).groups;
    } catch { /* fall back to the filtered set */ }
  }
  const chainsWithUnlocks = new Set(allGroups.map((g) => g.chainId));
  // Keep the currently-selected chain in the list even if it has none, so its
  // active pill still renders when someone deep-links to an idle chain.
  const filterChains = meta.chainIds.filter((cid) => chainsWithUnlocks.has(cid) || cid === filterChainId);

  // ItemList JSON-LD – unlock events scoped to this protocol.
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type":    "ItemList",
    name:       `${meta.name} upcoming unlocks`,
    description: `Live calendar of every upcoming ${meta.name} token unlock.`,
    numberOfItems: result.groups.length,
    itemListElement: result.groups.slice(0, 50).map((g, i) => ({
      "@type":   "ListItem",
      position:  i + 1,
      item: {
        "@type":   "Event",
        name:      `${tokenLabel(g.tokenSymbol, g.tokenAddress)} unlock`,
        startDate: g.eventTime ? new Date(g.eventTime * 1000).toISOString() : undefined,
        location:  { "@type": "VirtualLocation", url: `https://www.vestream.io/token/${g.chainId}/${g.tokenAddress}` },
        organizer: { "@type": "Organization", name: meta.name },
      },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",      item: "https://www.vestream.io/" },
      { "@type": "ListItem", position: 2, name: "Protocols", item: "https://www.vestream.io/protocols" },
      { "@type": "ListItem", position: 3, name: meta.name,   item: `https://www.vestream.io/protocols/${meta.slug}` },
      { "@type": "ListItem", position: 4, name: "Unlocks",   item: `https://www.vestream.io/protocols/${meta.slug}/unlocks` },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <SiteNav theme="light" />

      {/* ── Hero (breadcrumb integrated, no separate bar) ─────────────── */}
      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-10 md:pb-14 max-w-5xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li><Link href="/" className="hover:underline" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li><Link href="/protocols" className="hover:underline" style={{ color: "#8B8E92" }}>Protocols</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li><Link href={`/protocols/${meta.slug}`} className="hover:underline" style={{ color: "#8B8E92" }}>{meta.name}</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Unlocks</li>
          </ol>
        </nav>
        <div className="flex items-center gap-3 mb-3">
          <span
            className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase"
            style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
          >
            {meta.name}
          </span>
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8B8E92" }}>
            Upcoming unlocks
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          {meta.name} upcoming unlocks
          {filterChainId != null && (
            <span style={{ color: "#8B8E92" }}>
              {" "}on {CHAIN_NAMES[filterChainId as keyof typeof CHAIN_NAMES] ?? `chain ${filterChainId}`}
            </span>
          )}
        </h1>
        <p className="text-base max-w-2xl leading-relaxed mb-6" style={{ color: "#475569" }}>
          Every active vesting schedule on {meta.name} – sorted by next unlock event. Mass distributions to many wallets are collapsed into a single row. Click any token for the full per-token schedule.
        </p>

        {/* Stat strip */}
        <div className="rounded-2xl px-4 py-4 md:px-6 md:py-5 grid grid-cols-2 md:grid-cols-4 gap-4"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
          <Stat label="Unlocks" value={result.stats.unlockCount.toLocaleString()} />
          <Stat label="Tokens" value={result.stats.tokenCount.toLocaleString()} />
          <Stat label="Chains" value={result.stats.chainCount.toLocaleString()} />
          <Stat label="Wallets" value={result.stats.walletCount.toLocaleString()} />
        </div>

        {/* ── Chain filter pills ─────────────────────────────────────────
            Server-rendered Links so each filtered view is a fully-formed
            URL – shareable, bookmarkable, indexable by Google, and (since
            2026-06-12) a PATH segment rather than a query param so every
            variant is ISR-cached. The active pill picks up the protocol's
            brand colour so the filter feels like part of the page. */}
        {filterChains.length > 1 && (
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold tracking-widest uppercase mr-1" style={{ color: "#B8BABD" }}>
              Filter
            </span>
            <ChainPill href={`/protocols/${meta.slug}/unlocks`} active={!filterChainId} accent={meta.color}>
              All chains
            </ChainPill>
            {filterChains.map((cid) => {
              const chainName = CHAIN_NAMES[cid as keyof typeof CHAIN_NAMES] ?? `chain ${cid}`;
              return (
                <ChainPill
                  key={cid}
                  href={`/protocols/${meta.slug}/unlocks/${cid}`}
                  active={filterChainId === cid}
                  accent={meta.color}
                >
                  {chainName}
                </ChainPill>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Unlock list ───────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto w-full">
        {result.groups.length === 0 ? (
          <div className="rounded-2xl px-5 py-8 text-center"
            style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
            <p className="text-sm" style={{ color: "#8B8E92" }}>
              No upcoming unlocks indexed for {meta.name} in the next 12 months. Check back as the cache fills.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
            {visibleRows.map((g, i) => (
              <ProtocolUnlockRow
                key={g.groupKey}
                group={g}
                accent={meta.color}
                showTopBorder={i > 0}
              />
            ))}
            {gatedRows.length > 0 && (
              <PaywallTeaser
                hiddenLabel={`${gatedRows.length} more ${meta.name} unlock${gatedRows.length === 1 ? "" : "s"}`}
                headline={`See all ${meta.name} unlocks`}
                subline="Free account · full calendar in your dashboard · alerts on the events you care about"
              >
                {/* First 4 gated rows only – enough to suggest "there's more"
                    without rendering 100+ blurred rows of dead DOM weight.
                    The hiddenLabel above already communicates the full count. */}
                {gatedRows.slice(0, 4).map((g) => (
                  <ProtocolUnlockRow
                    key={g.groupKey}
                    group={g}
                    accent={meta.color}
                    showTopBorder={true}
                  />
                ))}
              </PaywallTeaser>
            )}
          </div>
        )}
      </section>

      {/* ── Cross-link back ───────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 max-w-5xl mx-auto w-full">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/protocols/${meta.slug}`}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", color: "#475569" }}
          >
            ← Back to {meta.name}
          </Link>
          <Link
            href="/unlocks"
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", color: "#475569" }}
          >
            All protocols calendar
          </Link>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}

function ProtocolUnlockRow({
  group, accent, showTopBorder,
}: {
  group:         WindowUnlockGroup;
  accent:        string;
  showTopBorder: boolean;
}) {
  const chainName = CHAIN_NAMES[group.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${group.chainId}`;
  return (
    <Link
      href={`/token/${group.chainId}/${group.tokenAddress}`}
      className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-3 hover:bg-slate-50 transition-colors"
      style={{ borderTop: showTopBorder ? "1px solid rgba(0,0,0,0.05)" : undefined }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
        style={{ background: accent }}>
        {tokenInitial(group.tokenSymbol, group.tokenAddress)}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: "#1A1D20" }}>
          {fmtTokenAmount(group.amount, group.tokenDecimals)} {tokenLabel(group.tokenSymbol, group.tokenAddress)}
        </p>
        <p className="text-xs truncate" style={{ color: "#8B8E92" }}>
          {chainName}
          {group.walletCount > 1 && (
            <>
              <span style={{ color: "#B8BABD" }}> · </span>
              {group.walletCount} wallets
            </>
          )}
        </p>
      </div>
      <div className="text-right hidden md:block">
        <p className="text-xs font-semibold" style={{ color: "#1A1D20" }}>
          {group.eventTime ? fmtDateUtc(group.eventTime) : "–"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs font-semibold tabular-nums" style={{ color: accent }}>
          {relativeTimeUntil(group.eventTime)}
        </p>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl md:text-2xl font-bold tabular-nums" style={{ color: "#1A1D20" }}>{value}</div>
      <div className="text-xs uppercase tracking-widest" style={{ color: "#8B8E92" }}>{label}</div>
    </div>
  );
}

// Chain filter pill. Active pill picks up the protocol's brand colour;
// inactive pills render in a neutral white-on-grey treatment.
function ChainPill({
  href, active, accent, children,
}: {
  href:     string;
  active:   boolean;
  accent:   string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
      style={
        active
          ? { background: `${accent}15`, color: accent, border: `1px solid ${accent}40` }
          : { background: "white", color: "#475569", border: "1px solid rgba(21,23,26,0.10)" }
      }
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
