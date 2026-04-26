// /token/[symbol] — symbol-routed token landing page.
//
// Routing logic:
//   - 0 matches: 404
//   - 1 match:   308 redirect to /token/[chainId]/[address] (canonical)
//   - 2+ matches: render disambiguation page (USDC across 5 chains, etc.)
//
// SEO objective: capture branded queries like "ARB unlock", "OP vesting",
// "PEPE token cliff" — none of which currently land on the canonical
// chain+address URL because the URL doesn't contain the symbol.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getChainSummariesForSymbol, getTopSymbols } from "@/lib/vesting/token-symbols";
import { CHAIN_NAMES } from "@/lib/vesting/types";

// ISR — symbol → (chain, address) mapping rarely changes; cache for 6h.
export const revalidate = 21600;

// Pre-render top 200 symbols at build time. Long-tail symbols fall through
// to on-demand ISR — Next.js generates them on first request and caches.
// Wrapped in try/catch so a DB hiccup at build time doesn't kill the build;
// we'll still have on-demand generation as the safety net.
export async function generateStaticParams() {
  try {
    const symbols = await getTopSymbols(200);
    return symbols.map((symbol) => ({ symbol }));
  } catch {
    return [];
  }
}

interface PageParams {
  params: Promise<{ symbol: string }>;
}

