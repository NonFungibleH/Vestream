// src/components/TokenMetaPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Stats + external-links panel rendered at the top of /token/[chainId]/[address].
//
// Shows at a glance:
//   • Live price + 24h change (DexScreener-sourced)
//   • Liquidity USD · 24h volume · FDV / market cap
//   • Indexed locked supply (from our own cache) — the Vestream differentiator
//   • External links row: block explorer · website · project X · TokenSniffer
//     · DexScreener · "Search $SYMBOL on X"
//
// Server Component — pure, no hooks. Missing data (no socials, no price)
// renders gracefully; nothing here throws.
// ─────────────────────────────────────────────────────────────────────────────

import {
  blockExplorerUrl,
  blockExplorerName,
  tokenSnifferUrl,
  xSearchUrl,
} from "@/lib/chain-links";
import type { TokenMarketData, TokenOverview } from "@/lib/vesting/token-aggregates";

interface Props {
  chainId:      number;
  tokenAddress: string;
  /** Required — used for the X search query + labels. May be null for tokens
   *  that don't have a resolved symbol in either DexScreener or our cache. */
  tokenSymbol:  string | null;
  market:       TokenMarketData;
  overview:     TokenOverview;
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1)   return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

function fmtPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1)      return `$${n.toFixed(4)}`;
  if (n >= 0.01)   return `$${n.toFixed(4)}`;
  if (n >= 1e-5)   return `$${n.toFixed(6)}`;
  // Sub-0.00001: fall back to scientific notation so we don't display a
  // misleading string of zeros.
  return `$${n.toExponential(2)}`;
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

/** Label map for the protocol chips on the Locked Supply line. */
const PROTOCOL_NAMES: Record<string, string> = {
  sablier:        "Sablier",
  hedgey:         "Hedgey",
  uncx:           "UNCX",
  "uncx-vm":      "UNCX",
  unvest:         "Unvest",
  "team-finance": "Team Finance",
  superfluid:     "Superfluid",
  pinksale:       "PinkSale",
};

function summariseProtocols(mix: TokenOverview["protocolMix"]): string {
  const names = new Set<string>();
  for (const p of mix) {
    const name = PROTOCOL_NAMES[p.protocol] ?? p.protocol;
    names.add(name);
  }
  const arr = Array.from(names);
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} + ${arr[1]}`;
  return `${arr[0]}, ${arr[1]} +${arr.length - 2}`;
}

// ─── External link pill ──────────────────────────────────────────────────────
//
// Small presentational helper so the links row stays a list of one-liners.
// Always opens in a new tab and sets rel="noopener noreferrer" to prevent
// the destination from modifying window.opener (tabnabbing).

function LinkPill({
  href, label, testid,
}: { href: string | null; label: string; testid?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testid}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
      style={{
        background: "rgba(0,0,0,0.04)",
        border:     "1px solid rgba(21,23,26,0.10)",
        color:      "#1A1D20",
      }}
    >
      {label}
      <span aria-hidden style={{ opacity: 0.5 }}>↗</span>
    </a>
  );
}

export function TokenMetaPanel({
  chainId,
  tokenAddress,
  tokenSymbol,
  market,
  overview,
}: Props) {
  const lockedDisplay =
    overview.lockedTokensWhole > 0
      ? `${fmtTokens(overview.lockedTokensWhole)} ${tokenSymbol ?? ""}`.trim()
      : null;
  const lockedUsd =
    overview.lockedTokensWhole > 0 && market.priceUsd
      ? fmtUsd(overview.lockedTokensWhole * market.priceUsd)
      : null;
  const protocolSummary = summariseProtocols(overview.protocolMix);

  const changePositive = (market.change24h ?? 0) >= 0;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "white",
        border:     "1px solid rgba(21,23,26,0.10)",
        boxShadow:  "0 4px 24px rgba(28,184,184,0.06)",
      }}
    >
      {/* Row 1 — price (left) + market stats (right on desktop, below on mobile).
          The old layout was a single flex with everything wrapping, which
          at 375px scattered "Liquidity / 24h volume / FDV" mid-wrap. On
          mobile we now stack: price on top, stats trio in a 3-column grid
          below it so each stat gets a consistent column width. */}
      <div className="px-5 md:px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#B8BABD" }}>
            Price
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <div className="text-2xl font-bold tabular-nums" style={{ color: "#1A1D20" }}>
              {fmtPrice(market.priceUsd)}
            </div>
            {market.change24h != null && (
              <div
                className="text-sm font-semibold tabular-nums"
                style={{ color: changePositive ? "#2DB36A" : "#B3322E" }}
              >
                {fmtPct(market.change24h)}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 md:flex md:items-center md:gap-5 text-xs">
          <Stat label="Liquidity" value={fmtUsd(market.liquidity)} />
          <Stat label="24h volume" value={fmtUsd(market.volume24h)} />
          <Stat label="FDV"       value={fmtUsd(market.fdv ?? market.marketCap)} />
        </div>
      </div>

      {/* Row 2 — Vestream differentiator: indexed locked supply.
          Two-row layout at mobile so the badge + amount stay on one line
          and the "locked across N streams · protocols" descriptor sits
          below in full width, rather than fragmenting mid-phrase when
          it wraps in-line with the badge. */}
      {lockedDisplay && (
        <div
          className="px-5 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2 sm:gap-3 text-sm"
          style={{
            background:   "linear-gradient(90deg, rgba(28,184,184,0.04), rgba(15,138,138,0.04))",
            borderTop:    "1px solid rgba(0,0,0,0.05)",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(28,184,184,0.1)", color: "#1CB8B8" }}
            >
              🔒 Vestream-indexed
            </span>
            <span className="font-semibold" style={{ color: "#1A1D20" }}>
              {lockedDisplay}
            </span>
            {lockedUsd && (
              <span className="font-semibold tabular-nums" style={{ color: "#8B8E92" }}>
                ({lockedUsd})
              </span>
            )}
          </div>
          <span style={{ color: "#8B8E92" }}>
            locked across {overview.activeStreamCount.toLocaleString()}{" "}
            {overview.activeStreamCount === 1 ? "stream" : "streams"}
            {protocolSummary && ` · ${protocolSummary}`}
          </span>
        </div>
      )}

      {/* Row 3 — external links */}
      <div className="px-5 md:px-6 py-3 flex items-center gap-2 flex-wrap">
        <LinkPill
          href={blockExplorerUrl(chainId, tokenAddress)}
          label={blockExplorerName(chainId) ?? "Explorer"}
          testid="link-explorer"
        />
        <LinkPill
          href={market.website}
          label="Website"
          testid="link-website"
        />
        <LinkPill
          href={market.twitterUrl}
          label="Project X"
          testid="link-twitter"
        />
        <LinkPill
          href={tokenSnifferUrl(chainId, tokenAddress)}
          label="TokenSniffer"
          testid="link-tokensniffer"
        />
        <LinkPill
          href={market.dexScreenerUrl}
          label="DexScreener"
          testid="link-dexscreener"
        />
        <LinkPill
          href={xSearchUrl(tokenSymbol, tokenAddress)}
          label={tokenSymbol ? `Search $${tokenSymbol} on X` : "Search on X"}
          testid="link-xsearch"
        />
      </div>
    </div>
  );
}

// Small inline stat — label above, value below. Used in row 1 next to the price.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#B8BABD" }}>
        {label}
      </div>
      <div className="font-semibold tabular-nums mt-0.5" style={{ color: "#1A1D20" }}>
        {value}
      </div>
    </div>
  );
}
