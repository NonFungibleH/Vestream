"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import useSWR from "swr";
import { isAddress } from "viem";
import { VestingStream } from "@/lib/vesting/normalize";
import { CHAIN_NAMES, SupportedChainId } from "@/lib/vesting/types";
import { UpsellModal } from "@/components/UpsellModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Wallet {
  id: string;
  address: string;
  label: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_PRICES: Record<string, number> = { USDC: 1, USDT: 1, DAI: 1, WETH: 3200, ETH: 3200, OP: 1.85, ARB: 0.85, BNB: 580, WBNB: 580 };

// Known-token palette (overrides hash-based colours)
const TOKEN_COLORS_PRESET: Record<string, string> = {
  USDC: "#2563eb",
  USDT: "#26a17b",
  DAI:  "#f5a623",
  WETH: "#7c3aed",
  ETH:  "#7c3aed",
  OP:   "#ff0420",
  ARB:  "#12aaff",
  BNB:  "#f3ba2f",
  WBNB: "#f3ba2f",
};

// 20-slot palette of visually distinct hues for unknown tokens
const HASH_PALETTE = [
  "#e74c3c", "#e67e22", "#2ecc71", "#1abc9c", "#3498db",
  "#9b59b6", "#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3",
  "#54a0ff", "#5f27cd", "#c44569", "#f8b739", "#05c46b",
  "#0fbcf9", "#ef5777", "#4bcffa", "#fd9644", "#a29bfe",
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

// Block-explorer base URLs per chain ID
const BLOCK_EXPLORERS: Record<number, string> = {
  1:        "https://etherscan.io",
  56:       "https://bscscan.com",
  8453:     "https://basescan.org",
  11155111: "https://sepolia.etherscan.io",
  84532:    "https://sepolia.basescan.org",
};

const PROTOCOL_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  sablier:        { text: "#a78bfa", bg: "rgba(167,139,250,0.1)",  border: "rgba(167,139,250,0.2)" },
  hedgey:         { text: "#60a5fa", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.2)"  },
  "team-finance": { text: "#34d399", bg: "rgba(52,211,153,0.1)",   border: "rgba(52,211,153,0.2)"  },
  uncx:           { text: "#fb923c", bg: "rgba(251,146,60,0.1)",   border: "rgba(251,146,60,0.2)"  },
  "uncx-vm":      { text: "#f97316", bg: "rgba(249,115,22,0.1)",   border: "rgba(249,115,22,0.2)"  },
  unvest:         { text: "#38bdf8", bg: "rgba(56,189,248,0.1)",   border: "rgba(56,189,248,0.2)"  },
};

const CLAIM_LINKS: Record<string, string> = {
  sablier:        "https://app.sablier.com",
  hedgey:         "https://app.hedgey.finance",
  "team-finance": "https://app.team.finance",
  uncx:           "https://app.uncx.network",
  "uncx-vm":      "https://app.uncx.network",
  unvest:         "https://unvest.io",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    "team-finance": "Team Finance",
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
): { month: string; usd: number; raw: number; hasLivePrice: boolean }[] {
  const now    = new Date();
  const MONTHS = 18;
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

    // ── Step/tranched streams: sum tranche amounts falling in each month bucket ──
    if (s.shape === "steps" && s.unlockSteps && s.unlockSteps.length > 0) {
      for (const b of buckets) {
        const monthTotal = s.unlockSteps
          .filter((step) => step.timestamp >= b.start && step.timestamp < b.end)
          .reduce((sum, step) => sum + toFloat(step.amount, s.tokenDecimals), 0);
        if (monthTotal > 0) {
          b.usd += monthTotal * price;
          b.raw += monthTotal;
          if (price > 0 && isLive) b.hasLivePrice = true;
        }
      }
      continue;
    }

    // ── Linear streams: pro-rated monthly amounts ──────────────────────────────
    const duration = s.endTime - s.startTime;
    if (duration <= 0) continue;
    const totalAmt = toFloat(s.totalAmount, s.tokenDecimals);

    for (const b of buckets) {
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

      b.usd += totalAmt * frac * price;
      b.raw += totalAmt * frac;
      if (price > 0 && isLive) b.hasLivePrice = true;
    }
  }

  return buckets.map(({ label, usd, raw, hasLivePrice }) => ({ month: label, usd, raw, hasLivePrice }));
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

  const nowSec   = Math.floor(Date.now() / 1000);
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
    // Linear: diagonal from (start, 0) → (end, total)
    pathPoints = [
      { x: PAD.left,               y: toChartY(0)     },
      { x: toChartX(stream.endTime), y: toChartY(total) },
    ];
    // Vested at now = linear interpolation
    const elapsed  = Math.max(0, Math.min(nowSec - stream.startTime, stream.endTime - stream.startTime));
    const duration = stream.endTime - stream.startTime;
    const vestedNow = duration > 0 ? (total * elapsed) / duration : 0;
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
            <svg width={10} height={10}><line x1={5} y1={0} x2={5} y2={10} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="2 2"/></svg>
            <span className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>Today</span>
          </div>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}>
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
              stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={nowX + 4} y={PAD.top + 10} fontSize={8} fill="#60a5fa" fontWeight={600}>now</text>
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
  const nowSec = Math.floor(Date.now() / 1000);
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
        <line x1={nowX} y1={0} x2={nowX} y2={H} stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.9} />
      )}
    </svg>
  );
}

// ─── PortfolioHero ────────────────────────────────────────────────────────────

