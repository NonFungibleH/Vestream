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
  params: Promise<{ protocol: string }>;
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
  let countLine = "";
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await getUnlocksInWindow(now, now + 365 * 86400, 500, meta.adapterIds);
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

export default async function ProtocolUnlocksPage({ params }: PageParams) {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta) notFound();

  // 365-day forward window — broad enough to surface most schedules,
  // bounded enough to keep the page readable. The 500-row pool cap in
  // getUnlocksInWindow keeps the SQL cheap even on heavy-vest protocols.
  const now = Math.floor(Date.now() / 1000);
  const result = await getUnlocksInWindow(now, now + 365 * 86400, 500, meta.adapterIds);

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
        startDate: g.endTime ? new Date(g.endTime * 1000).toISOString() : undefined,
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
          Every scheduled unlock on {meta.name} for the next 12 months — sorted by time. Mass distributions to many wallets are collapsed into a single row. Click any token for the full per-token schedule.
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
                      {g.endTime ? fmtDateUtc(g.endTime) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: meta.color }}>
                      {relativeTimeUntil(g.endTime)}
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
