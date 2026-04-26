// /unlocks/[range] — date-windowed unlock landing pages.
//
// Each window slug (today, tomorrow, this-week, etc.) is statically
// pre-rendered + ISR-revalidated every hour, so search engines see fresh
// numbers without us hitting the DB on every crawler request.
//
// SEO targets per page:
//   - title includes the window label + UTC date for freshness
//   - meta description quotes live unlock count + total tokens
//   - JSON-LD ItemList lets Google show rich-result event cards
//   - dynamic OG image with per-window stats (uses parent /unlocks default
//     until we ship per-window dynamic OGs)

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import {
  ALL_WINDOW_SLUGS,
  WINDOWS,
  WindowSlug,
  getUnlocksInWindow,
} from "@/lib/vesting/unlock-windows";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { listProtocols } from "@/lib/protocol-constants";

// ISR — re-render every hour. Long enough to keep DB load down, short enough
// that "next 24h" stays accurate to the hour.
export const revalidate = 3600;

// Pre-render every window at build time so first-request latency is zero.
export function generateStaticParams() {
  return ALL_WINDOW_SLUGS.map((range) => ({ range }));
}

interface PageParams {
  params: Promise<{ range: string }>;
}

// ── Helpers (page-local — small enough to keep colocated) ───────────────────