function fmtTokenAmount(amount: string, decimals: number): string {
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

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { symbol } = await params;
  let matches: Awaited<ReturnType<typeof getChainSummariesForSymbol>> = [];
  try {
    matches = await getChainSummariesForSymbol(symbol);
  } catch {
    // Build-time DB outage — return a neutral title; ISR will re-render
    // proper metadata on first runtime request.
  }
  if (matches.length === 0) return { title: "Token not found — Vestream" };

  const display = matches[0]?.symbol ?? symbol.toUpperCase();
  const url     = `https://vestream.io/tokens/${symbol.toLowerCase()}`;

  // Single-chain symbol → metadata for the redirect target. Even though
  // the page never renders for single matches (we redirect), Next.js
  // surfaces the metadata for crawlers that hit /token/[symbol] directly
  // before following the redirect.
  if (matches.length === 1) {
    const m    = matches[0];
    const chain = CHAIN_NAMES[m.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${m.chainId}`;
    return {
      title:       `${display} unlock schedule on ${chain} — Vestream`,
      description: `Track ${display} vesting on ${chain} — ${m.streamCount.toLocaleString()} streams, ${m.walletCount.toLocaleString()} wallets, live unlock calendar.`,
      alternates:  { canonical: `https://vestream.io/token/${m.chainId}/${m.address}` },
    };
  }

  // Multi-chain — describe coverage in the snippet
  const chainList = matches.map((m) => CHAIN_NAMES[m.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${m.chainId}`).join(", ");
  return {
    title:       `${display} vesting & unlocks across ${matches.length} chains | Vestream`,
    description: `${display} is vesting on ${chainList}. Live unlock schedules, top recipients, and upcoming unlocks for each chain.`,
    alternates:  { canonical: url },
    openGraph: {
      title:       `${display} vesting & unlocks across ${matches.length} chains`,
      description: `Live ${display} unlock schedules across ${chainList}.`,
      url,
      siteName:    "Vestream",
      type:        "website",
    },
  };
}

export default async function TokenSymbolPage({ params }: PageParams) {
  const { symbol } = await params;
  // Fail-soft: at build time CI has no DB access, getChainSummariesForSymbol
  // throws. Treat that as "no matches" so the build doesn't fail; ISR
  // re-renders with real data on the first runtime request.
  let matches: Awaited<ReturnType<typeof getChainSummariesForSymbol>> = [];
  try {
    matches = await getChainSummariesForSymbol(symbol);
  } catch (err) {
    console.warn(`[token-symbol] DB unavailable for ${symbol}; treating as not-found:`, err);
  }

  if (matches.length === 0) notFound();

  // Single match → redirect to the canonical chain+address page.
  // Permanent redirect because the symbol ↔ canonical mapping is stable.
  if (matches.length === 1) {
    const m = matches[0];
    redirect(`/token/${m.chainId}/${m.address}`);
  }

  const display = matches[0]?.symbol ?? symbol.toUpperCase();
  const totalStreams = matches.reduce((s, m) => s + m.streamCount, 0);
  const totalWallets = matches.reduce((s, m) => s + m.walletCount, 0);

  // JSON-LD: ItemList of all chain-specific token pages, plus a Token
  // entity tying them together via @id.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type":    "ItemList",
    name:       `${display} vesting across ${matches.length} chains`,
    numberOfItems: matches.length,
    itemListElement: matches.map((m, i) => ({
      "@type":   "ListItem",
      position:  i + 1,
      item: {
        "@type": "WebPage",
        name:    `${display} vesting on ${CHAIN_NAMES[m.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${m.chainId}`}`,
        url:     `https://vestream.io/token/${m.chainId}/${m.address}`,
      },
    })),
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
            <li><Link href="/protocols" className="hover:underline transition-colors" style={{ color: "#8B8E92" }}>Protocols</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>{display}</li>
          </ol>
        </nav>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pt-8 md:pt-12 pb-10 md:pb-14 max-w-5xl mx-auto w-full">
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>
          Multi-chain token
        </p>
        <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          {display} vesting across {matches.length} chains
        </h1>
        <p className="text-base max-w-2xl leading-relaxed" style={{ color: "#475569" }}>
          {display} appears in indexed vesting positions on multiple chains. Pick a chain below for the full unlock schedule, top recipients, and upcoming events.
        </p>

        {/* Stat strip */}
        <div className="rounded-2xl px-4 py-4 md:px-6 md:py-5 mt-6 grid grid-cols-3 gap-4"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
          <Stat label="Chains" value={matches.length.toLocaleString()} />
          <Stat label="Streams" value={totalStreams.toLocaleString()} />
          <Stat label="Wallets" value={totalWallets.toLocaleString()} />
        </div>
      </section>

      {/* ── Per-chain cards ───────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto w-full">
        <h2 className="text-xl md:text-2xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
          By chain
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map((m) => {
            const chainName = CHAIN_NAMES[m.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${m.chainId}`;
            return (
              <Link
                key={`${m.chainId}-${m.address}`}
                href={`/token/${m.chainId}/${m.address}`}
                className="rounded-2xl p-5 transition-all hover:-translate-y-0.5"
                style={{
                  background: "white",
                  border:     "1px solid rgba(21,23,26,0.10)",
                  boxShadow:  "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                    style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)" }}
                  >
                    {(m.symbol || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-base font-bold" style={{ color: "#1A1D20" }}>{m.symbol}</p>
                    <p className="text-xs" style={{ color: "#8B8E92" }}>{chainName}</p>
                  </div>
                </div>
                <p className="text-[10px] font-mono mb-3 truncate" style={{ color: "#B8BABD" }}>
                  {m.address.slice(0, 10)}…{m.address.slice(-8)}
                </p>
                <div className="flex items-center gap-4 text-xs pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  <div>
                    <div className="font-semibold text-sm tabular-nums" style={{ color: "#1A1D20" }}>
                      {fmtTokenAmount(m.lockedAmount, m.decimals)}
                    </div>
                    <div style={{ color: "#B8BABD" }}>locked</div>
                  </div>
                  <div>
                    <div className="font-semibold text-sm tabular-nums" style={{ color: "#1A1D20" }}>
                      {m.streamCount.toLocaleString()}
                    </div>
                    <div style={{ color: "#B8BABD" }}>streams</div>
                  </div>
                  <div>
                    <div className="font-semibold text-sm tabular-nums" style={{ color: "#1A1D20" }}>
                      {m.walletCount.toLocaleString()}
                    </div>
                    <div style={{ color: "#B8BABD" }}>wallets</div>
                  </div>
                </div>
              </Link>
            );
          })}
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
