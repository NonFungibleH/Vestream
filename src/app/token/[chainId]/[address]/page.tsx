// src/app/token/[chainId]/[address]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CONCEPT — DexTools-style token explorer, vesting-first.
//
// This page is the canonical landing surface for "is $TOKEN safe given what's
// unlocking?" queries. It combines:
//   • Market data (price / FDV / liquidity / 24h change) from DexScreener
//   • Vesting aggregates from our seeded vestingStreamsCache
// into a single SEO-friendly Server Component.
//
// Three key numbers live above the fold:
//   • Locked USD / % of FDV — the overhang metric
//   • 30-day unlock pressure — near-term sell risk
//   • Recipient concentration — who holds the locked bag
//
// Below that, a 12-month stacked-bar unlock schedule and a top-recipient
// table. Each recipient row links back to their wallet view (future).
//
// Revalidates every 30 minutes. Was 60s until 2026-05-10; bumped as part
// of the egress-reduction pass after Supabase Free hit 244% of its 5 GB
// quota. The token page is the heaviest egress source in the app — each
// render fans out into 5 cache reads (overview, calendar, recipients,
// upcoming, market data), each potentially returning hundreds of stream
// rows. With 60s revalidation, popular tokens were producing thousands
// of full-row reads per day across the long tail. 30-min revalidate
// drops that 30×; price drift on this scale shows up in the linked
// DexScreener data anyway.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
import { blockExplorerAddressUrl } from "@/lib/chain-links";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { AppStoreBadges } from "@/components/AppStoreBadges";
import { PROTOCOLS } from "@/lib/protocol-constants";
import { TokenMetaPanel } from "@/components/TokenMetaPanel";
import { TokenPulse } from "@/components/TokenPulse";
import { TokenFAQ } from "@/components/TokenFAQ";
import { TokenPaywall } from "@/components/TokenPaywall";
import { CopyButton } from "@/components/CopyButton";
import { TokenShareRow } from "@/components/TokenShareRow";
import { buildTokenFAQ } from "@/lib/vesting/token-faq";
import { buildTokenPulse } from "@/lib/vesting/token-pulse";
import {
  getTokenOverview,
  getTokenUnlockCalendar,
  getTokenRecipients,
  getTokenUpcomingEvents,
  getTokenMarketData,
  type TokenOverview,
  type UnlockCalendarBucket,
  type TokenRecipient,
  type TokenUpcomingEvent,
  type TokenMarketData,
} from "@/lib/vesting/token-aggregates";
import { withTimeout } from "@/lib/with-timeout";

export const revalidate = 1800;

// REQUIRED for ISR on this canary (2026-06-12): without at least one
// static-params sample, `await params` counts as a request-time API and
// the route silently renders per-request — which is exactly what was
// happening in prod (this page served `private, no-cache, no-store`
// despite the revalidate above, and every visit ran the full DB fan-out
// live). One stable sample is enough to flip `params` prerender-safe;
// every other token renders on demand and is then ISR-cached. USDC on
// Ethereum — guaranteed to exist forever.
export function generateStaticParams() {
  return [{ chainId: "1", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" }];
}

// ─── Small presentational helpers ───────────────────────────────────────────

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
};

// Per-chain block-explorer hosts for the public token page. Same convention
// as the dashboard's BLOCK_EXPLORERS — duplicated here because the public
// page is a Server Component that doesn't import the dashboard module.
// 2026-05-14: shipped alongside lockTxHash plumbing so the upcoming-events
// list can link each event to its originating creation tx.
const BLOCK_EXPLORERS_PUBLIC: Record<number, string> = {
  1:     "https://etherscan.io",
  56:    "https://bscscan.com",
  137:   "https://polygonscan.com",
  8453:  "https://basescan.org",
  42161: "https://arbiscan.io",
  10:    "https://optimistic.etherscan.io",
  101:   "https://solscan.io",
};

function truncate(a: string, n = 4): string {
  return a.length < 10 ? a : `${a.slice(0, 6)}…${a.slice(-n)}`;
}

function fmtUsd(n: number | null, compact = true): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (compact) {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)   return `$${n.toFixed(2)}`;
    return `$${n.toPrecision(3)}`;
  }
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function relUntil(ts: number | null): string {
  if (!ts) return "—";
  const delta = ts - Math.floor(Date.now() / 1000);
  if (delta <= 0) return "now";
  if (delta < 3600) return `in ${Math.floor(delta / 60)} min`;
  if (delta < 86400) {
    const h = Math.floor(delta / 3600);
    return `in ${h}h`;
  }
  const d = Math.floor(delta / 86400);
  return d >= 30 ? `in ${Math.floor(d / 30)}mo` : `in ${d}d`;
}

function protocolColour(protocol: string): string {
  const meta = Object.values(PROTOCOLS).find((p) => p.adapterIds.includes(protocol));
  return meta?.color ?? "#8B8E92";
}

function protocolName(protocol: string): string {
  const meta = Object.values(PROTOCOLS).find((p) => p.adapterIds.includes(protocol));
  return meta?.name ?? protocol;
}

function protocolSlug(protocol: string): string | null {
  const meta = Object.values(PROTOCOLS).find((p) => p.adapterIds.includes(protocol));
  return meta?.slug ?? null;
}

// ─── Metadata ───────────────────────────────────────────────────────────────

