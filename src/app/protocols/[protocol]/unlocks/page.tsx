// /protocols/[slug]/unlocks — protocol-specific unlock calendar.
//
// Sits one level beneath the protocol detail page (/protocols/[slug]) and
// targets the long-tail commercial-intent queries:
//   "Sablier upcoming unlocks", "Hedgey unlock calendar",
//   "UNCX next unlock", "Team Finance unlock schedule"
//
// We already rank for "[Protocol] vesting" via the parent page; this child
// page captures the unlocks-specific intent which is a distinct query class
// with its own search volume.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getProtocol, listProtocols } from "@/lib/protocol-constants";
import { getUnlocksInWindow } from "@/lib/vesting/unlock-windows";
import { CHAIN_NAMES } from "@/lib/vesting/types";

// ISR: 1h refresh — unlocks are time-sensitive but not by-the-second.
export const revalidate = 3600;

// Pre-render every protocol slug at build time.
export function generateStaticParams() {
  return listProtocols().map((p) => ({ protocol: p.slug }));
}

interface PageParams {
  params:       Promise<{ protocol: string }>;
  searchParams: Promise<{ chain?: string }>;
}

// Parse a chain query param. Accepts numeric chain id ("1", "137") or a
// short slug ("ethereum", "bsc", "polygon", "base"). Returns null when the
// param is missing or unrecognised — calling code treats null as "all chains".
const CHAIN_SLUG_TO_ID: Record<string, number> = {
  ethereum: 1,    eth: 1,    mainnet: 1,
  bsc:      56,   bnb: 56,   "bnb-chain": 56,
  polygon:  137,  matic: 137,
  base:     8453,
};
function parseChainParam(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return CHAIN_SLUG_TO_ID[trimmed] ?? null;
}

// ── Helpers (mirror /unlocks/[range] — kept colocated for now; extract to
//    shared lib once a third surface needs them) ───────────────────────────

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
  if (!amount) return "—";
  try {
    const n = Number(BigInt(amount)) / Math.pow(10, decimals);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)   return n.toFixed(2);
    return n.toFixed(4);
  } catch {
    return "—";
  }
}

