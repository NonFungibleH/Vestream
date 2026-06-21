// /dashboard/explorer/token/[chainId]/[address]
// ─────────────────────────────────────────────────────────────────────────────
// Token drill-down view inside the Vesting Index. Shows a token's vesting
// grouped into rounds (by terms), plotted on one overview graph, and lets the
// user expand a round to see every wallet receiving tokens.
//
// Server component — renders with data in the HTML (no client-side fetch
// spinner). Reads the cache via getTokenStreams(); Pro-gated by the
// /dashboard layout (requireDashboardAccess).
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
import Link from "next/link";
import { CHAIN_NAMES, type SupportedChainId } from "@/lib/vesting/types";
import { getTokenStreams, getTokenMarketData, getSmartMoneyHoldersOfToken, getTokenUpcomingEvents } from "@/lib/vesting/token-aggregates";
import { groupIntoRounds } from "@/lib/vesting/rounds";
import { getCurrentUserTier } from "@/lib/auth/tier";
import { withTimeout } from "@/lib/with-timeout";
import { TokenUnlockChart } from "./TokenUnlockChart";
import { RoundsList } from "./RoundsList";
import { HolderDistribution, type HolderRow } from "./HolderDistribution";
import type { VestingStream } from "@/lib/vesting/types";
import { CopyButton } from "./CopyButton";
import { SaveTokenButton } from "./SaveTokenButton";
import { blockExplorerUrl, blockExplorerName, tokenSnifferUrl, xSearchUrl } from "@/lib/chain-links";
import type { TokenMarketData } from "@/lib/vesting/token-aggregates";

const FREE_TIER_ROW_CAP = 50;