function PortfolioHero({ streams, walletCount, dark, prices }: { streams: VestingStream[]; walletCount: number; dark: boolean; prices: Record<string, number> }) {
  const tokens         = buildTokenSummaries(streams, prices);
  const totalValue     = tokens.reduce((s, t) => s + t.claimableUSD + t.lockedUSD, 0);
  const totalClaimable = tokens.reduce((s, t) => s + t.claimableUSD, 0);
  const totalLocked    = tokens.reduce((s, t) => s + t.lockedUSD, 0);
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
      const nowSec = Math.floor(Date.now() / 1000);
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
    ? { background: "linear-gradient(135deg, #0d0f14 0%, #0f1f4a 50%, #1a1035 100%)" }
    : { background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%)" };

  return (
    <div className="rounded-2xl overflow-hidden mb-5 relative" style={gradientStyle}>
      {/* Decorative orbs */}
      <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(147,197,253,0.12) 0%, transparent 70%)" }} />
      <div className="absolute right-32 bottom-0 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(167,139,250,0.1) 0%, transparent 70%)" }} />

      <div className="relative px-7 py-6">
        <div className="flex items-start justify-between gap-6">
          {/* Left: main value */}
          <div className="flex-1">
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
              Total Portfolio Value
            </p>
            <p className="text-5xl font-bold tabular-nums tracking-tight text-white leading-none">
              {fmtUSDFull(totalValue)}
            </p>
            <div className="flex items-center gap-2.5 mt-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {(() => {
                  const parts: string[] = [];
                  if (hasPrice) {
                    // Some tokens have USD prices — show USD total + any no-price tokens separately
                    if (totalClaimable >= 0.5) parts.push(fmtUSDFull(totalClaimable));
                    claimableNoPrice.forEach((t) =>
                      parts.push(`${t.claimable.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${t.symbol}`)
                    );
                  } else {
                    // No prices at all — show raw token amounts only
                    tokens.filter((t) => t.claimable > 0).forEach((t) =>
                      parts.push(`${t.claimable.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${t.symbol}`)
                    );
                  }
                  return (parts.length > 0 ? parts.join(" + ") : "Nothing") + " ready to claim";
                })()}
              </span>
              {(hasPrice ? totalValue > 0 : tokens.some((t) => t.claimable > 0)) && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
                  {hasPrice ? `${pctClaimable.toFixed(1)}% of portfolio` : `${activeStreams.length} active`}
                </span>
              )}
            </div>

            {/* Portfolio bar */}
            {tokens.length > 0 && (
              <div className="mt-4">
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
                style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>
                <IconArrowUp />
              </div>
              <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>Ready to Claim</p>
              {/* USD-priced claimable */}
              {totalClaimable > 0 && (
                <>
                  <p className="text-base font-bold tabular-nums mt-0.5 text-white">{fmtUSD(totalClaimable)}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{pctClaimable.toFixed(1)}% of total</p>
                </>
              )}
              {/* Raw amounts for tokens without a market price */}
              {claimableNoPrice.slice(0, 2).map((t) => (
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
                style={{ background: "rgba(147,197,253,0.15)", color: "#93c5fd" }}>
                <IconClock />
              </div>
              <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>This Month</p>
              {hasThisMonth ? (
                <>
                  <p className="text-base font-bold tabular-nums mt-0.5 text-white">
                    {hasPrice ? fmtUSD(thisMonth.usd) : thisMonth.raw.toLocaleString("en-US", { maximumFractionDigits: 2 })}
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
                style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
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
                style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
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
            <span className="text-[11px] font-semibold" style={{ color: "rgba(52,211,153,0.9)" }}>Live</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SnapshotPanel ────────────────────────────────────────────────────────────

function SnapshotPanel({
  streams,
  allStreams,
  activeTokens,
  onToggleToken,
  prices,
}: {
  streams: VestingStream[];
  allStreams: VestingStream[];
  activeTokens: Set<string>;
  onToggleToken: (symbol: string) => void;
  prices: Record<string, number>;
}) {
  const tokens    = buildTokenSummaries(streams, prices);
  const allTokens = buildTokenSummaries(allStreams, prices);

  if (tokens.length === 0) return null;

  const cardStyle = {
    background: "var(--preview-card)",
    borderColor: "var(--preview-border)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  };

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
      {/* Left: donut */}
      <div className="rounded-2xl border p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Portfolio Mix</h2>
        </div>
        <DonutChart tokens={tokens} />

        {/* Filter pills */}
        {allTokens.length > 1 && (
          <div className="mt-4 pt-4 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
            {allTokens.map((t) => {
              const isActive = activeTokens.has(t.symbol);
              return (
                <button key={t.symbol} onClick={() => onToggleToken(t.symbol)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all duration-150 select-none"
                  style={{
                    background: isActive ? t.color + "15" : "var(--preview-muted-2)",
                    borderColor: isActive ? t.color + "40" : "var(--preview-border-2)",
                    color: isActive ? t.color : "var(--preview-text-3)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: t.color, opacity: isActive ? 1 : 0.3 }} />
                  {t.symbol}
                </button>
              );
            })}
          </div>
        )}
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
      style={{ color: copied ? "#34d399" : "var(--preview-text-3)", background: "transparent" }}
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

// ─── VestingTable ─────────────────────────────────────────────────────────────

// Columns: Asset | Protocol | Locked | Start | End | Progress | Claimable | Schedule | Cancellable | Contract | Action
// Chain name is shown under the token symbol in the Asset column — no separate column needed
const COL = "grid-cols-[160px_88px_98px_80px_80px_108px_98px_118px_80px_90px_130px]";

function VestingTable({ streams, prices }: { streams: VestingStream[]; prices: Record<string, number> }) {
  const active = streams.filter((s) =>
    !s.isFullyVested ||
    BigInt(s.claimableNow ?? "0") > 0n ||
    BigInt(s.lockedAmount  ?? "0") > 0n
  );
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
      </div>

      {/* Scrollable table area */}
      <div className="overflow-x-auto">
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
              const hasCliff       = s.cliffTime && s.cliffTime > Math.floor(Date.now() / 1000);
              const streamDuration = s.endTime - s.startTime;
              const monthlyRate    = streamDuration > 0
                ? toFloat(s.totalAmount, s.tokenDecimals) * (30 * 86400) / streamDuration
                : 0;
              const monthlyRateUSD = monthlyRate * price;
              const tokenColor   = getTokenColor(s.tokenSymbol);
              const chainName    = CHAIN_NAMES[s.chainId as SupportedChainId] ?? `Chain ${s.chainId}`;
              const claimUrl     = CLAIM_LINKS[s.protocol] ?? "#";
              const proto        = PROTOCOL_COLORS[s.protocol] ?? { text: "#9ca3af", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.2)" };
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

                  {/* 1. Asset — token symbol + chain name + recipient */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0"
                      style={{ background: tokenColor + "18", borderColor: tokenColor + "30" }}>
                      <span className="text-[10px] font-bold" style={{ color: tokenColor }}>{s.tokenSymbol.slice(0, 3)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--preview-text)" }}>{s.tokenSymbol}</p>
                      <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--preview-text-3)" }}>{chainName}</p>
                      <p className="text-[9px] font-mono truncate" style={{ color: "var(--preview-text-3)", opacity: 0.65 }}>{shortAddr(s.recipient)}</p>
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
                    {!s.isFullyVested && s.endTime > Math.floor(Date.now() / 1000) && (
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
                      <span className="text-[11px] font-semibold" style={{ color: "#34d399" }}>✓ Fully vested</span>
                    ) : s.shape === "steps" && s.unlockSteps ? (
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded"
                            style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>Steps</span>
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
                          <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "#f59e0b" }}>Cliff</span>
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
                        style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                        title="Sender can cancel this stream at any time">
                        ⚠ Yes
                      </span>
                    ) : s.cancelable === false ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(52,211,153,0.08)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}>
                        ✓ Fixed
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>—</span>
                    )}
                  </div>

                  {/* 11. Contract (token address + copy + explorer) */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono" style={{ color: "var(--preview-text-3)" }}>
                      {s.tokenAddress.slice(0, 4)}…{s.tokenAddress.slice(-3)}
                    </span>
                    <CopyButton text={s.tokenAddress} />
                    <a href={`${explorerBase}/token/${s.tokenAddress}`} target="_blank" rel="noopener noreferrer"
                      title="View on block explorer"
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
                  </div>

                  {/* 12. Claim / View CTA + All holders explorer link + expand chevron */}
                  <div className="flex items-center justify-end gap-1.5">
                    <a href={`/explore/${s.chainId}/${s.tokenAddress}`} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="See all vesting holders for this token"
                      className="text-[9px] font-semibold px-2 py-0.5 rounded-md transition-all duration-150 hover:brightness-125 flex-shrink-0"
                      style={{ color: "#818cf8", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      All holders ↗
                    </a>
                    {claimableAmt > 0 ? (
                      <a href={claimUrl} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
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
      </div>{/* /overflow-x-auto */}
    </div>
  );
}

// ─── NextClaimCountdown ────────────────────────────────────────────────────────
// Per-token card showing the next unlock event with a live countdown.

function useCountdown() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function countdownStr(seconds: number): string {
  if (seconds <= 0) return "Now";
  const totalDays = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (totalDays >= 365) {
    const years  = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    return months > 0 ? `${years}yr ${months}mo` : `${years}yr`;
  }
  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const days   = totalDays % 30;
    return days > 0 ? `${months}mo ${days}d` : `${months}mo`;
  }
  if (totalDays > 0) return `${totalDays}d ${h}h`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function NextClaimCountdown({ streams }: { streams: VestingStream[] }) {
  const nowSec = useCountdown();

  // ── Section A: tokens currently streaming (continuous, past cliff/start, claimable > 0) ──
  // These are NOT counted down to — they are already unlocking every second.
  const claimableNowMap = new Map<string, { stream: VestingStream; totalAmt: number }>();
  for (const s of streams) {
    if (s.isFullyVested) continue;
    if (s.shape === "steps") continue; // steps handled below
    const isStarted   = s.startTime <= nowSec;
    const isPastCliff = !s.cliffTime || s.cliffTime <= nowSec;
    const claimable   = BigInt(s.claimableNow);
    if (isStarted && isPastCliff && claimable > 0n) {
      const amt      = toFloat(s.claimableNow, s.tokenDecimals);
      const existing = claimableNowMap.get(s.tokenSymbol);
      claimableNowMap.set(s.tokenSymbol, {
        stream:   existing?.stream ?? s,
        totalAmt: (existing?.totalAmt ?? 0) + amt,
      });
    }
  }
  const streamingNow = [...claimableNowMap.values()];
  const streamingSymbols = new Set(streamingNow.map((e) => e.stream.tokenSymbol));

  // ── Section B: discrete future events (step milestones, cliff, not-started streams) ──
  // Intentionally does NOT use nextUnlockTime — adapters may set that to arbitrary checkpoints
  // (e.g. stream end-time) that are misleading for continuously-vesting streams.
  const getNextDiscreteTs = (s: VestingStream): number | null => {
    if (s.isFullyVested) return null;
    if (streamingSymbols.has(s.tokenSymbol)) return null; // already shown as streaming
    // Step milestones
    if (s.shape === "steps" && s.unlockSteps && s.unlockSteps.length > 0) {
      const next = s.unlockSteps.find((st) => st.timestamp > nowSec);
      return next?.timestamp ?? null;
    }
    // Cliff not yet passed
    if (s.cliffTime && s.cliffTime > nowSec) return s.cliffTime;
    // Stream hasn't started yet
    if (s.startTime > nowSec) return s.startTime;
    return null;
  };

  const futureMap = new Map<string, { stream: VestingStream; nextTs: number; amount: string | null }>();
  for (const s of streams) {
    if (s.isFullyVested) continue;
    const ts = getNextDiscreteTs(s);
    if (!ts) continue;
    const existing = futureMap.get(s.tokenSymbol);
    if (!existing || ts < existing.nextTs) {
      let amount: string | null = null;
      if (s.shape === "steps" && s.unlockSteps) {
        const step = s.unlockSteps.find((st) => st.timestamp === ts);
        if (step) {
          const amt = toFloat(step.amount, s.tokenDecimals);
          if (amt > 0) amount = `${amt.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${s.tokenSymbol}`;
        }
      }
      futureMap.set(s.tokenSymbol, { stream: s, nextTs: ts, amount });
    }
  }
  const futureEntries = [...futureMap.values()].sort((a, b) => a.nextTs - b.nextTs);

  if (streamingNow.length === 0 && futureEntries.length === 0) return null;

  const cardStyle = {
    background:  "var(--preview-card)",
    borderColor: "var(--preview-border)",
    boxShadow:   "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  };

  const totalCards = streamingNow.length + futureEntries.length;

  return (
    <div className="rounded-2xl border overflow-hidden mb-4" style={cardStyle}>
      <div className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Token Unlock Status</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
            Live status for each token — continuously streaming or waiting for a scheduled event
          </p>
        </div>
      </div>

      <div className="px-6 py-5 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(totalCards, 4)}, 1fr)` }}>

        {/* ── Streaming-now cards (emerald) ── */}
        {streamingNow.map(({ stream: s, totalAmt }) => {
          const color = getTokenColor(s.tokenSymbol);
          const proto = PROTOCOL_COLORS[s.protocol] ?? { text: "#9ca3af", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.2)" };
          return (
            <div key={s.tokenSymbol} className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
              {/* Token header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0"
                    style={{ background: color + "18", borderColor: color + "30" }}>
                    <span className="text-[9px] font-bold" style={{ color }}>{s.tokenSymbol.slice(0, 3)}</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>{s.tokenSymbol}</span>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: proto.bg, color: proto.text, border: `1px solid ${proto.border}` }}>
                  {protocolDisplay(s.protocol)}
                </span>
              </div>
              {/* Status pill */}
              <div className="rounded-xl px-3 py-2.5 text-center"
                style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)" }}>
                <div className="flex items-center justify-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <p className="text-sm font-bold" style={{ color: "#34d399" }}>Streaming now</p>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(52,211,153,0.7)" }}>
                  Continuous · claim any time
                </p>
              </div>
              {/* Claimable amount */}
              {totalAmt > 0 && (
                <p className="text-[11px] font-semibold text-center tabular-nums" style={{ color }}>
                  {totalAmt.toLocaleString("en-US", { maximumFractionDigits: 4 })} {s.tokenSymbol} claimable
                </p>
              )}
            </div>
          );
        })}

        {/* ── Future discrete unlock cards (countdown) ── */}
        {futureEntries.map(({ stream: s, nextTs, amount }) => {
          const color     = getTokenColor(s.tokenSymbol);
          const secsLeft  = Math.max(0, nextTs - nowSec);
          const isPast    = secsLeft === 0;
          const proto     = PROTOCOL_COLORS[s.protocol] ?? { text: "#9ca3af", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.2)" };
          const dateLabel = new Date(nextTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          return (
            <div key={s.tokenSymbol} className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
              {/* Token header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0"
                    style={{ background: color + "18", borderColor: color + "30" }}>
                    <span className="text-[9px] font-bold" style={{ color }}>{s.tokenSymbol.slice(0, 3)}</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>{s.tokenSymbol}</span>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: proto.bg, color: proto.text, border: `1px solid ${proto.border}` }}>
                  {protocolDisplay(s.protocol)}
                </span>
              </div>
              {/* Countdown */}
              <div className="rounded-xl px-3 py-2.5 text-center"
                style={{ background: isPast ? color + "18" : "var(--preview-card)", border: `1px solid ${color}30` }}>
                <p className="text-xl font-bold tabular-nums tracking-tight"
                  style={{ color: isPast ? color : "var(--preview-text)" }}>
                  {isPast ? "Claimable!" : countdownStr(secsLeft)}
                </p>
                {!isPast && (
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>{dateLabel}</p>
                )}
              </div>
              {amount && (
                <p className="text-[11px] text-center" style={{ color: "var(--preview-text-3)" }}>
                  Unlocks: <span className="font-semibold tabular-nums" style={{ color }}>{amount}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── UnlockTimeline ───────────────────────────────────────────────────────────

function UnlockTimeline({ streams }: { streams: VestingStream[]; dark: boolean }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const [emailAlerts, setEmailAlerts] = useState(false);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.preferences?.emailEnabled) setEmailAlerts(true); })
      .catch(() => {});
  }, []);

  // Filter out streams with invalid/zero timestamps (e.g. unset defaults)
  const active = streams.filter((s) => !s.isFullyVested && s.startTime > 100_000 && s.endTime > 100_000);
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
  const nowColor = "#3b82f6";

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
            { label: "Cliff",     color: "#f59e0b" },
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
        const proto         = PROTOCOL_COLORS[s.protocol]  ?? { text: "#9ca3af", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.2)" };

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
                <a href="/settings"
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
                    style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.18)" }}
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
                    style={{ left: `${((s.cliffTime - s.startTime) / (s.endTime - s.startTime)) * 100}%`, background: "#f59e0b" }} />
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
            const proto     = PROTOCOL_COLORS[s.protocol] ?? { text: "#9ca3af", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.2)" };
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
            <p className="text-[11px] font-semibold tabular-nums" style={{ color: "#60a5fa" }}>
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
                    style={{ fontSize: 9, color: isCur ? "#60a5fa" : "var(--preview-text-2)" }}>
                    {primary}
                  </span>
                )}
                {secondary && (
                  <span className="tabular-nums leading-none select-none truncate text-center"
                    style={{ fontSize: 8, color: isCur ? "rgba(96,165,250,0.7)" : "var(--preview-text-3)" }}>
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
                      {d.raw > 0 && (
                        <p className={`text-[9px] text-center ${d.usd > 0 ? "" : "font-bold"}`}
                          style={{ color: d.usd > 0 ? "var(--preview-text-3)" : "var(--preview-text)" }}>
                          {fmtRaw(d.raw)} tokens
                        </p>
                      )}
                      <p className="text-[9px] text-center mt-0.5" style={{ color: "var(--preview-text-3)" }}>{d.month}</p>
                    </div>
                  )}
                  {/* Bar */}
                  <div className="w-full rounded-t-sm"
                    style={{
                      height: barH,
                      background: isCur
                        ? "linear-gradient(180deg, #93c5fd 0%, #2563eb 100%)"
                        : "linear-gradient(180deg, rgba(147,197,253,0.55) 0%, rgba(37,99,235,0.42) 100%)",
                      transition: "height 0.3s ease",
                    }} />
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
                      color:      i === 0 ? "#60a5fa" : "var(--preview-text-3)",
                      fontWeight: i === 0 ? 700 : 400,
                    }}>
                    {d.month}
                  </span>
                )}
              </div>
            );
          })}
        </div>
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
  high:    { label: "High",    color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  medium:  { label: "Medium",  color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  low:     { label: "Low",     color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  unknown: { label: "Unknown", color: "#9ca3af", bg: "rgba(156,163,175,0.1)" },
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
                background:   showNoPriceTokens ? "rgba(99,102,241,0.12)" : "var(--preview-muted-2)",
                color:        showNoPriceTokens ? "#818cf8" : "var(--preview-text-3)",
                border:       showNoPriceTokens ? "1px solid rgba(99,102,241,0.3)" : "1px solid var(--preview-border-2)",
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
            <button onClick={() => setShowNoPriceTokens(true)} className="ml-1 underline" style={{ color: "#818cf8" }}>
              Show {noPriceCount} unlisted token{noPriceCount > 1 ? "s" : ""}.
            </button>
          )}
        </div>
      ) : (
        <div className="px-6 py-5 grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(visibleMarket.length, 4)}, 1fr)` }}>
          {visibleMarket.map((m) => {
            const color          = getTokenColor(m.symbol);
            const liq            = LIQUIDITY_LABEL[m.liquidity];
            const changePositive = (m.change24h ?? 0) >= 0;
            const hasData        = m.price !== null;
            function changePill(label: string, val: number | null) {
              if (val === null) return null;
              const pos = val >= 0;
              return (
                <div key={label} className="flex flex-col items-center px-2 py-1 rounded-lg"
                  style={{ background: pos ? "rgba(52,211,153,0.10)" : "rgba(248,113,113,0.10)" }}>
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
                  <p className="text-[9px] mb-3" style={{ color: "#f87171" }}>
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
                        style={{ background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.18)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.1)")}>
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
    onAddBuyTx(symbol, {
      id:       Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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
                  <div className="w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0"
                    style={{ background: t.color + "18", borderColor: t.color + "30" }}>
                    <span className="text-[10px] font-bold" style={{ color: t.color }}>{t.symbol.slice(0, 3)}</span>
                  </div>
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
                <div className="mb-2 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.04)" }}>
                  <div className="px-4 py-1.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid rgba(52,211,153,0.15)" }}>
                    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2.5} strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#34d399" }}>
                      Purchases · {totalBought.toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.symbol} total
                    </span>
                  </div>
                  {buyTxs.map((tx, idx) => (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5 text-xs"
                      style={{ borderTop: idx > 0 ? "1px solid rgba(52,211,153,0.12)" : undefined }}>
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
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.color = "#f87171"; }}
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
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.color = "#f87171"; }}
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
                <div className="mb-2 rounded-xl p-3.5" style={{ border: "1px solid rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.06)" }}>
                  <p className="text-[10px] font-semibold mb-2.5 uppercase tracking-wide" style={{ color: "#34d399" }}>New Purchase</p>
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
                              background: fmMode === m ? "rgba(52,211,153,0.2)" : "transparent",
                              color:      fmMode === m ? "#34d399"              : "var(--preview-text-3)",
                              border:     `1px solid ${fmMode === m ? "rgba(52,211,153,0.4)" : "transparent"}`,
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
                        style={{ background: "#34d399", color: "white" }}
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
                    style={{ color: "#34d399", background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(52,211,153,0.12)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(52,211,153,0.06)")}>
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
                        style={{ background: totalPnL >= 0 ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${totalPnL >= 0 ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}` }}>
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

// ─── WalletChip ───────────────────────────────────────────────────────────────

function WalletChip({ address, open, onToggle, onDisconnect }: {
  address: string; open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onDisconnect: () => void;
}) {
  const isEmail  = address.includes("@");
  const initials = isEmail
    ? address.slice(0, 2).toUpperCase()
    : address.slice(2, 4).toUpperCase();
  const displayLabel = isEmail
    ? (address.length > 22 ? address.slice(0, 18) + "…" : address)
    : shortAddr(address);

  return (
    <div className="relative">
      <button onClick={onToggle}
        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl border transition-all duration-150"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--preview-card)")}
      >
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">{initials}</div>
        <span className="text-xs font-medium" style={{ color: "var(--preview-text-2)", fontFamily: isEmail ? "inherit" : "monospace" }}>{displayLabel}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
          <path d={open ? "M2 6.5L5 3.5L8 6.5" : "M2 3.5L5 6.5L8 3.5"}
            stroke="var(--preview-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-2xl border z-50 p-1 overflow-hidden"
          style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)" }}>
          <div className="px-3 py-3 mb-1" style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[11px] font-bold text-white">{initials}</div>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>{isEmail ? "Email account" : "My Wallet"}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-emerald-500 font-medium">Signed in</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] break-all" style={{ color: "var(--preview-text-3)", fontFamily: isEmail ? "inherit" : "monospace" }}>{address}</p>
          </div>
          <button onClick={onDisconnect}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 transition-colors font-semibold">
            <span>⊘</span> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ─── AddWalletBar ─────────────────────────────────────────────────────────────

function AddWalletBar({ onAdd, onCancel }: { onAdd: () => void; onCancel: () => void }) {
  const [address, setAddress] = useState("");
  const [label, setLabel]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { address: wagmiAddress } = useAccount();
  const { connect } = useConnect();

  // Auto-fill when a wallet connects
  useEffect(() => {
    if (wagmiAddress && !address) setAddress(wagmiAddress);
  }, [wagmiAddress, address]);

  async function handleAdd() {
    setError(null);
    if (!isAddress(address)) { setError("Invalid address"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, label: label || undefined }),
      });
      if (res.status === 409) { setError("Already added"); return; }
      if (res.status === 402) {
        const j = await res.json();
        const nextPlan = j.tier === "free" ? "Pro" : "Fund";
        setError(`${j.error ?? "Plan limit reached"} — upgrade to ${nextPlan} to add more wallets.`);
        return;
      }
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed"); return; }
      onAdd();
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="px-6 py-3 flex items-center gap-3 flex-shrink-0"
      style={{ background: "var(--preview-card)", borderBottom: "1px solid var(--preview-border)" }}>
      <input placeholder="Wallet address (0x…)" value={address} onChange={(e) => setAddress(e.target.value)}
        className="flex-1 max-w-xs rounded-xl px-3 py-2 text-sm font-mono outline-none"
        style={{ color: "var(--preview-text)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)" }} />
      <button
        type="button"
        onClick={() => connect({ connector: injected() })}
        title="Connect a wallet to auto-fill address"
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors flex-shrink-0"
        style={{
          color: wagmiAddress ? "#34d399" : "var(--preview-text-3)",
          background: "var(--preview-muted-2)",
          border: "1px solid var(--preview-border-2)",
        }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        </svg>
        {wagmiAddress ? "Detected" : "Detect"}
      </button>
      <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)}
        className="w-32 rounded-xl px-3 py-2 text-sm outline-none"
        style={{ color: "var(--preview-text)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)" }} />
      {error && <span className="text-xs text-red-400">{error}</span>}
      <button onClick={handleAdd} disabled={loading || !address}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors">
        <IconPlus /> {loading ? "Adding…" : "Track wallet"}
      </button>
      <button onClick={onCancel} className="text-xs font-medium transition-colors" style={{ color: "var(--preview-text-3)" }}>Cancel</button>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { icon: <IconGrid />,    label: "Dashboard", href: "/dashboard", active: true  },
  { icon: <IconSettings />, label: "Settings",  href: "/settings",  active: false },
];

function Sidebar({ wallets, tier, walletLimit, onAddWallet, onRemoveWallet }: {
  wallets: Wallet[];
  tier: string;
  walletLimit: number | null;
  onAddWallet: () => void;
  onRemoveWallet: (address: string) => void;
}) {
  const router = useRouter();
  return (
    <aside className="w-56 flex-shrink-0 h-screen flex flex-col"
      style={{ background: "var(--preview-card)", borderRight: "1px solid var(--preview-border)" }}>

      {/* Logo */}
      <a href="/" className="px-5 h-14 flex items-center gap-3 flex-shrink-0 transition-opacity hover:opacity-80"
        style={{ borderBottom: "1px solid var(--preview-border)" }}>
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm leading-none">V</span>
        </div>
        <div>
          <span className="font-bold text-sm tracking-tight leading-none" style={{ color: "var(--preview-text)" }}>Vestream</span>
          <p className="text-[9px] mt-0.5 leading-none" style={{ color: "var(--preview-text-3)" }}>Track every token unlock</p>
        </div>
      </a>

      {/* Nav */}
      <nav className="px-3 py-3 space-y-0.5 flex-shrink-0">
        {NAV_ITEMS.map((item) => (
          <button key={item.label} onClick={() => router.push(item.href)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
            style={item.active
              ? { background: "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(124,58,237,0.08))", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.15)" }
              : { color: "var(--preview-text-2)", border: "1px solid transparent" }}
            onMouseEnter={(e) => { if (!item.active) { e.currentTarget.style.background = "var(--preview-muted)"; } }}
            onMouseLeave={(e) => { if (!item.active) { e.currentTarget.style.background = "transparent"; } }}
          >
            <span className="opacity-80 flex-shrink-0">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Wallets section */}
      <div className="flex-1 px-3 overflow-y-auto" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.875rem" }}>
        <p className="text-[9px] font-bold tracking-widest uppercase px-3 mb-2" style={{ color: "var(--preview-text-3)" }}>Tracked Wallets</p>
        {wallets.map((w) => (
          <div key={w.id} className="group flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-default"
            style={{ color: "var(--preview-text-2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-muted)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="flex-1 truncate font-medium">{w.label ?? shortAddr(w.address)}</span>
            {wallets.length > 1 && (
              <button onClick={() => onRemoveWallet(w.address)}
                className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/10"
                style={{ color: "var(--preview-text-3)" }} title="Remove">
                ×
              </button>
            )}
          </div>
        ))}
        {/* Add wallet button — or upgrade nudge if at limit */}
        {walletLimit !== null && wallets.length >= walletLimit ? (
          <div className="mt-2 mx-1 rounded-xl p-3"
            style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.08))", border: "1px solid rgba(59,130,246,0.15)" }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: "#60a5fa" }}>
              🔒 {walletLimit}/{walletLimit} wallets used
            </p>
            <p className="text-[9px] mb-2" style={{ color: "var(--preview-text-3)" }}>
              {tier === "free" ? "Upgrade to Pro for up to 3 wallets." : "Upgrade to Fund for unlimited wallets."}
            </p>
            <a href="/pricing"
              className="block w-full text-center text-[10px] font-bold py-1.5 rounded-lg text-white transition-all hover:brightness-110"
              style={{ background: tier === "fund" ? "linear-gradient(135deg, #6366f1, #a855f7)" : "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
              {tier === "free" ? "Upgrade to Pro →" : "Upgrade to Fund →"}
            </a>
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

        {/* Fund plan badge */}
        {tier === "fund" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.10))", border: "1px solid rgba(99,102,241,0.25)" }}>
            <span className="text-[10px]">✦</span>
            <div>
              <p className="text-[10px] font-bold" style={{ color: "#a78bfa" }}>Fund Plan</p>
              <p className="text-[8px]" style={{ color: "var(--preview-text-3)" }}>Unlimited wallets · all features</p>
            </div>
          </div>
        )}

        {/* Pro plan badge */}
        {tier === "pro" && (
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-2)" }}>Pro Plan</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>PRO</span>
            </div>
            {/* Wallet usage bar */}
            <div className="w-full h-1 rounded-full mb-1.5" style={{ background: "var(--preview-border)" }}>
              <div className="h-1 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (wallets.length / 3) * 100)}%`,
                  background: wallets.length >= 3 ? "#ef4444" : "linear-gradient(90deg, #2563eb, #7c3aed)",
                }} />
            </div>
            <p className="text-[9px] mb-2" style={{ color: "var(--preview-text-3)" }}>
              {wallets.length}/3 wallets · email alerts · all chains
            </p>
            <a href="/pricing"
              className="block w-full text-center text-[10px] font-bold py-1.5 rounded-lg text-white transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
              Upgrade to Fund →
            </a>
          </div>
        )}

        {/* Free plan badge */}
        {tier === "free" && (
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-2)" }}>Free Plan</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>FREE</span>
            </div>
            {/* Wallet usage bar */}
            <div className="w-full h-1 rounded-full mb-1.5" style={{ background: "var(--preview-border)" }}>
              <div className="h-1 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, wallets.length * 100)}%`,
                  background: wallets.length >= 1 ? "#ef4444" : "linear-gradient(90deg, #2563eb, #7c3aed)",
                }} />
            </div>
            <p className="text-[9px] mb-2" style={{ color: "var(--preview-text-3)" }}>
              {wallets.length}/1 wallet · 1 chain · no alerts
            </p>
            <a href="/pricing"
              className="block w-full text-center text-[10px] font-bold py-1.5 rounded-lg text-white transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
              Upgrade to Pro →
            </a>
          </div>
        )}

        <p className="text-[8px] text-center" style={{ color: "var(--preview-text-3)" }}>
          Read-only · No funds access
        </p>
      </div>
    </aside>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div>
      {/* Friendly context message */}
      <div className="rounded-2xl border mb-5 px-6 py-5 flex items-start gap-4"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        {/* Animated spinner */}
        <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #2563eb22, #7c3aed22)", border: "1px solid #7c3aed30" }}>
          <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--preview-border-2)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text)" }}>
            Fetching your vesting data…
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--preview-text-3)" }}>
            Scanning <span style={{ color: "var(--preview-text-2)" }}>Sablier</span>,{" "}
            <span style={{ color: "var(--preview-text-2)" }}>Hedgey</span>,{" "}
            <span style={{ color: "var(--preview-text-2)" }}>UNCX</span>,{" "}
            <span style={{ color: "var(--preview-text-2)" }}>Team Finance</span> and{" "}
            <span style={{ color: "var(--preview-text-2)" }}>Unvest</span> across{" "}
            <span style={{ color: "var(--preview-text-2)" }}>Ethereum, Base, BSC and Sepolia</span>.
            This usually takes 5–15 seconds.
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
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [tier, setTier]                   = useState<string>("free");
  const [walletLimit, setWalletLimit]     = useState<number | null>(1); // free tier default
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [walletChipOpen, setWalletChipOpen] = useState(false);
  const [dark, setDark]                   = useState(false);
  const [activeTokens, setActiveTokens]   = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen]       = useState(false);
  const [upsell, setUpsell]               = useState<{ featureName: string; requiredTier: "pro" | "fund" } | null>(null);
  const [costBasis, setCostBasis]         = useState<Record<string, number>>({});
  const [sells, setSells]                 = useState<Record<string, SellTx[]>>({});
  const [buys,  setBuys]                  = useState<Record<string, BuyTx[]>>({});

  // Persist dark mode + cost basis + sells across page navigations via localStorage
  useEffect(() => {
    try { if (localStorage.getItem("vestr-dark") === "1") setDark(true); } catch { /* ignore */ }
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
        // Persist migrated data so old format is fully removed
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

  function toggleDark() {
    setDark((v) => {
      const next = !v;
      try { localStorage.setItem("vestr-dark", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  function updateCostBasis(symbol: string, price: number) {
    setCostBasis((prev) => {
      const next = { ...prev, [symbol]: price };
      try { localStorage.setItem("vestr-cost-basis", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function addSellTx(symbol: string, tx: SellTx) {
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
  }

  function addBuyTx(symbol: string, tx: BuyTx) {
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
  }

  const loadWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallets");
      if (res.status === 401) { router.push("/login"); return; }
      if (res.ok) {
        const json = await res.json();
        setWallets(json.wallets);
        setSessionAddress(json.sessionAddress ?? null);
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
  const vestingUrl = walletAddresses.length > 0 ? `/api/vesting?wallets=${walletAddresses}` : null;

  const { data, isLoading } = useSWR<{ streams: VestingStream[] }>(
    vestingUrl, fetcher, { refreshInterval: 60_000, revalidateOnFocus: true }
  );

  const { data: livePrices } = useSWR<Record<string, number>>(
    "/api/prices", fetcher, { refreshInterval: 300_000 }
  );

  const streams = data?.streams ?? [];

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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login"); router.refresh();
  }

  async function handleRemoveWallet(address: string) {
    await fetch(`/api/wallets/${address}`, { method: "DELETE" });
    await loadWallets();
  }

  return (
    <div
      className={`flex h-screen overflow-hidden${dark ? " dark" : ""}`}
      style={{ background: "var(--preview-bg)" }}
      onClick={() => { if (walletChipOpen) setWalletChipOpen(false); if (exportOpen) setExportOpen(false); }}
    >
      <Sidebar wallets={wallets} tier={tier} walletLimit={walletLimit} onAddWallet={() => setShowAddWallet((v) => !v)} onRemoveWallet={handleRemoveWallet} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 px-6 flex items-center justify-between flex-shrink-0"
          style={{ background: "var(--preview-card)", borderBottom: "1px solid var(--preview-border)" }}>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Overview</h1>
            <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
              {isLoading ? "Syncing…" : streams.length > 0 ? `${streams.length} stream${streams.length !== 1 ? "s" : ""} · live` : "No streams found"}
            </p>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="h-8 flex items-center gap-1.5 px-3 rounded-lg border text-xs font-medium transition-all"
                style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)", color: "var(--preview-text-2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--preview-card)")}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: exportOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-10 z-50 rounded-xl border overflow-hidden"
                  style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: "180px" }}>
                  {/* CSV download */}
                  <button
                    onClick={() => {
                      if (tier !== "fund") {
                        setExportOpen(false);
                        setUpsell({ featureName: "CSV Export", requiredTier: "fund" });
                        return;
                      }
                      setExportOpen(false);
                      const fld = (s: VestingStream) => s.tokenDecimals ?? 18;
                      // Helper: weighted avg entry from buys or manual cost basis
                      function epFor(sym: string): number | null {
                        const ba = buys[sym] ?? [];
                        if (ba.length > 0) {
                          const tot = ba.reduce((s, t) => s + t.amount, 0);
                          const cost = ba.reduce((s, t) => s + t.amount * t.pricePer, 0);
                          return tot > 0 ? cost / tot : null;
                        }
                        const m = costBasis[sym]; return (m != null && m > 0) ? m : null;
                      }
                      // Build per-token summary rows
                      const tokenMap = new Map<string, { locked: number; claimable: number; withdrawn: number }>();
                      for (const s of filteredStreams) {
                        const d = fld(s);
                        const l = Number(BigInt(s.lockedAmount ?? "0")) / Math.pow(10, d);
                        const c = Number(BigInt(s.claimableNow ?? "0")) / Math.pow(10, d);
                        const w = Number(BigInt(s.withdrawnAmount ?? "0")) / Math.pow(10, d);
                        const cur = tokenMap.get(s.tokenSymbol) ?? { locked: 0, claimable: 0, withdrawn: 0 };
                        tokenMap.set(s.tokenSymbol, { locked: cur.locked + l, claimable: cur.claimable + c, withdrawn: cur.withdrawn + w });
                      }
                      const rows: string[][] = [];
                      // Section 1: Portfolio Summary
                      rows.push(["PORTFOLIO SUMMARY"]);
                      rows.push(["Token","Locked","Claimable","Withdrawn","Avg Cost","Current Price","Unrealized P&L","Total Purchases","Total Sales","Realized P&L"]);
                      for (const [sym, { locked, claimable, withdrawn }] of tokenMap) {
                        const ep = epFor(sym); const cp = prices[sym] > 0 ? prices[sym] : null;
                        const unrealized = (ep && cp) ? ((cp - ep) * (claimable + locked)).toFixed(2) : "";
                        const buyArr = buys[sym] ?? []; const sellArr = sells[sym] ?? [];
                        const totBought = buyArr.reduce((s, t) => s + t.amount * t.pricePer, 0);
                        const totSold   = sellArr.reduce((s, t) => s + t.pricePer * t.amount, 0);
                        const realized  = (ep && sellArr.length > 0) ? sellArr.reduce((s, t) => s + (t.pricePer - ep) * t.amount, 0).toFixed(2) : "";
                        rows.push([sym, locked.toFixed(4), claimable.toFixed(4), withdrawn.toFixed(4), ep ? ep.toFixed(6) : "", cp ? cp.toFixed(6) : "", unrealized, totBought.toFixed(2), totSold.toFixed(2), realized]);
                      }
                      // Section 2: Vesting Schedules
                      rows.push([], ["VESTING SCHEDULES"]);
                      rows.push(["Protocol","Chain","Token","Start","End","Schedule","Locked","Claimable","Withdrawn","Cancelable"]);
                      for (const s of filteredStreams) {
                        const d = fld(s);
                        rows.push([s.protocol, String(s.chainId), s.tokenSymbol,
                          s.startTime ? new Date(s.startTime * 1000).toISOString().slice(0,10) : "",
                          s.endTime   ? new Date(s.endTime   * 1000).toISOString().slice(0,10) : "",
                          s.shape ?? "",
                          (Number(BigInt(s.lockedAmount    ?? "0")) / Math.pow(10, d)).toFixed(4),
                          (Number(BigInt(s.claimableNow   ?? "0")) / Math.pow(10, d)).toFixed(4),
                          (Number(BigInt(s.withdrawnAmount ?? "0")) / Math.pow(10, d)).toFixed(4),
                          s.cancelable ? "Yes" : "No"]);
                      }
                      // Section 3: Purchase Transactions
                      rows.push([], ["PURCHASE TRANSACTIONS"]);
                      rows.push(["Token","Date","Tokens Bought","Price/Token","Total Paid (USD)"]);
                      for (const [sym, txArr] of Object.entries(buys)) {
                        for (const tx of txArr) rows.push([sym, tx.date, String(tx.amount), tx.pricePer.toFixed(6), (tx.amount * tx.pricePer).toFixed(2)]);
                      }
                      // Section 4: Sale Transactions
                      rows.push([], ["SALE TRANSACTIONS"]);
                      rows.push(["Token","Date","Tokens Sold","Price/Token","Total USD","Realized P&L"]);
                      for (const [sym, txArr] of Object.entries(sells)) {
                        const ep = epFor(sym);
                        for (const tx of txArr) rows.push([sym, tx.date, String(tx.amount), tx.pricePer.toFixed(6), (tx.amount * tx.pricePer).toFixed(2), ep ? ((tx.pricePer - ep) * tx.amount).toFixed(2) : ""]);
                      }
                      const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a"); a.href = url;
                      a.download = `vestream-export-${new Date().toISOString().slice(0,10)}.csv`; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-xs text-left transition-all"
                    style={{ color: "var(--preview-text)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    <span>Download CSV / Excel</span>
                  </button>
                  {/* Save as PDF */}
                  <button
                    onClick={() => {
                      if (tier !== "fund") {
                        setExportOpen(false);
                        setUpsell({ featureName: "PDF Report", requiredTier: "fund" });
                        return;
                      }
                      setExportOpen(false);
                      const fld = (s: VestingStream) => s.tokenDecimals ?? 18;
                      const reportDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
                      function epFor(sym: string): number | null {
                        const ba = buys[sym] ?? [];
                        if (ba.length > 0) {
                          const tot = ba.reduce((s, t) => s + t.amount, 0);
                          const cost = ba.reduce((s, t) => s + t.amount * t.pricePer, 0);
                          return tot > 0 ? cost / tot : null;
                        }
                        const m = costBasis[sym]; return (m != null && m > 0) ? m : null;
                      }
                      function fmtN(n: number, dp = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
                      function fmtUSD(n: number) { return "$" + fmtN(n, 2); }
                      function pnlCell(n: number) { return `<span class="${n >= 0 ? "pos" : "neg"}">${n >= 0 ? "+" : "−"}${fmtUSD(Math.abs(n))}</span>`; }
                      // Build per-token aggregates
                      const tokenMap = new Map<string, { locked: number; claimable: number; withdrawn: number }>();
                      for (const s of filteredStreams) {
                        const d = fld(s);
                        const l = Number(BigInt(s.lockedAmount ?? "0")) / Math.pow(10, d);
                        const c = Number(BigInt(s.claimableNow ?? "0")) / Math.pow(10, d);
                        const w = Number(BigInt(s.withdrawnAmount ?? "0")) / Math.pow(10, d);
                        const cur = tokenMap.get(s.tokenSymbol) ?? { locked: 0, claimable: 0, withdrawn: 0 };
                        tokenMap.set(s.tokenSymbol, { locked: cur.locked + l, claimable: cur.claimable + c, withdrawn: cur.withdrawn + w });
                      }
                      // Portfolio totals
                      let totalValue = 0, totalClaimable = 0, totalLocked = 0, totalRealized = 0, totalUnrealized = 0;
                      for (const [sym, { claimable, locked }] of tokenMap) {
                        const cp = prices[sym] > 0 ? prices[sym] : 0;
                        const ep = epFor(sym);
                        totalClaimable += claimable * cp; totalLocked += locked * cp;
                        totalValue += (claimable + locked) * cp;
                        if (ep) {
                          totalUnrealized += (cp - ep) * (claimable + locked);
                          const sa = sells[sym] ?? []; sa.forEach(tx => { totalRealized += (tx.pricePer - ep) * tx.amount; });
                        }
                      }
                      // Build HTML
                      const summaryRows = [...tokenMap.entries()].map(([sym, { locked, claimable, withdrawn }]) => {
                        const cp = prices[sym] > 0 ? prices[sym] : null;
                        const ep = epFor(sym);
                        const unrealized = (ep && cp) ? (cp - ep) * (claimable + locked) : null;
                        const sa = sells[sym] ?? []; const realized = ep ? sa.reduce((s, t) => s + (t.pricePer - ep) * t.amount, 0) : null;
                        return `<tr>
                          <td><strong>${sym}</strong></td>
                          <td class="num">${fmtN(locked, 4)}</td>
                          <td class="num">${fmtN(claimable, 4)}</td>
                          <td class="num">${fmtN(withdrawn, 4)}</td>
                          <td class="num">${cp ? fmtUSD(cp) : "—"}</td>
                          <td class="num">${ep ? fmtUSD(ep) : "—"}</td>
                          <td class="num">${unrealized !== null ? pnlCell(unrealized) : "—"}</td>
                          <td class="num">${realized !== null ? pnlCell(realized) : "—"}</td>
                        </tr>`;
                      }).join("");
                      const scheduleRows = filteredStreams.map(s => {
                        const d = fld(s);
                        const l = (Number(BigInt(s.lockedAmount ?? "0")) / Math.pow(10, d));
                        const c = (Number(BigInt(s.claimableNow ?? "0")) / Math.pow(10, d));
                        const w = (Number(BigInt(s.withdrawnAmount ?? "0")) / Math.pow(10, d));
                        const total = l + c + w; const vestedPct = total > 0 ? ((c + w) / total * 100).toFixed(1) : "0.0";
                        return `<tr>
                          <td>${s.protocol}</td><td>${s.tokenSymbol}</td>
                          <td>${s.startTime ? new Date(s.startTime*1000).toLocaleDateString("en-GB") : "—"}</td>
                          <td>${s.endTime   ? new Date(s.endTime  *1000).toLocaleDateString("en-GB") : "—"}</td>
                          <td class="num">${vestedPct}%</td>
                          <td class="num">${fmtN(l, 4)}</td>
                          <td class="num">${fmtN(c, 4)}</td>
                          <td class="num">${s.cancelable ? "Yes" : "No"}</td>
                        </tr>`;
                      }).join("");
                      const allBuyTxs = Object.entries(buys).flatMap(([sym, txArr]) => txArr.map(tx => ({ sym, ...tx }))).sort((a, b) => a.date.localeCompare(b.date));
                      const allSellTxs = Object.entries(sells).flatMap(([sym, txArr]) => txArr.map(tx => ({ sym, ...tx }))).sort((a, b) => a.date.localeCompare(b.date));
                      const buyRows = allBuyTxs.map(tx => {
                        return `<tr><td>${tx.date}</td><td><strong>${tx.sym}</strong></td><td class="num">${fmtN(tx.amount, 4)}</td><td class="num">${fmtUSD(tx.pricePer)}</td><td class="num">${fmtUSD(tx.amount * tx.pricePer)}</td></tr>`;
                      }).join("") || `<tr><td colspan="5" class="empty">No purchase transactions recorded</td></tr>`;
                      const sellRows = allSellTxs.map(tx => {
                        const ep = epFor(tx.sym);
                        const pnl = ep ? (tx.pricePer - ep) * tx.amount : null;
                        return `<tr><td>${tx.date}</td><td><strong>${tx.sym}</strong></td><td class="num">${fmtN(tx.amount, 4)}</td><td class="num">${fmtUSD(tx.pricePer)}</td><td class="num">${fmtUSD(tx.amount * tx.pricePer)}</td><td class="num">${pnl !== null ? pnlCell(pnl) : "—"}</td></tr>`;
                      }).join("") || `<tr><td colspan="6" class="empty">No sale transactions recorded</td></tr>`;
                      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Vestream Portfolio Report — ${reportDate}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;color:#0f172a;background:#fff;padding:40px 48px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:28px}
  .logo{font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#2563eb}
  .logo span{color:#7c3aed}
  .meta{text-align:right;font-size:11px;color:#94a3b8;line-height:1.6}
  .meta strong{color:#64748b}
  .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:28px}
  .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px}
  .kpi-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94a3b8;margin-bottom:5px}
  .kpi-value{font-size:19px;font-weight:800;color:#0f172a;letter-spacing:-0.02em}
  .kpi-value.pos{color:#059669}.kpi-value.neg{color:#dc2626}
  h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748b;margin:24px 0 8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
  table{width:100%;border-collapse:collapse;margin-bottom:4px}
  th{background:#f8fafc;text-align:left;padding:7px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;border-bottom:1px solid #e2e8f0}
  td{padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#334155}
  td.num{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,"SF Mono",monospace}
  td.empty{text-align:center;color:#94a3b8;font-style:italic;padding:16px}
  tr:last-child td{border-bottom:none}
  .pos{color:#059669;font-weight:600}.neg{color:#dc2626;font-weight:600}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
  @media print{@page{margin:1.5cm;size:A4}body{padding:0}h2{break-before:avoid}table{break-inside:avoid}}
</style></head><body>
<div class="header">
  <div><div class="logo">Ve<span>stream</span></div><div style="font-size:13px;color:#64748b;margin-top:4px">Portfolio Report</div></div>
  <div class="meta"><strong>Generated</strong><br>${reportDate}<br>${sessionAddress ? `<strong>Wallet</strong><br>${sessionAddress.slice(0,6)}…${sessionAddress.slice(-4)}` : ""}</div>
</div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-label">Total Value</div><div class="kpi-value">${fmtUSD(totalValue)}</div></div>
  <div class="kpi"><div class="kpi-label">Claimable</div><div class="kpi-value">${fmtUSD(totalClaimable)}</div></div>
  <div class="kpi"><div class="kpi-label">Locked</div><div class="kpi-value">${fmtUSD(totalLocked)}</div></div>
  <div class="kpi"><div class="kpi-label">Unrealized P&L</div><div class="kpi-value ${totalUnrealized >= 0 ? "pos" : "neg"}">${totalUnrealized >= 0 ? "+" : "−"}${fmtUSD(Math.abs(totalUnrealized))}</div></div>
  <div class="kpi"><div class="kpi-label">Realized P&L</div><div class="kpi-value ${totalRealized >= 0 ? "pos" : "neg"}">${totalRealized >= 0 ? "+" : "−"}${fmtUSD(Math.abs(totalRealized))}</div></div>
</div>
<h2>Token Summary</h2>
<table><thead><tr><th>Token</th><th>Locked</th><th>Claimable</th><th>Withdrawn</th><th>Current Price</th><th>Avg Cost</th><th>Unrealized P&L</th><th>Realized P&L</th></tr></thead><tbody>${summaryRows}</tbody></table>
<h2>Vesting Schedules</h2>
<table><thead><tr><th>Protocol</th><th>Token</th><th>Start</th><th>End</th><th>Vested %</th><th>Locked</th><th>Claimable</th><th>Cancelable</th></tr></thead><tbody>${scheduleRows}</tbody></table>
<h2>Purchase Transactions</h2>
<table><thead><tr><th>Date</th><th>Token</th><th>Amount</th><th>Price / Token</th><th>Total Paid</th></tr></thead><tbody>${buyRows}</tbody></table>
<h2>Sale Transactions</h2>
<table><thead><tr><th>Date</th><th>Token</th><th>Amount</th><th>Price / Token</th><th>Total USD</th><th>Realized P&L</th></tr></thead><tbody>${sellRows}</tbody></table>
<div class="footer"><span>Vestream · vestream.io</span><span>All data is stored locally — nothing is sent to any server</span></div>
</body></html>`;
                      const win = window.open("", "_blank");
                      if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-xs text-left transition-all border-t"
                    style={{ color: "var(--preview-text)", borderColor: "var(--preview-border-2)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    <span>Save as PDF</span>
                  </button>
                </div>
              )}
            </div>
            <DarkToggle dark={dark} onToggle={toggleDark} />
            {sessionAddress && (
              <WalletChip
                address={sessionAddress}
                open={walletChipOpen}
                onToggle={(e) => { e.stopPropagation(); setWalletChipOpen((v) => !v); }}
                onDisconnect={handleLogout}
              />
            )}
          </div>
        </header>

        {showAddWallet && (
          <AddWalletBar onAdd={() => { loadWallets(); setShowAddWallet(false); }} onCancel={() => setShowAddWallet(false)} />
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-6 py-5">
          {!walletsLoaded ? (
            <LoadingSkeleton />
          ) : wallets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mb-2">
                <span className="text-white font-bold text-2xl">V</span>
              </div>
              <div>
                <p className="text-base font-semibold mb-1" style={{ color: "var(--preview-text)" }}>No wallets tracked yet</p>
                <p className="text-sm" style={{ color: "var(--preview-text-3)" }}>Add a wallet to start tracking vesting schedules.</p>
              </div>
              <button onClick={() => setShowAddWallet(true)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}>
                <IconPlus /> Add your first wallet
              </button>
            </div>
          ) : isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              <PortfolioHero streams={filteredStreams} walletCount={wallets.length} dark={dark} prices={prices} />
              <NextClaimCountdown streams={filteredStreams} />
              <MonthlyCashFlow streams={filteredStreams} prices={prices} costBasis={costBasis} buys={buys} />
              <SnapshotPanel
                streams={filteredStreams}
                allStreams={streams}
                activeTokens={activeTokens}
                onToggleToken={toggleToken}
                prices={prices}
              />
              <VestingTable streams={filteredStreams} prices={prices} />
              <PnLPanel
                streams={filteredStreams}
                prices={prices}
                costBasis={costBasis}
                onUpdateCostBasis={updateCostBasis}
                sells={sells}
                onAddSellTx={addSellTx}
                onRemoveSellTx={removeSellTx}
                buys={buys}
                onAddBuyTx={addBuyTx}
                onRemoveBuyTx={removeBuyTx}
              />
              <TokenMarketPanel tokens={(() => {
                const seen = new Set<string>();
                return filteredStreams
                  .filter(s => s.tokenAddress && s.chainId && seen.has(s.tokenSymbol) === false && !!seen.add(s.tokenSymbol))
                  .map(s => ({ symbol: s.tokenSymbol, address: s.tokenAddress, chainId: s.chainId }));
              })()} />
              <UnlockTimeline streams={filteredStreams} dark={dark} />

              {/* Footer */}
              <footer className="mt-6 pt-4 pb-2 flex items-center justify-between flex-shrink-0"
                style={{ borderTop: "1px solid var(--preview-border-2)" }}>
                <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>© 2026 Vestream. All rights reserved.</p>
                <div className="flex items-center gap-5">
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
    </div>
  );
}
