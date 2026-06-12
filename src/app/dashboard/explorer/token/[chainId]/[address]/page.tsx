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
import { getTokenStreams, getTokenMarketData } from "@/lib/vesting/token-aggregates";
import { groupIntoRounds } from "@/lib/vesting/rounds";
import { getCurrentUserTier } from "@/lib/auth/tier";
import { TokenUnlockChart } from "./TokenUnlockChart";
import { RoundsList } from "./RoundsList";
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

  const [streams, market] = await Promise.all([
    getTokenStreams(cid, addr),
    getTokenMarketData(cid, addr).catch(() => null),
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

  return (
    <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-7xl overflow-y-auto">
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
              </div>
            )}
            <SaveTokenButton chainId={cid} address={addr} symbol={symbol} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[
            { label: "Total locked", val: `${fmtNum(totalLockedWhole)} ${symbol}` },
            { label: "Recipients", val: recipientCount.toLocaleString() },
            { label: "Rounds", val: String(rounds.length) },
            { label: "Next unlock", val: fmtDate(nextUnlock) },
          ].map((t) => (
            <div key={t.label} className="rounded-xl px-3 py-2.5" style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>{t.label}</p>
              <p className="text-sm font-bold tabular-nums mt-0.5 truncate" style={{ color: "var(--preview-text)" }}>{t.val}</p>
            </div>
          ))}
        </div>

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
