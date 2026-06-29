"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { PROTOCOL_CHIPS } from "@/lib/protocol-constants";
import { useRouter, usePathname } from "next/navigation";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import useSWR from "swr";
import { isValidWalletAddress } from "@/lib/address-validation";
import { VestingStream } from "@/lib/vesting/normalize";
import { CHAIN_NAMES, SupportedChainId } from "@/lib/vesting/types";
// MobileAppBanner removed — dashboard users have demonstrably already paired
// via QR code, so "Get the app" prompts are noise for this audience.
import { CancellableWatchdog } from "@/components/CancellableWatchdog";
import { useDashboardChrome } from "@/components/DashboardChrome";
import { useCurrency } from "@/lib/use-currency";

// Interaction-gated components — none render on first paint. The upsell
// modal only mounts when a free-tier action hits the paywall; the two
// per-stream editors only mount inside an EXPANDED stream-detail row.
// Loading them with next/dynamic (ssr:false) keeps ~640 lines of editor
// + modal code out of the dashboard's initial JS chunk, so returning
// users hydrate the portfolio view faster. They load on demand the first
// time the user expands a row / triggers the paywall.
const UpsellModal = dynamic(
  () => import("@/components/UpsellModal").then((m) => ({ default: m.UpsellModal })),
  { ssr: false },
);
const StreamAnnotationEditor = dynamic(
  () => import("@/components/StreamAnnotationEditor").then((m) => ({ default: m.StreamAnnotationEditor })),
  { ssr: false },
);
const StreamTagsEditor = dynamic(
  () => import("@/components/StreamTagsEditor").then((m) => ({ default: m.StreamTagsEditor })),
  { ssr: false },
);
import { track } from "@/lib/analytics";
import { useDarkMode } from "@/lib/use-dark-mode";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Wallet {
  id: string;
  address: string;
  label: string | null;
  chains:       string[] | null;  // null = scan all chains
  protocols:    string[] | null;  // null = scan all protocols
  tokenAddress: string | null;    // null = scan all tokens
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_PRICES: Record<string, number> = { USDC: 1, USDT: 1, DAI: 1, WETH: 3200, ETH: 3200, OP: 1.85, ARB: 0.85, BNB: 580, WBNB: 580 };

// Known-token palette (overrides hash-based colours)
const TOKEN_COLORS_PRESET: Record<string, string> = {
  USDC: "#1CB8B8",
  USDT: "#26a17b",
  DAI:  "#f5a623",
  WETH: "#0F8A8A",
  ETH:  "#0F8A8A",
  OP:   "#ff0420",
  ARB:  "#12aaff",
  BNB:  "#f3ba2f",
  WBNB: "#f3ba2f",
};

// 20-slot palette of visually distinct hues for unknown tokens.
// Purples were swapped out (off-brand under the new ink/teal palette);
// replacements are visually distinct from existing slots and from
// the brand teal — slate, lime, amber stand in for the three purples.
const HASH_PALETTE = [
  "#e74c3c", "#e67e22", "#2ecc71", "#1abc9c", "#3498db",
  "#475569", "#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3",
  "#54a0ff", "#0891b2", "#c44569", "#f8b739", "#05c46b",
  "#0fbcf9", "#ef5777", "#4bcffa", "#fd9644", "#84cc16",
];

function getTokenColor(symbol: string): string {
  if (TOKEN_COLORS_PRESET[symbol]) return TOKEN_COLORS_PRESET[symbol];
  // Deterministic hash of the symbol string → consistent colour
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = Math.imul(31, h) + symbol.charCodeAt(i) | 0;
  }
  return HASH_PALETTE[Math.abs(h) % HASH_PALETTE.length];
}

// ─── TokenIcon — image with text-initials fallback ───────────────────────────
// Used by VestingTable rows, NextClaimCountdown cards, SnapshotPanel token
// rows, and PnLPanel. Renders the DexScreener logo when available; falls back
// to the coloured initials circle when the URL is missing or fails to load.
function TokenIcon({
  symbol, imageUrl, size = 32,
}: { symbol: string; imageUrl?: string | null; size?: number }) {
  const [imgOk, setImgOk] = useState(!!imageUrl);
  useEffect(() => { setImgOk(!!imageUrl); }, [imageUrl]);
  const color = getTokenColor(symbol);
  if (imgOk && imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={symbol}
        width={size}
        height={size}
        onError={() => setImgOk(false)}
        className="rounded-xl object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className="rounded-xl border flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: color + "18", borderColor: color + "30" }}>
      <span style={{ color, fontSize: Math.max(9, size * 0.32), fontWeight: 700, letterSpacing: "-0.02em" }}>
        {symbol.slice(0, 3)}
      </span>
    </div>
  );
}

// Block-explorer base URLs per chain ID. Token contracts live at
// `${base}/token/{address}`; transactions at `${base}/tx/{hash}` —
// same convention across every EVM explorer we support.
// 2026-05-14: added Arbitrum, Optimism, Solana so the lockTxHash row
// resolves on those chains too.
const BLOCK_EXPLORERS: Record<number, string> = {
  1:        "https://etherscan.io",
  56:       "https://bscscan.com",
  137:      "https://polygonscan.com",
  8453:     "https://basescan.org",
  42161:    "https://arbiscan.io",
  10:       "https://optimistic.etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  84532:    "https://sepolia.basescan.org",
  // Solana uses /tx for signatures and /address (not /token) for mints,
  // but Solscan accepts /token/{mint} as an alias. Same base; consumers
  // append `/tx/<sig>` or `/token/<mint>` as usual.
  101:      "https://solscan.io",
};

// 2026-05-15: aligned to the canonical palette in src/lib/protocol-constants.ts
// (which mobile + /protocols pages already use). Previous local map had
// Hedgey collide with brand-teal and UNCX collide with Sablier — both
// real design-bug-level palette collisions in the dashboard streams
// table. Streamflow / Jupiter Lock / LlamaPay / Sablier-Flow added for
// completeness so the fallback "#B8BABD grey" never fires on supported
// protocols.
// Single source of truth — see protocol-constants.ts (PROTOCOL_CHIPS).
const PROTOCOL_COLORS = PROTOCOL_CHIPS;

const CLAIM_LINKS: Record<string, string> = {
  sablier:        "https://app.sablier.com",
  hedgey:         "https://app.hedgey.finance",
  uncx:           "https://app.uncx.network",
  "uncx-vm":      "https://app.uncx.network",
  unvest:         "https://unvest.io",
  superfluid:     "https://app.superfluid.finance",
  pinksale:       "https://pinksale.finance/pinklock",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the current unix-second timestamp, but in a way that's safe to
 * call during React 19's strict rendering rules. Rather than calling
 * `Math.floor(Date.now() / 1000)` directly in component bodies (which
 * trips `react-hooks/purity` because `Date.now()` is impure and produces
 * unstable results across re-renders), we capture the time in component
 * state and tick it every 30 seconds.
 *
 * Trade-off: components that derive "vested-so-far" / "time-until-unlock"
 * stay accurate to ±15s on average without forcing a re-render every
 * frame. For a vesting tracker that's fine — unlock schedules don't
 * fire faster than that anyway.
 *
 * Use this hook anywhere you previously wrote
 * `const nowSec = Math.floor(Date.now() / 1000)` at the top of a render.
 */
function useNowSec(tickIntervalMs: number = 30_000): number {
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, tickIntervalMs);
    return () => clearInterval(id);
  }, [tickIntervalMs]);
  return nowSec;
}

function toFloat(amount: string, decimals: number): number {
  const raw = BigInt(amount);
  const d   = BigInt(10 ** Math.min(decimals, 18));
  return Number(raw) / Number(d);
}

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtUSDFull(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function timeUntil(ts: number): string {
  const diff = ts - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Now";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  if (d > 30)  return `${Math.round(d / 30)}mo`;
  if (d > 0)   return `${d}d ${h}h`;
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0)   return `${h}h ${m}m`;
  return `${m}m`;
}

function shortAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function protocolDisplay(protocol: string) {
  const NAMES: Record<string, string> = {
    sablier:        "Sablier",
    hedgey:         "Hedgey",
    uncx:           "UNCX",
    "uncx-vm":      "UNCX",
    unvest:         "Unvest",
    superfluid:     "Superfluid",
    pinksale:       "PinkSale",
  };
  return NAMES[protocol] ?? protocol.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ─── Token Summary ────────────────────────────────────────────────────────────

interface TokenSummary {
  symbol: string;
  decimals: number;
  claimed: number;
  claimable: number;
  locked: number;
  claimedUSD: number;
  claimableUSD: number;
  lockedUSD: number;
  color: string;
}

function buildTokenSummaries(streams: VestingStream[], prices: Record<string, number> = FALLBACK_PRICES): TokenSummary[] {
  const map: Record<string, TokenSummary> = {};
  for (const s of streams) {
    if (!map[s.tokenSymbol]) {
      map[s.tokenSymbol] = {
        symbol: s.tokenSymbol, decimals: s.tokenDecimals,
        claimed: 0, claimable: 0, locked: 0,
        claimedUSD: 0, claimableUSD: 0, lockedUSD: 0,
        color: getTokenColor(s.tokenSymbol),
      };
    }
    const t = map[s.tokenSymbol];
    const price = prices[s.tokenSymbol] ?? 0;
    const w = toFloat(s.withdrawnAmount, s.tokenDecimals);
    const c = toFloat(s.claimableNow, s.tokenDecimals);
    const l = toFloat(s.lockedAmount, s.tokenDecimals);
    t.claimed += w; t.claimable += c; t.locked += l;
    t.claimedUSD += w * price; t.claimableUSD += c * price; t.lockedUSD += l * price;
  }
  return Object.values(map).sort((a, b) => (b.claimableUSD + b.lockedUSD) - (a.claimableUSD + a.lockedUSD));
}

// ─── Monthly Cash-Flow ────────────────────────────────────────────────────────

function buildMonthlyCashFlow(
  streams: VestingStream[],
  prices: Record<string, number>,
  effectivePrices: Record<string, number> = {}
): { month: string; usd: number; raw: number; hasLivePrice: boolean; byToken: { symbol: string; color: string; usd: number; raw: number }[] }[] {
  const now    = new Date();
  const MONTHS = 18;
  // Per-bucket, per-token accumulator
  const tokenBuckets: Map<string, { usd: number; raw: number }>[] = Array.from({ length: MONTHS }, () => new Map());
  const buckets = Array.from({ length: MONTHS }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const nextD = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    return {
      start: Math.floor(d.getTime() / 1000),
      end:   Math.floor(nextD.getTime() / 1000),
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      usd:   0,
      raw:   0,
      hasLivePrice: false,
    };
  });

  for (const s of streams) {
    if (s.isFullyVested) continue;
    // Use live price first, fall back to user-provided entry price
    const livePrice = prices[s.tokenSymbol] ?? 0;
    const fallback  = effectivePrices[s.tokenSymbol] ?? 0;
    const price     = livePrice > 0 ? livePrice : fallback;
    const isLive    = livePrice > 0;
    const sym       = s.tokenSymbol;

    // ── Step/tranched streams: sum tranche amounts falling in each month bucket ──
    if (s.shape === "steps" && s.unlockSteps && s.unlockSteps.length > 0) {
      for (let bi = 0; bi < buckets.length; bi++) {
        const b = buckets[bi];
        const monthTotal = s.unlockSteps
          .filter((step) => step.timestamp >= b.start && step.timestamp < b.end)
          .reduce((sum, step) => sum + toFloat(step.amount, s.tokenDecimals), 0);
        if (monthTotal > 0) {
          b.usd += monthTotal * price;
          b.raw += monthTotal;
          if (price > 0 && isLive) b.hasLivePrice = true;
          const prev = tokenBuckets[bi].get(sym) ?? { usd: 0, raw: 0 };
          tokenBuckets[bi].set(sym, { usd: prev.usd + monthTotal * price, raw: prev.raw + monthTotal });
        }
      }
      continue;
    }

    // ── Linear streams: pro-rated monthly amounts ──────────────────────────────
    const duration = s.endTime - s.startTime;
    if (duration <= 0) continue;
    const totalAmt = toFloat(s.totalAmount, s.tokenDecimals);

    for (let bi = 0; bi < buckets.length; bi++) {
      const b = buckets[bi];
      if (s.cliffTime && b.end <= s.cliffTime) continue;

      let frac: number;
      if (s.cliffTime && b.start < s.cliffTime && b.end > s.cliffTime) {
        const overlapEnd = Math.min(b.end, s.endTime);
        frac = (overlapEnd - s.startTime) / duration;
      } else {
        const overlapStart = Math.max(b.start, s.startTime);
        const overlapEnd   = Math.min(b.end, s.endTime);
        if (overlapStart >= overlapEnd) continue;
        frac = (overlapEnd - overlapStart) / duration;
      }

      const monthAmt = totalAmt * frac;
      b.usd += monthAmt * price;
      b.raw += monthAmt;
      if (price > 0 && isLive) b.hasLivePrice = true;
      const prev = tokenBuckets[bi].get(sym) ?? { usd: 0, raw: 0 };
      tokenBuckets[bi].set(sym, { usd: prev.usd + monthAmt * price, raw: prev.raw + monthAmt });
    }
  }

  return buckets.map(({ label, usd, raw, hasLivePrice }, i) => ({
    month: label,
    usd,
    raw,
    hasLivePrice,
    byToken: [...tokenBuckets[i].entries()].map(([symbol, vals]) => ({
      symbol,
      color: getTokenColor(symbol),
      usd:   vals.usd,
      raw:   vals.raw,
    })),
  }));
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  );
}

function IconLock() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconCompass() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>
  );
}

function IconBookmark() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconExport() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

// Income statement / P&L icon — matches the bar-chart hint for an
// aggregated finances view, distinct from the simple "download" Exports icon.
function IconIncomeStatement() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10"/>
      <line x1="18" y1="20" x2="18" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
    </svg>
  );
}

// ── Panel/tab icons (replace the previous emoji labels) ──────────────────────
function IconCalendar({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
    </svg>
  );
}

function IconCashFlow({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
      <path d="M6 12h.01M18 12h.01"/>
    </svg>
  );
}

function IconTrendUp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>
    </svg>
  );
}

function IconTag({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  );
}

