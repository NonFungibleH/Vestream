// src/lib/vesting/token-pulse.ts
// ─────────────────────────────────────────────────────────────────────────────
// Token "Pulse" summary — a short bulleted read-out for the top of the token
// page, with a longer paragraph available behind a "See more" interaction.
//
// Why this module exists separately from token-faq.ts: the FAQ is
// question-driven (one Q&A per topic). Pulse is narrative-driven — what's
// the quick take on this token's vesting situation right now, in 3-4
// bullets a human can scan in five seconds?
//
// v1 is **fully template-based** — all bullet/paragraph text is computed
// deterministically from indexed data, no LLM involved. That's deliberate:
// (a) it ships today with zero API key / cost, (b) content is guaranteed
// factual, (c) we get to validate the UX + placement before paying for
// real generation.
//
// The function signature is intentionally swap-compatible with a future AI
// provider — v2 can replace `buildTokenPulse` with an async LLM call
// that takes the same BuildPulseInput and returns the same PulseOutput,
// cached to Postgres via a separate route. The component on the other end
// doesn't need to change.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  TokenOverview,
  UnlockCalendarBucket,
  TokenMarketData,
  TokenUpcomingEvent,
  TokenRecipient,
} from "./token-aggregates";

export interface PulseOutput {
  /** 3-4 short sentences, each a standalone insight. Shown as bullets
   *  above the fold. Empty array means "nothing substantive to say" —
   *  caller should hide the pulse section entirely. */
  bullets:  string[];
  /** Longer flowing paragraph shown behind "See more". Always populated
   *  if `bullets` is non-empty — the extended view is supposed to make
   *  the bullets read like a coherent narrative. */
  extended: string;
  /** When the summary was generated. Surfaces as "Updated X ago" in the
   *  UI so visitors know how fresh the data is. */
  generatedAt: Date;
}

export interface BuildPulseInput {
  symbol:     string;
  overview:   TokenOverview | null;
  market:     TokenMarketData;
  calendar:   UnlockCalendarBucket[];
  upcoming:   TokenUpcomingEvent[];
  recipients: TokenRecipient[];
}

// ─── Formatters — tuned for short, scannable prose ──────────────────────────

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

function daysFromNow(unixSec: number): number {
  return Math.max(0, Math.round((unixSec - Date.now() / 1000) / 86400));
}

const PROTOCOL_DISPLAY: Record<string, string> = {
  sablier:       "Sablier",
  hedgey:        "Hedgey",
  uncx:          "UNCX",
  "uncx-vm":     "UNCX",
  unvest:        "Unvest",
  "team-finance":"Team Finance",
  superfluid:    "Superfluid",
  pinksale:      "PinkSale",
};

// ─── Bullet generators — each returns null if it has nothing to say ──────────

function bLockedSupply(input: BuildPulseInput): string | null {
  const { symbol, overview, market } = input;
  if (!overview || overview.lockedTokensWhole <= 0) return null;
  const tokens = fmtTokens(overview.lockedTokensWhole);
  if (!market.priceUsd) {
    return `${tokens} ${symbol} sit in indexed vesting contracts across ${overview.activeStreamCount.toLocaleString()} active streams.`;
  }
  const usd = fmtUsd(overview.lockedTokensWhole * market.priceUsd);
  const fdvShare = market.fdv && market.fdv > 0
    ? ((overview.lockedTokensWhole * market.priceUsd) / market.fdv) * 100
    : null;
  if (fdvShare != null && fdvShare > 1) {
    return `${tokens} ${symbol} worth ${usd} are locked in vesting — roughly ${fdvShare.toFixed(1)}% of fully diluted valuation.`;
  }
  return `${tokens} ${symbol} worth ${usd} are currently locked in indexed vesting contracts.`;
}

function bThirtyDay(input: BuildPulseInput): string | null {
  const { symbol, overview, market } = input;
  if (!overview || overview.upcoming30dTokens <= 0) return null;
  const tokens = fmtTokens(overview.upcoming30dTokens);
  const usd    = market.priceUsd ? ` (${fmtUsd(overview.upcoming30dTokens * market.priceUsd)})` : "";
  const share  = overview.lockedTokensWhole > 0
    ? (overview.upcoming30dTokens / overview.lockedTokensWhole) * 100
    : 0;
  if (share >= 5) {
    return `${tokens} ${symbol}${usd} unlock in the next 30 days — ${share.toFixed(1)}% of currently locked supply hits the market.`;
  }
  return `${tokens} ${symbol}${usd} are scheduled to unlock in the next 30 days.`;
}

function bNextEvent(input: BuildPulseInput): string | null {
  const { symbol, upcoming } = input;
  if (upcoming.length === 0) return null;
  const next = upcoming[0];
  const when = daysFromNow(next.timestamp);
  const whenStr = when === 0 ? "today" : when === 1 ? "tomorrow" : `in ${when} days`;
  const protocolLbl = PROTOCOL_DISPLAY[next.protocol] ?? next.protocol;
  return `Next unlock is ${whenStr} on ${fmtDate(next.timestamp)} — ${fmtTokens(next.tokensWhole)} ${symbol} via ${protocolLbl}.`;
}

