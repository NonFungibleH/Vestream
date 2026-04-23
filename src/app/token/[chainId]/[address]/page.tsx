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
// Revalidates every 60s — price drift and new streams show up within a minute.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { PROTOCOLS } from "@/lib/protocol-constants";
import { TokenMetaPanel } from "@/components/TokenMetaPanel";
import { TokenPulse } from "@/components/TokenPulse";
import { TokenFAQ } from "@/components/TokenFAQ";
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

export const revalidate = 60;

// ─── Small presentational helpers ───────────────────────────────────────────

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
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
  return meta?.color ?? "#64748b";
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
  if (!CHAIN_NAMES[cid]) return { title: "Token not found — Vestream" };

  const [overview, market] = await Promise.all([
    getTokenOverview(cid, address),
    getTokenMarketData(cid, address),
  ]);

  const symbol  = market.tokenName || overview?.tokenSymbol || truncate(address);
  const chain   = CHAIN_NAMES[cid];
  const locked  = overview ? fmtTokens(overview.lockedTokensWhole) : "0";
  const title   = `${symbol} unlocks on ${chain} — Vestream`;
  const desc    = overview
    ? `${locked} ${symbol} still vesting across ${overview.protocolMix.length} protocol${overview.protocolMix.length === 1 ? "" : "s"}. Live unlock calendar, top recipients, and 30-day pressure.`
    : `Vesting activity for ${symbol} on ${chain}. Track unlocks before they hit.`;

  return {
    title,
    description: desc,
    alternates: { canonical: `https://vestream.io/token/${cid}/${address.toLowerCase()}` },
    openGraph: {
      title, description: desc,
      url: `https://vestream.io/token/${cid}/${address.toLowerCase()}`,
      siteName: "Vestream",
      type: "website",
    },
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function TokenPage(
  { params }: { params: Promise<Params> },
) {
  const { chainId, address } = await params;
  const cid   = Number(chainId);
  const addr  = address.toLowerCase();

  if (!CHAIN_NAMES[cid] || !/^0x[0-9a-f]{40}$/.test(addr)) {
    notFound();
  }

  const [overview, calendar, recipients, upcoming, market] = await Promise.all([
    getTokenOverview(cid, addr),
    getTokenUnlockCalendar(cid, addr, 12),
    getTokenRecipients(cid, addr, 10),
    getTokenUpcomingEvents(cid, addr, 8),
    getTokenMarketData(cid, addr),
  ]);

  const hasVesting  = overview !== null && overview.streamCount > 0;
  const priceUsd    = market.priceUsd;
  const lockedUsd   = priceUsd && overview ? overview.lockedTokensWhole * priceUsd : null;
  const upcoming30Usd = priceUsd && overview ? overview.upcoming30dTokens * priceUsd : null;
  const upcoming7Usd  = priceUsd && overview ? overview.upcoming7dTokens  * priceUsd : null;
  const overhangPct = lockedUsd != null && market.fdv && market.fdv > 0
    ? (lockedUsd / market.fdv) * 100
    : null;
  const symbol  = overview?.tokenSymbol ?? market.tokenName ?? truncate(addr);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#f8fafc", color: "#0f172a" }}>
      <SiteNav theme="light" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="pt-24 pb-6 md:pt-32 md:pb-10 px-4 md:px-8 max-w-5xl mx-auto">
        <div className="flex items-start gap-4 md:gap-5 flex-wrap">
          {market.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={market.imageUrl}
              alt={symbol}
              width={64}
              height={64}
              className="rounded-full flex-shrink-0"
              style={{ border: "1px solid rgba(0,0,0,0.08)", background: "white" }}
            />
          ) : (
            <div
              className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
              style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.22)", color: "#2563eb" }}
            >
              {symbol.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
                {symbol}
              </h1>
              {market.tokenName && market.tokenName !== symbol && (
                <span className="text-sm" style={{ color: "#94a3b8" }}>
                  · {market.tokenName}
                </span>
              )}
              <span
                className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider"
                style={{ background: "rgba(0,0,0,0.04)", color: "#64748b" }}
              >
                {CHAIN_NAMES[cid]}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-sm">
              <span className="font-mono" style={{ color: "#64748b" }}>
                {truncate(addr, 6)}
              </span>
              {priceUsd && (
                <>
                  <span className="font-bold tabular-nums" style={{ color: "#0f172a" }}>
                    {fmtUsd(priceUsd, false)}
                  </span>
                  {market.change24h != null && (
                    <span
                      className="tabular-nums font-semibold"
                      style={{ color: market.change24h >= 0 ? "#10b981" : "#ef4444" }}
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
      </section>

      {/* ── Stats + external links panel (DexScreener market + our own LP-lock
          readout + every external link the token-sleuth actually wants) ──── */}
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

      {/* ── Pulse summary — 3-4 bullets with a "See more" narrative.
          Rendered only when there's something substantive to say (the
          pulse builder returns empty bullets otherwise and the component
          renders null). Sits between the meta panel and the hero stats so
          visitors get the "what's happening with this token right now"
          read-out before diving into the raw numbers. */}
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

      {/* ── 4 hero stats ───────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <HeroStat
            label="Locked"
            value={lockedUsd != null ? fmtUsd(lockedUsd) : (overview ? `${fmtTokens(overview.lockedTokensWhole)} ${symbol}` : "—")}
            sub={overhangPct != null ? `${overhangPct.toFixed(1)}% of FDV` : (market.fdv ? "—" : "no price data")}
            accent="#2563eb"
          />
          <HeroStat
            label="Unlocking next 7d"
            value={upcoming7Usd != null ? fmtUsd(upcoming7Usd) : (overview ? fmtTokens(overview.upcoming7dTokens) : "—")}
            sub={overview ? `${fmtTokens(overview.upcoming7dTokens)} ${symbol}` : ""}
            accent="#ec4899"
          />
          <HeroStat
            label="Unlocking next 30d"
            value={upcoming30Usd != null ? fmtUsd(upcoming30Usd) : (overview ? fmtTokens(overview.upcoming30dTokens) : "—")}
            sub={overview ? `${fmtTokens(overview.upcoming30dTokens)} ${symbol}` : ""}
            accent="#f97316"
          />
          <HeroStat
            label="Recipients"
            value={overview ? overview.recipientCount.toLocaleString() : "—"}
            sub={overview ? `${overview.streamCount} active streams` : ""}
            accent="#0891b2"
          />
        </div>
      </section>

      {/* ── No-vesting state ───────────────────────────────────────────────── */}
      {!hasVesting && (
        <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto">
          <div
            className="rounded-2xl p-8 md:p-10 text-center"
            style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
          >
            <div className="text-base font-semibold mb-2" style={{ color: "#0f172a" }}>
              No vesting activity indexed for {symbol}
            </div>
            <p className="text-sm max-w-md mx-auto" style={{ color: "#64748b" }}>
              We haven&apos;t seen any active vesting streams for this token yet.
              It may not use any of the 7 protocols we track, or no streams have
              reached our cache. If you have a wallet with {symbol} vesting,
              searching it on Vestream will add it here.
            </p>
            <Link
              href="/find-vestings"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl font-semibold text-sm"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: "white",
                boxShadow: "0 4px 16px rgba(37,99,235,0.3)",
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
            <UnlockCalendar calendar={calendar} priceUsd={priceUsd} symbol={symbol} />
          </section>

          {/* ── Protocol mix + top recipients side-by-side ─────────────── */}
          <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <ProtocolMix mix={overview.protocolMix} total={overview.lockedTokensWhole} />
            </div>
            <div className="lg:col-span-3">
              <RecipientTable rows={recipients} symbol={symbol} priceUsd={priceUsd} />
            </div>
          </section>

          {/* ── Upcoming events chronological list ─────────────────────── */}
          {upcoming.length > 0 && (
            <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
              <UpcomingEvents events={upcoming} symbol={symbol} priceUsd={priceUsd} />
            </section>
          )}
        </>
      )}

      {/* ── SEO FAQ ───────────────────────────────────────────────────────
          Rendered even when hasVesting is false — questions like "what is
          $TOKEN FDV" still have valid answers, and the FAQPage JSON-LD is
          the main SEO win regardless of whether a vesting schedule exists.
          For a not-yet-indexed token the answers gracefully degrade to
          "Vestream has not indexed vesting for $TOKEN yet". */}
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

      <SiteFooter theme="light" />
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
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: accent }}>
        {label}
      </div>
      <div className="text-xl md:text-2xl font-bold tabular-nums" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-1" style={{ color: "#94a3b8" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function UnlockCalendar({
  calendar, priceUsd, symbol,
}: { calendar: UnlockCalendarBucket[]; priceUsd: number | null; symbol: string }) {
  const maxBucket = Math.max(1, ...calendar.map((b) => b.totalTokensWhole));
  const grandTotal = calendar.reduce((s, b) => s + b.totalTokensWhole, 0);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div
        className="flex items-center justify-between px-4 md:px-5 py-3 flex-wrap gap-2"
        style={{
          background:   "linear-gradient(90deg, rgba(37,99,235,0.05), rgba(124,58,237,0.04))",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>
            12-month unlock schedule
          </span>
        </div>
        <div className="text-xs" style={{ color: "#64748b" }}>
          <span className="font-semibold tabular-nums" style={{ color: "#0f172a" }}>
            {fmtTokens(grandTotal)} {symbol}
          </span>
          {priceUsd && <span className="ml-1">· {fmtUsd(grandTotal * priceUsd)}</span>}
        </div>
      </div>

      <div className="px-4 md:px-5 py-4 overflow-x-auto">
        <div className="flex items-end gap-1 md:gap-2" style={{ minHeight: 160 }}>
          {calendar.map((b) => {
            const pct = (b.totalTokensWhole / maxBucket) * 100;
            const usd = priceUsd ? b.totalTokensWhole * priceUsd : null;
            return (
              <div key={b.timestamp} className="flex flex-col items-center flex-1 min-w-[34px] group">
                <div
                  className="w-full flex flex-col-reverse rounded-t"
                  style={{ height: 130, position: "relative" }}
                  title={`${b.label}: ${fmtTokens(b.totalTokensWhole)} ${symbol}${usd ? ` (${fmtUsd(usd)})` : ""}`}
                >
                  {b.byProtocol.length === 0 ? (
                    <div className="w-full" style={{ height: 0 }} />
                  ) : (
                    b.byProtocol.map((seg, i) => {
                      const segPct = (seg.tokensWhole / b.totalTokensWhole) * pct;
                      return (
                        <div
                          key={seg.protocol + i}
                          className="w-full transition-opacity group-hover:opacity-90"
                          style={{
                            height: `${segPct}%`,
                            background: protocolColour(seg.protocol),
                            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.4)" : undefined,
                          }}
                        />
                      );
                    })
                  )}
                </div>
                <div className="text-[9.5px] mt-2 text-center" style={{ color: "#94a3b8" }}>
                  {b.label.split(" ")[0]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="px-4 md:px-5 py-2.5 text-[10.5px] leading-relaxed flex items-center gap-4 flex-wrap"
        style={{
          background:  "rgba(0,0,0,0.015)",
          borderTop:   "1px solid rgba(0,0,0,0.05)",
          color:       "#94a3b8",
        }}
      >
        <span className="font-semibold" style={{ color: "#64748b" }}>Protocols:</span>
        {Array.from(new Set(calendar.flatMap((b) => b.byProtocol.map((s) => s.protocol)))).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: protocolColour(p) }} />
            {protocolName(p)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProtocolMix({
  mix, total,
}: { mix: TokenOverview["protocolMix"]; total: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden h-full"
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div
        className="px-4 md:px-5 py-3"
        style={{
          background: "rgba(0,0,0,0.02)",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#0f172a" }}>
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
                  <span className="text-sm font-semibold" style={{ color: "#0f172a" }}>
                    {protocolName(p.protocol)}
                  </span>
                </div>
                <span className="text-xs font-bold tabular-nums" style={{ color: "#0f172a" }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
                <div className="h-full" style={{ width: `${Math.max(2, pct)}%`, background: protocolColour(p.protocol) }} />
              </div>
              <div className="text-[10px] mt-1" style={{ color: "#94a3b8" }}>
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
  rows, symbol, priceUsd,
}: { rows: TokenRecipient[]; symbol: string; priceUsd: number | null }) {
  return (
    <div
      className="rounded-2xl overflow-hidden h-full"
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div
        className="px-4 md:px-5 py-3 flex items-center justify-between"
        style={{
          background: "rgba(0,0,0,0.02)",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#0f172a" }}>
          Top recipients
        </span>
        <span className="text-xs" style={{ color: "#94a3b8" }}>{rows.length} shown</span>
      </div>
      <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        {rows.map((r, idx) => {
          const lockedUsd = priceUsd ? r.lockedTokensWhole * priceUsd : null;
          return (
            <div key={r.recipient} className="px-4 md:px-5 py-3 flex items-center gap-3">
              <div
                className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold tabular-nums"
                style={{ background: "rgba(0,0,0,0.04)", color: "#64748b" }}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono truncate" style={{ color: "#0f172a" }}>
                  {truncate(r.recipient)}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {r.protocols.slice(0, 3).map((p) => (
                    <span
                      key={p}
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: `${protocolColour(p)}22`, color: protocolColour(p) }}
                    >
                      {protocolName(p)}
                    </span>
                  ))}
                  <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                    next {relUntil(r.nextUnlockTime)}
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-sm font-bold tabular-nums" style={{ color: "#0f172a" }}>
                  {lockedUsd != null ? fmtUsd(lockedUsd) : fmtTokens(r.lockedTokensWhole)}
                </div>
                {lockedUsd != null && (
                  <div className="text-[10px] tabular-nums" style={{ color: "#94a3b8" }}>
                    {fmtTokens(r.lockedTokensWhole)} {symbol}
                  </div>
                )}
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
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div
        className="px-4 md:px-5 py-3"
        style={{
          background: "linear-gradient(90deg, rgba(249,115,22,0.06), rgba(236,72,153,0.04))",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#f97316" }}>
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
                <div className="text-sm font-semibold" style={{ color: "#0f172a" }}>
                  {fmtTokens(e.tokensWhole)} {symbol}
                  {usd && <span className="ml-1.5 text-xs font-normal" style={{ color: "#64748b" }}>({fmtUsd(usd)})</span>}
                </div>
                <div className="text-[10.5px] mt-0.5 font-mono" style={{ color: "#94a3b8" }}>
                  {protocolName(e.protocol)} · {truncate(e.recipient)}
                </div>
              </div>
              <div
                className="flex-shrink-0 text-[11px] font-bold px-2.5 py-0.5 rounded-full tabular-nums"
                style={{ background: "rgba(249,115,22,0.1)", color: "#ea580c" }}
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
