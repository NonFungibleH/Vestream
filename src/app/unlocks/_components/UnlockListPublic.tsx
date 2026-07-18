// src/app/unlocks/_components/UnlockListPublic.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared list renderer for the public /unlocks/* ranking pages
// (biggest-this-week, mass-distributions). Server component – takes
// already-enriched WindowUnlockGroup[] and renders them with the same
// teaser-gated table treatment users see on /unlocks/[range].
//
// Kept deliberately minimal: NO data fetching, NO metric computation,
// NO sort decisions. Those happen in the page that owns the route – this
// is the bottom of the food chain. /unlocks/[range] still has its own
// inlined renderer for now (it predates this); converging the two is a
// future cleanup.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { PaywallTeaser } from "@/components/PaywallTeaser";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { listProtocols } from "@/lib/protocol-constants";
import { formatUsdCompact } from "@/lib/vesting/quick-prices";
import type { WindowUnlockGroup } from "@/lib/vesting/unlock-windows";

const TEASER_VISIBLE_ROWS = 10;
const PROTO_MAP = new Map(listProtocols().map((p) => [p.slug, p]));

function protocolDisplay(slug: string) {
  const meta = PROTO_MAP.get(slug);
  return { name: meta?.name ?? slug, color: meta?.color ?? "#64748b" };
}

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
  } catch { return "–"; }
}

function fmtDateUtc(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function relativeTimeUntil(unix: number | null): string {
  if (!unix) return "–";
  const diff = unix - Math.floor(Date.now() / 1000);
  if (diff <= 0)    return "now";
  if (diff < 3600)  return `in ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.round(diff / 3600)}h`;
  return `in ${Math.round(diff / 86400)}d`;
}

interface Props {
  groups:        WindowUnlockGroup[];
  emptyMessage:  string;
  /** Headline above the list – different per ranking page so the SEO
   *  intent is in the H2 (e.g. "Biggest unlocks this week"). */
  heading:       string;
  /** Optional rendering of the linkable target on each row. Defaults to
   *  the public token page; can be overridden once we have other
   *  destinations. */
  rowHrefFor?:   (g: WindowUnlockGroup) => string;
}

export function UnlockListPublic({ groups, emptyMessage, heading, rowHrefFor }: Props) {
  if (groups.length === 0) {
    return (
      <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto w-full">
        <h2 className="text-xl md:text-2xl font-bold mb-1"
          style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
          {heading}
        </h2>
        <p className="text-sm mb-4" style={{ color: "#8B8E92" }}>{emptyMessage}</p>
      </section>
    );
  }
  const visibleRows = groups.slice(0, TEASER_VISIBLE_ROWS);
  const gatedRows   = groups.slice(TEASER_VISIBLE_ROWS);

  const renderRow = (g: WindowUnlockGroup, i: number, withTopBorder: boolean) => {
    const proto = protocolDisplay(g.protocol);
    const chainName = CHAIN_NAMES[g.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${g.chainId}`;
    const href = rowHrefFor ? rowHrefFor(g) : `/token/${g.chainId}/${g.tokenAddress}`;
    return (
      <Link
        key={g.groupKey}
        href={href}
        className="grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-3 hover:bg-slate-50 transition-colors"
        style={{ borderTop: withTopBorder || i > 0 ? "1px solid rgba(0,0,0,0.05)" : undefined }}
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
        <div className="text-right tabular-nums" style={{ minWidth: 64 }}>
          {g.usdValue != null ? (
            <p className="text-sm font-bold"
              style={{
                color: "#1A1D20",
                opacity: g.usdConfidence === "medium" ? 0.7 : 1,
              }}>
              {formatUsdCompact(g.usdValue)}
            </p>
          ) : (
            <p className="text-sm font-semibold" style={{ color: "#B8BABD" }}>–</p>
          )}
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs font-semibold" style={{ color: "#1A1D20" }}>
            {g.eventTime ? fmtDateUtc(g.eventTime) : "–"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tabular-nums" style={{ color: "#0F8A8A" }}>
            {relativeTimeUntil(g.eventTime)}
          </p>
        </div>
      </Link>
    );
  };

  return (
    <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto w-full">
      <h2 className="text-xl md:text-2xl font-bold mb-1"
        style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
        {heading}
      </h2>
      <p className="text-sm mb-4" style={{ color: "#8B8E92" }}>
        {groups.length} group{groups.length === 1 ? "" : "s"}. Mass distributions to many wallets are collapsed into one row.
      </p>
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
        {visibleRows.map((g, i) => renderRow(g, i, false))}
        {gatedRows.length > 0 && (
          <PaywallTeaser
            hiddenLabel={`${gatedRows.length} more unlock${gatedRows.length === 1 ? "" : "s"}`}
            headline="See every upcoming unlock"
            subline="Scan any wallet free · get the app for alerts on the events you care about"
          >
            {gatedRows.slice(0, 4).map((g) => renderRow(g, 0, true))}
          </PaywallTeaser>
        )}
      </div>
    </section>
  );
}