function bConcentration(input: BuildPulseInput): string | null {
  const { symbol, overview, recipients } = input;
  if (!overview || recipients.length === 0 || overview.lockedTokensWhole <= 0) return null;
  const top3 = recipients.slice(0, 3);
  const top3Total = top3.reduce((s, r) => s + r.lockedTokensWhole, 0);
  const share = (top3Total / overview.lockedTokensWhole) * 100;
  // Only surface this bullet when concentration is actually notable.
  if (share < 30) return null;
  return `The top 3 wallets hold ${share.toFixed(0)}% of locked ${symbol} — concentration worth knowing before a cliff.`;
}

function bProtocolMix(input: BuildPulseInput): string | null {
  const { symbol, overview } = input;
  if (!overview || overview.protocolMix.length === 0) return null;
  // De-dupe labels so uncx + uncx-vm don't double-count.
  const byLabel = new Map<string, number>();
  for (const p of overview.protocolMix) {
    const label = PROTOCOL_DISPLAY[p.protocol] ?? p.protocol;
    byLabel.set(label, (byLabel.get(label) ?? 0) + p.lockedTokensWhole);
  }
  const distinct = Array.from(byLabel.entries()).sort((a, b) => b[1] - a[1]);
  if (distinct.length === 1) {
    return `All indexed ${symbol} vesting sits on ${distinct[0][0]}.`;
  }
  const leaders = distinct.slice(0, 2).map((d) => d[0]).join(" and ");
  return `Vesting spans ${distinct.length} protocols — led by ${leaders}.`;
}

// ─── Extended narrative — ties the bullets together in prose ────────────────

function buildExtended(input: BuildPulseInput): string {
  const { symbol, overview, market, upcoming, calendar } = input;
  if (!overview || overview.streamCount === 0) {
    return `TokenVest has not indexed any vesting contracts for ${symbol} on this chain yet. If you know of a team allocation, launchpad lock, or streaming grant for this token, paste the recipient wallet into TokenVest's wallet tracker and it will pick up on the next cache refresh.`;
  }

  const parts: string[] = [];

  // Opening: locked supply snapshot
  const lockedTokens = fmtTokens(overview.lockedTokensWhole);
  const lockedUsd = market.priceUsd ? fmtUsd(overview.lockedTokensWhole * market.priceUsd) : null;
  parts.push(
    lockedUsd
      ? `As of the last seed-cache run, TokenVest tracks ${lockedTokens} ${symbol} worth ${lockedUsd} across ${overview.activeStreamCount.toLocaleString()} active vesting streams on this chain.`
      : `TokenVest tracks ${lockedTokens} ${symbol} across ${overview.activeStreamCount.toLocaleString()} active vesting streams on this chain.`,
  );

  // 30-day outlook
  if (overview.upcoming30dTokens > 0) {
    const t30 = fmtTokens(overview.upcoming30dTokens);
    const u30 = market.priceUsd ? ` (${fmtUsd(overview.upcoming30dTokens * market.priceUsd)})` : "";
    const share30 = overview.lockedTokensWhole > 0
      ? (overview.upcoming30dTokens / overview.lockedTokensWhole) * 100
      : 0;
    const shareNote = share30 >= 5
      ? `, amounting to ${share30.toFixed(1)}% of currently locked supply`
      : "";
    parts.push(`${t30} ${symbol}${u30} is scheduled to unlock within the next 30 days${shareNote}.`);
  }

  // Next event callout
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const protocolLbl = PROTOCOL_DISPLAY[next.protocol] ?? next.protocol;
    parts.push(
      `The nearest scheduled event is on ${fmtDate(next.timestamp)} — about ${fmtTokens(next.tokensWhole)} ${symbol} unlocking via ${protocolLbl}.`,
    );
  }

  // Long-horizon schedule context
  const nonZeroMonths = calendar.filter((b) => b.totalTokensWhole > 0);
  if (nonZeroMonths.length > 1) {
    const last = nonZeroMonths[nonZeroMonths.length - 1];
    parts.push(
      `The indexed schedule runs through ${last.label}, with unlocks spread across ${nonZeroMonths.length} months in TokenVest's 12-month view.`,
    );
  }

  return parts.join(" ");
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Build the Pulse output from token data. Returns empty bullets + empty
 * extended string when there's genuinely nothing to say — callers should
 * check `bullets.length > 0` before rendering.
 */
export function buildTokenPulse(input: BuildPulseInput): PulseOutput {
  const candidates = [
    bLockedSupply(input),
    bThirtyDay(input),
    bNextEvent(input),
    bConcentration(input),
    bProtocolMix(input),
  ].filter((s): s is string => typeof s === "string" && s.length > 0);

  // Cap at 4 bullets so the card stays scannable above the fold. The
  // bullet generators are already ordered by general relevance (locked →
  // 30d → next event → concentration → protocol mix), so slicing keeps
  // the most useful signals and drops the nice-to-haves.
  const bullets = candidates.slice(0, 4);

  return {
    bullets,
    extended:    bullets.length > 0 ? buildExtended(input) : "",
    generatedAt: new Date(),
  };
}