interface Params { chainId: string; address: string }

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { chainId, address } = await params;
  const cid  = Number(chainId);
  const addr = normaliseAddress(decodeURIComponent(address));
  if (!CHAIN_NAMES[cid]) return { title: "Token not found — Vestream" };

  // Same allSettled pattern as the page render below — if metadata
  // generation throws, Next fails the whole page with a 500 instead
  // of rendering. Two fallbacks keep title/description sensible.
  // Bounded — generateMetadata blocks the response head; a stalled query here
  // hangs the page just like the body fan-out below.
  const [overviewRes, marketRes] = await Promise.allSettled([
    withTimeout(getTokenOverview(cid, addr), 8_000, null, "pubtoken-meta:overview"),
    withTimeout(getTokenMarketData(cid, addr), 6_000, null, "pubtoken-meta:market"),
  ]);
  const overview = overviewRes.status === "fulfilled" ? overviewRes.value : null;
  // marketRes always fulfils now (withTimeout), but its value can be null on
  // timeout/error — fall back to the empty shell so downstream `market.x`
  // access is safe.
  const market: TokenMarketData = (marketRes.status === "fulfilled" && marketRes.value) ? marketRes.value : {
    priceUsd: null, fdv: null, marketCap: null, change24h: null,
    liquidity: null, volume24h: null, tokenName: null, imageUrl: null,
    website: null, twitterUrl: null, telegramUrl: null, discordUrl: null,
    dexScreenerUrl: null, dexToolsUrl: null, pairUrl: null,
  };

  const symbol  = market.tokenName || overview?.tokenSymbol || truncate(addr);
  const chain   = CHAIN_NAMES[cid];
  const locked  = overview ? fmtTokens(overview.lockedTokensWhole) : "0";
  const title   = `${symbol} unlocks on ${chain} — Vestream`;
  const desc    = overview
    ? `${locked} ${symbol} still vesting across ${overview.protocolMix.length} protocol${overview.protocolMix.length === 1 ? "" : "s"}. Live unlock calendar, top recipients, and 30-day pressure.`
    : `Vesting activity for ${symbol} on ${chain}. Track unlocks before they hit.`;

  const url = `https://www.vestream.io/token/${cid}/${addr}`;

  return {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title, description: desc,
      url,
      siteName: "Vestream",
      type: "website",
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description: desc,
    },
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function TokenPage(
  { params }: { params: Promise<Params> },
) {
  const { chainId, address } = await params;
  const cid   = Number(chainId);
  // Ecosystem-aware (2026-06-12): EVM-only regex + .toLowerCase() 404'd
  // every Solana token page (base58 mints are case-sensitive).
  const addr  = normaliseAddress(decodeURIComponent(address));

  if (!CHAIN_NAMES[cid] || !isValidWalletAddress(addr)) {
    notFound();
  }

  // Mixed-case → canonical-lowercase redirect happens in `src/middleware.ts`
  // (308 before this page ever renders). Anything that reaches here is
  // already in canonical form.

  // Promise.allSettled (not Promise.all): each loader hits a different
  // dependency (4 × DB query, 1 × DexScreener fetch). If any one throws
  // — a transient pool exhaustion, a DexScreener 5xx, an RPC blip — we
  // do NOT want the whole render to fail and ISR-cache an empty page for
  // the next 60 seconds. Each fallback keeps the page renderable from
  // whatever data DID load. Same partial-failure-resilience pattern as
  // /protocols/[slug] (commit 8ddabb7).
  // Each loader is BOUNDED (withTimeout): allSettled waits for every promise
  // to settle, so without per-call caps one stalled DB query (saturated
  // pooler connection) hangs the whole render until Cloudflare's 100s gateway
  // cuts it → a 524 the visitor sees as "this page couldn't load". A cap turns
  // that into a partial render in seconds — the same graceful-degradation
  // intent as the allSettled fallbacks, but for HANGS rather than throws.
  const settled = await Promise.allSettled([
    withTimeout(getTokenOverview(cid, addr), 15_000, null, "pubtoken:overview"),
    // Past 12 + next 12 months = 24 monthly buckets. The calendar UI
    // auto-folds the historical half away when it's all zero (fresh tokens
    // with no tranche history to show), so passing monthsBack is safe even
    // on brand-new listings.
    withTimeout(getTokenUnlockCalendar(cid, addr, { monthsBack: 12, monthsForward: 12 }), 12_000, [], "pubtoken:calendar"),
    withTimeout(getTokenRecipients(cid, addr, 10), 8_000, [], "pubtoken:recipients"),
    withTimeout(getTokenUpcomingEvents(cid, addr, 8), 8_000, [], "pubtoken:upcoming"),
    withTimeout(getTokenMarketData(cid, addr), 8_000, null, "pubtoken:market"),
  ]);

  // Log every rejection — invisible failures are the whole reason cache
  // poisoning bit us before. Production observability lives in logs.
  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      const stage = ["overview", "calendar", "recipients", "upcoming", "market"][i];
      console.error(`[token-page] ${stage} failed for ${cid}/${addr}:`, s.reason);
    }
  });

  const overview   = settled[0].status === "fulfilled" ? settled[0].value : null;
  const calendar   = settled[1].status === "fulfilled" ? settled[1].value : [];
  const recipients = settled[2].status === "fulfilled" ? settled[2].value : [];
  const upcoming   = settled[3].status === "fulfilled" ? settled[3].value : [];
  // settled[4].value can be null on a withTimeout fallback — coerce to the
  // empty shell so `market.x` access stays safe.
  const market: TokenMarketData = (settled[4].status === "fulfilled" && settled[4].value) ? settled[4].value : {
    priceUsd: null, fdv: null, marketCap: null, change24h: null,
    liquidity: null, volume24h: null, tokenName: null, imageUrl: null,
    website: null, twitterUrl: null, telegramUrl: null, discordUrl: null,
    dexScreenerUrl: null, dexToolsUrl: null, pairUrl: null,
  };

  const hasVesting  = overview !== null && overview.streamCount > 0;
  const priceUsd    = market.priceUsd;
  const lockedUsd   = priceUsd && overview ? overview.lockedTokensWhole * priceUsd : null;
  const upcoming30Usd = priceUsd && overview ? overview.upcoming30dTokens * priceUsd : null;
  const upcoming7Usd  = priceUsd && overview ? overview.upcoming7dTokens  * priceUsd : null;
  const overhangPct = lockedUsd != null && market.fdv && market.fdv > 0
    ? (lockedUsd / market.fdv) * 100
    : null;
  const symbol  = overview?.tokenSymbol ?? market.tokenName ?? truncate(addr);

  // Pick the dominant protocol for this token (the one with the largest locked
  // share). Used as the third breadcrumb so visitors landing on a token page
  // can navigate up to the protocol whose schedule dominates that token's
  // vesting — usually what they were browsing before finding the token.
  const dominantProtocol = (() => {
    const mix = overview?.protocolMix ?? [];
    if (mix.length === 0) return null;
    const sorted = [...mix].sort((a, b) => b.lockedTokensWhole - a.lockedTokensWhole);
    const slug = protocolSlug(sorted[0].protocol);
    const name = protocolName(sorted[0].protocol);
    return slug ? { slug, name } : null;
  })();

  // BreadcrumbList JSON-LD. Google uses this to render the breadcrumb
  // trail directly in search results (rich-snippet format) — the structured
  // signal also reinforces the site hierarchy for ranking. Positions are
  // 1-indexed and run Home → Protocols → [Protocol] → [Token].
  const breadcrumbs = [
    { name: "Home",      url: "https://www.vestream.io/" },
    { name: "Protocols", url: "https://www.vestream.io/protocols" },
    ...(dominantProtocol
      ? [{ name: dominantProtocol.name, url: `https://www.vestream.io/protocols/${dominantProtocol.slug}` }]
      : []),
    { name: `${symbol} on ${CHAIN_NAMES[cid]}`, url: `https://www.vestream.io/token/${cid}/${addr}` },
  ];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: breadcrumbs.map((b, i) => ({
      "@type":    "ListItem",
      position:   i + 1,
      name:       b.name,
      item:       b.url,
    })),
  };

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />

      {/* BreadcrumbList JSON-LD — rendered first so crawlers see the
          hierarchy before parsing anything else on the page. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* ── Breadcrumbs ─────────────────────────────────────────────────────
          Visible trail directly under the nav. Two jobs:
            1. UX — visitors who landed on a deep token page have a way back
               up the hierarchy instead of hunting for the nav "Protocols"
               link. Also gives them context about where they are.
            2. SEO — the structured-data version above helps Google render
               a breadcrumb trail in search results. The visible version
               provides the matching HTML links Google cross-references.
         ───────────────────────────────────────────────────────────────── */}
      <nav
        className="pt-24 md:pt-28 pb-2 px-4 md:px-8 max-w-5xl mx-auto"
        aria-label="Breadcrumb"
      >
        <ol className="flex items-center gap-1.5 flex-wrap text-xs" style={{ color: "#B8BABD" }}>
          {breadcrumbs.map((b, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <li key={b.url} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span aria-hidden style={{ color: "#cbd5e1" }}>/</span>
                )}
                {isLast ? (
                  <span
                    className="font-semibold truncate max-w-[240px]"
                    style={{ color: "#1A1D20" }}
                    aria-current="page"
                  >
                    {b.name}
                  </span>
                ) : (
                  <Link
                    href={b.url.replace("https://www.vestream.io", "")}
                    className="transition-colors hover:underline"
                    style={{ color: "#8B8E92" }}
                  >
                    {b.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="pt-4 pb-6 md:pt-6 md:pb-10 px-4 md:px-8 max-w-5xl mx-auto">
        <div className="flex items-start gap-4 md:gap-5 flex-wrap">
          {market.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={market.imageUrl}
              alt={symbol}
              width={64}
              height={64}
              className="rounded-full flex-shrink-0"
              style={{ border: "1px solid rgba(21,23,26,0.10)", background: "white" }}
            />
          ) : (
            <div
              className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
              style={{ background: "rgba(28,184,184,0.08)", border: "1px solid rgba(28,184,184,0.22)", color: "#1CB8B8" }}
            >
              {symbol.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
                {symbol}
              </h1>
              {market.tokenName && market.tokenName !== symbol && (
                <span className="text-sm" style={{ color: "#B8BABD" }}>
                  · {market.tokenName}
                </span>
              )}
              <span
                className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider"
                style={{ background: "rgba(0,0,0,0.04)", color: "#8B8E92" }}
              >
                {CHAIN_NAMES[cid]}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-sm">
              <CopyButton
                value={addr}
                display={`${addr.slice(0, 6)}…${addr.slice(-4)}`}
                style={{ color: "#8B8E92" }}
              />
              {priceUsd != null && priceUsd > 0 && (
                <>
                  <span className="font-bold tabular-nums" style={{ color: "#1A1D20" }}>
                    {/* Sub-cent prices round to "$0" in the 2-dp format — show
                        "<$0.01" so a low-priced token doesn't read as broken. */}
                    {priceUsd < 0.01 ? "<$0.01" : fmtUsd(priceUsd, false)}
                  </span>
                  {market.change24h != null && (
                    <span
                      className="tabular-nums font-semibold"
                      style={{ color: market.change24h >= 0 ? "#2DB36A" : "#B3322E" }}
                    >
                      {fmtPct(market.change24h)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* The duplicate DexScreener / Website buttons that used to sit here
              moved into <TokenMetaPanel/> below so every external link lives
              in one consistent row (explorer, website, X, TokenSniffer, …). */}
        </div>

        {/* Share actions — always visible, helps projects share the page */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <TokenShareRow
            pageUrl={`https://www.vestream.io/token/${cid}/${addr}`}
            symbol={symbol}
            chainName={CHAIN_NAMES[cid] ?? ""}
            lockedSummary={
              lockedUsd != null && lockedUsd > 1000
                ? `$${lockedUsd >= 1e6 ? `${(lockedUsd / 1e6).toFixed(1)}M` : `${(lockedUsd / 1e3).toFixed(0)}K`}`
                : null
            }
          />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────
          Page ordering rationale — vesting-first, market-data later.
          Vestream is a vesting platform first; price/liquidity are
          supporting context. Visitors who came here via a search for an
          unlock date should get the vesting answer before scrolling.

            1. Header
            2. 4 hero stats (Locked / 7d / 30d / Recipients)   ← vesting
            3. Pulse summary (narrative over those 4 numbers)  ← vesting
            4. 12-month unlock calendar                         ← vesting
            5. Protocol mix + top recipients                    ← vesting
            6. Upcoming events chronological list               ← vesting
            7. Market stats + external links (price/liquidity/FDV)
            8. Price chart (DexScreener) — supporting context, below the stats
            9. Token FAQ
           10. Conversion CTA
         ───────────────────────────────────────────────────────────────── */}

      {/* ── 4 hero stats (highest priority — vesting platform first) ─────── */}
      <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <HeroStat
            label="Locked"
            value={lockedUsd != null ? fmtUsd(lockedUsd) : (overview ? `${fmtTokens(overview.lockedTokensWhole)} ${symbol}` : "—")}
            sub={overhangPct != null ? `${overhangPct.toFixed(1)}% of FDV` : (market.fdv ? "—" : "no price data")}
            accent="#1CB8B8"
          />
          <HeroStat
            label="Unlocking next 7d"
            value={overview && overview.upcoming7dTokens > 0
              ? (upcoming7Usd != null ? fmtUsd(upcoming7Usd) : fmtTokens(overview.upcoming7dTokens))
              : "None"}
            sub={overview && overview.upcoming7dTokens > 0
              ? `${fmtTokens(overview.upcoming7dTokens)} ${symbol}`
              : "nothing in 7 days"}
            accent="#E063A0"
          />
          <HeroStat
            label="Unlocking next 30d"
            value={overview && overview.upcoming30dTokens > 0
              ? (upcoming30Usd != null ? fmtUsd(upcoming30Usd) : fmtTokens(overview.upcoming30dTokens))
              : "None"}
            sub={overview && overview.upcoming30dTokens > 0
              ? `${fmtTokens(overview.upcoming30dTokens)} ${symbol}`
              : "nothing in 30 days"}
            accent="#F0992E"
          />
          <HeroStat
            label="Recipients"
            value={overview ? overview.recipientCount.toLocaleString() : "—"}
            sub={overview ? `${overview.streamCount} active streams` : ""}
            accent="#0BA0CB"
          />
        </div>
      </section>

      {/* ── Pulse summary (3-4 bullets, no See more). Hidden when there's
          nothing substantive to say — TokenPulse returns null on empty. */}
      {overview && (
        <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto">
          <TokenPulse
            symbol={symbol}
            pulse={buildTokenPulse({
              symbol,
              overview,
              market,
              calendar,
              upcoming,
              recipients,
            })}
          />
        </section>
      )}

      {/* ── No-vesting state ───────────────────────────────────────────────── */}
      {!hasVesting && (
        <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto">
          <div
            className="rounded-2xl p-8 md:p-10 text-center"
            style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}
          >
            <div className="text-base font-semibold mb-2" style={{ color: "#1A1D20" }}>
              No vesting activity indexed for {symbol}
            </div>
            <p className="text-sm max-w-md mx-auto" style={{ color: "#8B8E92" }}>
              We haven&apos;t seen any active vesting streams for this token yet.
              It may not use any of the 9 protocols we track, or no streams have
              reached our cache. If you have a wallet with {symbol} vesting,
              searching it on Vestream will add it here.
            </p>
            <Link
              href="/find-vestings"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl font-semibold text-sm"
              style={{
                background: "#1CB8B8",
                color: "white",
                boxShadow: "0 4px 16px rgba(28,184,184,0.3)",
              }}
            >
              Scan a wallet →
            </Link>
          </div>
        </section>
      )}

      {hasVesting && overview && (
        <>
          {/* ── 12-month unlock calendar ───────────────────────────────── */}
          <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto">
            <UnlockCalendar
              calendar={calendar}
              priceUsd={priceUsd}
              symbol={symbol}
              lockedTotal={overview.lockedTokensWhole}
            />
          </section>

          {/* ── Protocol mix — only when MORE THAN ONE protocol vests this
              token. For single-protocol tokens (the common case) the panel
              just restated the breadcrumb + the market-stats line ("locked
              across N streams · PinkSale"), so it sat there mostly empty.
              Now it only appears when it actually adds signal. ───────────── */}
          {overview.protocolMix.length > 1 && (
            <section className="px-4 md:px-8 pb-4 max-w-5xl mx-auto">
              <ProtocolMix mix={overview.protocolMix} total={overview.lockedTokensWhole} />
            </section>
          )}

          {/* ── Top recipients — full width ────────────────────────────── */}
          <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto">
            <RecipientTable
              rows={recipients}
              symbol={symbol}
              priceUsd={priceUsd}
              lockedTotal={overview.lockedTokensWhole}
              chainId={cid}
            />
          </section>

          {/* ── Upcoming events chronological list ─────────────────────── */}
          {upcoming.length > 0 && (
            <section className="px-4 md:px-8 pb-10 max-w-5xl mx-auto">
              <UpcomingEvents events={upcoming} symbol={symbol} priceUsd={priceUsd} />
            </section>
          )}
        </>
      )}

      {/* ── Pro upsell strip ────────────────────────────────────────────────
          Sits between the data and the market stats — high-intent position.
          Visitors who've seen the calendar + recipients are already qualified;
          this is the moment to convert them into app installs. */}
      {hasVesting && (
        <section className="px-4 md:px-8 pb-8 max-w-5xl mx-auto">
          <div
            className="rounded-2xl px-5 py-4 md:px-6 md:py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            style={{
              background: "linear-gradient(135deg, rgba(28,184,184,0.06) 0%, rgba(28,184,184,0.02) 100%)",
              border: "1px solid rgba(28,184,184,0.18)",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#0F8A8A" }}>
                Vestream Pro
              </div>
              <p className="text-sm font-medium leading-snug" style={{ color: "#1A1D20" }}>
                See live claimable amounts, wallet-level alerts before every {symbol} unlock, and tax-ready exports.
              </p>
              <p className="text-xs mt-1" style={{ color: "#8B8E92" }}>
                Full data available to Pro subscribers on iOS &amp; Android.
              </p>
            </div>
            <div className="flex-shrink-0">
              <AppStoreBadges align="start" />
            </div>
          </div>
        </section>
      )}

      {/* ── Market stats + external links (price/liquidity/volume/FDV +
          explorer/website/X/TokenSniffer). Positioned LOWER than the
          vesting block because Vestream's value prop is vesting-first —
          price data is supporting context, not the headline. */}
      {overview && (
        <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto">
          <TokenMetaPanel
            chainId={cid}
            tokenAddress={addr}
            tokenSymbol={overview.tokenSymbol ?? market.tokenName ?? null}
            market={market}
            overview={overview}
          />
        </section>
      )}

      {/* ── Price chart (DexScreener embed) — sits directly below the market
          stats card (vesting-first: price data is supporting context). Only
          when a priced pair exists; pairUrl is the most-liquid pair's
          DexScreener URL; ?embed=1 strips their chrome to just the candles.
          dexscreener.com is allow-listed in the CSP frame-src (next.config.ts). */}
      {market.pairUrl && (
        <section className="px-4 md:px-8 pb-6 max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold" style={{ color: "#1A1D20" }}>Price chart</h2>
            <a
              href={market.dexScreenerUrl ?? market.pairUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] hover:underline"
              style={{ color: "#8B8E92" }}
            >
              via DexScreener ↗
            </a>
          </div>
          <div className="w-full rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.08)", background: "#fff" }}>
            <iframe
              src={`${market.pairUrl}?embed=1&theme=light&info=0&trades=0`}
              title={`${symbol} price chart on DexScreener`}
              loading="lazy"
              // Inline width/height — the iframe was falling back to its ~300px
              // HTML default (the `w-full` class wasn't winning), which rendered
              // DexScreener's cramped portrait/mobile layout. Inline width:100%
              // forces it to fill the max-w-6xl container → wide landscape chart.
              style={{ display: "block", width: "100%", height: 560, border: 0 }}
            />
          </div>
        </section>
      )}

      {/* ── SEO FAQ ───────────────────────────────────────────────────────
          Rendered even when hasVesting is false — questions like "what is
          $TOKEN worth fully diluted today" still have valid answers, and
          the FAQPage JSON-LD is the main SEO win regardless of whether a
          vesting schedule exists. For a not-yet-indexed token the answers
          gracefully degrade to "Vestream has not indexed vesting yet". */}
      <TokenFAQ
        symbol={symbol}
        items={buildTokenFAQ({
          chainId: cid,
          tokenAddress: addr,
          symbol,
          overview,
          market,
          calendar,
          upcoming,
          recipients,
        })}
      />

      {/* ── Conversion CTA — the funnel entry point at the bottom of every
          token page. Visitors who scrolled this far are high-intent: they
          read the Pulse, the calendar, the FAQ. This is the moment to
          offer the one action we actually want — put the wallet on their
          watchlist so they get notified before every future unlock. */}
      <section className="px-4 md:px-8 pb-16 md:pb-20 max-w-5xl mx-auto">
        <div
          className="rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)",
            border: "1px solid rgba(15,138,138,0.25)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(15,138,138,0.18) 0%, transparent 70%)",
            }}
          />
          <div className="relative">
            <h2
              className="text-2xl md:text-3xl font-bold mb-3"
              style={{ letterSpacing: "-0.02em", color: "white" }}
            >
              Don&rsquo;t miss the next {symbol} unlock
            </h2>
            <p
              className="text-sm md:text-base mb-8 max-w-xl mx-auto"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Get a push and email notification the moment {symbol} tokens
              are ready to claim — plus coverage for every other wallet you
              track, across all 9 protocols and 7 chains — EVM and Solana.
            </p>
            <AppStoreBadges align="center" />
            <div className="mt-5">
              <Link
                href="/find-vestings"
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-all hover:opacity-70"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Or scan a wallet on the web →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />

      {/* Soft paywall — client-side, applied only for human visitors over the
          free limit. The full page above always server-renders (SEO intact);
          this just overlays a blurred "get the app" gate post-hydration. */}
      <TokenPaywall chainId={cid} address={addr} symbol={symbol} />
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function HeroStat({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: accent }}>
        {label}
      </div>
      <div className="text-xl md:text-2xl font-bold tabular-nums" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-1" style={{ color: "#B8BABD" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function UnlockCalendar({
  calendar, priceUsd, symbol, lockedTotal,
}: {
  calendar:    UnlockCalendarBucket[];
  priceUsd:    number | null;
  symbol:      string;
  /** Current locked-supply total — used to compute "share of locked supply
   *  unlocking in the forward window" in the stats footer. */
  lockedTotal: number;
}) {
  // ── View mode: 24-month (past + future) or forward-only fallback ──────
  // The data layer returns past + future buckets, but if all past buckets
  // are empty (brand-new token with no history to show) we collapse back
  // to a forward-only view. Saves a lot of empty horizontal space.
  const hasAnyPast = calendar.some((b) => b.isPast && b.totalTokensWhole > 0);
  const visible    = hasAnyPast ? calendar : calendar.filter((b) => !b.isPast);

  // Index of the first FUTURE bucket in `visible` (the current month). Used
  // to position the "NOW" marker and split cumulative/stats calculations
  // between history and forward.
  const firstFutureIdx = Math.max(0, visible.findIndex((b) => !b.isPast));

  // ── Derived series ────────────────────────────────────────────────────
  const maxBucket  = Math.max(1, ...visible.map((b) => b.totalTokensWhole));
  // Forward-only totals power the stats strip — we care about "what's
  // coming" not "what already released" for the KPI readout.
  //
  // 2026-05-15: switched from .totalTokensWhole to .futureTokensWhole.
  // The current-month bucket can include events that already fired
  // earlier in the month (e.g. May 1 → May 15 today). totalTokensWhole
  // counts those for the bar-chart visual; futureTokensWhole excludes
  // them so the "12-mo total" KPI shows only what's actually still to
  // unlock. This is the fix for the "12-MO TOTAL 393M vs LOCKED 278M"
  // anomaly user spotted.
  const forward    = visible.filter((b) => !b.isPast);
  const grandTotal = forward.reduce((s, b) => s + b.futureTokensWhole, 0);

  // Cumulative running total across the visible window (past + future).
  // Drives the overlay curve — turns the chart from independent months
  // into a release trajectory reading at a glance.
  const cumulativeRaw: number[] = visible.reduce<number[]>((acc, b) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
    acc.push(prev + b.totalTokensWhole);
    return acc;
  }, []);
  const maxCum = cumulativeRaw[cumulativeRaw.length - 1] || 1;

  // Peak FUTURE month — stats strip asks "biggest unlock ahead".
  // Peak month — uses futureTokensWhole for the same reason as grandTotal.
  // A bucket whose past-this-month portion would have been the largest is
  // no longer falsely crowned "peak month" when its future-this-month
  // portion is actually small.
  const peak = forward.reduce<UnlockCalendarBucket | null>((acc, b) => {
    if (!acc || b.futureTokensWhole > acc.futureTokensWhole) return b;
    return acc;
  }, null);

  // Share of currently-locked supply unlocking in the forward window.
  // A reading of "90%+ in 12mo" means vesting is nearly over; "30%" means
  // most unlocks are further out.
  //
  // 2026-05-15: track the RAW ratio separately so we can detect anomalous
  // cases where the per-step amount sum exceeds the parent stream's
  // lockedAmount (e.g. PinkSale cycle-based vesting producing overlapping
  // step events in token-aggregates expandUnlockEvents — investigated
  // separately). When the ratio is suspiciously high (>105%) we render
  // the stat as "—" rather than clamp to a confident-looking 100% with
  // a negative "still locked beyond" subtitle.
  const unlockRatioRaw = lockedTotal > 0
    ? (grandTotal / lockedTotal) * 100
    : 0;
  const unlockShareOfLocked = Math.min(100, unlockRatioRaw);
  const isAnomalous         = unlockRatioRaw > 105;
  // True ↔ the next 12 months cover the full locked supply (within 1%).
  const fullyVestedIn12mo   = !isAnomalous && unlockRatioRaw >= 99;
  const remainingBeyond     = Math.max(0, lockedTotal - grandTotal);

  // Last non-empty forward bucket — drives "Last unlock ahead". Uses
  // futureTokensWhole for consistency with grandTotal/peak — a current-
  // month bucket whose only events already fired this month doesn't
  // qualify as a "future unlock".
  const lastActiveForwardIdx = (() => {
    for (let i = visible.length - 1; i >= firstFutureIdx; i--) {
      if (visible[i].futureTokensWhole > 0) return i;
    }
    return -1;
  })();
  const lastActiveMonthsOut = lastActiveForwardIdx >= 0
    ? lastActiveForwardIdx - firstFutureIdx
    : -1;

  // ── Y-axis scale (0, 25%, 50%, 75%, 100% of peak month) ───────────────
  const yAxisLabels = [1, 0.75, 0.5, 0.25, 0].map((frac) => ({
    frac,
    value: maxBucket * frac,
  }));

  // ── Cumulative overlay coordinates — an SVG polyline drawn over the bars.
  // viewBox is 0→100 horizontal, 0→100 vertical; preserveAspectRatio=none
  // stretches to fill the bar grid so the line aligns with bar tops.
  //
  // The polyline's X runs from the centre of the first bar to the centre
  // of the last bar. Y is inverted (SVG 0 is top) and scaled against maxCum.
  const svgPoints = visible
    .map((_, i) => {
      const x = ((i + 0.5) / visible.length) * 100;
      const y = 100 - (cumulativeRaw[i] / maxCum) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  // Final cumulative Y always lands at the top since maxCum === last entry.
  const finalCumY = 0;

  // X position of the "now" divider in viewBox units — sits at the left
  // edge of the first future bar (so the past side ends where future
  // begins).
  const nowDividerX = hasAnyPast
    ? (firstFutureIdx / visible.length) * 100
    : null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 md:px-5 py-3 flex-wrap gap-2"
        style={{
          background:   "linear-gradient(90deg, rgba(28,184,184,0.05), rgba(15,138,138,0.04))",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#1CB8B8" }}>
            {hasAnyPast ? "24-month unlock timeline" : "12-month unlock schedule"}
          </span>
          {/* Legend chip for the overlay line */}
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "#0F8A8A" }}>
            <span
              aria-hidden
              style={{
                display:       "inline-block",
                width:         14,
                height:        2,
                background:    "#0F8A8A",
                borderRadius:  1,
              }}
            />
            cumulative
          </span>
          {hasAnyPast && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "#B8BABD" }}>
              <span
                aria-hidden
                style={{
                  display:       "inline-block",
                  width:         8,
                  height:        8,
                  background:    "rgba(148,163,184,0.5)",
                  borderRadius:  2,
                }}
              />
              past
            </span>
          )}
        </div>
        <div className="text-xs" style={{ color: "#8B8E92" }}>
          <span style={{ color: "#B8BABD" }}>next 12mo</span>{" "}
          <span className="font-semibold tabular-nums" style={{ color: "#1A1D20" }}>
            {fmtTokens(grandTotal)} {symbol}
          </span>
          {priceUsd && <span className="ml-1">· {fmtUsd(grandTotal * priceUsd)}</span>}
        </div>
      </div>

      {/* Chart body — Y-axis column on the left, bars + overlay on the right.
          The chart's internal min-widths (y-axis column + ~34px × 12 or 24
          bars) exceed 375px, so the overflow-x-auto lets mobile visitors
          scroll horizontally. A right-edge fade gradient (position=relative
          + absolute pseudo-mask below) hints at the scrollable content
          without the scrollbar being prominent on touch devices. */}
      <div className="relative">
      <div className="px-4 md:px-5 py-4 overflow-x-auto">
        <div className="flex items-stretch gap-2" style={{ minHeight: 180 }}>
          {/* Y-axis labels (peak-month scale). We keep these on the left so
              the bars can line up against known reference rows — feels a lot
              more like a chart and less like a decorative graphic. */}
          <div
            className="flex flex-col justify-between pr-2 flex-shrink-0"
            style={{ height: 130, paddingTop: 0, paddingBottom: 24, color: "#cbd5e1", fontSize: 9.5 }}
            aria-hidden
          >
            {yAxisLabels.map(({ frac, value }) => (
              <div key={frac} className="tabular-nums leading-none text-right">
                {value > 0 ? fmtTokens(value) : "0"}
              </div>
            ))}
          </div>

          {/* Bars + overlay curve stacked in the same grid */}
          <div className="flex-1 relative">
            {/* Horizontal gridlines — pure decoration but makes the chart read
                as a chart. Drawn as stacked flex rows matching the Y labels. */}
            <div
              className="absolute inset-x-0 pointer-events-none"
              style={{ top: 0, height: 130 }}
              aria-hidden
            >
              {[0.25, 0.5, 0.75, 1].map((frac) => (
                <div
                  key={frac}
                  className="absolute left-0 right-0"
                  style={{
                    top:        `${(1 - frac) * 100}%`,
                    height:     1,
                    background: "rgba(0,0,0,0.04)",
                  }}
                />
              ))}
            </div>

            {/* Bars themselves — iterate `visible` so the history fallback
                works correctly. Past bars render at 50% opacity to visually
                recede vs. the forward-looking buckets.
                Heights use explicit pixels (not height:100% chains) so the
                bars render correctly even when all data lands in a single
                month — CSS percentage heights in a flex-end context can
                silently resolve to zero when the intermediate column div
                has no explicit height (reproducer: $HOUND on Base, 2026-06-01). */}
            <div className="flex items-end gap-1 md:gap-2" style={{ height: 130 }}>
              {visible.map((b, idx) => {
                const pct     = (b.totalTokensWhole / maxBucket) * 100;
                const barPx   = Math.max(0, Math.round(pct * 130 / 100));
                const usd     = priceUsd ? b.totalTokensWhole * priceUsd : null;
                const isThisMonth = idx === firstFutureIdx;
                return (
                  <div
                    key={b.timestamp}
                    className="flex flex-col items-center flex-1 min-w-[34px] group relative"
                  >
                    <div
                      className="w-full flex flex-col-reverse rounded-t"
                      style={{
                        height:   barPx,
                        position: "relative",
                        // Past bars render muted so the eye is pulled to
                        // future months — which is the decision-relevant
                        // part. We keep them visible (not invisible) so the
                        // cumulative curve has context on both sides.
                        opacity:  b.isPast ? 0.35 : 1,
                      }}
                      title={`${b.label}${b.isPast ? " (past)" : ""}: ${fmtTokens(b.totalTokensWhole)} ${symbol}${usd ? ` (${fmtUsd(usd)})` : ""}${
                        b.byProtocol.length > 0
                          ? " · " + b.byProtocol.map((s) => `${protocolName(s.protocol)}: ${fmtTokens(s.tokensWhole)}`).join(", ")
                          : ""
                      }`}
                    >
                      {b.byProtocol.length === 0 ? null : (
                        b.byProtocol.map((seg, i) => {
                          // Segment pixel height = proportion of this bar's pixels
                          const segPx = Math.max(0, Math.round((seg.tokensWhole / b.totalTokensWhole) * barPx));
                          return (
                            <div
                              key={seg.protocol + i}
                              className="w-full transition-opacity group-hover:opacity-90"
                              style={{
                                height:     segPx,
                                background: protocolColour(seg.protocol),
                                borderTop:  i > 0 ? "1px solid rgba(255,255,255,0.4)" : undefined,
                              }}
                            />
                          );
                        })
                      )}
                    </div>
                    {/* "NOW" pill on the first FUTURE bucket — divider
                        between the historical and forward halves. */}
                    {isThisMonth && (
                      <div
                        className="absolute -top-3 text-[8.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          background: "#0F8A8A",
                          color:      "white",
                          letterSpacing: "0.08em",
                          whiteSpace: "nowrap",
                        }}
                        aria-hidden
                      >
                        Now
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cumulative overlay. Same bounding box as the bars so y=0
                lines up with the x-axis baseline and y=100 with the peak
                bucket top. preserveAspectRatio=none is critical — we WANT
                the line to stretch to fill the container on any width. */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 pointer-events-none"
              style={{ width: "100%", height: 130 }}
              aria-hidden
            >
              {/* Vertical "now" divider — sits at the boundary between past
                  and future buckets. Drawn before the polyline so the curve
                  stays on top visually. */}
              {nowDividerX !== null && (
                <line
                  x1={nowDividerX}
                  y1={0}
                  x2={nowDividerX}
                  y2={100}
                  stroke="#0F8A8A"
                  strokeWidth={0.8}
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.5}
                />
              )}
              <polyline
                points={svgPoints}
                fill="none"
                stroke="#0F8A8A"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Dot on the final point so the end of the curve has a
                  visual anchor (matches the "cumulative" legend pill). */}
              <circle
                cx={visible.length ? ((visible.length - 0.5) / visible.length) * 100 : 100}
                cy={finalCumY}
                r={0.9}
                fill="#0F8A8A"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* Month labels under each bar. Past labels render muted so
                the forward half of the axis reads as primary.
                text-[10px] is the accessibility floor for secondary info;
                lower than that becomes unreadable on small screens. */}
            <div className="flex gap-1 md:gap-2 mt-2">
              {visible.map((b) => (
                <div
                  key={b.timestamp}
                  className="text-[10px] text-center flex-1 min-w-[34px]"
                  style={{ color: b.isPast ? "#cbd5e1" : "#B8BABD" }}
                >
                  {b.label.split(" ")[0]}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Right-edge fade gradient hinting at horizontal scroll on mobile.
          md:hidden so desktop (where the chart fits without scrolling)
          doesn't get a visual mask that implies content is hidden. */}
      <div
        className="absolute top-0 right-0 bottom-0 w-8 pointer-events-none md:hidden"
        style={{
          background: "linear-gradient(to left, rgba(255,255,255,0.95), transparent)",
        }}
        aria-hidden
      />
      </div>

      {/* Stats strip — four technical metrics pulled from the same data.
          When NOTHING unlocks in the forward 12-month window every tile
          would render "—" / "0.0%" — a wall of dashes that reads as
          missing data rather than the real signal ("it's all locked
          further out"). Collapse to one honest line in that case. */}
      {grandTotal <= 0 ? (
        <div
          className="px-4 md:px-5 py-3 border-t text-xs"
          style={{ borderColor: "rgba(0,0,0,0.05)", background: "rgba(0,0,0,0.015)", color: "#64748b" }}
        >
          Nothing unlocks in the next 12 months
          {remainingBeyond > 0 && (
            <> — <span className="font-semibold tabular-nums" style={{ color: "#1A1D20" }}>
              {fmtTokens(remainingBeyond)} {symbol}
            </span> still locked beyond</>
          )}
        </div>
      ) : (
      <div
        className="px-4 md:px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 border-t"
        style={{ borderColor: "rgba(0,0,0,0.05)", background: "rgba(0,0,0,0.015)" }}
      >
        <CalendarStat
          label="Peak month"
          value={peak && peak.futureTokensWhole > 0 ? peak.label : "—"}
          sub={peak && peak.futureTokensWhole > 0 ? `${fmtTokens(peak.futureTokensWhole)} ${symbol}` : ""}
        />
        <CalendarStat
          label="12-mo total"
          value={fmtTokens(grandTotal)}
          sub={priceUsd ? fmtUsd(grandTotal * priceUsd) : `${symbol}`}
        />
        {/* 2026-05-15: re-worked from "100% — — MOONMOON still locked beyond"
            into three explicit states:
              - anomalous (step amounts sum > locked total): "—" + diagnostic copy
              - fully vested in 12mo: 100% + "vesting complete within 12mo"
              - partial: percentage + "X still locked beyond 12mo"
            Last case is the common one; the first two were rendering
            as a confusing "100% / — MOONMOON still locked beyond" combo
            for low-circulation tokens with step-vested PinkSale schedules. */}
        <CalendarStat
          label="of locked supply"
          value={
            lockedTotal === 0    ? "—" :
            isAnomalous          ? "—" :
            `${unlockShareOfLocked.toFixed(1)}%`
          }
          sub={
            lockedTotal === 0    ? "" :
            isAnomalous          ? "schedule data overlapping — see chart" :
            fullyVestedIn12mo    ? `vesting complete within 12mo` :
            `${fmtTokens(remainingBeyond)} ${symbol} still locked beyond`
          }
        />
        <CalendarStat
          label="Last unlock ahead"
          value={lastActiveForwardIdx >= 0 ? visible[lastActiveForwardIdx].label : "—"}
          sub={lastActiveMonthsOut >= 0
            ? (lastActiveMonthsOut === 0
                ? "this month"
                : `${lastActiveMonthsOut + 1} month${lastActiveMonthsOut === 0 ? "" : "s"} out`)
            : ""}
        />
      </div>
      )}

      {/* Protocol legend */}
      <div
        className="px-4 md:px-5 py-2.5 text-[10.5px] leading-relaxed flex items-center gap-4 flex-wrap"
        style={{
          background:  "rgba(0,0,0,0.015)",
          borderTop:   "1px solid rgba(0,0,0,0.05)",
          color:       "#B8BABD",
        }}
      >
        <span className="font-semibold" style={{ color: "#8B8E92" }}>Protocols:</span>
        {Array.from(new Set(visible.flatMap((b) => b.byProtocol.map((s) => s.protocol)))).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: protocolColour(p) }} />
            {protocolName(p)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Small stat cell for the calendar's footer strip. Co-located because it
// only makes sense inside this chart card.
function CalendarStat({
  label, value, sub,
}: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "#B8BABD" }}
      >
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: "#1A1D20" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10.5px] mt-0.5" style={{ color: "#8B8E92" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ProtocolMix({
  mix, total,
}: { mix: TokenOverview["protocolMix"]; total: number }) {
  // Single protocol → a "mix" with one 100% bar is noise (it just restates
  // the breadcrumb + pulse). Collapse to a one-line statement instead.
  if (mix.length === 1) {
    const p = mix[0];
    const slug = protocolSlug(p.protocol);
    const inner = (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: protocolColour(p.protocol) }} />
        <span className="text-sm font-semibold" style={{ color: "#1A1D20" }}>{protocolName(p.protocol)}</span>
        <span className="text-xs" style={{ color: "#8B8E92" }}>
          · all {p.streams} stream{p.streams === 1 ? "" : "s"}
        </span>
      </div>
    );
    return (
      <div className="rounded-2xl overflow-hidden h-full"
        style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div className="px-4 md:px-5 py-3" style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#1A1D20" }}>Protocol</span>
        </div>
        <div className="px-4 md:px-5 py-4">
          {slug ? (
            <Link href={`/protocols/${slug}`} className="block hover:opacity-80 transition-opacity">{inner}</Link>
          ) : inner}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden h-full"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div
        className="px-4 md:px-5 py-3"
        style={{
          background: "rgba(0,0,0,0.02)",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#1A1D20" }}>
          Protocol mix
        </span>
      </div>
      <div className="px-4 md:px-5 py-4 space-y-3">
        {mix.map((p) => {
          const pct = total > 0 ? (p.lockedTokensWhole / total) * 100 : 0;
          const slug = protocolSlug(p.protocol);
          const content = (
            <>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: protocolColour(p.protocol) }} />
                  <span className="text-sm font-semibold" style={{ color: "#1A1D20" }}>
                    {protocolName(p.protocol)}
                  </span>
                </div>
                <span className="text-xs font-bold tabular-nums" style={{ color: "#1A1D20" }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
                <div className="h-full" style={{ width: `${Math.max(2, pct)}%`, background: protocolColour(p.protocol) }} />
              </div>
              <div className="text-[10px] mt-1" style={{ color: "#B8BABD" }}>
                {p.streams} stream{p.streams === 1 ? "" : "s"}
              </div>
            </>
          );
          return slug ? (
            <Link key={p.protocol} href={`/protocols/${slug}`} className="block hover:opacity-80 transition-opacity">
              {content}
            </Link>
          ) : (
            <div key={p.protocol}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

function RecipientTable({
  rows, symbol, priceUsd, lockedTotal, chainId,
}: { rows: TokenRecipient[]; symbol: string; priceUsd: number | null; lockedTotal: number; chainId: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      {/* Title bar */}
      <div
        className="px-4 md:px-5 py-3 flex items-center justify-between"
        style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}
      >
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#1A1D20" }}>
          Top recipients
        </span>
        <span className="text-xs" style={{ color: "#B8BABD" }}>{rows.length} shown</span>
      </div>

      {/* Column headings — md+ only (mobile folds protocol into the recipient cell) */}
      <div
        className="hidden md:grid grid-cols-12 gap-3 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "#B8BABD", borderBottom: "1px solid rgba(0,0,0,0.05)" }}
      >
        <div className="col-span-1">#</div>
        <div className="col-span-3">Recipient</div>
        <div className="col-span-2">Protocol</div>
        <div className="col-span-1 text-center">Streams</div>
        <div className="col-span-2 text-right">Share</div>
        <div className="col-span-1 text-right">Next</div>
        <div className="col-span-2 text-right">Locked</div>
      </div>

      <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        {rows.map((r, idx) => {
          const lockedUsd = priceUsd ? r.lockedTokensWhole * priceUsd : null;
          const pct       = lockedTotal > 0 ? (r.lockedTokensWhole / lockedTotal) * 100 : 0;
          const explorer  = blockExplorerAddressUrl(chainId, r.recipient);
          return (
            <div key={r.recipient} className="grid grid-cols-12 gap-3 items-center px-4 md:px-5 py-3">
              {/* Rank */}
              <div className="col-span-1">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold tabular-nums"
                  style={{ background: "rgba(0,0,0,0.04)", color: "#8B8E92" }}
                >
                  {idx + 1}
                </div>
              </div>

              {/* Recipient (links to block explorer) */}
              <div className="col-span-5 md:col-span-3 min-w-0">
                {explorer ? (
                  <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs font-mono truncate hover:underline"
                    style={{ color: "#1A1D20" }}
                  >
                    {truncate(r.recipient)}
                  </a>
                ) : (
                  <span className="block text-xs font-mono truncate" style={{ color: "#1A1D20" }}>
                    {truncate(r.recipient)}
                  </span>
                )}
                {/* Mobile-only meta — protocol chip(s), since that column is hidden < md */}
                <div className="md:hidden flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {r.protocols.slice(0, 2).map((p) => (
                    <span
                      key={p}
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: `${protocolColour(p)}22`, color: protocolColour(p) }}
                    >
                      {protocolName(p)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Protocol (md+) */}
              <div className="hidden md:flex md:col-span-2 items-center gap-1.5 flex-wrap min-w-0">
                {r.protocols.slice(0, 2).map((p) => (
                  <span
                    key={p}
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: `${protocolColour(p)}22`, color: protocolColour(p) }}
                  >
                    {protocolName(p)}
                  </span>
                ))}
              </div>

              {/* Streams (md+) */}
              <div className="hidden md:block md:col-span-1 text-center text-xs tabular-nums" style={{ color: "#1A1D20" }}>
                {r.streamCount}
              </div>

              {/* Share of locked supply (md+) */}
              <div className="hidden md:block md:col-span-2 text-right text-xs tabular-nums" style={{ color: "#1A1D20" }}>
                {pct >= 0.1 ? `${pct.toFixed(pct >= 10 ? 0 : 1)}%` : "<0.1%"}
              </div>

              {/* Next unlock */}
              <div className="col-span-3 md:col-span-1 text-right text-[11px] tabular-nums" style={{ color: "#8B8E92" }}>
                {relUntil(r.nextUnlockTime)}
              </div>

              {/* Locked value */}
              <div className="col-span-3 md:col-span-2 text-right">
                <div className="text-sm font-bold tabular-nums" style={{ color: "#1A1D20" }}>
                  {lockedUsd != null ? fmtUsd(lockedUsd) : fmtTokens(r.lockedTokensWhole)}
                </div>
                <div className="text-[10px] tabular-nums" style={{ color: "#B8BABD" }}>
                  {fmtTokens(r.lockedTokensWhole)} {symbol}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpcomingEvents({
  events, symbol, priceUsd,
}: { events: TokenUpcomingEvent[]; symbol: string; priceUsd: number | null }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div
        className="px-4 md:px-5 py-3"
        style={{
          background: "linear-gradient(90deg, rgba(240,153,46,0.06), rgba(224,99,160,0.04))",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#F0992E" }}>
          Upcoming unlock events
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        {events.map((e, i) => {
          const usd = priceUsd ? e.tokensWhole * priceUsd : null;
          return (
            <div key={`${e.streamId}-${e.timestamp}-${i}`} className="px-4 md:px-5 py-3 flex items-center gap-3">
              <div
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold"
                style={{ background: `${protocolColour(e.protocol)}15`, color: protocolColour(e.protocol) }}
              >
                {protocolName(e.protocol).charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "#1A1D20" }}>
                  {fmtTokens(e.tokensWhole)} {symbol}
                  {usd && <span className="ml-1.5 text-xs font-normal" style={{ color: "#8B8E92" }}>({fmtUsd(usd)})</span>}
                </div>
                <div className="text-[10.5px] mt-0.5 font-mono flex items-center gap-1.5" style={{ color: "#B8BABD" }}>
                  <span>{protocolName(e.protocol)} · {truncate(e.recipient)}</span>
                  {/* 2026-05-14: per-event "tx ↗" pill. Links straight to the
                      originating lock transaction on the chain's block
                      explorer — the on-chain anchor a retail buyer can
                      verify themselves. Hidden when adapter didn't expose
                      the hash (PinkSale + Solana adapters currently). */}
                  {e.lockTxHash && e.chainId && (
                    <a
                      href={`${BLOCK_EXPLORERS_PUBLIC[e.chainId] ?? "https://etherscan.io"}/tx/${e.lockTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      title={`View lock transaction · ${e.lockTxHash.slice(0, 10)}…`}
                      className="inline-flex items-center px-1 rounded text-[9px] font-bold tracking-wider hover:opacity-80 transition-opacity"
                      style={{ color: "#0F8A8A", background: "rgba(28,184,184,0.08)", border: "1px solid rgba(28,184,184,0.18)", height: 16 }}
                    >
                      TX ↗
                    </a>
                  )}
                </div>
              </div>
              <div
                className="flex-shrink-0 text-[11px] font-bold px-2.5 py-0.5 rounded-full tabular-nums"
                style={{ background: "rgba(240,153,46,0.1)", color: "#ea580c" }}
              >
                {relUntil(e.timestamp)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