function isWindowSlug(s: string): s is WindowSlug {
  return ALL_WINDOW_SLUGS.includes(s as WindowSlug);
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

// When a token has no symbol (or has the cache's literal "UNKNOWN"
// placeholder, which adapters write when the ERC-20 metadata call
// fails or the token doesn't implement IERC20Metadata), fall back to
// a truncated contract address. Keeps the row useful for visitors
// who recognise the address from Etherscan / DexScreener — and an
// address truncation is more honest than "Unknown" for tokens that
// genuinely exist on-chain.
function isMissingSymbol(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  return t === "" || t.toLowerCase() === "unknown";
}

function tokenLabel(symbol: string | null, address: string): string {
  if (!isMissingSymbol(symbol)) return symbol!;
  if (address && address.length >= 10) {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }
  return address || "Unknown";
}

function tokenInitial(symbol: string | null, address: string): string {
  if (!isMissingSymbol(symbol)) return symbol!.slice(0, 2).toUpperCase();
  // Use chars 2-3 of address (skip the 0x prefix on EVM, or the first
  // two real chars on Solana base58).
  if (address && address.length >= 4) {
    const start = address.startsWith("0x") ? 2 : 0;
    return address.slice(start, start + 2).toUpperCase();
  }
  return "?";
}

function relativeTimeUntil(endTimeSec: number | null): string {
  if (!endTimeSec) return "—";
  const diff = endTimeSec - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "now";
  if (diff < 3600)    return `in ${Math.round(diff / 60)}m`;
  if (diff < 86400)   return `in ${Math.round(diff / 3600)}h`;
  if (diff < 86400 * 7)  return `in ${Math.round(diff / 86400)}d`;
  return `in ${Math.round(diff / 86400)}d`;
}

function fmtDateUtc(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

const PROTOCOL_LOOKUP = (() => {
  const protos = listProtocols();
  return new Map(protos.map((p) => [p.slug, p]));
})();

function protocolDisplay(id: string): { name: string; color: string } {
  const meta = PROTOCOL_LOOKUP.get(id);
  if (meta) return { name: meta.name, color: meta.color };
  return { name: id, color: "#8B8E92" };
}

// ── Per-window metadata ─────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { range } = await params;
  if (!isWindowSlug(range)) return { title: "Not found" };

  const def     = WINDOWS[range];
  const ranges  = def.range();
  const dateStr = fmtDateUtc(Math.floor(Date.now() / 1000));

  // Pull a quick count for the meta description so Google snippets show
  // live numbers. This adds one DB round-trip per metadata generation, but
  // since metadata + page render happen on the same request and ISR caches
  // the result for 1h, the cost is negligible.
  let countLine = "";
  try {
    const result = await getUnlocksInWindow(ranges.startSec, ranges.endSec);
    if (result.stats.unlockCount > 0) {
      countLine = `${result.stats.unlockCount} unlocks across ${result.stats.tokenCount} tokens. `;
    }
  } catch {
    // Fall through with no count
  }

  const title  = `Token unlocks ${def.label.toLowerCase()} — ${dateStr} | Vestream`;
  const desc   = `${countLine}${def.description} Live data from Vestream's index of 9 vesting protocols.`;
  const url    = `https://vestream.io/unlocks/${range}`;

  return {
    title,
    description: desc.slice(0, 160),
    alternates:  { canonical: url },
    openGraph: {
      title,
      description: desc.slice(0, 200),
      url,
      siteName: "Vestream",
      type:     "website",
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description: desc.slice(0, 200),
    },
  };
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function WindowPage({ params }: PageParams) {
  const { range } = await params;
  if (!isWindowSlug(range)) notFound();

  const def    = WINDOWS[range];
  const ranges = def.range();
  const result = await getUnlocksInWindow(ranges.startSec, ranges.endSec);

  // ItemList JSON-LD — every unlock as an Event so Google can render rich
  // event-result cards in SERPs. Capped at 50 items (Google's practical
  // upper bound for ItemList rich results).
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type":    "ItemList",
    name:       `Token unlocks ${def.label.toLowerCase()}`,
    description: def.description,
    numberOfItems: result.groups.length,
    itemListElement: result.groups.slice(0, 50).map((g, i) => ({
      "@type":   "ListItem",
      position:  i + 1,
      item: {
        "@type":      "Event",
        name:         `${g.tokenSymbol ?? "Unknown"} unlock — ${fmtTokenAmount(g.amount, g.tokenDecimals)} ${g.tokenSymbol ?? ""}`,
        startDate:    g.endTime ? new Date(g.endTime * 1000).toISOString() : undefined,
        location: {
          "@type": "VirtualLocation",
          url:     `https://vestream.io/token/${g.chainId}/${g.tokenAddress}`,
        },
        organizer: {
          "@type": "Organization",
          name:    protocolDisplay(g.protocol).name,
        },
      },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",    item: "https://vestream.io/" },
      { "@type": "ListItem", position: 2, name: "Unlocks", item: "https://vestream.io/unlocks" },
      { "@type": "ListItem", position: 3, name: def.label, item: `https://vestream.io/unlocks/${range}` },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <SiteNav theme="light" />

      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      <div
        className="w-full pt-16 md:pt-20"
        style={{ borderBottom: "1px solid rgba(21,23,26,0.06)" }}
      >
        <nav aria-label="Breadcrumb" className="px-4 md:px-8 py-3 max-w-5xl mx-auto w-full">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li><Link href="/" className="hover:underline transition-colors" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li><Link href="/unlocks" className="hover:underline transition-colors" style={{ color: "#8B8E92" }}>Unlocks</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>{def.label}</li>
          </ol>
        </nav>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pt-8 md:pt-12 pb-10 md:pb-14 max-w-5xl mx-auto w-full">
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>
          Token unlock calendar · {def.label}
        </p>
        <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          Token unlocks {def.label.toLowerCase()}
        </h1>
        <p className="text-base max-w-2xl leading-relaxed mb-6" style={{ color: "#475569" }}>
          {def.description}
        </p>

        {/* Stat strip */}
        <div className="rounded-2xl px-4 py-4 md:px-6 md:py-5 grid grid-cols-2 md:grid-cols-4 gap-4"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
          <Stat label="Unlocks" value={result.stats.unlockCount.toLocaleString()} />
          <Stat label="Tokens" value={result.stats.tokenCount.toLocaleString()} />
          <Stat label="Chains" value={result.stats.chainCount.toLocaleString()} />
          <Stat label="Wallets" value={result.stats.walletCount.toLocaleString()} />
        </div>
      </section>

      {/* ── Top tokens by amount (only if there are unlocks) ──────────── */}
      {result.stats.byToken.length > 0 && (
        <section className="px-4 md:px-8 pb-12 max-w-5xl mx-auto w-full">
          <h2 className="text-xl md:text-2xl font-bold mb-1" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
            Biggest unlocks {def.label.toLowerCase()}
          </h2>
          <p className="text-sm mb-4" style={{ color: "#8B8E92" }}>
            Sorted by total token amount unlocking in the window. Click a token for the per-token unlock schedule.
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
            {result.stats.byToken.slice(0, 10).map((t, i) => {
              // Find the first matching group for the chain context
              const first = result.groups.find((g) => g.tokenAddress.toLowerCase() === t.address);
              const chainId = first?.chainId;
              const decimals = first?.tokenDecimals ?? 18;
              return (
                <Link
                  key={t.address}
                  href={chainId ? `/token/${chainId}/${t.address}` : "#"}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
                  style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : undefined }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, #1CB8B8, #0F8A8A)` }}>
                    {tokenInitial(t.symbol, t.address)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "#1A1D20" }}>{tokenLabel(t.symbol, t.address)}</p>
                    {chainId && (
                      <p className="text-xs" style={{ color: "#8B8E92" }}>{CHAIN_NAMES[chainId as keyof typeof CHAIN_NAMES] ?? `chain ${chainId}`}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-base tabular-nums" style={{ color: "#0F8A8A" }}>
                      {fmtTokenAmount(t.amount.toString(), decimals)}
                    </p>
                    <p className="text-[10px]" style={{ color: "#B8BABD" }}>{isMissingSymbol(t.symbol) ? "tokens" : t.symbol}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Full unlock list ──────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto w-full">
        <h2 className="text-xl md:text-2xl font-bold mb-1" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
          All scheduled unlocks
        </h2>
        <p className="text-sm mb-4" style={{ color: "#8B8E92" }}>
          {result.groups.length === 0
            ? "No unlocks scheduled in this window. Try a longer one above."
            : `${result.groups.length} group${result.groups.length === 1 ? "" : "s"}, sorted by time. Mass distributions to many wallets are collapsed into a single row.`}
        </p>
        {result.groups.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
            {result.groups.map((g, i) => {
              const proto = protocolDisplay(g.protocol);
              const chainName = CHAIN_NAMES[g.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${g.chainId}`;
              return (
                <Link
                  key={g.groupKey}
                  href={`/token/${g.chainId}/${g.tokenAddress}`}
                  className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-3 hover:bg-slate-50 transition-colors"
                  style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : undefined }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
                    style={{ background: proto.color }}>
                    {tokenInitial(g.tokenSymbol, g.tokenAddress)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "#1A1D20" }}>
                      {fmtTokenAmount(g.amount, g.tokenDecimals)} {tokenLabel(g.tokenSymbol, g.tokenAddress)}
                    </p>
                    <p className="text-xs truncate" style={{ color: "#8B8E92" }}>
                      <span style={{ color: proto.color }}>{proto.name}</span>
                      <span style={{ color: "#B8BABD" }}> · </span>
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
                      {g.endTime ? fmtDateUtc(g.endTime) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: "#0F8A8A" }}>
                      {relativeTimeUntil(g.endTime)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Other windows ─────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 max-w-5xl mx-auto w-full">
        <h2 className="text-base font-bold mb-3" style={{ color: "#1A1D20" }}>Other windows</h2>
        <div className="flex flex-wrap gap-2">
          {ALL_WINDOW_SLUGS.filter((s) => s !== range).map((slug) => (
            <Link
              key={slug}
              href={`/unlocks/${slug}`}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: "white",
                border:     "1px solid rgba(21,23,26,0.10)",
                color:      "#475569",
              }}
            >
              {WINDOWS[slug].label}
            </Link>
          ))}
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