const fmtNum = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(2)}K`
  : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtDate = (t: number | null) =>
  t ? new Date(t * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

export default async function ExplorerTokenPage({
  params,
}: {
  params: Promise<{ chainId: string; address: string }>;
}) {
  const { chainId, address } = await params;
  const cid = Number(chainId);
  // Ecosystem-aware (2026-06-12): the old EVM-only regex + blanket
  // .toLowerCase() 404'd every Solana token (Streamflow / Jupiter Lock) —
  // base58 mints are case-SENSITIVE and don't match /^0x.../.
  const addr = normaliseAddress(decodeURIComponent(address));
  if (!CHAIN_NAMES[cid as SupportedChainId] || !isValidWalletAddress(addr)) {
    notFound();
  }

  // Dark-mode theming is owned by <DarkModeProvider> in the dashboard
  // layout — see the comment on the parent /dashboard/explorer page for
  // the full why-no-per-page-dark-class rationale. 2026-06-12.
  const tier = await getCurrentUserTier();
  const isFree = tier === "free" || tier == null;

  // Each call is bounded so a stalled dependency (e.g. a saturated Supabase
  // pooler connection) degrades to a partial render in seconds instead of
  // hanging the whole render until Cloudflare's 100s gateway cuts it → a 524
  // the user sees as "this page couldn't load". Streams get the most headroom
  // (they're the page's core content); the secondary panels fail fast.
  const [streams, market, smartHolders, upcomingEvents] = await Promise.all([
    withTimeout(getTokenStreams(cid, addr), 15_000, [], "token:getTokenStreams"),
    withTimeout(getTokenMarketData(cid, addr), 8_000, null, "token:getTokenMarketData"),
    withTimeout(getSmartMoneyHoldersOfToken(cid, addr), 6_000, [], "token:getSmartMoney"),
    withTimeout(getTokenUpcomingEvents(cid, addr, 50), 6_000, [], "token:getUpcomingEvents"),
  ]);

  const rounds = groupIntoRounds(streams);
  const dec = streams[0]?.tokenDecimals ?? 18;
  const symbol = streams[0]?.tokenSymbol ?? shortAddr(addr);
  const name = market?.tokenName ?? null;
  const priceUsd = market?.priceUsd ?? null;
  const recipientCount = new Set(streams.map((s) => s.recipient.toLowerCase())).size;
  const totalLockedWhole = streams.reduce((a, s) => a + Number(BigInt(s.lockedAmount ?? "0")) / 10 ** dec, 0);
  const nextUnlock = rounds.reduce<number | null>(
    (m, r) => (r.nextUnlockTime != null && (m == null || r.nextUnlockTime < m) ? r.nextUnlockTime : m),
    null,
  );

  // ── Holder distribution + vesting span ───────────────────────────────────
  // "Who holds the locked supply" is the single biggest informed-decision
  // signal — a fair launch (many wallets, no whale) reads very differently
  // from 3 wallets holding 95%. Aggregate locked-by-recipient (cheap: one
  // token's streams, already loaded) → concentration + a ranked holder list.
  const dist = computeDistribution(streams, dec, priceUsd);
  // Whole-token vesting span + how far through it the token is, for the
  // "lengths" the user asked to surface.
  const spanStarts = streams.map((s) => s.startTime).filter((t): t is number => !!t);
  const spanEnds   = streams.map((s) => s.endTime).filter((t): t is number => !!t);
  const firstStart = spanStarts.length ? Math.min(...spanStarts) : null;
  const lastEnd    = spanEnds.length ? Math.max(...spanEnds) : null;
  const spanPct = firstStart != null && lastEnd != null && lastEnd > firstStart
    ? Math.max(0, Math.min(1, (Math.floor(Date.now() / 1000) - firstStart) / (lastEnd - firstStart)))
    : null;

  // ── #6 enrichments ──────────────────────────────────────────────────────
  // Realisable value of the locked supply (price × locked), with a liquidity
  // caveat: under $10k DEX depth the dollar figure is more notional than
  // realisable, so we flag it rather than present it as gospel.
  const lockedValueUsd = priceUsd != null ? totalLockedWhole * priceUsd : null;
  const liqUsd = market?.liquidity ?? null;
  // How big the vesting overhang is vs the circulating token — the number that
  // tells you whether the holder concentration below actually matters (a single
  // wallet holding 100% of a vesting that's 2% of market cap is a non-event).
  const vestingShareOfMktCap = lockedValueUsd != null && market?.marketCap
    ? lockedValueUsd / market.marketCap
    : null;
  const thinLiquidity = lockedValueUsd != null && (liqUsd == null || liqUsd < 10_000);
  // Absorption: how many days of average 24h volume it would take to trade
  // through the ENTIRE locked supply. The market's capacity to swallow the
  // overhang — high = heavy structural sell pressure as the locked supply vests.
  const absorptionDays = lockedValueUsd != null && market?.volume24h != null && market.volume24h > 0
    ? lockedValueUsd / market.volume24h
    : null;
  // Nearest FUTURE cliff across streams — a cliff is a single lump unlock
  // (distinct from gradual linear/step vesting), the kind worth bracing for.
  const nowSec = Math.floor(Date.now() / 1000);
  const nextCliff = streams.reduce<number | null>(
    (m, s) => (s.cliffTime != null && s.cliffTime > nowSec && (m == null || s.cliffTime < m) ? s.cliffTime : m),
    null,
  );

  // ── End-user enrichments (#1–#3) ─────────────────────────────────────────
  // #1 % of supply locked. Total supply ≈ FDV ÷ price (DexScreener fields we
  // already have). The single number a trader scans for: how much of the
  // whole token is still locked / yet to hit the market.
  const totalSupplyApprox = market?.fdv != null && priceUsd != null && priceUsd > 0
    ? market.fdv / priceUsd
    : null;
  const pctSupplyLocked = totalSupplyApprox != null && totalSupplyApprox > 0
    ? totalLockedWhole / totalSupplyApprox
    : null;

  // #3 Vesting progress — how far through the WHOLE schedule the token is, by
  // tokens (not time): (totalEver − stillLocked) / totalEver. totalAmount is
  // the original grant; lockedAmount is what's left. Falls back to locked when
  // an adapter didn't surface totalAmount (then progress reads 0% — honest).
  const totalGrantedWhole = streams.reduce((a, s) => {
    let t = 0;
    try { t = Number(BigInt(s.totalAmount ?? s.lockedAmount ?? "0")) / 10 ** dec; } catch { /* keep 0 */ }
    return a + t;
  }, 0);
  const vestedPct = totalGrantedWhole > 0
    ? Math.max(0, Math.min(1, (totalGrantedWhole - totalLockedWhole) / totalGrantedWhole))
    : null;

  // #2 Forward unlocks — aggregate the per-stream upcoming events by day, so
  // the user sees concrete "what unlocks next, when, and how big" instead of
  // just the curve shape. Top 5 nearest dates with token amount, USD, % supply.
  const unlocksByDay = new Map<number, number>();
  for (const ev of upcomingEvents) {
    const day = Math.floor(ev.timestamp / 86_400) * 86_400;
    unlocksByDay.set(day, (unlocksByDay.get(day) ?? 0) + ev.tokensWhole);
  }
  const nextUnlocks = [...unlocksByDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 5)
    .map(([ts, tokens]) => ({
      ts,
      tokens,
      usd:       priceUsd != null ? tokens * priceUsd : null,
      pctSupply: totalSupplyApprox != null && totalSupplyApprox > 0 ? tokens / totalSupplyApprox : null,
    }));

  return (
    <main className="flex-1 px-4 md:px-8 py-6 md:py-8 overflow-y-auto w-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px] mb-3" style={{ color: "var(--preview-text-3)" }}>
        <Link href="/dashboard" className="hover:underline">Dashboard</Link><span>/</span>
        <Link href="/dashboard/explorer" className="hover:underline">Vesting Explorer</Link><span>/</span>
        <span style={{ color: "var(--preview-text-2)" }}>{symbol}</span>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border p-5 mb-5" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
              {symbol}{name ? <span className="font-normal" style={{ color: "var(--preview-text-3)" }}> · {name}</span> : null}
            </h1>
            <div className="flex items-center flex-wrap gap-2 mt-1.5">
              <span className="text-[11px] font-mono break-all" style={{ color: "var(--preview-text-3)" }}>{addr}</span>
              <CopyButton text={addr} />
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--preview-muted-2)", color: "var(--preview-text-3)" }}>
                {CHAIN_NAMES[cid as SupportedChainId]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {priceUsd != null && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>Price</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>
                  ${priceUsd < 0.01 ? priceUsd.toPrecision(2) : priceUsd.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </p>
                {/* Low-liquidity prices ARE shown (DexScreener has a market),
                    but flagged so the figure reads as a thin-market estimate
                    rather than a reliable mark. */}
                {liqUsd != null && liqUsd < 10_000 && (
                  <p className="text-[10px] font-semibold" style={{ color: "#d97706" }}
                    title={`Low DEX liquidity (~$${Math.round(liqUsd).toLocaleString()}). The price is real but thin — large size couldn't trade at it.`}>
                    ⚠ low liquidity
                  </p>
                )}
              </div>
            )}
            <SaveTokenButton chainId={cid} address={addr} symbol={symbol} />
            {/* Link to the public, shareable token page (no auth) — same token,
                but the marketing/SEO surface with the social-share + FAQ. The
                two pages are deliberately different audiences (this is the
                gated analyst tool; that one is public + shareable). */}
            <a
              href={`/token/${cid}/${addr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border)", color: "var(--preview-text-2)" }}
            >
              Public page ↗
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          {([
            // Vesting stats (our index).
            { label: "Locked value", val: lockedValueUsd != null ? `$${fmtNum(lockedValueUsd)}` : "—" },
            { label: "Total locked", val: `${fmtNum(totalLockedWhole)} ${symbol}` },
            // % of total supply still locked (≈ totalLocked ÷ FDV/price). The
            // headline overhang read; ">100%" when our tracked lock exceeds
            // DexScreener's FDV-implied supply (common for heavily-locked tokens).
            { label: "% supply locked",
              val: pctSupplyLocked != null
                ? (pctSupplyLocked > 1 ? ">100%" : `${(pctSupplyLocked * 100).toFixed(pctSupplyLocked < 0.1 ? 1 : 0)}%`)
                : "—" },
            { label: "Recipients", val: recipientCount.toLocaleString() },
            { label: "Rounds", val: String(rounds.length) },
            { label: "Next unlock", val: fmtDate(nextUnlock) },
            // Market stats — already fetched in TokenMarketData (DexScreener),
            // surfaced here so the page reads as a real token dashboard.
            { label: "Market cap", val: market?.marketCap != null ? `$${fmtNum(market.marketCap)}` : "—" },
            { label: "FDV", val: market?.fdv != null ? `$${fmtNum(market.fdv)}` : "—" },
            { label: "24h volume", val: market?.volume24h != null ? `$${fmtNum(market.volume24h)}` : "—" },
            // Absorption — locked supply ÷ daily volume, in "days of volume".
            // Amber > 30d, red > 90d: the overhang would take months to clear.
            { label: "Absorption",
              val: absorptionDays != null ? (absorptionDays >= 1 ? `${fmtNum(absorptionDays)}d vol` : "<1d vol") : "—",
              valColor: absorptionDays != null ? (absorptionDays > 90 ? "#dc2626" : absorptionDays > 30 ? "#d97706" : undefined) : undefined },
            { label: "Liquidity", val: liqUsd != null ? `$${fmtNum(liqUsd)}` : "—" },
            { label: "24h change",
              val: market?.change24h != null ? `${market.change24h >= 0 ? "+" : ""}${market.change24h.toFixed(1)}%` : "—",
              valColor: market?.change24h != null ? (market.change24h >= 0 ? "#0F8A8A" : "#dc2626") : undefined },
          ] as Array<{ label: string; val: string; valColor?: string }>).map((t) => (
            <div key={t.label} className="rounded-xl px-3 py-2.5" style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>{t.label}</p>
              <p className="text-sm font-bold tabular-nums mt-0.5 truncate" style={{ color: t.valColor ?? "var(--preview-text)" }}>{t.val}</p>
            </div>
          ))}
        </div>
        {/* Realisable-value honesty: a thin DEX pool means the "locked value"
            above is more notional than realisable. */}
        {thinLiquidity && (
          <p className="text-[11px] mt-2" style={{ color: "var(--preview-text-3)" }}>
            ⚠ Locked value is notional — under $10k DEX liquidity, this size couldn&apos;t be realised at the quoted price.
          </p>
        )}
        {/* Next-cliff callout — a lump unlock, distinct from gradual vesting. */}
        {nextCliff != null && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", color: "#b45309" }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span><strong>Cliff unlock {fmtDate(nextCliff)}</strong> — a lump unlocks at once, not gradually.</span>
          </div>
        )}
        {/* Smart-money-on-token — top-100 wallets that vest this token among
            their largest positions. The "the smart money is in this" signal. */}
        {smartHolders.length > 0 && (
          <div className="mt-3 px-3 py-2.5 rounded-lg" style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.22)" }}>
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#0F8A8A" }}>
              Smart money · {smartHolders.length} top-100 wallet{smartHolders.length === 1 ? "" : "s"} vest this token
            </p>
            <div className="flex flex-wrap gap-1.5">
              {smartHolders.slice(0, 8).map((h) => (
                <Link key={h.recipient}
                  href={`/dashboard/explorer?mode=wallet&q=${encodeURIComponent(h.recipient)}`}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold hover:opacity-80 transition-opacity"
                  style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", color: "var(--preview-text-2)" }}>
                  <span style={{ color: "#0F8A8A" }}>#{h.rank}</span>
                  <span className="font-mono">{shortAddr(h.recipient)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Due-diligence row — project social/data links to help users
            assess the token. All sourced from DexScreener except the
            block explorer + TokenSniffer (chain-deterministic) and the
            X-search (always available). Links missing from DexScreener
            simply don't render — no awkward "—" placeholders. 2026-06-12. */}
        <DueDiligenceRow
          chainId={cid}
          tokenAddress={addr}
          tokenSymbol={symbol}
          market={market}
        />
      </div>

      {streams.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--preview-border)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text-2)" }}>No active vesting indexed for this token yet</p>
          <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>It may not use one of the protocols we track, or all of its streams have fully vested.</p>
        </div>
      ) : (
        <>
          <HolderDistribution
            holders={dist.holders}
            totalHolders={dist.totalHolders}
            top1={dist.top1}
            top5={dist.top5}
            symbol={symbol}
            firstStart={firstStart}
            lastEnd={lastEnd}
            spanPct={spanPct}
            isFree={isFree}
            rowCap={FREE_TIER_ROW_CAP}
            vestingShareOfMktCap={vestingShareOfMktCap}
          />

          {/* Vesting progress (#3) + next unlocks (#2) + alert CTA (#4) */}
          <div className="rounded-2xl border p-4 md:p-5 mb-5" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Vesting progress &amp; upcoming unlocks</h2>
              <Link href="/dashboard/alerts"
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: "rgba(28,184,184,0.10)", border: "1px solid rgba(28,184,184,0.25)", color: "#0F8A8A" }}>
                🔔 Alert me before unlocks
              </Link>
            </div>

            {vestedPct != null && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: "var(--preview-text-3)" }}>
                  <span><strong style={{ color: "var(--preview-text)" }}>{(vestedPct * 100).toFixed(0)}%</strong> vested</span>
                  <span>{((1 - vestedPct) * 100).toFixed(0)}% still locked</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--preview-muted-2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${vestedPct * 100}%`, background: "#0F8A8A" }} />
                </div>
              </div>
            )}

            {nextUnlocks.length > 0 ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--preview-text-3)" }}>Next unlocks</p>
                <div className="space-y-1">
                  {nextUnlocks.map((u) => (
                    <div key={u.ts} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--preview-muted-2)" }}>
                      <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--preview-text)" }}>{fmtDate(u.ts)}</span>
                      <span className="text-xs tabular-nums text-right" style={{ color: "var(--preview-text-2)" }}>
                        {fmtNum(u.tokens)} {symbol}
                        {u.usd != null && <span style={{ color: "var(--preview-text-3)" }}> · ${fmtNum(u.usd)}</span>}
                        {u.pctSupply != null && <span style={{ color: "var(--preview-text-3)" }}> · {(u.pctSupply * 100).toFixed(u.pctSupply < 0.1 ? 2 : 1)}% supply</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>No upcoming unlock events indexed for this token.</p>
            )}
          </div>

          <div className="rounded-2xl border p-4 md:p-5 mb-5" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>Unlock overview</h2>
            <TokenUnlockChart rounds={rounds} symbol={symbol} />
          </div>

          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>
            Vesting rounds <span className="font-normal" style={{ color: "var(--preview-text-3)" }}>— click a round to see its wallets</span>
          </h2>
          <RoundsList rounds={rounds} symbol={symbol} isFree={isFree} rowCap={FREE_TIER_ROW_CAP} />
        </>
      )}
    </main>
  );
}