function IconGantt({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="10" y1="18" x2="18" y2="18"/>
    </svg>
  );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ tokens }: { tokens: TokenSummary[] }) {
  const totalUSD  = tokens.reduce((s, t) => s + t.claimableUSD + t.lockedUSD, 0);
  const hasPrice  = totalUSD > 0;

  // When multiple tokens but no USD prices, showing raw amounts is meaningless
  // (mixing UNCX and USDC token counts tells you nothing about portfolio weight).
  // In that case, render a placeholder instead.
  const multiNoPrice = !hasPrice && tokens.length > 1;

  const getVal      = (t: TokenSummary) => t.claimableUSD + t.lockedUSD;
  const totalVal    = hasPrice ? tokens.reduce((s, t) => s + getVal(t), 0) : 0;
  const totalClaimableUSD = tokens.reduce((s, t) => s + t.claimableUSD, 0);

  const R = 52, cx = 64, cy = 64, stroke = 16;
  const circumference = 2 * Math.PI * R;
  let offset = 0;
  const slices = hasPrice ? tokens.map((t) => {
    const pct  = totalVal > 0 ? getVal(t) / totalVal : 0;
    const dash = pct * circumference;
    const sl   = { color: t.color, dash, gap: circumference - dash, offset };
    offset += dash;
    return sl;
  }) : [];

  if (multiNoPrice) {
    // No USD data for multiple tokens — show informative placeholder
    return (
      <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-1"
          style={{ background: "var(--preview-muted-2)" }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--preview-text-3)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
          </svg>
        </div>
        <p className="text-xs font-semibold" style={{ color: "var(--preview-text-2)" }}>USD values loading…</p>
        <p className="text-[10px] max-w-[160px] leading-relaxed" style={{ color: "var(--preview-text-3)" }}>
          Portfolio mix shown in USD once DexScreener prices are fetched for your tokens.
        </p>
        <div className="flex flex-col gap-1.5 w-full mt-1">
          {tokens.map((t) => (
            <div key={t.symbol} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span className="text-xs font-medium" style={{ color: "var(--preview-text)" }}>{t.symbol}</span>
              <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>
                {(t.claimable + t.locked).toLocaleString("en-US", { maximumFractionDigits: 2 })} tokens
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (totalVal === 0 && !hasPrice && tokens.length === 1) {
    // Single token, no price — show raw amounts with token label
    const t = tokens[0];
    const totalRaw = t.claimable + t.locked;
    if (totalRaw === 0) return null;
    const claimFrac = totalRaw > 0 ? t.claimable / totalRaw : 0;
    const dashFull  = circumference;
    return (
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <svg width={128} height={128} viewBox="0 0 128 128">
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--preview-border-2)" strokeWidth={stroke} />
            <circle cx={cx} cy={cy} r={R} fill="none" stroke={t.color} strokeWidth={stroke} strokeOpacity={0.15}
              strokeDasharray={`${dashFull} 0`} strokeDashoffset={circumference / 4} />
            {claimFrac > 0 && (
              <circle cx={cx} cy={cy} r={R} fill="none" stroke={t.color} strokeWidth={stroke}
                strokeDasharray={`${claimFrac * dashFull} ${dashFull}`}
                strokeDashoffset={circumference / 4} />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[10px] font-medium" style={{ color: "var(--preview-text-3)" }}>Claimable</p>
            <p className="text-base font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>
              {t.claimable.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
            <p className="text-[9px] font-semibold" style={{ color: t.color }}>{t.symbol}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {[
            { label: "Claimable", val: t.claimable },
            { label: "Locked",    val: t.locked },
          ].map(({ label, val }) => (
            <div key={label}>
              <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>{label}</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--preview-text)" }}>
                {val.toLocaleString("en-US", { maximumFractionDigits: 4 })} {t.symbol}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (totalVal === 0) return null;

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0">
        <svg width={128} height={128} viewBox="0 0 128 128">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--preview-border-2)" strokeWidth={stroke} />
          {slices.map((s, i) => (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none"
              stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={-s.offset + circumference / 4}
              style={{ transition: "all 0.5s ease" }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] font-medium" style={{ color: "var(--preview-text-3)" }}>Claimable</p>
          <p className="text-sm font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>{fmtUSD(totalClaimableUSD)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 flex-1">
        {tokens.map((t) => {
          const tokenUSD      = t.claimableUSD + t.lockedUSD;
          const tokenHasPrice = tokenUSD > 0;
          return (
            <div key={t.symbol} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                <span className="text-sm font-medium" style={{ color: "var(--preview-text)" }}>{t.symbol}</span>
              </div>
              <div className="text-right">
                {tokenHasPrice ? (
                  <>
                    <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--preview-text)" }}>
                      {fmtUSD(tokenUSD)}
                    </p>
                    {t.claimableUSD > 0 && (
                      <p className="text-[11px] font-medium tabular-nums" style={{ color: t.color }}>
                        {fmtUSD(t.claimableUSD)} claimable
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--preview-text)" }}>
                      {(t.claimable + t.locked).toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.symbol}
                    </p>
                    {t.claimable > 0 && (
                      <p className="text-[11px] font-medium tabular-nums" style={{ color: t.color }}>
                        {t.claimable.toLocaleString("en-US", { maximumFractionDigits: 2 })} claimable
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TokenBarChart ────────────────────────────────────────────────────────────

function TokenBarChart({ tokens }: { tokens: TokenSummary[] }) {
  return (
    <div className="space-y-3.5">
      {tokens.map((t) => {
        // Use per-token hasPrice so tokens without DexScreener prices aren't hidden
        const tokenHasPrice = (t.claimedUSD + t.claimableUSD + t.lockedUSD) > 0;
        const total        = tokenHasPrice ? (t.claimedUSD + t.claimableUSD + t.lockedUSD) : (t.claimed + t.claimable + t.locked);
        const claimedVal   = tokenHasPrice ? t.claimedUSD : t.claimed;
        const claimableVal = tokenHasPrice ? t.claimableUSD : t.claimable;
        if (total === 0) return null;
        const claimedPct   = (claimedVal   / total) * 100;
        const claimablePct = (claimableVal / total) * 100;
        const suffix           = tokenHasPrice ? "" : ` ${t.symbol}`;
        const totalDisplay     = tokenHasPrice ? fmtUSD(total)         : total.toLocaleString("en-US",         { maximumFractionDigits: 2 }) + suffix;
        const claimableDisplay = tokenHasPrice ? fmtUSD(claimableVal)  : claimableVal.toLocaleString("en-US",  { maximumFractionDigits: 2 }) + suffix;
        const claimedDisplay   = tokenHasPrice ? fmtUSD(claimedVal)    : claimedVal.toLocaleString("en-US",    { maximumFractionDigits: 2 }) + suffix;
        return (
          <div key={t.symbol}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                <span className="text-xs font-semibold" style={{ color: "var(--preview-text-2)" }}>{t.symbol}</span>
              </div>
              <div className="flex items-center gap-3">
                {claimedVal > 0 && (
                  <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--preview-text-3)" }}>
                    ✓ {claimedDisplay} claimed
                  </span>
                )}
                {claimableVal > 0 && (
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: t.color }}>
                    {claimableDisplay} claimable
                  </span>
                )}
                <span className="text-[11px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>{totalDisplay}</span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden flex" style={{ background: "var(--preview-border-2)" }}>
              {claimedPct > 0 && (
                <div style={{ width: `${claimedPct}%`, background: t.color, opacity: 0.4, transition: "width 0.5s ease" }} className="h-full" />
              )}
              <div style={{ width: `${claimablePct}%`, background: t.color, transition: "width 0.5s ease" }} className="h-full" />
              <div style={{ width: `${100 - claimedPct - claimablePct}%`, background: t.color, opacity: 0.15 }} className="h-full" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── EmissionChart ────────────────────────────────────────────────────────────
// Staircase SVG chart showing cumulative token emissions over the life of a stream.
// For step streams, each tranche creates a vertical jump; for linear streams, a diagonal.

function EmissionChart({ stream }: { stream: VestingStream }) {
  const W = 640, H = 88, PAD = { top: 8, right: 16, bottom: 24, left: 44 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  const nowSec   = useNowSec();
  const total    = toFloat(stream.totalAmount, stream.tokenDecimals);
  const withdrawn = toFloat(stream.withdrawnAmount, stream.tokenDecimals);
  const color    = getTokenColor(stream.tokenSymbol);

  const toChartX = (ts: number) => {
    const pct = Math.max(0, Math.min(1, (ts - stream.startTime) / (stream.endTime - stream.startTime)));
    return PAD.left + pct * chartW;
  };
  const toChartY = (amt: number) => PAD.top + chartH - (total > 0 ? (amt / total) * chartH : 0);

  const nowX = toChartX(nowSec);

  // Build path points for the staircase / diagonal
  let pathPoints: { x: number; y: number }[] = [];
  let nowY = PAD.top + chartH; // y coordinate at the "now" line (vested amount)

  if (stream.shape === "steps" && stream.unlockSteps && stream.unlockSteps.length > 0) {
    // Staircase: horizontal until tranche, then vertical jump
    let cumulative = 0;
    pathPoints.push({ x: PAD.left, y: toChartY(0) });
    for (const step of stream.unlockSteps) {
      const x   = toChartX(step.timestamp);
      const yPre = toChartY(cumulative);
      cumulative += toFloat(step.amount, stream.tokenDecimals);
      const yPost = toChartY(cumulative);
      pathPoints.push({ x, y: yPre });   // horizontal plateau
      pathPoints.push({ x, y: yPost });  // vertical jump
    }
    // Extend to end if last tranche < endTime
    pathPoints.push({ x: toChartX(stream.endTime), y: toChartY(cumulative) });

    // Now Y = vested at now
    const vestedNow = Math.min(
      stream.unlockSteps
        .filter((s) => s.timestamp <= nowSec)
        .reduce((sum, s) => sum + toFloat(s.amount, stream.tokenDecimals), 0),
      total
    );
    nowY = toChartY(vestedNow);
  } else {
    // Linear vesting. With a cliff it stays flat at 0 until the cliff date,
    // jumps to the back-accrued amount at the cliff, then goes linear to the
    // end — nothing vests before the cliff. (Matches on-chain semantics + the
    // mobile chart; previously this drew a straight line from start, showing
    // tokens vesting pre-cliff.)
    const duration = stream.endTime - stream.startTime;
    const cliff = stream.cliffTime && stream.cliffTime > stream.startTime && stream.cliffTime < stream.endTime
      ? stream.cliffTime : null;
    if (cliff !== null && duration > 0) {
      const cliffAmt = (total * (cliff - stream.startTime)) / duration;
      pathPoints = [
        { x: PAD.left,                 y: toChartY(0)        },
        { x: toChartX(cliff),          y: toChartY(0)        }, // flat until cliff
        { x: toChartX(cliff),          y: toChartY(cliffAmt) }, // jump at cliff
        { x: toChartX(stream.endTime), y: toChartY(total)    }, // linear to end
      ];
    } else {
      pathPoints = [
        { x: PAD.left,                 y: toChartY(0)     },
        { x: toChartX(stream.endTime), y: toChartY(total) },
      ];
    }
    // Vested at now = 0 before the cliff, else linear interpolation.
    let vestedNow = 0;
    if (cliff === null || nowSec >= cliff) {
      const elapsed = Math.max(0, Math.min(nowSec - stream.startTime, duration));
      vestedNow = duration > 0 ? (total * elapsed) / duration : 0;
    }
    nowY = toChartY(vestedNow);
  }

  const pathD = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // Filled area under the curve (claim + locked shading)
  const fillD = pathD + ` L${pathPoints.at(-1)!.x.toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${PAD.left},${(PAD.top + chartH).toFixed(1)} Z`;

  // Y-axis labels: 0, 50%, 100%
  const yLabels = [
    { y: toChartY(0),         label: "0"                                    },
    { y: toChartY(total / 2), label: (total / 2).toLocaleString("en-US", { maximumFractionDigits: 0 }) },
    { y: toChartY(total),     label: total.toLocaleString("en-US", { maximumFractionDigits: 0 })       },
  ];

  // X-axis labels: start, now, end
  const xLabels = [
    { x: PAD.left,                    label: fmtDate(stream.startTime) },
    { x: toChartX(stream.endTime),    label: fmtDate(stream.endTime)   },
  ];

  // Step markers: small triangles at each tranche timestamp
  const stepMarkers = stream.shape === "steps" && stream.unlockSteps
    ? stream.unlockSteps.map((s) => ({ x: toChartX(s.timestamp), amt: toFloat(s.amount, stream.tokenDecimals) }))
    : [];

  return (
    <div className="px-5 py-4" style={{ borderTop: "1px solid var(--preview-border-2)", background: "var(--preview-card-2)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--preview-text-3)" }}>
          {stream.shape === "steps" ? `Emission Schedule · ${stream.unlockSteps?.length ?? 0} tranches` : "Emission Schedule · Linear"}
        </span>
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1">
            <div className="w-3 h-1 rounded-full" style={{ background: color, opacity: 0.9 }} />
            <span className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>Vested</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-1 rounded-full" style={{ background: color, opacity: 0.2 }} />
            <span className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>Locked</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width={10} height={10}><line x1={5} y1={0} x2={5} y2={10} stroke="#1CB8B8" strokeWidth={1.5} strokeDasharray="2 2"/></svg>
            <span className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>Today</span>
          </div>
        </div>
      </div>

      {/* Full-width: the chart fills the expanded row so it reads as part of
          the table rather than a cramped inset. width:100% + height:auto lets
          height follow the container width via the viewBox ratio (~7:1), so a
          ~900px-wide row renders the chart ~124px tall instead of the old
          520px-capped ~72px. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible", display: "block", width: "100%", height: "auto" }}>
        {/* Horizontal grid lines at 25/50/75% */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f}
            x1={PAD.left} y1={PAD.top + chartH * (1 - f)}
            x2={PAD.left + chartW} y2={PAD.top + chartH * (1 - f)}
            stroke="var(--preview-border-2)" strokeWidth={0.75} />
        ))}

        {/* Filled area (locked — faint) */}
        <path d={fillD} fill={color} fillOpacity={0.07} />

        {/* Vested fill up to "now" — brighter */}
        {nowSec > stream.startTime && nowSec < stream.endTime && (() => {
          const clampedPath = pathPoints
            .filter((p) => p.x <= nowX)
            .map((p, i) => `${i === 0 ? "M" : "L"}${Math.min(p.x, nowX).toFixed(1)},${p.y.toFixed(1)}`);
          if (clampedPath.length < 2) return null;
          const nowFill = clampedPath.join(" ")
            + ` L${nowX.toFixed(1)},${nowY.toFixed(1)}`
            + ` L${nowX.toFixed(1)},${(PAD.top + chartH).toFixed(1)}`
            + ` L${PAD.left},${(PAD.top + chartH).toFixed(1)} Z`;
          return <path d={nowFill} fill={color} fillOpacity={0.2} />;
        })()}

        {/* Emission curve */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {/* Step tranche markers */}
        {stepMarkers.map((m, i) => (
          <g key={i}>
            <line x1={m.x} y1={PAD.top} x2={m.x} y2={PAD.top + chartH}
              stroke={color} strokeWidth={0.75} strokeDasharray="3 2" strokeOpacity={0.4} />
            <circle cx={m.x} cy={toChartY(
              stream.unlockSteps!.slice(0, i + 1).reduce((s, st) => s + toFloat(st.amount, stream.tokenDecimals), 0)
            )} r={3} fill={color} fillOpacity={0.8} />
          </g>
        ))}

        {/* Claimed / withdrawn line */}
        {withdrawn > 0 && (
          <line
            x1={PAD.left} y1={toChartY(withdrawn)}
            x2={nowX} y2={toChartY(withdrawn)}
            stroke="var(--preview-text-3)" strokeWidth={1} strokeDasharray="4 3" />
        )}

        {/* "Now" vertical line */}
        {nowSec > stream.startTime && nowSec < stream.endTime && (
          <>
            <line x1={nowX} y1={PAD.top} x2={nowX} y2={PAD.top + chartH}
              stroke="#1CB8B8" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={nowX + 4} y={PAD.top + 10} fontSize={8} fill="#1CB8B8" fontWeight={600}>now</text>
          </>
        )}

        {/* Y-axis labels */}
        {yLabels.map((l, i) => (
          <text key={i} x={PAD.left - 4} y={l.y + 3} fontSize={8} textAnchor="end"
            fill="var(--preview-text-3)">{l.label}</text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={PAD.top + chartH + 14} fontSize={8}
            textAnchor={i === 0 ? "start" : "end"}
            fill="var(--preview-text-3)">{l.label}</text>
        ))}

        {/* X-axis baseline */}
        <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH}
          stroke="var(--preview-border)" strokeWidth={1} />
        {/* Y-axis baseline */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH}
          stroke="var(--preview-border)" strokeWidth={1} />

        {/* Token label */}
        <text x={PAD.left + chartW} y={PAD.top + 10} fontSize={8} textAnchor="end"
          fill={color} fontWeight={700}>{stream.tokenSymbol}</text>
      </svg>
    </div>
  );
}

// ─── ClaimHistory ─────────────────────────────────────────────────────────────
// Shows a ledger-style list of individual withdrawal events with date, time and amount.

function fmtDateTime(ts: number): { date: string; time: string } {
  const d = new Date(ts * 1000);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

function ClaimHistory({ stream }: { stream: VestingStream }) {
  const withdrawnAmt = toFloat(stream.withdrawnAmount, stream.tokenDecimals);
  const hasWithdrawn = withdrawnAmt > 0;
  const events       = stream.claimEvents ?? [];

  if (!hasWithdrawn && events.length === 0) return null;

  const color = getTokenColor(stream.tokenSymbol);

  return (
    <div className="px-5 pb-5" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "1rem" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center"
            style={{ background: color + "18" }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <span className="text-[11px] font-semibold" style={{ color: "var(--preview-text)" }}>
            Claim History
          </span>
          {events.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
              style={{ background: color + "15", color }}>
              {events.length} claim{events.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
          {withdrawnAmt.toLocaleString("en-US", { maximumFractionDigits: 4 })} {stream.tokenSymbol} total
        </span>
      </div>

      {events.length > 0 ? (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--preview-border-2)" }}>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2"
            style={{ background: "var(--preview-card-2)", borderBottom: "1px solid var(--preview-border-2)" }}>
            <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--preview-text-3)" }}>Date</span>
            <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--preview-text-3)" }}>Time</span>
            <span className="text-[9px] font-semibold uppercase tracking-widest text-right" style={{ color: "var(--preview-text-3)" }}>Amount</span>
          </div>
          {/* Rows */}
          {events.map((ev, i) => {
            const amt          = toFloat(ev.amount, stream.tokenDecimals);
            const { date, time } = fmtDateTime(ev.timestamp);
            return (
              <div key={i}
                className="grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2.5 items-center"
                style={{
                  borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined,
                  background: i % 2 === 0 ? "transparent" : "var(--preview-muted-2)",
                }}>
                {/* Date */}
                <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--preview-text-2)" }}>
                  {date}
                </span>
                {/* Time */}
                <span className="text-[11px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>
                  {time}
                </span>
                {/* Amount */}
                <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
                  +{amt.toLocaleString("en-US", { maximumFractionDigits: 4 })} {stream.tokenSymbol}
                </span>
              </div>
            );
          })}
        </div>
      ) : hasWithdrawn ? (
        <div className="rounded-xl px-4 py-3 flex items-center gap-2.5"
          style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
          <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: color + "15" }}>
            <span style={{ fontSize: 10 }}>ℹ</span>
          </div>
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
            <span className="font-semibold" style={{ color }}>{withdrawnAmt.toLocaleString("en-US", { maximumFractionDigits: 4 })} {stream.tokenSymbol}</span> claimed — individual transaction history not available for this protocol
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── MiniSparkline ────────────────────────────────────────────────────────────
// Tiny always-visible emission preview shown inline in the Schedule column.

function MiniSparkline({ stream }: { stream: VestingStream }) {
  const W = 52, H = 22;
  const nowSec = useNowSec();
  const color  = getTokenColor(stream.tokenSymbol);
  const total  = toFloat(stream.totalAmount, stream.tokenDecimals);
  const dur    = stream.endTime - stream.startTime;
  if (total === 0 || dur <= 0) return null;

  const toX = (ts: number) => Math.max(0, Math.min(W, ((ts - stream.startTime) / dur) * W));
  const toY = (amt: number) => H - Math.max(0, Math.min(H, (amt / total) * H));

  let pathD: string;
  if (stream.shape === "steps" && stream.unlockSteps && stream.unlockSteps.length > 0) {
    let cum = 0;
    const pts: string[] = [`M0,${H}`];
    for (const st of stream.unlockSteps) {
      const x = toX(st.timestamp);
      pts.push(`L${x.toFixed(1)},${toY(cum).toFixed(1)}`);
      cum += toFloat(st.amount, stream.tokenDecimals);
      pts.push(`L${x.toFixed(1)},${toY(cum).toFixed(1)}`);
    }
    pts.push(`L${W},${toY(cum).toFixed(1)}`);
    pathD = pts.join(" ");
  } else {
    pathD = `M0,${H} L${W},0`;
  }

  const nowX = toX(nowSec);
  const inRange = nowSec > stream.startTime && nowSec < stream.endTime;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", display: "block" }}>
      {/* Full path faint fill */}
      <path d={pathD + ` L${W},${H} Z`} fill={color} fillOpacity={0.08} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.65} strokeLinejoin="round" />
      {/* Now line */}
      {inRange && (
        <line x1={nowX} y1={0} x2={nowX} y2={H} stroke="#1CB8B8" strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.9} />
      )}
    </svg>
  );
}

// ─── PortfolioHero ────────────────────────────────────────────────────────────

function PortfolioHero({ streams, walletCount, dark, prices }: { streams: VestingStream[]; walletCount: number; dark: boolean; prices: Record<string, number> }) {
  // Currency-aware formatters for the hero figures. Falls back to USD when
  // the user hasn't picked anything (CurrencyProvider was added in the
  // dashboard layout commit; the inner hook returns sensible defaults
  // outside the provider, so this is safe even if the layout is bypassed).
  const { format: fmtCurrencyFull, formatCompact: fmtCurrencyCompact } = useCurrency();
  const nowSec = useNowSec();

  const tokens         = buildTokenSummaries(streams, prices);
  const totalValue     = tokens.reduce((s, t) => s + t.claimableUSD + t.lockedUSD, 0);
  const totalClaimable = tokens.reduce((s, t) => s + t.claimableUSD, 0);
  const pctClaimable   = totalValue > 0 ? (totalClaimable / totalValue) * 100 : 0;
  const hasPrice       = totalValue > 0;
  const totalRaw       = tokens.reduce((s, t) => s + t.claimable + t.locked, 0);
  const activeStreams   = streams.filter((s) => !s.isFullyVested);
  // Tokens with tokens claimable but NO USD price — need separate display when in USD mode
  const claimableNoPrice = tokens.filter((t) => t.claimable > 0 && t.claimableUSD === 0);

  // Next unlock: stream with soonest nextUnlockTime
  const nextUnlockStream = activeStreams
    .filter((s) => s.nextUnlockTime)
    .sort((a, b) => (a.nextUnlockTime ?? 0) - (b.nextUnlockTime ?? 0))[0] ?? null;
  const nextUnlock = nextUnlockStream?.nextUnlockTime ?? null;

  // Next unlock amount — for step streams use the next tranche, for linear use monthly rate
  const nextUnlockAmt: string | null = (() => {
    if (!nextUnlockStream) return null;
    const s = nextUnlockStream;
    if (s.shape === "steps" && s.unlockSteps) {
      const next   = s.unlockSteps.find((st) => st.timestamp > nowSec);
      if (next) {
        const amt = toFloat(next.amount, s.tokenDecimals);
        return `${amt.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${s.tokenSymbol}`;
      }
    }
    const dur = s.endTime - s.startTime;
    if (dur > 0) {
      const monthly = toFloat(s.totalAmount, s.tokenDecimals) * (30 * 86400) / dur;
      if (monthly > 0) return `~${monthly.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${s.tokenSymbol}/mo`;
    }
    return null;
  })();

  // This month's unlocks (first bucket from cashflow)
  const cashflow    = buildMonthlyCashFlow(streams, prices);
  const thisMonth   = cashflow[0];
  const hasThisMonth = thisMonth && (thisMonth.usd > 0 || thisMonth.raw > 0);

  // Active protocols
  const protocols = new Set(streams.map((s) => s.protocol));
  const numProtocols = protocols.size;

  const gradientStyle = dark
    ? { background: "linear-gradient(135deg, #0d0f14 0%, #0F8A8A 100%)" }
    : { background: "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)" };

  return (
    <div className="rounded-2xl overflow-hidden mb-4 relative" style={gradientStyle}>
      {/* Decorative orbs */}
      <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(147,197,253,0.12) 0%, transparent 70%)" }} />
      <div className="absolute right-32 bottom-0 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(28,184,184,0.1) 0%, transparent 70%)" }} />

      <div className="relative px-6 py-4">
        <div className="flex items-start justify-between gap-6">
          {/* Left: main value */}
          <div className="flex-1">
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
              Total Portfolio Value
            </p>
            <p className="text-4xl font-bold tabular-nums tracking-tight text-white leading-none">
              {fmtCurrencyFull(totalValue)}
            </p>
            {/* "Ready to claim" intentionally not repeated here — it's shown in
                the "Ready to Claim" stat chip (right) and per-token in the
                Token Unlock Status section below. */}

            {/* Portfolio bar */}
            {tokens.length > 0 && (
              <div className="mt-3">
                <div className="h-1 w-56 rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,0.1)" }}>
                  {tokens.map((t) => {
                    // Use USD values when available, otherwise fall back to raw token amounts
                    const pct = hasPrice
                      ? ((t.claimableUSD + t.lockedUSD) / totalValue) * 100
                      : totalRaw > 0 ? ((t.claimable + t.locked) / totalRaw) * 100 : 0;
                    return <div key={t.symbol} style={{ width: `${pct}%`, background: t.color }} className="h-full" />;
                  })}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  {tokens.map((t) => (
                    <div key={t.symbol} className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                      <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>{t.symbol}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: stat blocks — four meaningful live metrics */}
          <div className="flex gap-2.5 flex-shrink-0">

            {/* Stat 1: Ready to Claim — per-token breakdown when no price data */}
            <div className="rounded-xl px-4 py-3 min-w-[108px]"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="w-6 h-6 rounded-md flex items-center justify-center mb-2"
                style={{ background: "rgba(63,165,104,0.15)", color: "#3FA568" }}>
                <IconArrowUp />
              </div>
              <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>Ready to Claim</p>
              {/* USD-priced claimable */}
              {totalClaimable > 0 && (
                <>
                  <p className="text-base font-bold tabular-nums mt-0.5 text-white">{fmtCurrencyCompact(totalClaimable)}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{pctClaimable.toFixed(1)}% of total</p>
                </>
              )}
              {/* Raw amounts for tokens without a market price — only in USD
                  mode (alongside the USD total). When there's NO price at all,
                  the fallback below renders them instead — gating on hasPrice
                  here stops both paths listing the same tokens twice. */}
              {hasPrice && claimableNoPrice.slice(0, 2).map((t) => (
                <p key={t.symbol} className="text-sm font-bold tabular-nums mt-0.5 leading-tight text-white">
                  {t.claimable.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  <span className="text-[10px] font-semibold ml-1" style={{ color: t.color }}>{t.symbol}</span>
                </p>
              ))}
              {/* Fallback: no price at all, show all claimable in raw mode */}
              {!hasPrice && tokens.filter((t) => t.claimable > 0).slice(0, 2).map((t) => (
                <p key={t.symbol} className="text-sm font-bold tabular-nums mt-0.5 leading-tight text-white">
                  {t.claimable.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  <span className="text-[10px] font-semibold ml-1" style={{ color: t.color }}>{t.symbol}</span>
                </p>
              ))}
              {/* Nothing claimable */}
              {totalClaimable === 0 && claimableNoPrice.length === 0 && !tokens.some((t) => t.claimable > 0) && (
                <p className="text-base font-bold mt-0.5 text-white">—</p>
              )}
            </div>

            {/* Stat 2: This Month — from monthly cashflow forecast */}
            <div className="rounded-xl px-4 py-3 min-w-[108px]"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="w-6 h-6 rounded-md flex items-center justify-center mb-2"
                style={{ background: "rgba(147,197,253,0.15)", color: "#1CB8B8" }}>
                <IconClock />
              </div>
              <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>This Month</p>
              {hasThisMonth ? (
                <>
                  <p className="text-base font-bold tabular-nums mt-0.5 text-white">
                    {hasPrice ? fmtCurrencyCompact(thisMonth.usd) : thisMonth.raw.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {hasPrice ? "unlocking" : `tokens unlocking`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-bold tabular-nums mt-0.5 text-white">—</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>nothing this month</p>
                </>
              )}
            </div>

            {/* Stat 3: Next Event — countdown + amount */}
            <div className="rounded-xl px-4 py-3 min-w-[108px]"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="w-6 h-6 rounded-md flex items-center justify-center mb-2"
                style={{ background: "rgba(240,184,61,0.15)", color: "#F0B83D" }}>
                <IconLock />
              </div>
              <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>Next Event</p>
              {nextUnlock ? (
                <>
                  <p className="text-base font-bold tabular-nums mt-0.5 text-white">{timeUntil(nextUnlock)}</p>
                  {nextUnlockAmt && (
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>{nextUnlockAmt}</p>
                  )}
                </>
              ) : (
                <p className="text-base font-bold tabular-nums mt-0.5 text-white">—</p>
              )}
            </div>

            {/* Stat 4: Streams breakdown */}
            <div className="rounded-xl px-4 py-3 min-w-[108px]"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="w-6 h-6 rounded-md flex items-center justify-center mb-2"
                style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}>
                <IconGrid />
              </div>
              <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>Streams</p>
              <p className="text-base font-bold tabular-nums mt-0.5 text-white">{activeStreams.length} active</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                {numProtocols} protocol{numProtocols !== 1 ? "s" : ""}
              </p>
            </div>

          </div>
        </div>

        {/* Bottom: wallet + chain chips */}
        <div className="flex items-center gap-2 mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Tracking</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }}>
              {walletCount} wallet{walletCount !== 1 ? "s" : ""}
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }}>
              {streams.length} stream{streams.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold" style={{ color: "rgba(63,165,104,0.9)" }}>Live</span>
          </div>
        </div>

        {/* Unpriced token footnote — only shown when some tokens lack a live price */}
        {hasPrice && tokens.some((t) => (t.claimableUSD + t.lockedUSD === 0) && (t.claimable + t.locked > 0)) && (
          <p className="mt-3 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            * Portfolio total excludes{" "}
            {tokens.filter((t) => (t.claimableUSD + t.lockedUSD === 0) && (t.claimable + t.locked > 0)).map((t) => t.symbol).join(", ")}{" "}
            — no live price available for {tokens.filter((t) => (t.claimableUSD + t.lockedUSD === 0) && (t.claimable + t.locked > 0)).length === 1 ? "this token" : "these tokens"}.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── SnapshotPanel ────────────────────────────────────────────────────────────

function SnapshotPanel({
  streams,
  prices,
}: {
  streams: VestingStream[];
  prices: Record<string, number>;
}) {
  const tokens    = buildTokenSummaries(streams, prices);

  if (tokens.length === 0) return null;

  const cardStyle = {
    background: "var(--preview-card)",
    borderColor: "var(--preview-border)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4 mb-4">
      {/* Left: donut */}
      <div className="rounded-2xl border p-4 md:p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Portfolio Mix</h2>
        </div>
        <DonutChart tokens={tokens} />
      </div>

      {/* Right: bar chart */}
      <div className="rounded-2xl border p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Claimable vs Locked</h2>
        </div>
        <TokenBarChart tokens={tokens} />

        {/* Legend */}
        <div className="flex items-center gap-4 mt-5 pt-4" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
          {[
            { label: "Claimed",   opacity: 0.4 },
            { label: "Claimable", opacity: 1   },
            { label: "Locked",    opacity: 0.15 },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full" style={{ background: "var(--preview-text-3)", opacity: item.opacity }} />
              <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── VestingRing ──────────────────────────────────────────────────────────────

function VestingRing({ claimedPct, claimablePct, color }: {
  claimedPct: number; claimablePct: number; color: string;
}) {
  const R = 13, cx = 16, cy = 16, strokeW = 3;
  const circumference = 2 * Math.PI * R;
  const claimedDash   = (claimedPct   / 100) * circumference;
  const claimableDash = (claimablePct / 100) * circumference;
  const vestedPct     = Math.round(claimedPct + claimablePct);
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex-shrink-0" style={{ width: 32, height: 32 }}>
        <svg width={32} height={32} viewBox="0 0 32 32">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--preview-border-2)" strokeWidth={strokeW} />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--preview-muted)" strokeWidth={strokeW}
            strokeDasharray={`${claimedDash} ${circumference - claimedDash}`}
            strokeDashoffset={circumference / 4} style={{ transition: "all 0.4s" }} />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={strokeW}
            strokeDasharray={`${claimableDash} ${circumference - claimableDash}`}
            strokeDashoffset={circumference / 4 - claimedDash} style={{ transition: "all 0.4s" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[7px] font-bold tabular-nums" style={{ color: "var(--preview-text-2)" }}>{vestedPct}%</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold tabular-nums" style={{ color: "var(--preview-text)" }}>{vestedPct}%</p>
        <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>vested</p>
      </div>
    </div>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={handleCopy} title={copied ? "Copied!" : "Copy address"}
      className="inline-flex items-center justify-center w-5 h-5 rounded transition-all duration-150"
      style={{ color: copied ? "#3FA568" : "var(--preview-text-3)", background: "transparent" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--preview-muted)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
      {copied ? (
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  );
}

// ─── StreamDetailSheet ────────────────────────────────────────────────────────
// Mobile bottom-sheet for per-position drill-down. Slides up from the bottom
// when a user taps a row in the mobile condensed VestingTable view. Shows the
// full position breakdown: claimable/locked, progress, claim CTA, emission
// chart, claim history, and annotation/tag editors.

function StreamDetailSheet({
  stream: s,
  prices,
  imageUrls = {},
  onClose,
  onClaim,
}: {
  stream:     VestingStream;
  prices:     Record<string, number>;
  imageUrls?: Record<string, string>;
  onClose:    () => void;
  onClaim?:   () => void;
}) {
  const nowSec = useNowSec();
  const [claimedId, setClaimedId] = useState(false);

  const price        = prices[s.tokenSymbol] ?? 0;
  const claimableAmt = toFloat(s.claimableNow, s.tokenDecimals);
  const lockedAmt    = toFloat(s.lockedAmount, s.tokenDecimals);
  const withdrawnAmt = toFloat(s.withdrawnAmount, s.tokenDecimals);
  const totalAmt     = toFloat(s.totalAmount, s.tokenDecimals);
  const tokenColor   = getTokenColor(s.tokenSymbol);
  const chainName    = CHAIN_NAMES[s.chainId as SupportedChainId] ?? `Chain ${s.chainId}`;
  const claimUrl     = CLAIM_LINKS[s.protocol] ?? "#";
  const proto        = PROTOCOL_COLORS[s.protocol] ?? { text: "#B8BABD", bg: "rgba(184,186,189,0.1)", border: "rgba(184,186,189,0.2)" };
  const vestedPct    = totalAmt > 0 ? Math.min(100, ((withdrawnAmt + claimableAmt) / totalAmt) * 100) : 0;
  const claimedPct   = totalAmt > 0 ? Math.min(100, (withdrawnAmt / totalAmt) * 100) : 0;
  const hasCliff     = s.cliffTime && s.cliffTime > nowSec;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: "rgba(0,0,0,0.60)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sheet panel — slides up from bottom on mobile */}
      <div
        className="w-full rounded-t-3xl overflow-y-auto"
        style={{
          background: "var(--preview-card)",
          maxHeight: "90dvh",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--preview-border)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <TokenIcon symbol={s.tokenSymbol} imageUrl={imageUrls[s.tokenSymbol]} size={40} />
            <div>
              <p className="text-base font-bold" style={{ color: "var(--preview-text)" }}>{s.tokenSymbol}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                  style={{ background: proto.bg, color: proto.text }}>
                  {protocolDisplay(s.protocol)}
                </span>
                <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>{chainName}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-colors hover:opacity-70" style={{ color: "var(--preview-text-3)" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-5 pb-8 space-y-4">
          {/* Claimable + Locked cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={{ background: tokenColor + "10", border: `1px solid ${tokenColor}25` }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: tokenColor }}>Claimable now</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: claimableAmt > 0 ? tokenColor : "var(--preview-text-3)" }}>
                {claimableAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-medium mt-0.5" style={{ color: tokenColor + "99" }}>{s.tokenSymbol}</p>
              {price > 0 && claimableAmt > 0 && (
                <p className="text-xs tabular-nums mt-1" style={{ color: "var(--preview-text-3)" }}>{fmtUSDFull(claimableAmt * price)}</p>
              )}
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--preview-text-3)" }}>Locked</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>
                {lockedAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-medium mt-0.5" style={{ color: "var(--preview-text-3)" }}>{s.tokenSymbol}</p>
              {price > 0 && lockedAmt > 0 && (
                <p className="text-xs tabular-nums mt-1" style={{ color: "var(--preview-text-3)" }}>{fmtUSDFull(lockedAmt * price)}</p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-[11px] mb-1.5" style={{ color: "var(--preview-text-3)" }}>
              <span>{withdrawnAmt > 0 ? `${withdrawnAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })} claimed` : "0 claimed"}</span>
              <span>{vestedPct.toFixed(1)}% vested</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--preview-muted)" }}>
              <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${Math.min(vestedPct, 100)}%` }}>
                <div style={{ width: `${claimedPct > 0 ? (claimedPct / vestedPct) * 100 : 0}%`, background: "rgba(63,165,104,0.7)" }} />
                <div style={{ flex: 1, background: tokenColor }} />
              </div>
            </div>
          </div>

          {/* Claim CTA */}
          {claimedId ? (
            <div className="flex items-center justify-center gap-2 py-3 rounded-2xl"
              style={{ background: "rgba(63,165,104,0.08)", border: "1px solid rgba(63,165,104,0.2)" }}>
              <span className="animate-spin text-sm">↻</span>
              <span className="text-sm font-semibold" style={{ color: "#3FA568" }}>Updating on-chain…</span>
            </div>
          ) : claimableAmt > 0 ? (
            <a
              href={claimUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setClaimedId(true);
                onClaim?.();
                setTimeout(() => setClaimedId(false), 18_000);
              }}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${tokenColor}, ${tokenColor}cc)`, boxShadow: `0 4px 16px ${tokenColor}40` }}
            >
              Claim {claimableAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })} {s.tokenSymbol} ↗
            </a>
          ) : (
            <a
              href={claimUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold"
              style={{ color: "var(--preview-text-2)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)" }}
            >
              View on {protocolDisplay(s.protocol)} ↗
            </a>
          )}

          {/* Schedule info */}
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--preview-text-3)" }}>Schedule</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Start</p>
                <p className="font-medium" style={{ color: "var(--preview-text-2)" }}>{fmtDate(s.startTime)}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>End</p>
                <p className="font-medium" style={{ color: "var(--preview-text-2)" }}>{fmtDate(s.endTime)}</p>
              </div>
              {s.cancelable !== undefined && (
                <div>
                  <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Cancelable</p>
                  <p className="font-semibold" style={{ color: s.cancelable ? "#B3322E" : "#3FA568" }}>{s.cancelable ? "⚠ Yes" : "✓ Fixed"}</p>
                </div>
              )}
              {hasCliff && s.cliffTime && (
                <div>
                  <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Cliff ends</p>
                  <p className="font-medium" style={{ color: "#F0992E" }}>in {timeUntil(s.cliffTime)}</p>
                </div>
              )}
              {s.nextUnlockTime && !s.isFullyVested && !hasCliff && (
                <div>
                  <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Next unlock</p>
                  <p className="font-medium" style={{ color: "var(--preview-text-2)" }}>in {timeUntil(s.nextUnlockTime)}</p>
                </div>
              )}
              <div>
                <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Recipient</p>
                <p className="font-mono text-[10px]" style={{ color: "var(--preview-text-3)" }}>{shortAddr(s.recipient)}</p>
              </div>
            </div>
          </div>

          {/* Emission chart */}
          <EmissionChart stream={s} />

          {/* Claim history */}
          <ClaimHistory stream={s} />

          {/* Annotations + tags */}
          <div className="space-y-2">
            <StreamAnnotationEditor streamId={s.id} />
            <StreamTagsEditor streamId={s.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VestingTable ─────────────────────────────────────────────────────────────

// Columns: Asset | Protocol | Locked | Start | End | Progress | Claimable | Schedule | Cancellable | Contract | Action
// Chain name is shown under the token symbol in the Asset column — no separate column needed
const COL = "grid-cols-[160px_88px_98px_80px_80px_108px_98px_118px_80px_90px_130px]";

function VestingTable({ streams, prices, imageUrls = {}, onClaim }: { streams: VestingStream[]; prices: Record<string, number>; imageUrls?: Record<string, string>; onClaim?: () => void }) {
  // Single source of truth for "now" inside this table — used by the cliff /
  // monthly-rate derivations below. Replaces inline Date.now() calls flagged
  // by react-hooks/purity (Date.now isn't pure for React 19's strict-mode
  // analysis). Re-renders every 30s so cliff-active flags stay accurate.
  const nowSec = useNowSec();
  // Track stream IDs where user clicked "Claim ↗" — shows a "refreshing…"
  // indicator for 15s until the parent triggers a data refresh.
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  // Mobile drill-down: which stream is currently open in the detail sheet
  const [sheetStreamId, setSheetStreamId] = useState<string | null>(null);

  // Bulk-fetch the user's stream annotations once. We expose a Map<streamId,
  // annotation> for O(1) row-level lookup. Cheap because annotations are
  // sparse — most users have 0–10 rows, so the response is tiny.
  const { data: annData } = useSWR<{ annotations: Array<{ streamId: string; customName: string | null; notes: string | null }> }>(
    "/api/streams/annotations",
    async (url: string) => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { revalidateOnFocus: false },
  );
  const annotationByStreamId = useMemo(() => {
    const m = new Map<string, { customName: string | null; notes: string | null }>();
    for (const a of annData?.annotations ?? []) {
      m.set(a.streamId, { customName: a.customName, notes: a.notes });
    }
    return m;
  }, [annData]);

  // Same pattern for tags. We render tags inline on each row's Asset column
  // (small chips next to the title) so users see the personal taxonomy
  // without having to expand each row.
  const { data: tagData } = useSWR<{ tags: Array<{ streamId: string; tag: string; color: string | null }> }>(
    "/api/streams/tags",
    async (url: string) => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { revalidateOnFocus: false },
  );
  const tagsByStreamId = useMemo(() => {
    const m = new Map<string, Array<{ tag: string; color: string | null }>>();
    for (const t of tagData?.tags ?? []) {
      const arr = m.get(t.streamId) ?? [];
      arr.push({ tag: t.tag, color: t.color });
      m.set(t.streamId, arr);
    }
    return m;
  }, [tagData]);
  // Show any stream where not all tokens have been withdrawn yet.
  // Using totalAmount vs withdrawnAmount is more robust than relying on
  // isFullyVested / claimableNow which can mis-compute on edge-case data.
  const active = streams.filter((s) => {
    try {
      const total     = BigInt(s.totalAmount     || "0");
      const withdrawn = BigInt(s.withdrawnAmount || "0");
      return total > 0n && total > withdrawn;
    } catch {
      return true; // if we can't parse, show rather than hide
    }
  });
  // Mobile detail sheet stream — resolved after `active` to avoid temporal dead zone
  const sheetStream = active.find(s => s.id === sheetStreamId) ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const COLS = ["Asset", "Protocol", "Locked", "Start", "End", "Progress", "Claimable", "Schedule", "Cancellable", "Contract", ""];

  return (
    <div className="rounded-2xl border overflow-hidden mb-4"
      style={{
        background: "var(--preview-card)",
        borderColor: "var(--preview-border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
      }}>
      {/* Outer header — full width, no scroll */}
      <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Vesting Schedules</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
            {active.length} active position{active.length !== 1 ? "s" : ""} · scroll →
          </p>
        </div>
        {/* Compact cancellable-vests warning — hover/focus for detail. Replaces
            the old full-width banner that sat above the hero (too prominent). */}
        <CancellableWatchdog streams={active} />
      </div>

      {/* ── Mobile condensed list (hidden on md+) ──────────────────────────── */}
      <div className="md:hidden">
        {active.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium" style={{ color: "var(--preview-text-3)" }}>No active streams found.</p>
          </div>
        ) : (
          <div>
            {active.map((s, idx) => {
              const price        = prices[s.tokenSymbol] ?? 0;
              const claimableAmt = toFloat(s.claimableNow, s.tokenDecimals);
              const lockedAmt    = toFloat(s.lockedAmount,  s.tokenDecimals);
              const tokenColor   = getTokenColor(s.tokenSymbol);
              const proto        = PROTOCOL_COLORS[s.protocol] ?? { text: "#B8BABD", bg: "rgba(184,186,189,0.1)", border: "rgba(184,186,189,0.2)" };
              const chainName    = CHAIN_NAMES[s.chainId as SupportedChainId] ?? `Chain ${s.chainId}`;
              const claimUrl     = CLAIM_LINKS[s.protocol] ?? "#";
              const isExpanded   = expandedId === s.id;
              const total        = BigInt(s.totalAmount);
              const withdrawn    = BigInt(s.withdrawnAmount);
              const claimedPct   = total > 0n ? Number((withdrawn * 10000n) / total) / 100 : 0;
              const claimablePct = total > 0n ? Number((BigInt(s.claimableNow) * 10000n) / total) / 100 : 0;

              return (
                <div key={s.id} style={{ borderTop: idx > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
                  {/* Main row — 4 columns: tap = open detail sheet */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                    onClick={() => setSheetStreamId(s.id)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Col 1: token icon + symbol + protocol */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <TokenIcon symbol={s.tokenSymbol} imageUrl={imageUrls[s.tokenSymbol]} size={36} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--preview-text)" }}>{s.tokenSymbol}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[9px] inline-flex items-center px-1 py-px rounded" style={{ background: proto.bg, color: proto.text }}>
                            {protocolDisplay(s.protocol)}
                          </span>
                          <span className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>{chainName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Col 2: Claimable */}
                    <div className="flex-shrink-0 text-right w-20">
                      <p className="text-xs font-semibold tabular-nums" style={{ color: claimableAmt > 0 ? tokenColor : "var(--preview-text-3)" }}>
                        {claimableAmt > 0 ? claimableAmt.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0"}
                      </p>
                      <p className="text-[9px] tabular-nums mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                        {price > 0 && claimableAmt > 0 ? fmtUSD(claimableAmt * price) : "claimable"}
                      </p>
                    </div>

                    {/* Col 3: Locked */}
                    <div className="flex-shrink-0 text-right w-20">
                      <p className="text-xs tabular-nums font-medium" style={{ color: "var(--preview-text)" }}>
                        {lockedAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[9px] tabular-nums mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                        {price > 0 && lockedAmt > 0 ? fmtUSD(lockedAmt * price) : "locked"}
                      </p>
                    </div>

                    {/* Col 4: CTA + chevron */}
                    <div className="flex-shrink-0 flex items-center gap-1.5 ml-1">
                      {claimedIds.has(s.id) ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg"
                          style={{ background: "rgba(63,165,104,0.1)", color: "#3FA568", border: "1px solid rgba(63,165,104,0.2)" }}>
                          <span className="animate-spin text-[8px]">↻</span>
                        </span>
                      ) : claimableAmt > 0 ? (
                        <a href={claimUrl} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setClaimedIds(prev => new Set([...prev, s.id]));
                            onClaim?.();
                            setTimeout(() => setClaimedIds(prev => { const next = new Set(prev); next.delete(s.id); return next; }), 18_000);
                          }}
                          className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1.5 rounded-lg text-white"
                          style={{ background: `linear-gradient(135deg, ${tokenColor}, ${tokenColor}cc)`, boxShadow: `0 2px 8px ${tokenColor}30` }}>
                          Claim
                        </a>
                      ) : (
                        <a href={claimUrl} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg"
                          style={{ color: "var(--preview-text-3)", background: "var(--preview-muted)" }}>
                          View
                        </a>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSheetStreamId(s.id); }}
                        className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
                        style={{ color: "var(--preview-text-3)" }}
                        aria-label="Open details"
                      >
                        <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Mobile rows open the full-screen detail sheet on tap — no inline expansion */}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Desktop scrollable table (hidden on mobile) ─────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[1360px]">

          {/* Column headers */}
          <div className={`grid ${COL} gap-4 px-6 py-2.5`}
            style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-card-2)" }}>
            {COLS.map((h) => (
              <p key={h} className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--preview-text-3)" }}>{h}</p>
            ))}
          </div>

          <div>
            {active.map((s, idx) => {
              const total     = BigInt(s.totalAmount);
              const withdrawn = BigInt(s.withdrawnAmount);
              const claimable = BigInt(s.claimableNow);
              const price     = prices[s.tokenSymbol] ?? 0;
              const claimedPct   = total > 0n ? Number((withdrawn  * 10000n) / total) / 100 : 0;
              const claimablePct = total > 0n ? Number((claimable  * 10000n) / total) / 100 : 0;
              const claimableAmt = toFloat(s.claimableNow, s.tokenDecimals);
              const lockedAmt    = toFloat(s.lockedAmount, s.tokenDecimals);
              const hasCliff       = s.cliffTime && s.cliffTime > nowSec;
              const streamDuration = s.endTime - s.startTime;
              const monthlyRate    = streamDuration > 0
                ? toFloat(s.totalAmount, s.tokenDecimals) * (30 * 86400) / streamDuration
                : 0;
              const monthlyRateUSD = monthlyRate * price;
              const tokenColor   = getTokenColor(s.tokenSymbol);
              const chainName    = CHAIN_NAMES[s.chainId as SupportedChainId] ?? `Chain ${s.chainId}`;
              const claimUrl     = CLAIM_LINKS[s.protocol] ?? "#";
              const proto        = PROTOCOL_COLORS[s.protocol] ?? { text: "#B8BABD", bg: "rgba(184,186,189,0.1)", border: "rgba(184,186,189,0.2)" };
              const explorerBase = BLOCK_EXPLORERS[s.chainId] ?? "https://etherscan.io";

              const isExpanded = expandedId === s.id;

              return (
                <div key={s.id} style={{ borderTop: idx > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
                <div
                  className={`grid ${COL} gap-4 px-6 py-4 items-center group relative transition-colors duration-100 cursor-pointer`}
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Left accent */}
                  <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: tokenColor }} />

                  {/* 1. Asset — token symbol + chain name + recipient.
                      If the user set a customName via StreamAnnotationEditor,
                      it becomes the row's primary label; the on-chain symbol
                      drops to a subtitle so the user can still see it.
                      Tag chips render below the recipient if the user has
                      tagged this stream — small, colour-coded, max 2 visible
                      with overflow indicator. */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TokenIcon symbol={s.tokenSymbol} imageUrl={imageUrls[s.tokenSymbol]} size={32} />
                    <div className="min-w-0 flex-1">
                      {(() => {
                        const customName = annotationByStreamId.get(s.id)?.customName;
                        if (customName) {
                          return (
                            <>
                              <p className="text-sm font-semibold truncate" style={{ color: "var(--preview-text)" }} title={customName}>{customName}</p>
                              <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--preview-text-3)" }}>{s.tokenSymbol} · {chainName}</p>
                              <p className="text-[9px] font-mono truncate" style={{ color: "var(--preview-text-3)", opacity: 0.65 }}>{shortAddr(s.recipient)}</p>
                            </>
                          );
                        }
                        return (
                          <>
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--preview-text)" }}>{s.tokenSymbol}</p>
                            <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--preview-text-3)" }}>{chainName}</p>
                            <p className="text-[9px] font-mono truncate" style={{ color: "var(--preview-text-3)", opacity: 0.65 }}>{shortAddr(s.recipient)}</p>
                            {s.tokenAddress && (
                              <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                                {/* Public token project page (price chart, recipients,
                                    FAQ). Logged-in users bypass the soft paywall there. */}
                                <a href={`/token/${s.chainId}/${s.tokenAddress}`}
                                  onClick={(e) => e.stopPropagation()}
                                  title={`Open the ${s.tokenSymbol} token page`}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
                                  style={{ color: "#1CB8B8" }}>
                                  <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
                                  </svg>
                                  Token page ↗
                                </a>
                                <a href={`/dashboard/explorer/token/${s.chainId}/${s.tokenAddress}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
                                  style={{ color: "#1CB8B8" }}>
                                  <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                  </svg>
                                  All holders ↗
                                </a>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {(() => {
                        const rowTags = tagsByStreamId.get(s.id) ?? [];
                        if (rowTags.length === 0) return null;
                        const visible = rowTags.slice(0, 2);
                        const overflow = rowTags.length - visible.length;
                        return (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {visible.map((t) => {
                              // Deterministic palette colour matching StreamTagsEditor.
                              const palette = ["#1CB8B8", "#F0992E", "#8169E0", "#28B895", "#E063A0", "#3D7FD0", "#0BA0CB", "#F0B83D", "#A26B3F", "#5DCE9D", "#dc2626", "#7c3aed"];
                              let h = 0;
                              for (let i = 0; i < t.tag.length; i++) h = t.tag.charCodeAt(i) + ((h << 5) - h);
                              const c = t.color ?? palette[Math.abs(h) % palette.length];
                              return (
                                <span
                                  key={t.tag}
                                  className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold whitespace-nowrap"
                                  style={{ background: c + "1F", color: c, border: `1px solid ${c}33` }}
                                  title={t.tag}
                                >
                                  {t.tag.replace(/\b\w/g, (l) => l.toUpperCase())}
                                </span>
                              );
                            })}
                            {overflow > 0 && (
                              <span className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>
                                +{overflow}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 2. Protocol */}
                  <div>
                    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                      style={{ background: proto.bg, color: proto.text, border: `1px solid ${proto.border}` }}>
                      {protocolDisplay(s.protocol)}
                    </span>
                  </div>

                  {/* 3. Locked (moved before Start) */}
                  <div>
                    <p className="text-sm tabular-nums font-medium" style={{ color: "var(--preview-text)" }}>
                      {lockedAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </p>
                    {price > 0 && <p className="text-[10px] tabular-nums mt-0.5" style={{ color: "var(--preview-text-3)" }}>{fmtUSDFull(lockedAmt * price)}</p>}
                  </div>

                  {/* 4. Start */}
                  <div>
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--preview-text-2)" }}>{fmtDate(s.startTime)}</span>
                  </div>

                  {/* 5. End */}
                  <div>
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--preview-text-2)" }}>{fmtDate(s.endTime)}</span>
                    {!s.isFullyVested && s.endTime > nowSec && (
                      <p className="text-[9px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                        in {timeUntil(s.endTime)}
                      </p>
                    )}
                  </div>

                  {/* 6. Progress ring */}
                  <VestingRing claimedPct={claimedPct} claimablePct={claimablePct} color={tokenColor} />

                  {/* 7. Claimable */}
                  <div>
                    {claimableAmt > 0 ? (
                      <>
                        <p className="text-sm font-semibold tabular-nums" style={{ color: tokenColor }}>
                          {claimableAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })} {s.tokenSymbol}
                        </p>
                        {price > 0 && <p className="text-[10px] tabular-nums mt-0.5" style={{ color: "var(--preview-text-3)" }}>{fmtUSDFull(claimableAmt * price)}</p>}
                      </>
                    ) : (
                      <p className="text-sm tabular-nums" style={{ color: "var(--preview-text-3)" }}>0 {s.tokenSymbol}</p>
                    )}
                    {/* Claimed indicator */}
                    {toFloat(s.withdrawnAmount, s.tokenDecimals) > 0 && (
                      <p className="text-[9px] mt-1 font-medium tabular-nums"
                        style={{ color: "var(--preview-text-3)" }}>
                        ✓ {toFloat(s.withdrawnAmount, s.tokenDecimals).toLocaleString("en-US", { maximumFractionDigits: 4 })} claimed
                      </p>
                    )}
                  </div>

                  {/* 8. Schedule */}
                  <div>
                    {s.isFullyVested ? (
                      <span className="text-[11px] font-semibold" style={{ color: "#3FA568" }}>✓ Fully vested</span>
                    ) : s.shape === "steps" && s.unlockSteps ? (
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded"
                            style={{ background: "rgba(28,184,184,0.12)", color: "#1CB8B8" }}>Steps</span>
                          <span className="text-[10px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>
                            {s.unlockSteps.length} tranches
                          </span>
                        </div>
                        {s.nextUnlockTime && (
                          <p className="text-[10px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>
                            next in {timeUntil(s.nextUnlockTime)}
                          </p>
                        )}
                        <div className="mt-1.5"><MiniSparkline stream={s} /></div>
                      </div>
                    ) : hasCliff ? (
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "#F0992E" }}>Cliff</span>
                          {s.nextUnlockTime && (
                            <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--preview-text)" }}>
                              {fmtDate(s.nextUnlockTime)}
                            </span>
                          )}
                        </div>
                        {s.nextUnlockTime && (
                          <p className="text-[10px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>
                            in {timeUntil(s.nextUnlockTime)}
                          </p>
                        )}
                        {monthlyRate > 0 && (
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                            then ~{monthlyRateUSD > 0.01 ? `${fmtUSD(monthlyRateUSD)}/mo` : `${monthlyRate.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${s.tokenSymbol}/mo`}
                          </p>
                        )}
                        <div className="mt-1.5"><MiniSparkline stream={s} /></div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[11px] font-semibold" style={{ color: "var(--preview-text)" }}>Continuous</p>
                        {monthlyRate > 0 && (
                          <p className="text-[10px] tabular-nums mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                            {monthlyRateUSD > 0.01 ? `${fmtUSD(monthlyRateUSD)}/mo` : `~${monthlyRate.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${s.tokenSymbol}/mo`}
                          </p>
                        )}
                        <div className="mt-1.5"><MiniSparkline stream={s} /></div>
                      </div>
                    )}
                  </div>

                  {/* 10. Cancellable */}
                  <div>
                    {s.cancelable === true ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(179,50,46,0.08)", color: "#B3322E", border: "1px solid rgba(179,50,46,0.2)" }}
                        title="Sender can cancel this stream at any time">
                        ⚠ Yes
                      </span>
                    ) : s.cancelable === false ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(63,165,104,0.08)", color: "#3FA568", border: "1px solid rgba(63,165,104,0.2)" }}>
                        ✓ Fixed
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>—</span>
                    )}
                  </div>

                  {/* 11. Contract (token address + copy + token-explorer + tx-explorer).
                      2026-05-14: added the optional "tx" pill next to the
                      contract explorer icon. Renders only when the adapter
                      surfaced a lockTxHash (UNCX-VM, Hedgey, Sablier).
                      One click opens the originating creation tx on the
                      chain's block explorer — the verifiable on-chain
                      anchor backing every claim in the row. */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono" style={{ color: "var(--preview-text-3)" }}>
                      {s.tokenAddress.slice(0, 4)}…{s.tokenAddress.slice(-3)}
                    </span>
                    <CopyButton text={s.tokenAddress} />
                    <a href={`${explorerBase}/token/${s.tokenAddress}`} target="_blank" rel="noopener noreferrer"
                      title="View token contract on block explorer"
                      className="inline-flex items-center justify-center w-5 h-5 rounded transition-all duration-150"
                      style={{ color: "var(--preview-text-3)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--preview-muted)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                    {s.lockTxHash && (
                      <a href={`${explorerBase}/tx/${s.lockTxHash}`} target="_blank" rel="noopener noreferrer"
                        title={`View originating lock transaction · ${s.lockTxHash.slice(0, 10)}…`}
                        className="inline-flex items-center justify-center px-1 rounded text-[9px] font-bold tracking-wider transition-all duration-150"
                        style={{ color: "#0F8A8A", background: "rgba(28,184,184,0.08)", border: "1px solid rgba(28,184,184,0.18)", height: 18 }}
                        onClick={(e) => e.stopPropagation()}>
                        TX
                      </a>
                    )}
                  </div>

                  {/* 12. Claim / View CTA + expand chevron.
                      "All holders" link promoted to column 1 (token info cell)
                      where it has room to breathe and is more discoverable.
                      Link points at /token/* (the canonical token page) directly
                      instead of /explore/* which 308-redirects there — saves a
                      round trip and means clicks feel instant. */}
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Set alert — deep-links into the token-first alerts page
                        with this stream pre-selected (?stream=<id>). */}
                    {!s.isFullyVested && (
                      <a href={`/dashboard/alerts?stream=${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={`Set an alert for ${s.tokenSymbol}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-80"
                        style={{ color: "var(--preview-text-3)", background: "var(--preview-muted)" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        Alert
                      </a>
                    )}
                    {claimedIds.has(s.id) ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg"
                        style={{ background: "rgba(63,165,104,0.1)", color: "#3FA568", border: "1px solid rgba(63,165,104,0.2)" }}>
                        <span className="animate-spin text-[8px]">↻</span> Updating…
                      </span>
                    ) : claimableAmt > 0 ? (
                      <a href={claimUrl} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setClaimedIds(prev => new Set([...prev, s.id]));
                          onClaim?.();
                          // Clear the "updating" indicator after the refresh window
                          setTimeout(() => setClaimedIds(prev => { const next = new Set(prev); next.delete(s.id); return next; }), 18_000);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-all duration-150 hover:scale-105"
                        style={{ background: `linear-gradient(135deg, ${tokenColor}, ${tokenColor}cc)`, boxShadow: `0 2px 8px ${tokenColor}40` }}>
                        Claim ↗
                      </a>
                    ) : (
                      <a href={claimUrl} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                        style={{ color: "var(--preview-text-3)", background: "var(--preview-muted)" }}>
                        View ↗
                      </a>
                    )}
                    {/* Expand chart chevron — coloured for step streams so it's more discoverable */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : s.id); }}
                      className="flex items-center gap-0.5 px-1.5 h-6 rounded-lg transition-all"
                      title={isExpanded ? "Hide emission chart" : "Show full chart"}
                      style={{
                        color: isExpanded ? tokenColor : (s.shape === "steps" ? tokenColor : "var(--preview-text-3)"),
                        background: isExpanded ? tokenColor + "15" : (s.shape === "steps" ? tokenColor + "10" : "transparent"),
                        border: s.shape === "steps" && !isExpanded ? `1px solid ${tokenColor}30` : "1px solid transparent",
                      }}>
                      <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        <path d={isExpanded ? "M2 6.5L5 3.5L8 6.5" : "M2 3.5L5 6.5L8 3.5"}
                          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expandable: emission chart + claim history */}
                {isExpanded && (
                  <>
                    <EmissionChart stream={s} />
                    <ClaimHistory stream={s} />
                    <div className="px-6 pb-5 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <StreamAnnotationEditor streamId={s.id} />
                      <StreamTagsEditor streamId={s.id} />
                    </div>
                  </>
                )}
                </div>
              );
            })}
            {active.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium" style={{ color: "var(--preview-text-3)" }}>No active streams found.</p>
              </div>
            )}
          </div>

        </div>{/* /min-w */}
      </div>{/* /hidden md:block overflow-x-auto */}

      {/* Mobile detail sheet — rendered as portal-like fixed overlay */}
      {sheetStream && (
        <StreamDetailSheet
          stream={sheetStream}
          prices={prices}
          imageUrls={imageUrls}
          onClose={() => setSheetStreamId(null)}
          onClaim={onClaim}
        />
      )}
    </div>
  );
}

// ─── UpcomingOutlook ──────────────────────────────────────────────────────────
//
// Ported from mobile app's UpcomingOutlook.tsx (May 2026 polish pass).
// The Tokenomist / Carta mental model applied to a single user's portfolio:
// how much $ is unlocking in the next 30 / 90 / 365 days across every
// tracked stream? Tokenomist / CryptoRank / DefiLlama know per-TOKEN unlock
// projections but they can't apply them to "your" portfolio — only we do.
// This card is the one chart a user can ONLY get here.
//
// 2026-05-13.

type OutlookWindow = "30d" | "90d" | "1y";
const OUTLOOK_WINDOW_DAYS: Record<OutlookWindow, number> = { "30d": 30, "90d": 90, "1y": 365 };
const OUTLOOK_WINDOW_LABEL: Record<OutlookWindow, string> = {
  "30d": "Next 30 days", "90d": "Next 90 days", "1y": "Next year",
};

function outlookTotal(streams: VestingStream[], prices: Record<string, number>, days: number): { totalUsd: number; eventCount: number } {
  const now = Math.floor(Date.now() / 1000);
  const horizon = now + days * 86_400;
  let totalUsd = 0;
  let eventCount = 0;
  for (const s of streams) {
    if (s.isFullyVested) continue;
    const price = prices[s.tokenAddress];
    if (!price) continue;
    const decimals = s.tokenDecimals;
    const steps = s.unlockSteps ?? [];
    if (steps.length === 0) {
      if (s.nextUnlockTime && s.nextUnlockTime >= now && s.nextUnlockTime <= horizon) {
        const tokens = Number(BigInt(s.lockedAmount)) / 10 ** decimals;
        totalUsd += tokens * price;
        eventCount += 1;
      }
      continue;
    }
    for (const step of steps) {
      if (step.timestamp < now || step.timestamp > horizon) continue;
      const tokens = Number(BigInt(step.amount)) / 10 ** decimals;
      totalUsd += tokens * price;
      eventCount += 1;
    }
  }
  return { totalUsd, eventCount };
}

function outlookProjection(streams: VestingStream[], prices: Record<string, number>, days: number): number[] {
  const now = Math.floor(Date.now() / 1000);
  const buckets = days <= 30 ? 15 : days <= 90 ? 18 : 12;
  const bucketSec = (days * 86_400) / buckets;
  const out = new Array(buckets).fill(0);
  for (const s of streams) {
    if (s.isFullyVested) continue;
    const price = prices[s.tokenAddress];
    if (!price) continue;
    const decimals = s.tokenDecimals;
    const steps = s.unlockSteps ?? [];
    if (steps.length === 0) {
      if (s.nextUnlockTime && s.nextUnlockTime >= now && s.nextUnlockTime <= now + days * 86_400) {
        const offset = s.nextUnlockTime - now;
        const idx = Math.min(buckets - 1, Math.max(0, Math.floor(offset / bucketSec)));
        out[idx] += (Number(BigInt(s.lockedAmount)) / 10 ** decimals) * price;
      }
      continue;
    }
    for (const step of steps) {
      if (step.timestamp < now || step.timestamp > now + days * 86_400) continue;
      const offset = step.timestamp - now;
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor(offset / bucketSec)));
      out[idx] += (Number(BigInt(step.amount)) / 10 ** decimals) * price;
    }
  }
  return out;
}

function UpcomingOutlook({ streams, prices }: { streams: VestingStream[]; prices: Record<string, number> }) {
  const [window, setWindow] = useState<OutlookWindow>("90d");
  const { totalUsd, eventCount } = useMemo(
    () => outlookTotal(streams, prices, OUTLOOK_WINDOW_DAYS[window]),
    [streams, prices, window],
  );
  const values = useMemo(
    () => outlookProjection(streams, prices, OUTLOOK_WINDOW_DAYS[window]),
    [streams, prices, window],
  );

  // No upcoming priced events — hide rather than show a $0 placeholder.
  if (totalUsd === 0 && eventCount === 0) return null;

  // Build cumulative running-total curve — Apple-tier "outlook" charts use
  // cumulative because users care about WHEN they hit $X total.
  const cum: number[] = [];
  let running = 0;
  for (const v of values) { running += v; cum.push(running); }
  const max = cum[cum.length - 1] || 1;

  const W = 640;
  const H = 56;
  const inset = 3;
  const innerH = H - inset * 2;
  const points = cum.map((y, i) => {
    const x = (i / Math.max(1, cum.length - 1)) * W;
    const yPx = inset + (1 - y / max) * innerH;
    return [x, yPx] as const;
  });
  const lineD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaD = lineD + ` L${W.toFixed(2)} ${(H - inset).toFixed(2)} L0 ${(H - inset).toFixed(2)} Z`;

  return (
    <div
      className="rounded-2xl overflow-hidden mb-5 relative"
      style={{
        background: "var(--preview-card)",
        border: "1px solid var(--preview-border-2)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
      role="region"
      aria-label={`${OUTLOOK_WINDOW_LABEL[window]}: ${fmtUSDFull(totalUsd)} unlocking across ${eventCount} event${eventCount !== 1 ? "s" : ""}`}
    >
      {/* Brand-teal hairline — matches mobile UpcomingOutlook visual continuity */}
      <div
        className="h-[2px] pointer-events-none"
        style={{ background: "linear-gradient(90deg, rgba(28,184,184,0.55), rgba(28,184,184,0))" }}
        aria-hidden
      />
      <div className="px-5 py-4">
        {/* Header — eyebrow + window selector */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#1CB8B8" }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--preview-text-3)" }}>
              Upcoming Unlocks
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(["30d", "90d", "1y"] as OutlookWindow[]).map((w) => {
              const isActive = window === w;
              return (
                <button
                  key={w}
                  onClick={() => setWindow(w)}
                  aria-pressed={isActive}
                  aria-label={OUTLOOK_WINDOW_LABEL[w]}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors"
                  style={{
                    background: isActive ? "rgba(28,184,184,0.14)" : "transparent",
                    border: `1px solid ${isActive ? "rgba(28,184,184,0.30)" : "var(--preview-border-2)"}`,
                    color: isActive ? "#1CB8B8" : "var(--preview-text-3)",
                    fontWeight: isActive ? 700 : 600,
                  }}
                >
                  {w}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hero metric — total USD unlocking in the chosen window */}
        <p
          className="text-3xl md:text-4xl font-extrabold tabular-nums leading-none"
          style={{
            color: "var(--preview-text)",
            letterSpacing: "-0.02em",
            textShadow: "0 2px 10px rgba(28,184,184,0.18)",
          }}
        >
          {fmtUSDFull(totalUsd)}
        </p>
        <p className="text-xs mt-2" style={{ color: "var(--preview-text-3)" }}>
          across <span className="font-semibold" style={{ color: "var(--preview-text)" }}>{eventCount}</span> event
          {eventCount !== 1 ? "s" : ""} · {OUTLOOK_WINDOW_LABEL[window].toLowerCase()}
        </p>

        {/* Cumulative projection sparkline — shape of unlock pressure */}
        <div className="mt-3">
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="outlook-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1CB8B8" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#1CB8B8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaD} fill="url(#outlook-area-grad)" />
            <path d={lineD} stroke="#1CB8B8" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Today</span>
            <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>{OUTLOOK_WINDOW_LABEL[window]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── UnlockTimeline ───────────────────────────────────────────────────────────

function UnlockTimeline({ streams }: { streams: VestingStream[]; dark: boolean }) {
  const nowSec = useNowSec();
  const [emailAlerts, setEmailAlerts] = useState(false);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.preferences?.emailEnabled) setEmailAlerts(true); })
      .catch(() => {});
  }, []);

  // Filter out streams with invalid/zero timestamps (e.g. unset defaults)
  // Allow startTime=0 (e.g. Team Finance missing start); normalize to min(now, endTime) so they still show
  const active = streams
    .filter((s) => !s.isFullyVested && s.endTime > 100_000)
    .map((s) => s.startTime > 100_000 ? s : { ...s, startTime: Math.min(nowSec, s.endTime) });
  if (active.length === 0) return null;

  const TWO_YRS  = 2 * 365 * 86400;
  const NINETY_D = 90 * 86400;

  // Separate streams that START within the 2yr view window vs those that start later
  // (e.g. a 50yr vesting starting 3 years from now would be invisible as a 0.5% bar)
  const viewEnd = nowSec + TWO_YRS;
  const ganttStreams  = active.filter((s) => s.startTime <= viewEnd);
  const futureStreams = active.filter((s) => s.startTime >  viewEnd);

  // Compute view window using only streams that will be drawn on the chart
  const drawSet = ganttStreams.length > 0 ? ganttStreams : active;
  const lastEnd = Math.max(...drawSet.map((s) => s.endTime));
  const clampedViewEnd = Math.min(lastEnd, viewEnd);

  const earliestStart = Math.min(...drawSet.map((s) => s.startTime));
  const viewStart  = Math.max(earliestStart, nowSec - NINETY_D);

  const totalSpan  = clampedViewEnd - viewStart;
  if (totalSpan <= 0 && futureStreams.length === 0) return null;

  const anyExtendsBeyond = active.some((s) => s.endTime > clampedViewEnd);

  // Convert a timestamp to a % position along the chart axis (0–100)
  const toX      = (ts: number) => totalSpan > 0 ? Math.max(0, Math.min(100, ((ts - viewStart) / totalSpan) * 100)) : 0;
  const nowX     = toX(nowSec);
  const nowColor = "#1CB8B8";

  const labelCount = 5;
  const timeLabels = Array.from({ length: labelCount }, (_, i) => {
    const ts = viewStart + (totalSpan / (labelCount - 1)) * i; // spans viewStart → clampedViewEnd
    return {
      pct:   (i / (labelCount - 1)) * 100,
      label: new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    };
  });

  const cardStyle = {
    background:   "var(--preview-card)",
    borderColor:  "var(--preview-border)",
    boxShadow:    "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  };

  return (
    <div className="rounded-2xl border overflow-hidden mb-4" style={cardStyle}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Unlock Timeline</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
            {active.length} active schedule{active.length !== 1 ? "s" : ""}
            {anyExtendsBeyond ? " · 2yr view (→ shows actual end)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {[
            { label: "Claimed",   opacity: 0.35 },
            { label: "Claimable", opacity: 0.9  },
            { label: "Locked",    opacity: 0.1  },
            { label: "Today",     dashed: true   },
            { label: "Cliff",     color: "#F0992E" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              {item.dashed ? (
                <svg width={12} height={12}>
                  <line x1={6} y1={0} x2={6} y2={12} stroke={nowColor} strokeWidth={1.5} strokeDasharray="3 2" />
                </svg>
              ) : (
                <div className="w-3 h-2 rounded-sm"
                  style={{ background: item.color ?? "var(--preview-text-3)", opacity: item.opacity ?? 1 }} />
              )}
              <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable chart area ──────────────────────────────────────────── */}
      <div className="overflow-x-auto">
      <div style={{ minWidth: "700px" }}>

      {/* ── Column header row ──────────────────────────────────────────────── */}
      <div className="flex" style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-card-2)" }}>
        <div className="w-64 flex-shrink-0 px-5 py-2" style={{ borderRight: "1px solid var(--preview-border-2)" }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--preview-text-3)" }}>Asset</span>
        </div>
        {/* Time axis labels */}
        <div className="flex-1 relative h-7">
          {timeLabels.map((tl, i) => (
            <span key={i} className="absolute top-1/2 text-[10px] font-medium select-none"
              style={{
                left: `${tl.pct}%`,
                transform: `translateX(${i === 0 ? "0" : i === labelCount - 1 ? "-100%" : "-50%"}) translateY(-50%)`,
                color: "var(--preview-text-3)",
              }}>
              {tl.label}
            </span>
          ))}
          <div className="absolute top-0 bottom-0 w-px" style={{ left: `${nowX}%`, background: nowColor, opacity: 0.3 }} />
        </div>
      </div>

      {/* ── Gantt rows ─────────────────────────────────────────────────────── */}
      {ganttStreams.map((s, idx) => {
        const startPct      = toX(s.startTime);
        const endPct        = toX(s.endTime);     // clamped to 100 for extending streams
        const barWidthPct   = Math.max(endPct - startPct, 0.5);
        const extendsBeyond = s.endTime > clampedViewEnd; // stream end beyond the 2yr view window
        const totalAmt      = toFloat(s.totalAmount, s.tokenDecimals);
        const claimableAmt  = toFloat(s.claimableNow, s.tokenDecimals);
        const lockedAmt     = toFloat(s.lockedAmount, s.tokenDecimals);
        const withdrawnAmt  = toFloat(s.withdrawnAmount, s.tokenDecimals);
        // Bar fill fractions (expressed as % of the bar width)
        const withdrawnFrac = totalAmt > 0 ? withdrawnAmt  / totalAmt : 0;
        const claimableFrac = totalAmt > 0 ? claimableAmt  / totalAmt : 0;
        const color         = getTokenColor(s.tokenSymbol);
        const proto         = PROTOCOL_COLORS[s.protocol]  ?? { text: "#B8BABD", bg: "rgba(184,186,189,0.1)", border: "rgba(184,186,189,0.2)" };

        return (
          <div key={s.id} className="flex"
            style={{ borderTop: idx > 0 ? "1px solid var(--preview-border-2)" : undefined }}>

            {/* ── Label column ─────────────────────────────────────────────── */}
            <div className="w-64 flex-shrink-0 px-4 py-3"
              style={{ borderRight: "1px solid var(--preview-border-2)" }}>

              {/* Token + notification bell */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0"
                    style={{ background: color + "18", borderColor: color + "30" }}>
                    <span className="text-[10px] font-bold" style={{ color }}>{s.tokenSymbol.slice(0, 2)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--preview-text)" }}>{s.tokenSymbol}</p>
                    <p className="text-[10px] font-mono" style={{ color: "var(--preview-text-3)" }}>{shortAddr(s.recipient)}</p>
                  </div>
                </div>
                {/* Bell: filled + coloured when email alerts are on */}
                <a href="/settings#notifications"
                  title={emailAlerts ? "Email alerts on · manage in Settings" : "Enable alerts in Settings"}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: emailAlerts ? color : "var(--preview-text-3)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <svg width={13} height={13} viewBox="0 0 24 24"
                    fill={emailAlerts ? "currentColor" : "none"}
                    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </a>
              </div>

              {/* Protocol badge + cancellable */}
              <div className="flex items-center gap-1 flex-wrap mb-2">
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: proto.bg, color: proto.text, border: `1px solid ${proto.border}` }}>
                  {protocolDisplay(s.protocol)}
                </span>
                {s.cancelable === true && (
                  <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(179,50,46,0.08)", color: "#B3322E", border: "1px solid rgba(179,50,46,0.18)" }}
                    title="Sender can cancel this stream">
                    ⚠ Cancel
                  </span>
                )}
              </div>

              {/* Claimable / locked amounts */}
              <div className="flex flex-col gap-0.5">
                {claimableAmt > 0 ? (
                  <span className="text-[11px] font-semibold" style={{ color }}>
                    ↑&nbsp;{claimableAmt.toLocaleString("en-US", { maximumFractionDigits: 4 })} claimable
                  </span>
                ) : (
                  <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>Nothing claimable yet</span>
                )}
                <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                  {lockedAmt.toLocaleString("en-US", { maximumFractionDigits: 4 })} still locked
                </span>
              </div>
            </div>

            {/* ── Bar column ───────────────────────────────────────────────── */}
            <div className="flex-1 relative overflow-hidden" style={{ height: 88 }}>
              {/* Grid lines at 25 / 50 / 75% */}
              {[25, 50, 75].map(p => (
                <div key={p} className="absolute top-0 bottom-0 w-px"
                  style={{ left: `${p}%`, background: "var(--preview-border-2)" }} />
              ))}

              {/* Today line */}
              <div className="absolute top-0 bottom-0 w-px" style={{ left: `${nowX}%`, background: nowColor, opacity: 0.7, zIndex: 2 }} />

              {/* Gantt bar */}
              <div className="absolute rounded-lg overflow-hidden"
                style={{ top: "50%", transform: "translateY(-50%)", left: `${startPct}%`, width: `${barWidthPct}%`, height: 24, zIndex: 1 }}>
                {/* Full bar background (locked portion) */}
                <div className="absolute inset-0" style={{ background: color, opacity: 0.1 }} />
                {/* Already claimed / withdrawn */}
                {withdrawnFrac > 0 && (
                  <div className="absolute inset-y-0 left-0"
                    style={{ width: `${withdrawnFrac * 100}%`, background: color, opacity: 0.35 }} />
                )}
                {/* Currently claimable (bright) */}
                {claimableFrac > 0 && (
                  <div className="absolute inset-y-0"
                    style={{ left: `${withdrawnFrac * 100}%`, width: `${claimableFrac * 100}%`, background: color, opacity: 0.9 }} />
                )}
                {/* Cliff marker */}
                {s.cliffTime && s.cliffTime > s.startTime && s.cliffTime < s.endTime && (
                  <div className="absolute top-0 bottom-0 w-0.5"
                    style={{ left: `${((s.cliffTime - s.startTime) / (s.endTime - s.startTime)) * 100}%`, background: "#F0992E" }} />
                )}
                {/* Token label inside bar */}
                <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
                  <span className="text-[9px] font-bold text-white truncate" style={{ opacity: 0.85 }}>{s.tokenSymbol}</span>
                </div>
              </div>

              {/* End date label — inline for normal streams, pinned to right edge for extending ones */}
              {!extendsBeyond ? (
                <span className="absolute text-[10px] font-medium whitespace-nowrap"
                  style={{ left: `${endPct}%`, top: "50%", transform: "translateY(-50%)", paddingLeft: 6, color: "var(--preview-text-3)", zIndex: 1 }}>
                  {fmtDate(s.endTime)}
                </span>
              ) : (
                <div className="absolute right-2 flex items-center gap-0.5 pointer-events-none"
                  style={{ bottom: 8, zIndex: 3 }}>
                  <span className="text-[10px] font-bold" style={{ color: "var(--preview-text-3)" }}>→</span>
                  <span className="text-[9px] font-medium tabular-nums whitespace-nowrap"
                    style={{ color: "var(--preview-text-3)" }}>
                    {fmtDate(s.endTime)}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Future streams (start > 2yr window) — shown as text rows ────── */}
      {futureStreams.length > 0 && (
        <div style={{ borderTop: "1px solid var(--preview-border-2)" }}>
          <div className="px-5 py-2"
            style={{ background: "var(--preview-card-2)", borderBottom: "1px solid var(--preview-border-2)" }}>
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--preview-text-3)" }}>
              Scheduled beyond 2yr view window
            </span>
          </div>
          {futureStreams.map((s) => {
            const color     = getTokenColor(s.tokenSymbol);
            const proto     = PROTOCOL_COLORS[s.protocol] ?? { text: "#B8BABD", bg: "rgba(184,186,189,0.1)", border: "rgba(184,186,189,0.2)" };
            const totalAmt  = toFloat(s.totalAmount, s.tokenDecimals);
            return (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3"
                style={{ borderTop: "1px solid var(--preview-border-2)" }}>
                <div className="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0"
                  style={{ background: color + "18", borderColor: color + "30" }}>
                  <span className="text-[9px] font-bold" style={{ color }}>{s.tokenSymbol.slice(0, 3)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>{s.tokenSymbol}</p>
                  <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
                    {totalAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })} tokens total
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: proto.bg, color: proto.text, border: `1px solid ${proto.border}` }}>
                  {protocolDisplay(s.protocol)}
                </span>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] font-semibold" style={{ color: "var(--preview-text-3)" }}>
                    Starts {fmtDate(s.startTime)}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
                    Ends {fmtDate(s.endTime)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </div>{/* /minWidth inner */}
      </div>{/* /overflow-x-auto */}
    </div>
  );
}

// ─── MonthlyCashFlow ──────────────────────────────────────────────────────────

function MonthlyCashFlow({
  streams, prices,
  costBasis = {}, buys = {},
}: {
  streams: VestingStream[];
  prices: Record<string, number>;
  costBasis?: Record<string, number>;
  buys?: Record<string, BuyTx[]>;
}) {
  // Derive effective prices: buy-tx weighted avg > manual costBasis > nothing
  const effectivePrices: Record<string, number> = {};
  const uniqueSymbols = [...new Set(streams.map(s => s.tokenSymbol))];
  for (const sym of uniqueSymbols) {
    const buyArr = buys[sym] ?? [];
    if (buyArr.length > 0) {
      const totalAmt  = buyArr.reduce((acc, tx) => acc + tx.amount, 0);
      const totalCost = buyArr.reduce((acc, tx) => acc + tx.amount * tx.pricePer, 0);
      if (totalAmt > 0) effectivePrices[sym] = totalCost / totalAmt;
    } else if (costBasis[sym] && costBasis[sym] > 0) {
      effectivePrices[sym] = costBasis[sym];
    }
  }

  const data     = buildMonthlyCashFlow(streams, prices, effectivePrices);
  const hasPrice = data.some(d => d.usd > 0);
  const anyLive  = data.some(d => d.hasLivePrice);
  const anyEst   = hasPrice && !anyLive; // all USD values come from fallback entry prices
  const vals     = data.map(d => hasPrice ? d.usd : d.raw);
  const maxVal   = Math.max(...vals, 1);
  const totalVal = vals.reduce((a, b) => a + b, 0);
  const totalUSD = data.reduce((s, d) => s + d.usd, 0);

  if (totalVal === 0) return null;

  function fmtRaw(val: number) {
    return val >= 1_000_000
      ? `${(val / 1_000_000).toFixed(1)}M`
      : val >= 1000
        ? `${(val / 1000).toFixed(1)}K`
        : val.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  const cardStyle = {
    background:  "var(--preview-card)",
    borderColor: "var(--preview-border)",
    boxShadow:   "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  };

  return (
    <div className="rounded-2xl border overflow-hidden mb-4" style={cardStyle}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
            Monthly Unlock Forecast
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
            Next 18 months · aggregated across all active streams
            {anyLive ? " · live USD value" : anyEst ? " · estimated USD (entry prices)" : ""}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>
            {hasPrice ? fmtUSD(totalVal) : totalVal.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
          {/* Show partial USD total when not all tokens have prices */}
          {!hasPrice && totalUSD > 0 && (
            <p className="text-[11px] font-semibold tabular-nums" style={{ color: "#1CB8B8" }}>
              {fmtUSD(totalUSD)} est. value
            </p>
          )}
          <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>total unlocking</p>
        </div>
      </div>

      {/* Chart */}
      <div className="px-6 py-5">
        {/* Value label row — two lines per bar: primary metric + secondary when both available */}
        <div className="flex gap-0.5 mb-1.5" style={{ height: 34 }}>
          {data.map((d, i) => {
            const val    = hasPrice ? d.usd : d.raw;
            const isCur  = i === 0;
            // Primary label always matches bar height
            const primary = val > 0 ? (hasPrice ? fmtUSD(val) : fmtRaw(val)) : "";
            // Secondary label: show USD when bars are token-count, show tokens when bars are USD
            const secondary = !hasPrice && d.usd > 0
              ? fmtUSD(d.usd)
              : hasPrice && d.raw > 0
                ? fmtRaw(d.raw)
                : "";
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center justify-end overflow-hidden gap-px">
                {primary && (
                  <span className="tabular-nums font-bold leading-none select-none truncate text-center"
                    style={{ fontSize: 9, color: isCur ? "#1CB8B8" : "var(--preview-text-2)" }}>
                    {primary}
                  </span>
                )}
                {secondary && (
                  <span className="tabular-nums leading-none select-none truncate text-center"
                    style={{ fontSize: 8, color: isCur ? "rgba(28,184,184,0.7)" : "var(--preview-text-3)" }}>
                    {secondary}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Bars area with grid lines */}
        <div className="relative" style={{ height: 96 }}>
          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75].map(f => (
            <div key={f} className="absolute inset-x-0 pointer-events-none"
              style={{ bottom: `${f * 100}%`, borderTop: "1px dashed var(--preview-border-2)" }} />
          ))}
          {/* Bar columns */}
          <div className="absolute inset-0 flex items-end gap-0.5">
            {data.map((d, i) => {
              const val    = hasPrice ? d.usd : d.raw;
              const barH   = maxVal > 0 ? Math.max((val / maxVal) * 96, val > 0 ? 3 : 0) : 0;
              const isCur  = i === 0;
              // Build stacked segments sorted by descending value (largest at bottom)
              const segments = d.byToken
                .map(t => ({ ...t, val: hasPrice ? t.usd : t.raw }))
                .filter(t => t.val > 0)
                .sort((a, b) => b.val - a.val);
              const segTotal = segments.reduce((s, t) => s + t.val, 0);
              return (
                <div key={d.month} className="flex-1 group relative flex flex-col justify-end" style={{ height: "100%" }}>
                  {/* Hover tooltip — always shows both metrics when available */}
                  {(val > 0 || d.usd > 0) && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap rounded-lg px-2.5 py-1.5"
                      style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.14)" }}>
                      {d.usd > 0 && (
                        <p className="text-[10px] font-bold text-center" style={{ color: "var(--preview-text)" }}>
                          {fmtUSD(d.usd)}
                        </p>
                      )}
                      {/* Per-token breakdown */}
                      {segments.map(t => (
                        <p key={t.symbol} className="text-[9px] flex items-center gap-1 justify-center" style={{ color: "var(--preview-text-3)" }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 inline-block" style={{ background: t.color }} />
                          {t.symbol}: {hasPrice && t.usd > 0 ? fmtUSD(t.usd) : fmtRaw(t.raw)}
                        </p>
                      ))}
                      {!hasPrice && d.raw > 0 && segments.length === 0 && (
                        <p className="text-[9px] text-center font-bold" style={{ color: "var(--preview-text)" }}>
                          {fmtRaw(d.raw)} tokens
                        </p>
                      )}
                      <p className="text-[9px] text-center mt-0.5" style={{ color: "var(--preview-text-3)" }}>{d.month}</p>
                    </div>
                  )}
                  {/* Stacked bar: one segment per token, bottom-up */}
                  <div className="w-full flex flex-col justify-end overflow-hidden rounded-t-sm"
                    style={{ height: barH, transition: "height 0.3s ease" }}>
                    {segments.length > 0 ? (
                      segments.map((t, si) => {
                        const segH = segTotal > 0 ? (t.val / segTotal) * 100 : 0;
                        const opacity = isCur ? 1 : 0.65;
                        return (
                          <div key={t.symbol}
                            style={{
                              height:     `${segH}%`,
                              background: t.color,
                              opacity,
                              borderTop: si > 0 ? "1px solid rgba(0,0,0,0.12)" : "none",
                              minHeight: 2,
                            }} />
                        );
                      })
                    ) : (
                      <div className="w-full h-full" style={{
                        background: isCur
                          ? "linear-gradient(180deg, #1CB8B8 0%, #1CB8B8 100%)"
                          : "linear-gradient(180deg, rgba(147,197,253,0.55) 0%, rgba(28,184,184,0.42) 100%)",
                      }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Month labels */}
        <div className="flex gap-0.5 mt-2 pt-2" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
          {data.map((d, i) => {
            const show = i === 0 || i % 3 === 0 || i === data.length - 1;
            return (
              <div key={d.month} className="flex-1 text-center overflow-hidden">
                {show && (
                  <span className="text-[9px] leading-none"
                    style={{
                      color:      i === 0 ? "#1CB8B8" : "var(--preview-text-3)",
                      fontWeight: i === 0 ? 700 : 400,
                    }}>
                    {d.month}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Token legend */}
        {(() => {
          const legendTokens = [...new Map(
            data.flatMap(d => d.byToken).filter(t => t.raw > 0).map(t => [t.symbol, t])
          ).values()];
          if (legendTokens.length <= 1) return null;
          return (
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
              {legendTokens.map(t => (
                <div key={t.symbol} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: t.color }} />
                  <span className="text-[10px] font-medium" style={{ color: "var(--preview-text-3)" }}>{t.symbol}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── TokenMarketPanel ─────────────────────────────────────────────────────────

interface TokenMarket {
  symbol:                string;
  address:               string | null;
  chainId:               number | null;
  marketCap:             number | null;
  fullyDilutedValuation: number | null;
  change1h:              number | null;
  change6h:              number | null;
  change24h:             number | null;
  volume24h:             number | null;
  price:                 number | null;
  liquidity:             "high" | "medium" | "low" | "unknown";
  liquidityUsd:          number | null;
  dexScreenerUrl:        string | null;
  dexToolsUrl:           string | null;
  tokenName:             string | null;
  imageUrl:              string | null;
  website:               string | null;
  docs:                  string | null;
  socials:               { type: string; url: string }[];
}

function fmtCompact(n: number | null): string {
  if (n === null || n === 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

const LIQUIDITY_LABEL: Record<TokenMarket["liquidity"], { label: string; color: string; bg: string }> = {
  high:    { label: "High",    color: "#3FA568", bg: "rgba(63,165,104,0.1)" },
  medium:  { label: "Medium",  color: "#F0B83D", bg: "rgba(240,184,61,0.1)" },
  low:     { label: "Low",     color: "#B3322E", bg: "rgba(179,50,46,0.1)" },
  unknown: { label: "Unknown", color: "#B8BABD", bg: "rgba(184,186,189,0.1)" },
};

interface TokenInfo { symbol: string; address: string; chainId: number }

function TokenMarketPanel({ tokens }: { tokens: TokenInfo[] }) {
  // Build query: SYMBOL:address:chainId,...
  const query = tokens.map(t => `${t.symbol}:${t.address}:${t.chainId}`).join(",");
  const { data, isLoading } = useSWR<{ market: TokenMarket[] }>(
    query ? `/api/market?tokens=${encodeURIComponent(query)}` : null,
    fetcher,
    { refreshInterval: 300_000 }
  );
  const market = data?.market ?? [];

  // Toggle: by default only show tokens that have price data
  const [showNoPriceTokens, setShowNoPriceTokens] = useState(false);
  const noPriceCount = market.filter((m) => m.price === null).length;
  const visibleMarket = showNoPriceTokens ? market : market.filter((m) => m.price !== null);

  const cardStyle = {
    background:   "var(--preview-card)",
    borderColor:  "var(--preview-border)",
    boxShadow:    "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  };

  if (tokens.length === 0) return null;

  return (
    <div className="rounded-2xl border overflow-hidden mb-4" style={cardStyle}>
      <div className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Token Market Context</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
            Live prices &amp; liquidity via DexScreener · Is the token liquid enough to sell?
          </p>
        </div>
        <div className="flex items-center gap-2">
          {noPriceCount > 0 && (
            <button
              onClick={() => setShowNoPriceTokens((v) => !v)}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md transition-all"
              style={{
                background:   showNoPriceTokens ? "rgba(28,184,184,0.12)" : "var(--preview-muted-2)",
                color:        showNoPriceTokens ? "#1CB8B8" : "var(--preview-text-3)",
                border:       showNoPriceTokens ? "1px solid rgba(28,184,184,0.3)" : "1px solid var(--preview-border-2)",
              }}>
              {showNoPriceTokens ? `Hide ${noPriceCount} unlisted` : `+${noPriceCount} unlisted`}
            </button>
          )}
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ background: "var(--preview-muted-2)", color: "var(--preview-text-3)", border: "1px solid var(--preview-border-2)" }}>
            DexScreener
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="px-6 py-6 flex gap-4 animate-pulse">
          {tokens.map((t) => (
            <div key={t.symbol} className="flex-1 h-28 rounded-xl" style={{ background: "var(--preview-muted)" }} />
          ))}
        </div>
      ) : visibleMarket.length === 0 ? (
        <div className="px-6 py-6 text-center text-[12px]" style={{ color: "var(--preview-text-3)" }}>
          No price data available.{noPriceCount > 0 && (
            <button onClick={() => setShowNoPriceTokens(true)} className="ml-1 underline" style={{ color: "#1CB8B8" }}>
              Show {noPriceCount} unlisted token{noPriceCount > 1 ? "s" : ""}.
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 md:px-6 py-4 md:py-5 grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {visibleMarket.map((m) => {
            const color          = getTokenColor(m.symbol);
            const liq            = LIQUIDITY_LABEL[m.liquidity];
            const hasData        = m.price !== null;
            function changePill(label: string, val: number | null) {
              if (val === null) return null;
              const pos = val >= 0;
              return (
                <div key={label} className="flex flex-col items-center px-2 py-1 rounded-lg"
                  style={{ background: pos ? "rgba(63,165,104,0.10)" : "rgba(179,50,46,0.10)" }}>
                  <span className="text-[9px] font-medium leading-none mb-0.5" style={{ color: "var(--preview-text-3)" }}>{label}</span>
                  <span className={`text-[10px] font-bold tabular-nums leading-none ${pos ? "text-emerald-400" : "text-red-400"}`}>
                    {pos ? "▲" : "▼"}{Math.abs(val).toFixed(2)}%
                  </span>
                </div>
              );
            }
            return (
              <div key={m.symbol} className="rounded-2xl p-4 flex flex-col" style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>

                {/* Token badge + price */}
                <div className="flex items-center gap-2.5 mb-3">
                  {/* Logo or fallback */}
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt={m.symbol} width={32} height={32}
                      className="w-8 h-8 rounded-xl flex-shrink-0 object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0"
                      style={{ background: color + "18", borderColor: color + "30" }}>
                      <span className="text-[10px] font-bold" style={{ color }}>{m.symbol.slice(0, 3)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold leading-tight" style={{ color: "var(--preview-text)" }}>{m.symbol}</p>
                    {m.tokenName && m.tokenName !== m.symbol && (
                      <p className="text-[10px] truncate" style={{ color: "var(--preview-text-3)" }}>{m.tokenName}</p>
                    )}
                    {m.price !== null ? (
                      <p className="text-[11px] font-semibold tabular-nums mt-0.5" style={{ color }}>
                        ${m.price >= 1
                          ? m.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                          : m.price >= 0.01
                            ? m.price.toFixed(4)
                            : m.price >= 0.0001
                              ? m.price.toFixed(6)
                              : m.price.toFixed(8)}
                      </p>
                    ) : (
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>No price data</p>
                    )}
                  </div>
                  {/* current price change — moved to labeled row below */}
                </div>

                {/* Price change row — 1h / 6h / 24h */}
                {hasData && (m.change1h !== null || m.change6h !== null || m.change24h !== null) && (
                  <div className="flex items-center gap-1.5 mb-3">
                    {changePill("1h", m.change1h)}
                    {changePill("6h", m.change6h)}
                    {changePill("24h", m.change24h)}
                  </div>
                )}

                {/* Market stats */}
                {hasData && (
                  <div className="space-y-1.5 mb-3">
                    {[
                      { label: "Mkt Cap",  value: fmtCompact(m.marketCap) },
                      { label: "FDV",      value: fmtCompact(m.fullyDilutedValuation) },
                      { label: "Vol 24h",  value: fmtCompact(m.volume24h) },
                      { label: "Liquidity",value: fmtCompact(m.liquidityUsd) },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>{label}</span>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--preview-text-2)" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Liquidity badge */}
                {hasData && (
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Sell liquidity</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                      style={{ background: liq.bg, color: liq.color }}>
                      {liq.label}
                    </span>
                  </div>
                )}
                {m.liquidity === "low" && hasData && (
                  <p className="text-[9px] mb-3" style={{ color: "#B3322E" }}>
                    ⚠ Low liquidity — large sells may have significant price impact.
                  </p>
                )}

                {/* Spacer to push links to bottom */}
                <div className="flex-1" />

                {/* Website + social links */}
                {(m.website || m.docs || m.socials.length > 0) && (
                  <div className="flex items-center gap-1.5 flex-wrap mb-2.5 pt-2.5" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
                    {m.website && (
                      <a href={m.website} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg transition-all"
                        style={{ background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border-2)" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.75")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}>
                        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                        Website
                      </a>
                    )}
                    {m.docs && (
                      <a href={m.docs} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-lg transition-all"
                        style={{ background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border-2)" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.75")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}>
                        Docs
                      </a>
                    )}
                    {m.socials.slice(0, 3).map((soc) => {
                      const socLabel: Record<string, string> = { twitter: "𝕏", telegram: "TG", discord: "DC", github: "GH" };
                      const label = socLabel[soc.type] ?? soc.type.slice(0, 2).toUpperCase();
                      return (
                        <a key={soc.url} href={soc.url} target="_blank" rel="noopener noreferrer"
                          title={soc.type}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg transition-all"
                          style={{ background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border-2)" }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.75")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}>
                          {label}
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* DEX links */}
                {(m.dexScreenerUrl || m.dexToolsUrl) && (
                  <div className="flex items-center gap-2">
                    {m.dexScreenerUrl && (
                      <a href={m.dexScreenerUrl} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center text-[10px] font-semibold py-1 rounded-lg transition-all"
                        style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.18)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.1)")}>
                        DexScreener ↗
                      </a>
                    )}
                    {m.dexToolsUrl && (
                      <a href={m.dexToolsUrl} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center text-[10px] font-semibold py-1 rounded-lg transition-all"
                        style={{ background: "rgba(28,184,184,0.1)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.2)" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.18)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(28,184,184,0.1)")}>
                        DexTools ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PnLPanel ─────────────────────────────────────────────────────────────────
// Per-token purchase + sell transaction log. Entry price derived from purchases.
// All data stored in localStorage only — nothing sent to any server.

type SellTx = { id: string; date: string; amount: number; pricePer: number };
type BuyTx  = { id: string; date: string; amount: number; pricePer: number };

function PnLPanel({
  streams,
  prices,
  imageUrls = {},
  costBasis,
  onUpdateCostBasis,
  sells,
  onAddSellTx,
  onRemoveSellTx,
  buys,
  onAddBuyTx,
  onRemoveBuyTx,
}: {
  streams:          VestingStream[];
  prices:           Record<string, number>;
  imageUrls?:       Record<string, string>;
  costBasis:        Record<string, number>;
  onUpdateCostBasis:(symbol: string, price: number) => void;
  sells:            Record<string, SellTx[]>;
  onAddSellTx:      (symbol: string, tx: SellTx) => void;
  onRemoveSellTx:   (symbol: string, id: string) => void;
  buys:             Record<string, BuyTx[]>;
  onAddBuyTx:       (symbol: string, tx: BuyTx) => void;
  onRemoveBuyTx:    (symbol: string, id: string) => void;
}) {
  // Entry-price editing (manual override when no purchases logged)
  const [editSym,       setEditSym]       = useState<string | null>(null);
  const [entryInput,    setEntryInput]    = useState("");
  // Add-sale form
  const [addingFor,     setAddingFor]     = useState<string | null>(null);
  // Add-purchase form
  const [addingBuyFor,  setAddingBuyFor]  = useState<string | null>(null);
  // Shared form fields (used by both buy and sell forms)
  const [fmDate,        setFmDate]        = useState(new Date().toISOString().slice(0, 10));
  const [fmAmt,         setFmAmt]         = useState("");
  const [fmPrice,       setFmPrice]       = useState("");
  const [fmMode,        setFmMode]        = useState<"per" | "total">("per");

  const tokens = buildTokenSummaries(streams, prices);
  if (tokens.length === 0) return null;

  function commitEntry() {
    if (!editSym) return;
    const p = parseFloat(entryInput.replace(/[^0-9.]/g, ""));
    if (!isNaN(p) && p > 0) onUpdateCostBasis(editSym, p);
    setEditSym(null); setEntryInput("");
  }

  function openAddForm(symbol: string) {
    setAddingFor(symbol); setAddingBuyFor(null);
    setFmDate(new Date().toISOString().slice(0, 10));
    setFmAmt(""); setFmPrice(""); setFmMode("per");
  }

  function openAddBuyForm(symbol: string) {
    setAddingBuyFor(symbol); setAddingFor(null);
    setFmDate(new Date().toISOString().slice(0, 10));
    setFmAmt(""); setFmPrice(""); setFmMode("per");
  }

  function commitAddTx(symbol: string) {
    const amt = parseFloat(fmAmt.replace(/[^0-9.]/g, ""));
    const px  = parseFloat(fmPrice.replace(/[^0-9.]/g, ""));
    if (isNaN(amt) || amt <= 0 || isNaN(px) || px <= 0 || !fmDate) return;
    const pricePer = fmMode === "total" ? px / amt : px;
    onAddSellTx(symbol, {
      id:       Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date:     fmDate,
      amount:   amt,
      pricePer,
    });
    setAddingFor(null); setFmAmt(""); setFmPrice("");
  }

  function commitAddBuyTx(symbol: string) {
    const amt = parseFloat(fmAmt.replace(/[^0-9.]/g, ""));
    const px  = parseFloat(fmPrice.replace(/[^0-9.]/g, ""));
    if (isNaN(amt) || amt <= 0 || isNaN(px) || px <= 0 || !fmDate) return;
    const pricePer = fmMode === "total" ? px / amt : px;
    // ID generation: React 19's react-hooks/purity flags Date.now() + Math.random()
    // here because the function is defined during render. But this IS a click
    // handler — it never runs during render, only when the user clicks Save. The
    // disable scopes the suppression to this exact line.
    // eslint-disable-next-line react-hooks/purity
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    onAddBuyTx(symbol, {
      id,
      date:     fmDate,
      amount:   amt,
      pricePer,
    });
    setAddingBuyFor(null); setFmAmt(""); setFmPrice("");
  }

  function fmtDate(d: string) {
    try { return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return d; }
  }

  // Helper: derive entry price from purchases (weighted avg) or fall back to manual
  function getEntryPrice(symbol: string): number | null {
    const buyArr = buys[symbol] ?? [];
    if (buyArr.length > 0) {
      const totalAmt  = buyArr.reduce((s, tx) => s + tx.amount, 0);
      const totalCost = buyArr.reduce((s, tx) => s + tx.amount * tx.pricePer, 0);
      return totalAmt > 0 ? totalCost / totalAmt : null;
    }
    const manual = costBasis[symbol];
    return (manual != null && manual > 0) ? manual : null;
  }

  // Grand totals
  let grandRealized = 0, grandUnrealized = 0;
  let hasAnyRealized = false, hasAnyUnrealized = false;
  tokens.forEach((t) => {
    const cp  = prices[t.symbol] > 0 ? prices[t.symbol] : null;
    const ep  = getEntryPrice(t.symbol);
    const txs = sells[t.symbol] ?? [];
    const tt  = t.claimable + t.locked;
    if (ep && txs.length > 0) { txs.forEach(tx => { grandRealized += (tx.pricePer - ep) * tx.amount; }); hasAnyRealized = true; }
    if (ep && cp && tt > 0)   { grandUnrealized += (cp - ep) * tt; hasAnyUnrealized = true; }
  });
  const grandTotal = grandRealized + grandUnrealized;

  const cardStyle: React.CSSProperties = {
    background: "var(--preview-card)", borderColor: "var(--preview-border)",
    boxShadow:  "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  };

  return (
    <div className="rounded-2xl border overflow-hidden mb-4" style={cardStyle}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>P&amp;L Tracker</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
            Log entry price &amp; individual sales — realized &amp; unrealized P&amp;L, stored locally
          </p>
        </div>
        {(hasAnyRealized || hasAnyUnrealized) ? (
          <div className="flex items-center gap-4">
            {hasAnyRealized && (
              <div className="text-right">
                <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Realized</p>
                <p className={`text-xs font-bold tabular-nums ${grandRealized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {grandRealized >= 0 ? "+" : "−"}{fmtUSDFull(Math.abs(grandRealized))}
                </p>
              </div>
            )}
            {hasAnyUnrealized && (
              <div className="text-right">
                <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Unrealized</p>
                <p className={`text-xs font-bold tabular-nums ${grandUnrealized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {grandUnrealized >= 0 ? "+" : "−"}{fmtUSDFull(Math.abs(grandUnrealized))}
                </p>
              </div>
            )}
            {hasAnyRealized && hasAnyUnrealized && (
              <div className="text-right pl-4" style={{ borderLeft: "1px solid var(--preview-border-2)" }}>
                <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Total P&amp;L</p>
                <p className={`text-sm font-bold tabular-nums ${grandTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {grandTotal >= 0 ? "+" : "−"}{fmtUSDFull(Math.abs(grandTotal))}
                </p>
              </div>
            )}
          </div>
        ) : (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md"
            style={{ background: "var(--preview-muted-2)", color: "var(--preview-text-3)", border: "1px solid var(--preview-border-2)" }}>
            Stored locally
          </span>
        )}
      </div>

      {/* Cloud sync notice */}
      <div className="px-6 py-2.5 flex items-center gap-2.5 text-[11px]"
        style={{ background: "rgba(28,184,184,0.05)", borderBottom: "1px solid rgba(28,184,184,0.12)" }}>
        <span style={{ fontSize: 12, color: "#0F8A8A" }}>☁</span>
        <span style={{ color: "var(--preview-text-3)" }}>
          P&amp;L data syncs to your account — available on any device.
          Local data from this browser is migrated automatically on first load.
        </span>
      </div>

      {/* Token sections */}
      <div className="divide-y" style={{ borderColor: "var(--preview-border-2)" }}>
        {tokens.map((t) => {
          const currentPrice   = prices[t.symbol] && prices[t.symbol] > 0 ? prices[t.symbol] : null;
          const buyTxs         = buys[t.symbol]  ?? [];
          const entryPrice     = getEntryPrice(t.symbol);
          const entryFromBuys  = buyTxs.length > 0;  // true when entry is auto-calculated
          const txs            = sells[t.symbol] ?? [];
          const totalTokens    = t.claimable + t.locked;
          const totalSold      = txs.reduce((s, tx) => s + tx.amount, 0);
          const totalBought    = buyTxs.reduce((s, tx) => s + tx.amount, 0);
          const realizedPnL:   number | null = (entryPrice && txs.length > 0) ? txs.reduce((s, tx) => s + (tx.pricePer - entryPrice) * tx.amount, 0) : null;
          const unrealizedPnL: number | null = (entryPrice && currentPrice && totalTokens > 0) ? (currentPrice - entryPrice) * totalTokens : null;
          const totalPnL:      number | null = (realizedPnL !== null && unrealizedPnL !== null) ? realizedPnL + unrealizedPnL : null;
          const isEditingEntry = editSym === t.symbol;
          const isAddingTx     = addingFor === t.symbol;
          const isAddingBuyTx  = addingBuyFor === t.symbol;

          const inputSty: React.CSSProperties = { color: "var(--preview-text)", background: "var(--preview-muted-2)", border: `1px solid ${t.color}50`, boxShadow: `0 0 0 2px ${t.color}18` };
          const btnSty = (v: boolean): React.CSSProperties => ({ color: v ? "var(--preview-text)" : "var(--preview-text-3)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" });

          return (
            <div key={t.symbol} className="px-6 py-4">
              {/* Token header row */}
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                {/* Badge */}
                <div className="flex items-center gap-2.5 w-32 flex-shrink-0">
                  <TokenIcon symbol={t.symbol} imageUrl={imageUrls[t.symbol]} size={32} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>{t.symbol}</p>
                    <p className="text-[10px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>
                      {totalTokens.toLocaleString("en-US", { maximumFractionDigits: 2 })} vesting
                    </p>
                  </div>
                </div>
                {/* Entry / avg cost */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium" style={{ color: "var(--preview-text-3)" }}>
                    {entryFromBuys ? "Avg cost" : "Entry"}
                  </span>
                  {entryFromBuys ? (
                    // Auto-calculated from purchase transactions — show as read-only with indicator
                    <span className="rounded-lg px-2 py-1 text-xs font-mono tabular-nums flex items-center gap-1"
                      style={{ color: "var(--preview-text)", background: t.color + "12", border: `1px solid ${t.color}30` }}>
                      ${entryPrice!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                      <span className="text-[9px] font-medium" style={{ color: t.color }}>avg</span>
                    </span>
                  ) : isEditingEntry ? (
                    <input autoFocus type="text" inputMode="decimal" placeholder="0.00" value={entryInput}
                      onChange={(e) => setEntryInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitEntry(); if (e.key === "Escape") { setEditSym(null); setEntryInput(""); } }}
                      onBlur={commitEntry}
                      className="w-24 rounded-lg px-2 py-1 text-xs font-mono outline-none" style={inputSty} />
                  ) : (
                    <button onClick={() => { setEditSym(t.symbol); setEntryInput(entryPrice ? String(entryPrice) : ""); }}
                      className="rounded-lg px-2 py-1 text-xs font-mono transition-all" style={btnSty(!!entryPrice)}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = t.color + "50")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--preview-border-2)")}>
                      {entryPrice ? `$${entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : "Set ✎"}
                    </button>
                  )}
                </div>
                {/* Live price */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium" style={{ color: "var(--preview-text-3)" }}>Now</span>
                  <span className="text-xs font-mono" style={{ color: "var(--preview-text-2)" }}>
                    {currentPrice ? `$${currentPrice >= 0.01 ? currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : currentPrice.toFixed(8)}` : "—"}
                  </span>
                </div>
              </div>

              {/* ── Purchase transaction list ── */}
              {buyTxs.length > 0 && (
                <div className="mb-2 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(63,165,104,0.2)", background: "rgba(63,165,104,0.04)" }}>
                  <div className="px-4 py-1.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid rgba(63,165,104,0.15)" }}>
                    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#3FA568" strokeWidth={2.5} strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#3FA568" }}>
                      Purchases · {totalBought.toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.symbol} total
                    </span>
                  </div>
                  {buyTxs.map((tx, idx) => (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5 text-xs"
                      style={{ borderTop: idx > 0 ? "1px solid rgba(63,165,104,0.12)" : undefined }}>
                      <span className="tabular-nums w-24 flex-shrink-0" style={{ color: "var(--preview-text-3)" }}>{fmtDate(tx.date)}</span>
                      <span className="tabular-nums flex-1" style={{ color: "var(--preview-text-2)" }}>
                        {tx.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} {t.symbol}
                      </span>
                      <span className="tabular-nums flex-shrink-0" style={{ color: "var(--preview-text-3)" }}>
                        @ ${tx.pricePer >= 0.01 ? tx.pricePer.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : tx.pricePer.toFixed(8)}/token
                      </span>
                      <button onClick={() => onRemoveBuyTx(t.symbol, tx.id)}
                        className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all"
                        style={{ color: "var(--preview-text-3)", background: "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(179,50,46,0.12)"; e.currentTarget.style.color = "#B3322E"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--preview-text-3)"; }}>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Sell transaction list ── */}
              {txs.length > 0 && (
                <div className="mb-2 rounded-xl overflow-hidden" style={{ border: "1px solid var(--preview-border-2)", background: "var(--preview-muted-2)" }}>
                  <div className="px-4 py-1.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
                    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--preview-text-3)" strokeWidth={2.5} strokeLinecap="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>
                      Sales · {totalSold.toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.symbol} sold
                    </span>
                  </div>
                  {txs.map((tx, idx) => {
                    const txPnL = entryPrice ? (tx.pricePer - entryPrice) * tx.amount : null;
                    return (
                      <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5 text-xs"
                        style={{ borderTop: idx > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
                        <span className="tabular-nums w-24 flex-shrink-0" style={{ color: "var(--preview-text-3)" }}>{fmtDate(tx.date)}</span>
                        <span className="tabular-nums flex-1" style={{ color: "var(--preview-text-2)" }}>
                          {tx.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} {t.symbol}
                        </span>
                        <span className="tabular-nums flex-shrink-0" style={{ color: "var(--preview-text-3)" }}>
                          @ ${tx.pricePer >= 0.01 ? tx.pricePer.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : tx.pricePer.toFixed(8)}/token
                        </span>
                        {txPnL !== null && (
                          <span className={`tabular-nums flex-shrink-0 font-semibold ${txPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {txPnL >= 0 ? "+" : "−"}{fmtUSDFull(Math.abs(txPnL))}
                          </span>
                        )}
                        <button onClick={() => onRemoveSellTx(t.symbol, tx.id)}
                          className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all"
                          style={{ color: "var(--preview-text-3)", background: "transparent" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(179,50,46,0.12)"; e.currentTarget.style.color = "#B3322E"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--preview-text-3)"; }}>
                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Add Purchase form / button ── */}
              {isAddingBuyTx ? (
                <div className="mb-2 rounded-xl p-3.5" style={{ border: "1px solid rgba(63,165,104,0.25)", background: "rgba(63,165,104,0.06)" }}>
                  <p className="text-[10px] font-semibold mb-2.5 uppercase tracking-wide" style={{ color: "#3FA568" }}>New Purchase</p>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Date</label>
                      <input type="date" value={fmDate} onChange={(e) => setFmDate(e.target.value)}
                        className="rounded-lg px-2 py-1.5 text-xs font-mono outline-none"
                        style={{ ...inputSty, width: "132px" }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Tokens bought</label>
                      <input type="text" inputMode="decimal" placeholder="e.g. 10000" value={fmAmt}
                        onChange={(e) => setFmAmt(e.target.value)}
                        className="rounded-lg px-2 py-1.5 text-xs font-mono outline-none w-28"
                        style={inputSty} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        {(["per", "total"] as const).map((m) => (
                          <button key={m} onClick={() => setFmMode(m)}
                            className="text-[10px] px-2 py-0.5 rounded transition-all"
                            style={{
                              background: fmMode === m ? "rgba(63,165,104,0.2)" : "transparent",
                              color:      fmMode === m ? "#3FA568"              : "var(--preview-text-3)",
                              border:     `1px solid ${fmMode === m ? "rgba(63,165,104,0.4)" : "transparent"}`,
                            }}>
                            {m === "per" ? "$/token" : "Total $"}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: "var(--preview-text-3)" }}>$</span>
                        <input type="text" inputMode="decimal"
                          placeholder={fmMode === "per" ? "price/token" : "total paid"}
                          value={fmPrice} onChange={(e) => setFmPrice(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitAddBuyTx(t.symbol); if (e.key === "Escape") setAddingBuyFor(null); }}
                          className="rounded-lg px-2 py-1.5 text-xs font-mono outline-none w-28"
                          style={inputSty} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => commitAddBuyTx(t.symbol)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: "#3FA568", color: "white" }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                        Add
                      </button>
                      <button onClick={() => setAddingBuyFor(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: "var(--preview-muted-2)", color: "var(--preview-text-3)", border: "1px solid var(--preview-border-2)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ── Add Sale form / button ── */}
              {isAddingTx ? (
                <div className="mb-2 rounded-xl p-3.5" style={{ border: `1px solid ${t.color}30`, background: `${t.color}08` }}>
                  <p className="text-[10px] font-semibold mb-2.5 uppercase tracking-wide" style={{ color: t.color }}>New Sale</p>
                  <div className="flex items-end gap-3 flex-wrap">
                    {/* Date */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Date</label>
                      <input type="date" value={fmDate} onChange={(e) => setFmDate(e.target.value)}
                        className="rounded-lg px-2 py-1.5 text-xs font-mono outline-none"
                        style={{ ...inputSty, width: "132px" }} />
                    </div>
                    {/* Amount */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Tokens sold</label>
                      <input type="text" inputMode="decimal" placeholder="e.g. 1000" value={fmAmt}
                        onChange={(e) => setFmAmt(e.target.value)}
                        className="rounded-lg px-2 py-1.5 text-xs font-mono outline-none w-28"
                        style={inputSty} />
                    </div>
                    {/* Price mode toggle + price */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        {(["per", "total"] as const).map((m) => (
                          <button key={m} onClick={() => setFmMode(m)}
                            className="text-[10px] px-2 py-0.5 rounded transition-all"
                            style={{
                              background: fmMode === m ? t.color + "20" : "transparent",
                              color:      fmMode === m ? t.color : "var(--preview-text-3)",
                              border:     `1px solid ${fmMode === m ? t.color + "40" : "transparent"}`,
                            }}>
                            {m === "per" ? "$/token" : "Total $"}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: "var(--preview-text-3)" }}>$</span>
                        <input type="text" inputMode="decimal"
                          placeholder={fmMode === "per" ? "price/token" : "total USD"}
                          value={fmPrice} onChange={(e) => setFmPrice(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitAddTx(t.symbol); if (e.key === "Escape") setAddingFor(null); }}
                          className="rounded-lg px-2 py-1.5 text-xs font-mono outline-none w-28"
                          style={inputSty} />
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => commitAddTx(t.symbol)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: t.color, color: "white" }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                        Add
                      </button>
                      <button onClick={() => setAddingFor(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: "var(--preview-muted-2)", color: "var(--preview-text-3)", border: "1px solid var(--preview-border-2)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ── Action buttons row (shown when neither form is open) ── */}
              {!isAddingTx && !isAddingBuyTx && (
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => openAddBuyForm(t.symbol)}
                    className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all"
                    style={{ color: "#3FA568", background: "rgba(63,165,104,0.06)", border: "1px solid rgba(63,165,104,0.2)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(63,165,104,0.12)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(63,165,104,0.06)")}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Log Purchase
                  </button>
                  <button onClick={() => openAddForm(t.symbol)}
                    className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all"
                    style={{ color: t.color, background: t.color + "0d", border: `1px solid ${t.color}20` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = t.color + "18")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = t.color + "0d")}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Log Sale
                  </button>
                </div>
              )}

              {/* P&L summary row */}
              {(realizedPnL !== null || unrealizedPnL !== null) ? (
                <div className="flex items-center gap-3 flex-wrap">
                  {realizedPnL !== null && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Realized</span>
                      <span className={`text-xs font-semibold tabular-nums ${realizedPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {realizedPnL >= 0 ? "+" : "−"}{fmtUSDFull(Math.abs(realizedPnL))}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
                        ({totalSold.toLocaleString("en-US", { maximumFractionDigits: 2 })} sold)
                      </span>
                    </div>
                  )}
                  {realizedPnL !== null && unrealizedPnL !== null && <span style={{ color: "var(--preview-border)" }}>·</span>}
                  {unrealizedPnL !== null && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Unrealized</span>
                      <span className={`text-xs font-semibold tabular-nums ${unrealizedPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {unrealizedPnL >= 0 ? "+" : "−"}{fmtUSDFull(Math.abs(unrealizedPnL))}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
                        ({totalTokens.toLocaleString("en-US", { maximumFractionDigits: 2 })} vesting)
                      </span>
                    </div>
                  )}
                  {totalPnL !== null && (
                    <>
                      <span style={{ color: "var(--preview-border)" }}>·</span>
                      <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-0.5"
                        style={{ background: totalPnL >= 0 ? "rgba(63,165,104,0.08)" : "rgba(179,50,46,0.08)", border: `1px solid ${totalPnL >= 0 ? "rgba(63,165,104,0.25)" : "rgba(179,50,46,0.25)"}` }}>
                        <span className="text-[10px] font-medium" style={{ color: "var(--preview-text-3)" }}>Total</span>
                        <span className={`text-xs font-bold tabular-nums ${totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {totalPnL >= 0 ? "+" : "−"}{fmtUSDFull(Math.abs(totalPnL))}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ) : !entryPrice ? (
                <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>Log a purchase or set an entry price to track P&amp;L</p>
              ) : entryPrice && !currentPrice ? (
                <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>No live price for {t.symbol} — unrealized P&amp;L unavailable</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DarkToggle ───────────────────────────────────────────────────────────────

function DarkToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} title={dark ? "Light mode" : "Dark mode"}
      className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200"
      style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--preview-card)")}
    >
      {dark ? (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--preview-text-2)" }}>
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--preview-text-2)" }}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

// WalletChip moved to src/components/WalletChip.tsx — the account chip now
// lives in the universal <DashboardHeader> (rendered by DashboardChrome on
// every tab), not in this page's local header.

// ─── Chain / protocol label maps (used by WalletRow badges + loading skeleton) ─
const CHAIN_LABELS: Record<string, string> = {
  "1": "ETH", "56": "BSC", "137": "Polygon", "8453": "Base",
  "42161": "Arbitrum", "101": "SOL", "11155111": "Sepolia",
};
const PROTOCOL_LABELS: Record<string, string> = {
  "sablier": "Sablier", "uncx": "UNCX",
  "hedgey": "Hedgey", "unvest": "Unvest", "superfluid": "Superfluid",
  "pinksale": "PinkSale", "streamflow": "Streamflow", "jupiter-lock": "Jupiter",
};

// ─── AddWalletModal ───────────────────────────────────────────────────────────
// Simplified: just enter an address. We scan all chains × all protocols
// automatically — no chain/protocol dropdowns needed.

function AddWalletModal({ onAdd, onCancel }: { onAdd: () => void; onCancel: () => void }) {
  const [address, setAddress] = useState("");
  const [label,   setLabel]   = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { address: wagmiAddress } = useAccount();
  const { connect } = useConnect();

  // Focus the address field on mount
  useEffect(() => { inputRef.current?.focus(); }, []);
  // Auto-fill connected wallet address
  useEffect(() => { if (wagmiAddress && !address) setAddress(wagmiAddress); }, [wagmiAddress, address]);

  async function handleAdd() {
    setError(null);
    const trimmed = address.trim();
    if (!isValidWalletAddress(trimmed)) {
      setError("Invalid address — expected EVM 0x… or Solana pubkey");
      return;
    }
    setLoading(true);
    try {
      // POST with empty chains + protocols → server scans all automatically
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: trimmed, label: label.trim() || undefined }),
      });
      if (res.status === 409) { setError("Wallet already tracked"); return; }
      if (res.status === 402) {
        const j = await res.json();
        const nextPlan = j.tier === "free" ? "Pro" : "Enterprise";
        setError(`${j.error ?? "Plan limit reached"} — upgrade to ${nextPlan} to add more wallets.`);
        return;
      }
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError((j as {error?:string}).error ?? "Failed to add wallet"); return; }
      onAdd();
    } catch { setError("Network error — please try again"); }
    finally { setLoading(false); }
  }

  // Close on backdrop click or Escape
  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onCancel();
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--preview-text)" }}>Track a wallet</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>
              We&apos;ll scan all chains &amp; protocols automatically.
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: "var(--preview-text-3)" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Address input */}
        <label className="block mb-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--preview-text-3)" }}>
          Wallet address
        </label>
        <div className="flex items-center gap-2 mb-4">
          <input
            ref={inputRef}
            placeholder="0x… or Solana pubkey"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm font-mono outline-none"
            style={{ color: "var(--preview-text)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)" }}
          />
          <button
            type="button"
            onClick={() => connect({ connector: injected() })}
            title="Auto-fill from connected wallet"
            className="flex-shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors"
            style={{
              color: wagmiAddress ? "#3FA568" : "var(--preview-text-3)",
              background: "var(--preview-muted-2)",
              border: "1px solid var(--preview-border)",
            }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            {wagmiAddress ? "✓" : "Detect"}
          </button>
        </div>

        {/* Label input */}
        <label className="block mb-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--preview-text-3)" }}>
          Label <span className="font-normal normal-case tracking-normal">(optional)</span>
        </label>
        <input
          placeholder="e.g. My main wallet"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-5"
          style={{ color: "var(--preview-text)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)" }}
        />

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleAdd}
            disabled={loading || !address.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", boxShadow: loading ? "none" : "0 4px 16px rgba(28,184,184,0.3)" }}
          >
            {loading ? (
              <>
                <Spinner16 /> Scanning &amp; adding…
              </>
            ) : (
              <>
                <IconPlus /> Scan &amp; track wallet
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ color: "var(--preview-text-3)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)" }}
          >
            Cancel
          </button>
        </div>

        <p className="text-[10px] mt-3 text-center" style={{ color: "var(--preview-text-3)" }}>
          Searches Sablier, Hedgey, UNCX, Unvest, Superfluid, PinkSale, Streamflow &amp; more
        </p>
      </div>
    </div>
  );
}

function Spinner16() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="animate-spin flex-shrink-0">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3"/>
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

// Nav definition — `active` is computed from usePathname() at render time,
// not hardcoded. The previous static `active: true` on Dashboard meant the
// Dashboard pill stayed highlighted regardless of which sub-route the user
// was viewing, and the Explorer pill never lit up.
const NAV_ITEMS = [
  { icon: <IconGrid />,     label: "Dashboard",      href: "/dashboard"                    },
  { icon: <IconCompass />,  label: "Vesting Explorer",  href: "/dashboard/explorer"           },
  { icon: <IconSearch />,   label: "Wallet Scanner", href: "/dashboard/discover"           },
  { icon: <IconBookmark />, label: "Token Watchlist", href: "/dashboard/watchlist"         },
  { icon: <IconIncomeStatement />, label: "Income",  href: "/dashboard/income-statement"  },
  { icon: <IconExport />,   label: "Tax Reports",    href: "/dashboard/exports"            },
  { icon: <IconSettings />, label: "Settings",       href: "/settings"                    },
];

// ─── WalletRow (sidebar wallet entry — clean display with config badges) ──────

function WalletRow({
  wallet, onRemove,
}: {
  wallet:   Wallet;
  onRemove: () => void;
}) {
  const cfgChains    = wallet.chains    && wallet.chains.length    > 0 ? wallet.chains    : null;
  const cfgProtocols = wallet.protocols && wallet.protocols.length > 0 ? wallet.protocols : null;
  const hasConfig    = !!(cfgChains || cfgProtocols || wallet.tokenAddress);

  return (
    <div className="rounded-xl mb-0.5 relative group">
      <div className="flex items-center gap-2 px-3 py-2 text-xs transition-all duration-150 cursor-default rounded-xl"
        style={{ color: "var(--preview-text-2)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-muted)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
        <span className="flex-1 truncate font-medium">{wallet.label ?? shortAddr(wallet.address)}</span>
        {/* Config filter dot — visible only when filters are set */}
        {hasConfig && (
          <span className="flex-shrink-0 w-1 h-1 rounded-full" style={{ background: "#1CB8B8" }} title="Custom filters applied" />
        )}
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/10"
          style={{ color: "var(--preview-text-3)" }} title="Remove"
        >×</button>
      </div>

      {/* Config badge tooltip — appears above the row on hover */}
      {hasConfig && (
        <div className="absolute left-0 right-0 bottom-full mb-1.5 hidden group-hover:flex flex-wrap gap-1 px-2.5 py-2 rounded-xl z-50 pointer-events-none"
          style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
          {cfgChains?.map((c) => (
            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: "rgba(59,130,246,0.10)", color: "#1CB8B8" }}>
              {CHAIN_LABELS[c] ?? c}
            </span>
          ))}
          {cfgProtocols?.filter(p => p !== "uncx-vm").map((p) => (
            <span key={p} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: "rgba(15,138,138,0.10)", color: "#0F8A8A" }}>
              {PROTOCOL_LABELS[p] ?? p}
            </span>
          ))}
          {wallet.tokenAddress && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: "rgba(63,165,104,0.10)", color: "#3FA568" }}>
              Token: {wallet.tokenAddress.slice(0, 6)}…{wallet.tokenAddress.slice(-4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

// ─── OnboardingModal ──────────────────────────────────────────────────────────
// First-visit welcome modal. Shown once (localStorage flag prevents repeat).
// Warm tone — these users are arriving from the mobile app so they already
// trust Vestream. Goal: orient them quickly and surface the Pro features.

function OnboardingModal({ onClose }: { onClose: () => void }) {
  const features = [
    { icon: <IconGrid />,     title: "Portfolio overview", desc: "Every vesting stream, claimable amount, and total portfolio value in one place." },
    { icon: <IconCalendar size={16} />, title: "Vesting schedule", desc: "A visual unlock timeline so you always know what's coming and when." },
    { icon: <IconCashFlow size={16} />, title: "Monthly cashflow", desc: "Month-by-month view of tokens unlocking — plan treasury or personal finances ahead." },
    { icon: <IconSearch />,   title: "Wallet scanner", desc: "Scan any wallet to discover vesting streams across all major protocols instantly." },
    { icon: <IconTrendUp size={16} />,  title: "P&L tracker", desc: "Log entry prices and sales to track realized and unrealized profit on vested tokens." },
    { icon: <IconExport />,   title: "Tax exports", desc: "One-click CSV exports compatible with Koinly, CoinTracker, and TurboTax." },
  ];

  const proFeatures = [
    "Unlimited wallet tracking",
    "Real-time price alerts",
    "Multi-wallet portfolio view",
    "Priority support",
  ];

  function handleClose() {
    try { localStorage.setItem("vestr-onboarding-seen", "1"); } catch { /* ignore */ }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", boxShadow: "0 24px 80px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center"
          style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.08), rgba(37,99,235,0.06))", borderBottom: "1px solid var(--preview-border-2)" }}>
          <img src="/logo-icon.svg"      alt="Vestream" className="w-12 h-12 mx-auto mb-3 block dark:hidden" />
          <img src="/logo-icon-dark.svg" alt=""         aria-hidden="true" className="w-12 h-12 mx-auto mb-3 hidden dark:block" />
          <h2 className="text-base font-bold mb-1" style={{ color: "var(--preview-text)" }}>
            Welcome to your vesting dashboard
          </h2>
          <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>
            Every unlock, claim, and price across your wallets and protocols — in one live view. Here&apos;s a quick tour.
          </p>
        </div>

        {/* Feature grid */}
        <div className="px-6 py-4 grid grid-cols-2 gap-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl p-3"
              style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}>
              <div className="mb-1.5" style={{ color: "#1CB8B8" }}>{f.icon}</div>
              <p className="text-[11px] font-semibold mb-0.5" style={{ color: "var(--preview-text)" }}>{f.title}</p>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--preview-text-3)" }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Pro callout */}
        <div className="mx-6 mb-4 rounded-xl p-3"
          style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.2)" }}>
          <p className="text-[11px] font-semibold mb-2" style={{ color: "#0F8A8A" }}>Pro features</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {proFeatures.map(f => (
              <li key={f} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--preview-text-2)" }}>
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#1CB8B8" }} />{f}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          <button
            onClick={handleClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}>
            Let&apos;s go →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FeedbackModal ────────────────────────────────────────────────────────────

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage]   = useState("");
  const [rating, setRating]     = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, rating, page: "/dashboard" }),
      });
      setDone(true);
    } catch {
      // Silent fail — feedback isn't critical
      setDone(true);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {done ? (
          <div className="flex flex-col items-center text-center py-4 gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
              style={{ background: "rgba(37,99,235,0.1)" }}>✓</div>
            <p className="font-semibold text-sm" style={{ color: "var(--preview-text)" }}>Thanks for the feedback!</p>
            <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>We read every response and use it to make Vestream better.</p>
            <button onClick={onClose}
              className="mt-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "#1CB8B8" }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-sm" style={{ color: "var(--preview-text)" }}>Share feedback</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>Help us build a better product</p>
              </div>
              <button onClick={onClose} className="text-lg leading-none" style={{ color: "var(--preview-text-3)" }}>×</button>
            </div>

            {/* Star rating */}
            <div className="flex gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)}
                  className="text-2xl transition-transform hover:scale-110"
                  style={{ color: rating !== null && n <= rating ? "#F0992E" : "var(--preview-border)" }}>
                  ★
                </button>
              ))}
              {rating && (
                <span className="text-xs self-center ml-1" style={{ color: "var(--preview-text-3)" }}>
                  {["", "Poor", "Fair", "Good", "Great", "Excellent"][rating]}
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's working well? What could be better? Any features you're missing?"
                rows={4}
                maxLength={2000}
                className="w-full text-sm px-4 py-3 rounded-xl resize-none outline-none"
                style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border)", color: "var(--preview-text)", lineHeight: 1.5 }}
              />
              <button type="submit"
                disabled={!message.trim() || submitting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "#1CB8B8" }}>
                {submitting ? "Sending…" : "Send feedback"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ wallets, tier, walletLimit, isOpen, onClose, onAddWallet, onRemoveWallet, onFeedback, dark, onToggleDark }: {
  wallets: Wallet[];
  tier: string;
  walletLimit: number | null;
  isOpen: boolean;
  onClose: () => void;
  onAddWallet: () => void;
  onRemoveWallet: (address: string) => void;
  onFeedback: () => void;
  dark: boolean;
  onToggleDark: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <aside
      className={`fixed md:relative z-50 md:z-auto w-56 flex-shrink-0 h-full md:h-screen flex flex-col transition-transform duration-200 ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      style={{ background: "var(--preview-card)", borderRight: "1px solid var(--preview-border)" }}>

      {/* Logo. Two <img> tags, swapped via Tailwind's `dark:` variant
          (defined in globals.css as `&:is(.dark *)` — i.e. any descendant
          of a .dark element). The Sidebar lives under the dashboard root
          which sets `.dark` based on the toggle, so the right variant
          renders without JS. */}
      <a href="/dashboard" className="px-5 h-14 flex items-center gap-3 flex-shrink-0 transition-opacity hover:opacity-80"
        style={{ borderBottom: "1px solid var(--preview-border)" }}>
        <img src="/logo-icon.svg"      alt="Vestream" className="w-7 h-7 flex-shrink-0 block dark:hidden" />
        <img src="/logo-icon-dark.svg" alt=""         aria-hidden="true" className="w-7 h-7 flex-shrink-0 hidden dark:block" />
        <div>
          <span className="font-bold text-sm tracking-tight leading-none" style={{ color: "var(--preview-text)" }}>Vestream</span>
          <p className="text-[9px] mt-0.5 leading-none" style={{ color: "var(--preview-text-3)" }}>Track every token unlock</p>
        </div>
      </a>

      {/* Nav.
          Discover is no longer Pro-locked — free users get 3 lifetime
          scans, then upgrade. Explorer (block-explorer search) is open
          to all tiers but free is capped at 50 results / single filter
          so the surface still drives Pro conversion. We badge both with
          a small "free 3" / "Pro caps" hint for free visitors so the
          model is obvious before they click. */}
      <nav className="px-3 py-3 space-y-0.5 flex-shrink-0">
        {NAV_ITEMS.map((item) => {
          const isFree         = tier === "free";
          const showFreeBadge  = isFree && (item.href === "/dashboard/discover"); // "Wallet Scanner"
          // Dynamic active — Dashboard matches exact path; everything else
          // matches when pathname starts with item.href so sub-routes
          // (e.g. /dashboard/explorer/[token]) keep the parent highlighted.
          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
          return (
            <button key={item.label}
              onClick={() => { router.push(item.href); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
              style={isActive
                ? { background: "linear-gradient(135deg, rgba(28,184,184,0.12), rgba(15,138,138,0.08))", color: "#1CB8B8", border: "1px solid rgba(59,130,246,0.15)" }
                : { color: "var(--preview-text-2)", border: "1px solid transparent" }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = "var(--preview-muted)"; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = "transparent"; } }}
            >
              <span className="opacity-80 flex-shrink-0">{item.icon}</span>
              {item.label}
              {showFreeBadge && (
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: "rgba(28,184,184,0.1)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.2)" }}>
                  3 free
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Wallets section */}
      <div className="flex-1 px-3 overflow-y-auto" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.875rem" }}>
        <p className="text-[9px] font-bold tracking-widest uppercase px-3 mb-2" style={{ color: "var(--preview-text-3)" }}>
          Tracked Wallets
        </p>
        {wallets.map((w) => (
          <WalletRow
            key={w.id}
            wallet={w}
            onRemove={() => onRemoveWallet(w.address)}
          />
        ))}
        {/* Add wallet button — or upgrade nudge if at limit */}
        {walletLimit !== null && wallets.length >= walletLimit ? (
          <div className="mt-2 mx-1 px-3 py-2 rounded-xl"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}>
            <p className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>
              {walletLimit}/{walletLimit} wallets — {tier === "free" ? "upgrade to add more" : "contact us for Enterprise"}
            </p>
          </div>
        ) : (
          <button onClick={onAddWallet}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs border border-dashed transition-all duration-150 mt-1"
            style={{ color: "var(--preview-text-3)", borderColor: "var(--preview-border)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--preview-muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <IconPlus /> Add wallet
            {walletLimit !== null && (
              <span className="ml-auto text-[9px] font-semibold" style={{ color: "var(--preview-text-3)" }}>
                {wallets.length}/{walletLimit}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Footer — tier badge */}
      <div className="px-3 pb-3 flex-shrink-0 space-y-2" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.75rem" }}>

        {/* Enterprise plan badge (internal tier name "fund" stays in the
            DB for backward compat; UI displays "Enterprise" per the
            pricing page). */}
        {tier === "fund" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.12), rgba(28,184,184,0.10))", border: "1px solid rgba(28,184,184,0.25)" }}>
            <span className="text-[10px]">✦</span>
            <div>
              <p className="text-[10px] font-bold" style={{ color: "#1CB8B8" }}>Enterprise</p>
              <p className="text-[8px]" style={{ color: "var(--preview-text-3)" }}>Unlimited wallets · all features</p>
            </div>
          </div>
        )}

        {/* Pro plan badge — previously said "5 wallets" but the real cap
            (enforced server-side + on /pricing) is 3. */}
        {tier === "pro" && (
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.06), rgba(15,138,138,0.06))", border: "1px solid rgba(15,138,138,0.2)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-2)" }}>Pro Plan</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(15,138,138,0.15)", color: "#1CB8B8" }}>PRO</span>
            </div>
            <p className="text-[9px] mb-2.5" style={{ color: "var(--preview-text-3)" }}>
              3 wallets · all chains · unlimited alerts
            </p>
            <button
              onClick={onFeedback}
              className="block w-full text-center text-[10px] font-bold py-1.5 rounded-lg text-white transition-all hover:brightness-110"
              style={{ background: "#1CB8B8" }}>
              Share feedback →
            </button>
          </div>
        )}

        {/* Free plan badge — previously claimed "1 chain · no alerts"
            which is wrong on both counts (Free auto-scans all 5 chains
            AND gets 3 lifetime push alerts per /pricing). Progress bar
            also used red (read-as-error) at cap; switched to amber
            ("you're at plan limit") to stop the Free UI feeling broken
            after adding one wallet. */}
        {tier === "free" && (
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-2)" }}>Free Plan</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(59,130,246,0.15)", color: "#1CB8B8" }}>FREE</span>
            </div>
            {/* Wallet usage bar */}
            <div className="w-full h-1 rounded-full mb-1.5" style={{ background: "var(--preview-border)" }}>
              <div className="h-1 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, wallets.length * 100)}%`,
                  background: wallets.length >= 1 ? "#F0992E" : "#1CB8B8",
                }} />
            </div>
            <p className="text-[9px] mb-2" style={{ color: "var(--preview-text-3)" }}>
              {wallets.length}/1 wallet · all chains · 3 lifetime alerts
            </p>
            <a href="/pricing"
              className="block w-full text-center text-[10px] font-bold py-1.5 rounded-lg text-white transition-all hover:brightness-110"
              style={{ background: "#1CB8B8" }}>
              Upgrade to Pro →
            </a>
          </div>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={onToggleDark}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all"
          style={{ color: "var(--preview-text-3)", border: "1px solid var(--preview-border-2)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--preview-muted)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <span>{dark ? "☀ Light mode" : "☽ Dark mode"}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
            style={{ background: "var(--preview-muted-2)", color: "var(--preview-text-3)" }}>
            {dark ? "ON" : "OFF"}
          </span>
        </button>

        <p className="text-[8px] text-center" style={{ color: "var(--preview-text-3)" }}>
          Read-only · No funds access
        </p>
      </div>
    </aside>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton({ walletCount, chainUnion, protocolUnion }: {
  walletCount:    number;
  chainUnion:     string[] | null;
  protocolUnion:  string[] | null;
}) {
  return (
    <div>
      {/* Friendly context message */}
      <div className="rounded-2xl border mb-5 px-6 py-5 flex items-start gap-4"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        {/* Animated spinner */}
        <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #1CB8B822, #0F8A8A22)", border: "1px solid #0F8A8A30" }}>
          <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--preview-border-2)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#0F8A8A" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text)" }}>
            Fetching your vesting data…
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--preview-text-3)" }}>
            Checking{" "}
            <span style={{ color: "var(--preview-text-2)" }}>
              {walletCount} wallet{walletCount !== 1 ? "s" : ""}
            </span>
            {chainUnion && chainUnion.length > 0 && (
              <>{" on "}<span style={{ color: "var(--preview-text-2)" }}>
                {chainUnion.map(id => CHAIN_LABELS[id] ?? `Chain ${id}`).join(", ")}
              </span></>
            )}
            {protocolUnion && protocolUnion.length > 0 && (
              <>{" via "}<span style={{ color: "var(--preview-text-2)" }}>
                {protocolUnion.map(id => PROTOCOL_LABELS[id] ?? id).join(", ")}
              </span></>
            )}
            {!chainUnion && !protocolUnion && <>{" across all configured platforms and chains"}</>}
            {". This usually takes a few seconds."}
          </p>
        </div>
      </div>
      {/* Skeleton shimmer blocks */}
      <div className="space-y-4 animate-pulse">
        <div className="h-44 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(15,23,42,0.6), rgba(30,58,138,0.4))" }} />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-52 rounded-2xl" style={{ background: "var(--preview-muted)" }} />
          <div className="h-52 rounded-2xl" style={{ background: "var(--preview-muted)" }} />
        </div>
        <div className="h-64 rounded-2xl" style={{ background: "var(--preview-muted)" }} />
        <div className="h-36 rounded-2xl" style={{ background: "var(--preview-muted)" }} />
      </div>
    </div>
  );
}

// ─── SWR fetcher ──────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  // wagmi useAccount is used inside AddWalletBar — nothing needed at top level
  const [wallets, setWallets]             = useState<Wallet[]>([]);
  const [walletsLoaded, setWalletsLoaded] = useState(false);
  const [tier, setTier]                   = useState<string>("free");
  const [walletLimit, setWalletLimit]     = useState<number | null>(1); // free tier default
  const [showAddWallet, setShowAddWallet] = useState(false);
  // Night mode is now a single shared control (sidebar) backed by
  // DarkModeProvider. Read the reactive value here for inline-styled children
  // (PortfolioHero gradient, UnlockTimeline) — no local state, no per-page toggle.
  const { dark }                          = useDarkMode();
  const [activeTokens, setActiveTokens]   = useState<Set<string>>(new Set());
  const [upsell, setUpsell]               = useState<{ featureName: string; requiredTier: "pro" | "fund" } | null>(null);
  // sidebarOpen state moved to DashboardChrome (the layout wrapper) — every
  // dashboard sub-route now shares the same drawer state via context.
  const { toggleSidebar }                 = useDashboardChrome();
  const [showFeedback, setShowFeedback]   = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeTab, setActiveTab]         = useState<"schedule" | "cashflow" | "pnl" | "market" | "gantt">("schedule");
  const [costBasis, setCostBasis]         = useState<Record<string, number>>({});
  const [sells, setSells]                 = useState<Record<string, SellTx[]>>({});
  const [buys,  setBuys]                  = useState<Record<string, BuyTx[]>>({});
  // symbolToAddress: token symbol → first contract address seen in streams.
  // Used to key Supabase API calls (which require a tokenAddress, not a symbol).
  const symbolToAddress = useRef<Record<string, string>>({});
  // Track whether we have merged cloud P&L into state (so we only do it once).
  const pnlCloudLoaded = useRef(false);

  // ── Phase 1: load localStorage immediately on mount ──────────────────────
  // Gives instant population without waiting for the network. Cloud data
  // loaded in Phase 2 below will override any matching entries.
  useEffect(() => {
    // Show onboarding modal on first visit (never seen the dashboard before)
    if (!localStorage.getItem("vestr-onboarding-seen")) {
      setShowOnboarding(true);
    }
    try {
      const stored = localStorage.getItem("vestr-cost-basis");
      if (stored) setCostBasis(JSON.parse(stored));
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem("vestr-sells");
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate: old format stored a plain object {amount, avgPrice} per symbol.
        // New format expects SellTx[] per symbol. Discard any non-array entries.
        const migrated: Record<string, SellTx[]> = {};
        for (const [sym, val] of Object.entries(parsed)) {
          if (Array.isArray(val)) migrated[sym] = val as SellTx[];
          // else: old {amount, avgPrice} object — silently discard
        }
        setSells(migrated);
        localStorage.setItem("vestr-sells", JSON.stringify(migrated));
      }
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem("vestr-buys");
      if (stored) {
        const parsed = JSON.parse(stored);
        const validated: Record<string, BuyTx[]> = {};
        for (const [sym, val] of Object.entries(parsed)) {
          if (Array.isArray(val)) validated[sym] = val as BuyTx[];
        }
        setBuys(validated);
      }
    } catch { /* ignore */ }
  }, []);

  function updateCostBasis(symbol: string, price: number) {
    setCostBasis((prev) => {
      const next = { ...prev, [symbol]: price };
      try { localStorage.setItem("vestr-cost-basis", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    // Persist to Supabase (fire-and-forget)
    const addr = symbolToAddress.current[symbol];
    if (addr) {
      fetch(`/api/dashboard/pnl/${encodeURIComponent(addr)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryPrice: price }),
      }).catch(() => {});
    }
  }

  function addSellTx(symbol: string, tx: SellTx) {
    const addr = symbolToAddress.current[symbol];
    if (addr) {
      // Persist to Supabase first to get the canonical UUID, then update state
      fetch(`/api/dashboard/pnl/${encodeURIComponent(addr)}/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: tx.date, amount: tx.amount, price: tx.pricePer }),
      })
        .then(r => r.ok ? r.json() : null)
        .then((json: { sale: { id: string; date: string; amount: number; price: number } } | null) => {
          if (!json?.sale) return;
          // Replace the temp-ID tx with the Supabase UUID
          setSells((prev) => {
            const existing = prev[symbol] ?? [];
            const replaced = existing.map(t => t.id === tx.id ? { ...t, id: json.sale.id } : t);
            const next = { ...prev, [symbol]: replaced };
            try { localStorage.setItem("vestr-sells", JSON.stringify(next)); } catch { /* ignore */ }
            return next;
          });
        })
        .catch(() => {});
    }
    // Optimistic local update (instant UI feedback)
    setSells((prev) => {
      const next = { ...prev, [symbol]: [...(prev[symbol] ?? []), tx] };
      try { localStorage.setItem("vestr-sells", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function removeSellTx(symbol: string, id: string) {
    setSells((prev) => {
      const next = { ...prev, [symbol]: (prev[symbol] ?? []).filter(tx => tx.id !== id) };
      try { localStorage.setItem("vestr-sells", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    // Delete from Supabase (fire-and-forget — ID is either Supabase UUID or temp)
    const addr = symbolToAddress.current[symbol];
    if (addr) {
      fetch(`/api/dashboard/pnl/${encodeURIComponent(addr)}/sales/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }

  function addBuyTx(symbol: string, tx: BuyTx) {
    const addr = symbolToAddress.current[symbol];
    if (addr) {
      fetch(`/api/dashboard/pnl/${encodeURIComponent(addr)}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: tx.date, amount: tx.amount, price: tx.pricePer }),
      })
        .then(r => r.ok ? r.json() : null)
        .then((json: { purchase: { id: string; date: string; amount: number; price: number } } | null) => {
          if (!json?.purchase) return;
          setBuys((prev) => {
            const existing = prev[symbol] ?? [];
            const replaced = existing.map(t => t.id === tx.id ? { ...t, id: json.purchase.id } : t);
            const next = { ...prev, [symbol]: replaced };
            try { localStorage.setItem("vestr-buys", JSON.stringify(next)); } catch { /* ignore */ }
            return next;
          });
        })
        .catch(() => {});
    }
    setBuys((prev) => {
      const next = { ...prev, [symbol]: [...(prev[symbol] ?? []), tx] };
      try { localStorage.setItem("vestr-buys", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function removeBuyTx(symbol: string, id: string) {
    setBuys((prev) => {
      const next = { ...prev, [symbol]: (prev[symbol] ?? []).filter(tx => tx.id !== id) };
      try { localStorage.setItem("vestr-buys", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    const addr = symbolToAddress.current[symbol];
    if (addr) {
      fetch(`/api/dashboard/pnl/${encodeURIComponent(addr)}/purchases/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }

  const loadWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallets");
      if (res.status === 401) { router.push("/login"); return; }
      if (res.ok) {
        const json = await res.json();
        setWallets(json.wallets);
        setTier(json.tier ?? "free");
        setWalletLimit(json.walletLimit !== undefined ? json.walletLimit : 3);
      }
    } catch {
      // Network error — fall through, walletsLoaded still gets set so UI doesn't hang
    } finally {
      setWalletsLoaded(true);
    }
  }, [router]);

  useEffect(() => { loadWallets(); }, [loadWallets]);

  const walletAddresses = wallets.map((w) => w.address).join(",");

  // Compute the union of chains/protocols across all tracked wallets.
  // If any wallet has null (= all chains/protocols), we skip the filter param.
  const anyAllChains    = wallets.some((w) => !w.chains    || w.chains.length    === 0);
  const anyAllProtocols = wallets.some((w) => !w.protocols || w.protocols.length === 0);
  const chainUnion    = anyAllChains    ? null : [...new Set(wallets.flatMap((w) => w.chains!))];
  // Normalise "uncx-vm" → "uncx" so the loading message always shows "UNCX" (never "uncx-vm")
  const protocolUnion = anyAllProtocols ? null : [...new Set(wallets.flatMap((w) => w.protocols!).map(p => p === "uncx-vm" ? "uncx" : p))];
  const chainsQs    = chainUnion    ? `&chains=${chainUnion.join(",")}`       : "";
  const protocolsQs = protocolUnion ? `&protocols=${protocolUnion.join(",")}`  : "";
  // Build per-wallet token filters: "walletAddr:tokenAddr,..." for wallets that have a tokenAddress set
  const tokenFiltersStr = wallets
    .filter(w => w.tokenAddress)
    .map(w => `${w.address}:${w.tokenAddress}`)
    .join(",");
  const tokenFiltersQs = tokenFiltersStr ? `&tokenFilters=${tokenFiltersStr}` : "";
  const vestingUrl = walletAddresses.length > 0
    ? `/api/vesting?wallets=${walletAddresses}${chainsQs}${protocolsQs}${tokenFiltersQs}`
    : null;

  const { data, isLoading, mutate: mutateStreams } = useSWR<{ streams: VestingStream[]; scanning?: boolean }>(
    vestingUrl, fetcher,
    {
      // While the server reports it's still doing a first-ever background
      // scan (cold start, zero cache for these wallets) it returns
      // { streams: [], scanning: true } INSTANTLY instead of blocking for
      // 5-30s on a live multi-subgraph/RPC walk. Poll fast (4s) so the
      // real data lands seconds after the background scan finishes; once
      // streams arrive, drop back to the lazy 60s refresh.
      refreshInterval: (latest) => (latest?.scanning ? 4_000 : 60_000),
      // revalidateOnFocus inherits the provider default (false) — the 60s
      // poll already covers staleness, so refetching on every tab-focus
      // was pure cost. (Was an explicit `true` override here.)
    }
  );

  const { data: livePrices } = useSWR<Record<string, number>>(
    "/api/prices", fetcher, { refreshInterval: 300_000 }
  );

  // Memoise the streams array so its identity is stable when SWR hands us the
  // same payload again. Without this, the `?? []` fallback creates a brand-
  // new empty array on every render and the useEffect below thinks `streams`
  // has changed every tick. (Lint flagged this as exhaustive-deps; the real
  // issue is dependency identity, not "missing deps".)
  const streams = useMemo<VestingStream[]>(
    () => data?.streams ?? [],
    [data?.streams],
  );

  // First-ever load for these wallets: the server returned an empty payload
  // with scanning:true and is building the cache in the background. Keep the
  // skeleton up (rather than flashing the "no vestings" empty state) until
  // the fast poll above picks up the real streams.
  const isScanning = data?.scanning === true;

  // ── Phase 2: merge cloud P&L once streams are known ──────────────────────
  // Runs after the streams SWR fetch resolves. Builds symbolToAddress from
  // streams, then fetches /api/dashboard/pnl and overlays results.
  // Cloud data wins for any symbol that has a Supabase entry — otherwise
  // the localStorage data from Phase 1 is kept as-is (works offline too).
  useEffect(() => {
    if (pnlCloudLoaded.current) return;  // only load once per session
    if (streams.length === 0) return;    // wait until we know the token addresses

    // Build symbol → address map from streams
    const s2a: Record<string, string> = {};
    for (const s of streams) {
      if (!s2a[s.tokenSymbol] && s.tokenAddress) {
        s2a[s.tokenSymbol] = s.tokenAddress.toLowerCase();
      }
    }
    symbolToAddress.current = s2a;

    // Build reverse: address → symbol (for mapping API response back to state keys)
    const a2s: Record<string, string> = {};
    for (const [sym, addr] of Object.entries(s2a)) a2s[addr] = sym;

    fetch("/api/dashboard/pnl")
      .then(r => r.ok ? r.json() : null)
      .then((json: { byToken: Record<string, { entryPrice: number | null; sales: { id: string; date: string; amount: number; price: number }[]; purchases: { id: string; date: string; amount: number; price: number }[] }> } | null) => {
        if (!json?.byToken) return;
        pnlCloudLoaded.current = true;

        const newCostBasis: Record<string, number> = {};
        const newSells: Record<string, SellTx[]> = {};
        const newBuys: Record<string, BuyTx[]> = {};

        for (const [addr, pnlData] of Object.entries(json.byToken)) {
          const sym = a2s[addr];
          if (!sym) continue;  // address not in this user's streams — skip
          if (pnlData.entryPrice !== null) newCostBasis[sym] = pnlData.entryPrice;
          if (pnlData.sales.length > 0) {
            newSells[sym] = pnlData.sales.map(s => ({ id: s.id, date: s.date, amount: s.amount, pricePer: s.price }));
          }
          if (pnlData.purchases.length > 0) {
            newBuys[sym] = pnlData.purchases.map(p => ({ id: p.id, date: p.date, amount: p.amount, pricePer: p.price }));
          }
        }

        // Only update state if the cloud actually has data — don't wipe localStorage
        // for tokens that aren't in Supabase yet (those stay as-is).
        if (Object.keys(newCostBasis).length > 0) {
          setCostBasis(prev => ({ ...prev, ...newCostBasis }));
        }
        if (Object.keys(newSells).length > 0) {
          setSells(prev => ({ ...prev, ...newSells }));
        }
        if (Object.keys(newBuys).length > 0) {
          setBuys(prev => ({ ...prev, ...newBuys }));
        }
      })
      .catch(() => { /* cloud unavailable — localStorage data stays */ });
  }, [streams]);

  useEffect(() => {
    if (streams.length === 0) return;
    const symbols = new Set(streams.map((s) => s.tokenSymbol));
    setActiveTokens((prev) => {
      // Always merge new symbols (e.g. from a newly added wallet) into the
      // active set while preserving tokens the user has manually filtered out.
      const hasNew = [...symbols].some((s) => !prev.has(s));
      if (!hasNew) return prev; // avoid re-render when nothing changed
      return new Set([...prev, ...symbols]);
    });
  }, [streams]);

  function toggleToken(symbol: string) {
    setActiveTokens((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) { if (next.size === 1) return prev; next.delete(symbol); }
      else next.add(symbol);
      return next;
    });
  }

  const filteredStreams = streams.filter((s) => activeTokens.has(s.tokenSymbol));

  // Build market query from filteredStreams — identical to what TokenMarketPanel uses,
  // guaranteeing SWR deduplicates both into a single request and prices stay in sync.
  const marketQuery = (() => {
    const seen = new Set<string>();
    return filteredStreams
      .filter(s => s.tokenAddress && s.chainId && !seen.has(s.tokenSymbol) && !!seen.add(s.tokenSymbol))
      .map(s => `${s.tokenSymbol}:${s.tokenAddress}:${s.chainId}`)
      .join(",");
  })();
  const { data: marketData } = useSWR<{ market: TokenMarket[] }>(
    marketQuery ? `/api/market?tokens=${encodeURIComponent(marketQuery)}` : null,
    fetcher,
    { refreshInterval: 300_000 }
  );
  // Merge: FALLBACK < CoinGecko livePrices < DexScreener marketPrices (most accurate for custom tokens)
  const marketPrices = (marketData?.market ?? []).reduce(
    (acc, m) => m.price ? { ...acc, [m.symbol]: m.price } : acc,
    {} as Record<string, number>
  );
  const prices = { ...FALLBACK_PRICES, ...livePrices, ...marketPrices };
  // Token logo URLs from DexScreener, keyed by symbol. Used by TokenIcon component.
  const imageUrls = (marketData?.market ?? []).reduce(
    (acc, m) => m.imageUrl ? { ...acc, [m.symbol]: m.imageUrl } : acc,
    {} as Record<string, string>
  );


  async function handleRemoveWallet(address: string) {
    await fetch(`/api/wallets/${address}`, { method: "DELETE" });
    track("wallet_removed", { surface: "dashboard" });
    await loadWallets();
  }

  // The outer flex shell + sidebar + mobile drawer overlay are provided by
  // src/app/dashboard/layout.tsx (DashboardChrome). The legacy inline
  // Sidebar component (with its own NAV_ITEMS) has been removed; the
  // layout's shared DashboardSidebar is now canonical and consistent
  // across every dashboard sub-route. Wallet management UI continues to
  // live on this page — it migrates from the sidebar into the main
  // content area (see "Tracked wallets" section below). The mobile
  // hamburger now calls `toggleSidebar()` from the chrome context.
  //
  // Returning a Fragment so the modals (which use position: fixed) can
  // sit as siblings of the main content column without an extra wrapping
  // div — keeps DOM clean and matches the previous mount semantics.
  return (
    <>
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden${dark ? " dark" : ""}`}>

        {/* AddWalletModal is rendered as a portal-like fixed overlay below */}

        {/* Content. px-4 on mobile (16px) drops to px-6 (24px) on tablet+
            so the dashboard cards have breathing room on phones without
            losing edge-of-screen space to padding (375px – 48px = 327px). */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
          {!walletsLoaded ? (
            <LoadingSkeleton walletCount={wallets.length} chainUnion={chainUnion} protocolUnion={protocolUnion} />
          ) : wallets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <img src="/logo-icon.svg"      alt="Vestream" className="w-14 h-14 mb-2 block dark:hidden" />
              <img src="/logo-icon-dark.svg" alt=""         aria-hidden="true" className="w-14 h-14 mb-2 hidden dark:block" />
              <div>
                <p className="text-base font-semibold mb-1" style={{ color: "var(--preview-text)" }}>No wallets tracked yet</p>
                <p className="text-sm" style={{ color: "var(--preview-text-3)" }}>Add a wallet to start tracking vesting schedules.</p>
              </div>
              <button onClick={() => setShowAddWallet(true)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
                style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.35)" }}>
                <IconPlus /> Add your first wallet
              </button>
            </div>
          ) : (isLoading || isScanning) ? (
            <LoadingSkeleton walletCount={wallets.length} chainUnion={chainUnion} protocolUnion={protocolUnion} />
          ) : (
            <>
              {/* ── Above the fold ─────────────────────────────────────── */}
              {/* Home-only inline controls. The universal <DashboardHeader>
                  (DashboardChrome) now carries the page title + wallet count +
                  account menu on every tab; this row keeps the home page's
                  live stream status and the quick "+ Add wallet" affordance
                  that used to live in the page's local header. */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                  {(() => {
                    if (streams.length === 0) return "No streams found";
                    const active = streams.filter((s) => !s.isFullyVested).length;
                    if (active === 0) return `${streams.length} stream${streams.length !== 1 ? "s" : ""} · all fully vested`;
                    return `${active} active stream${active !== 1 ? "s" : ""} · live`;
                  })()}
                </p>
                <button onClick={() => setShowAddWallet((v) => !v)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
                  style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
                  + Add wallet
                </button>
              </div>
              <PortfolioHero streams={filteredStreams} walletCount={wallets.length} dark={dark} prices={prices} />

              {/* Global token filter — drives filteredStreams across the whole
                  dashboard. Kept directly above the table so you filter the
                  content you're reading. (Previously these pills lived inside
                  the Portfolio Mix card, which now sits below the table.) */}
              {(() => {
                const allTokens = buildTokenSummaries(streams, prices);
                if (allTokens.length <= 1) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <span className="text-[11px] font-medium mr-0.5" style={{ color: "var(--preview-text-3)" }}>Tokens</span>
                    {allTokens.map((t) => {
                      const isActive = activeTokens.has(t.symbol);
                      return (
                        <button key={t.symbol} onClick={() => toggleToken(t.symbol)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all duration-150 select-none"
                          style={{
                            background: isActive ? t.color + "15" : "var(--preview-muted-2)",
                            borderColor: isActive ? t.color + "40" : "var(--preview-border-2)",
                            color: isActive ? t.color : "var(--preview-text-3)",
                          }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: t.color, opacity: isActive ? 1 : 0.3 }} />
                          {t.symbol}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── Tab strip for below-fold panels ───────────────────── */}
              {/* Floating pill tabs — each panel keeps its own card wrapper below */}
              <div className="flex gap-1 mb-3 overflow-x-auto">
                {(["schedule", "cashflow", "pnl", "market", "gantt"] as const).map((tab) => {
                  const labels: Record<string, string> = {
                    schedule: "Schedule",
                    cashflow: "Cash Flow",
                    pnl:      "P&L",
                    market:   "Market",
                    gantt:    "Gantt",
                  };
                  const icons: Record<string, ReactNode> = {
                    schedule: <IconCalendar />,
                    cashflow: <IconCashFlow />,
                    pnl:      <IconTrendUp />,
                    market:   <IconTag />,
                    gantt:    <IconGantt />,
                  };
                  const isActive = activeTab === tab;
                  return (
                    <button key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      style={isActive
                        ? { background: "rgba(28,184,184,0.12)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.25)" }
                        : { background: "var(--preview-card)", color: "var(--preview-text-3)", border: "1px solid var(--preview-border)" }}>
                      {icons[tab]}{labels[tab]}
                    </button>
                  );
                })}
              </div>

              {/* Active panel — each renders its own full card */}
              {activeTab === "schedule" && (
                <VestingTable streams={filteredStreams} prices={prices} imageUrls={imageUrls} onClaim={() => {
                  // Auto-refresh stream data 15s after a claim action
                  // (time for the on-chain tx to settle + indexer to pick it up)
                  setTimeout(() => mutateStreams(), 15_000);
                }} />
              )}
              {activeTab === "cashflow" && (
                <MonthlyCashFlow streams={filteredStreams} prices={prices} costBasis={costBasis} buys={buys} />
              )}
              {activeTab === "pnl" && (
                <PnLPanel
                  streams={filteredStreams}
                  prices={prices}
                  imageUrls={imageUrls}
                  costBasis={costBasis}
                  onUpdateCostBasis={updateCostBasis}
                  sells={sells}
                  onAddSellTx={addSellTx}
                  onRemoveSellTx={removeSellTx}
                  buys={buys}
                  onAddBuyTx={addBuyTx}
                  onRemoveBuyTx={removeBuyTx}
                />
              )}
              {activeTab === "market" && (
                <TokenMarketPanel tokens={(() => {
                  const seen = new Set<string>();
                  return filteredStreams
                    .filter(s => s.tokenAddress && s.chainId && seen.has(s.tokenSymbol) === false && !!seen.add(s.tokenSymbol))
                    .map(s => ({ symbol: s.tokenSymbol, address: s.tokenAddress, chainId: s.chainId }));
                })()} />
              )}
              {activeTab === "gantt" && (
                <UnlockTimeline streams={filteredStreams} dark={dark} />
              )}

              {/* Secondary insight panels — moved below the table so the
                  schedule sits high on the page. Upcoming outlook + the
                  portfolio-mix / claimable-vs-locked charts. */}
              <div className="mt-5">
                <UpcomingOutlook streams={filteredStreams} prices={prices} />
                <SnapshotPanel streams={filteredStreams} prices={prices} />
              </div>

              {/* Footer — stacks on mobile (links above copyright) so the
                  links stay tap-friendly on phones, side-by-side on md+. */}
              <footer className="mt-6 pt-4 pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between flex-shrink-0 gap-3 sm:gap-0"
                style={{ borderTop: "1px solid var(--preview-border-2)" }}>
                <p className="text-[11px] order-2 sm:order-1" style={{ color: "var(--preview-text-3)" }}>© 2026 Vestream. All rights reserved.</p>
                <div className="flex items-center gap-5 order-1 sm:order-2">
                  <a href="/privacy" className="text-[11px] transition-colors hover:underline" style={{ color: "var(--preview-text-3)" }}>Privacy Policy</a>
                  <a href="/terms"   className="text-[11px] transition-colors hover:underline" style={{ color: "var(--preview-text-3)" }}>Terms of Service</a>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>

      {/* Upsell modal — rendered outside scroll container so it covers everything */}
      {upsell && (
        <UpsellModal
          featureName={upsell.featureName}
          requiredTier={upsell.requiredTier}
          onClose={() => setUpsell(null)}
        />
      )}

      {/* Add wallet modal — simple address-only form, scans all chains+protocols */}
      {showAddWallet && (
        <AddWalletModal
          onAdd={() => { loadWallets(); setShowAddWallet(false); }}
          onCancel={() => setShowAddWallet(false)}
        />
      )}

      {/* Onboarding welcome modal — first visit only */}
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

      {/* Beta feedback modal */}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </>
  );
}