function relativeTimeUntil(endTimeSec: number | null): string {
  if (!endTimeSec) return "—";
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

// ── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta) return { title: "Not found" };

  const url = `https://vestream.io/protocols/${meta.slug}/unlocks`;

  // Live count for the description so SERPs show fresh numbers.
  // 5y window matches the page-render query — see comment there.
  let countLine = "";
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await getUnlocksInWindow(now, now + 5 * 365 * 86400, 2000, meta.adapterIds);
    if (result.stats.unlockCount > 0) {
      countLine = `${result.stats.unlockCount} upcoming unlocks across ${result.stats.tokenCount} tokens. `;
    }
  } catch { /* fall through */ }

  return {
    title:       `${meta.name} upcoming unlocks — full schedule | Vestream`,
    description: `${countLine}Live calendar of every upcoming ${meta.name} token unlock. Per-token amounts, dates, and recipient counts.`.slice(0, 160),
    alternates:  { canonical: url },
    openGraph: {
      title:       `${meta.name} upcoming unlocks — Vestream`,
      description: `Live calendar of every upcoming ${meta.name} token unlock.`,
      url,
      siteName:    "Vestream",
      type:        "website",
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function ProtocolUnlocksPage({ params, searchParams }: PageParams) {
  const { protocol } = await params;
  const sp = await searchParams;
  const meta = getProtocol(protocol);
  if (!meta) notFound();

  // Chain filter from ?chain=... query param. Null = no filter (show all chains).
  const filterChainId = parseChainParam(sp.chain);
  const chainFilter   = filterChainId ? [filterChainId] : undefined;

  // 5-year forward window — broad enough to capture multi-year team vests
  // (Team Finance's typical 2-4 year linear schedules don't have discrete
  // "events" before completion, so a 365-day window misses 90%+ of active
  // positions). Pool of 2000 is sized to stay under Vercel's gateway
  // timeout for Sablier-scale protocols; the SQL endTime pre-filter and
  // ORDER BY in `getUnlocksInWindow` ensure those 2000 are the soonest-
  // ending streams, which is exactly the calendar slice users want.
  // Fail-soft: at build time CI has no DB access, so a query failure
  // renders an empty state and ISR refreshes on first runtime request.
  const now = Math.floor(Date.now() / 1000);
  const FIVE_YEARS_SEC = 5 * 365 * 86400;
  let result;
  try {
    result = await getUnlocksInWindow(now, now + FIVE_YEARS_SEC, 2000, meta.adapterIds, chainFilter);
  } catch (err) {
    console.warn(`[protocol-unlocks] DB unavailable for ${meta.slug}; rendering empty state:`, err);
    result = { groups: [], stats: { unlockCount: 0, tokenCount: 0, chainCount: 0, walletCount: 0, byToken: [] } };
  }

  // ItemList JSON-LD — unlock events scoped to this protocol.
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
        location:  { "@type": "VirtualLocation", url: `https://vestream.io/token/${g.chainId}/${g.tokenAddress}` },
        organizer: { "@type": "Organization", name: meta.name },
      },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",      item: "https://vestream.io/" },
      { "@type": "ListItem", position: 2, name: "Protocols", item: "https://vestream.io/protocols" },
      { "@type": "ListItem", position: 3, name: meta.name,   item: `https://vestream.io/protocols/${meta.slug}` },
      { "@type": "ListItem", position: 4, name: "Unlocks",   item: `https://vestream.io/protocols/${meta.slug}/unlocks` },
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
        </h1>
        <p className="text-base max-w-2xl leading-relaxed mb-6" style={{ color: "#475569" }}>
          Every active vesting schedule on {meta.name} — sorted by next unlock event. Mass distributions to many wallets are collapsed into a single row. Click any token for the full per-token schedule.
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
            URL — shareable, bookmarkable, indexable by Google. The active
            pill picks up the protocol's brand colour so the filter feels
            like part of the page, not a generic chrome. */}
        {meta.chainIds.length > 1 && (
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold tracking-widest uppercase mr-1" style={{ color: "#B8BABD" }}>
              Filter
            </span>
            <ChainPill href={`/protocols/${meta.slug}/unlocks`} active={!filterChainId} accent={meta.color}>
              All chains
            </ChainPill>
            {meta.chainIds.map((cid) => {
              const chainName = CHAIN_NAMES[cid as keyof typeof CHAIN_NAMES] ?? `chain ${cid}`;
              return (
                <ChainPill
                  key={cid}
                  href={`/protocols/${meta.slug}/unlocks?chain=${cid}`}
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
            {result.groups.map((g, i) => {
              const chainName = CHAIN_NAMES[g.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${g.chainId}`;
              return (
                <Link
                  key={g.groupKey}
                  href={`/token/${g.chainId}/${g.tokenAddress}`}
                  className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-3 hover:bg-slate-50 transition-colors"
                  style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : undefined }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
                    style={{ background: meta.color }}>
                    {tokenInitial(g.tokenSymbol, g.tokenAddress)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "#1A1D20" }}>
                      {fmtTokenAmount(g.amount, g.tokenDecimals)} {tokenLabel(g.tokenSymbol, g.tokenAddress)}
                    </p>
                    <p className="text-xs truncate" style={{ color: "#8B8E92" }}>
                      {chainName}
                      {g.walletCount > 1 && (
                        <>
                          <span style={{ color: "#B8BABD" }}> · </span>
                          {g.walletCount} wallets
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-xs font-semibold" style={{ color: "#1A1D20" }}>
                      {g.eventTime ? fmtDateUtc(g.eventTime) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: meta.color }}>
                      {relativeTimeUntil(g.eventTime)}
                    </p>
                  </div>
                </Link>
              );
            })}
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