// ── Holder distribution ──────────────────────────────────────────────────
// Aggregate locked-by-recipient → concentration metrics + a ranked list.
// Pure JS over the already-loaded streams (one token), so no extra query.
function computeDistribution(
  streams: VestingStream[],
  dec: number,
  priceUsd: number | null,
): { holders: HolderRow[]; totalHolders: number; top1: number; top5: number; top10: number } {
  const byRecip = new Map<string, bigint>();
  for (const s of streams) {
    const k = s.recipient.toLowerCase();
    let v = 0n;
    try { v = BigInt(s.lockedAmount ?? "0"); } catch { /* keep 0n */ }
    byRecip.set(k, (byRecip.get(k) ?? 0n) + v);
  }
  const entries = [...byRecip.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  let total = 0n;
  for (const [, v] of entries) total += v;
  const totalNum = Number(total);
  const shareOf = (locked: bigint) => (total > 0n ? Number(locked) / totalNum : 0);
  const cumShare = (n: number) =>
    total > 0n ? entries.slice(0, n).reduce((a, [, v]) => a + Number(v), 0) / totalNum : 0;

  const holders: HolderRow[] = entries.map(([recipient, locked]) => {
    const lockedWhole = Number(locked) / 10 ** dec;
    return {
      recipient,
      lockedWhole,
      usd:   priceUsd != null ? lockedWhole * priceUsd : null,
      share: shareOf(locked),
    };
  });

  return {
    holders,
    totalHolders: entries.length,
    top1:  entries[0] ? shareOf(entries[0][1]) : 0,
    top5:  cumShare(5),
    top10: cumShare(10),
  };
}

// ── Due-diligence link row ───────────────────────────────────────────────
// Renders only what we actually have. Themed via CSS vars so it tracks the
// dashboard's dark-mode reactively (the explorer's whole tree sits inside
// the DarkModeProvider's reactive `.dark` wrapper — see use-dark-mode.tsx).
// Order is by user intent: project surfaces first (the things you'd visit
// to read about the project), market/data surfaces second (where you'd
// check liquidity + traders), security/explorer last.

interface DueDiligenceRowProps {
  chainId:      number;
  tokenAddress: string;
  tokenSymbol:  string;
  market:       TokenMarketData | null;
}

function DueDiligenceRow({ chainId, tokenAddress, tokenSymbol, market }: DueDiligenceRowProps) {
  const explorerName = blockExplorerName(chainId);
  const links: Array<{ href: string | null; label: string }> = [
    // Project surfaces.
    { href: market?.website     ?? null, label: "Website" },
    { href: market?.twitterUrl  ?? null, label: "X / Twitter" },
    { href: market?.telegramUrl ?? null, label: "Telegram" },
    { href: market?.discordUrl  ?? null, label: "Discord" },
    // Market / data surfaces.
    { href: market?.dexScreenerUrl ?? null, label: "DexScreener" },
    { href: market?.dexToolsUrl    ?? null, label: "DexTools" },
    { href: xSearchUrl(tokenSymbol, tokenAddress), label: `Search $${tokenSymbol} on X` },
    // Security + on-chain truth.
    { href: tokenSnifferUrl(chainId, tokenAddress), label: "TokenSniffer" },
    { href: blockExplorerUrl(chainId, tokenAddress), label: explorerName ?? "Explorer" },
  ];
  const present = links.filter((l) => l.href);
  if (present.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--preview-border-2)" }}>
      <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--preview-text-3)" }}>
        Project links · do your own due diligence
      </p>
      <div className="flex flex-wrap gap-1.5">
        {present.map((l) => (
          <a
            key={l.label}
            href={l.href!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-opacity hover:opacity-80"
            style={{
              background: "var(--preview-muted)",
              border:     "1px solid var(--preview-border)",
              color:      "var(--preview-text)",
            }}
          >
            {l.label}
            <span aria-hidden style={{ opacity: 0.5 }}>↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
