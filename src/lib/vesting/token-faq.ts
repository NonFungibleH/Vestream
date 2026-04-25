// src/lib/vesting/token-faq.ts
// ─────────────────────────────────────────────────────────────────────────────
// Data-driven FAQ builder for /token/[chainId]/[address].
//
// Every question is a short, natural-language match to a real user search
// query ("when does $TOKEN unlock", "what is $TOKEN FDV", …). Every answer
// is synthesised from data the page has already fetched — no separate DB
// calls, no AI, no hallucination risk.
//
// Why a module rather than inlined JSX?
//   • Testable. The builder is pure; feed it fixture input, assert output
//     strings. Catches copy regressions in CI.
//   • Reusable. Same FAQ data feeds the on-page accordion AND the
//     `<script type="application/ld+json">` FAQPage schema. The FAQPage
//     JSON-LD is the primary SEO reason this exists — Google's rich-snippet
//     pipeline reads that blob and promotes matching Q&A into search results.
//
// Keep answers:
//   • Short (1-3 sentences). Google's FAQ rich results truncate past ~300 char.
//   • Factual only. Never opine on "good"/"bad"/"risky". Never recommend buys.
//   • Symbol-substituted. Every answer mentions $SYMBOL so the content is
//     unique per token — avoids duplicate-content SEO penalties.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  TokenOverview,
  UnlockCalendarBucket,
  TokenMarketData,
  TokenUpcomingEvent,
  TokenRecipient,
} from "./token-aggregates";

export interface FAQItem {
  question: string;
  /** Plain-text answer. Safe for both DOM rendering and JSON-LD. */
  answer:   string;
}

export interface BuildFAQInput {
  chainId:      number;
  tokenAddress: string;
  /** Preferred display symbol. Callers should pass `overview?.tokenSymbol ??
   *  market.tokenName ?? "the token"`. Used inline in every answer. */
  symbol:       string;
  /** May be null for tokens with no indexed vesting yet — the builder
   *  produces graceful "nothing indexed" variants in that case. */
  overview:     TokenOverview | null;
  market:       TokenMarketData;
  calendar:     UnlockCalendarBucket[];
  upcoming:     TokenUpcomingEvent[];
  recipients:   TokenRecipient[];
}

// ─── Internal formatters (not exported — FAQ-local style) ───────────────────

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} million`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)} million`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  if (n >= 1)   return `$${n.toFixed(0)}`;
  return `$${n.toPrecision(2)}`;
}

function fmtDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function truncateAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
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

function protocolLabel(id: string): string {
  return PROTOCOL_DISPLAY[id] ?? id;
}

/** Distinct protocols in a protocolMix, deduped (since uncx + uncx-vm both map
 *  to "UNCX" we don't want to list the same name twice). Sorted by tokens
 *  locked, descending. */
function distinctProtocolsByLock(
  mix: TokenOverview["protocolMix"],
): Array<{ name: string; tokens: number }> {
  const sorted = [...mix].sort((a, b) => b.lockedTokensWhole - a.lockedTokensWhole);
  const seen = new Map<string, number>();
  for (const p of sorted) {
    const label = protocolLabel(p.protocol);
    seen.set(label, (seen.get(label) ?? 0) + p.lockedTokensWhole);
  }
  return Array.from(seen.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, tokens]) => ({ name, tokens }));
}

// ─── Per-question answer builders ───────────────────────────────────────────

function ansVestingSchedule(input: BuildFAQInput): string {
  const { symbol, overview, calendar } = input;
  if (!overview || overview.streamCount === 0) {
    return `Vestream has not indexed any vesting contracts for ${symbol} yet. Check back after the next seed-cache run or submit a wallet to help us index activity.`;
  }
  const nonZero = calendar.filter((b) => b.totalTokensWhole > 0);
  if (nonZero.length === 0) {
    return `${symbol} has ${overview.streamCount.toLocaleString()} indexed vesting stream${overview.streamCount === 1 ? "" : "s"}, but no unlocks are scheduled in the next 12 months.`;
  }
  const first = nonZero[0];
  const last  = nonZero[nonZero.length - 1];
  const peak  = [...nonZero].sort((a, b) => b.totalTokensWhole - a.totalTokensWhole)[0];
  return `${symbol} unlocks are scheduled from ${first.label} to ${last.label} across ${nonZero.length} active month${nonZero.length === 1 ? "" : "s"}. The largest single month is ${peak.label} with about ${fmtTokens(peak.totalTokensWhole)} ${symbol} scheduled to unlock.`;
}

function ansNextUnlock(input: BuildFAQInput): string {
  const { symbol, upcoming } = input;
  if (upcoming.length === 0) {
    return `No upcoming ${symbol} unlocks are currently indexed by Vestream.`;
  }
  const next = upcoming[0];
  return `The next scheduled ${symbol} unlock is on ${fmtDate(next.timestamp)}, releasing approximately ${fmtTokens(next.tokensWhole)} ${symbol} via ${protocolLabel(next.protocol)}.`;
}

function ansLockedSupply(input: BuildFAQInput): string {
  const { symbol, overview, market } = input;
  if (!overview || overview.lockedTokensWhole <= 0) {
    return `Vestream is not tracking any currently-locked ${symbol} in indexed vesting contracts.`;
  }
  const tokens = fmtTokens(overview.lockedTokensWhole);
  const usd    = market.priceUsd ? fmtUsd(overview.lockedTokensWhole * market.priceUsd) : "";
  const fdvPct = market.fdv && market.fdv > 0 && market.priceUsd
    ? ((overview.lockedTokensWhole * market.priceUsd) / market.fdv) * 100
    : null;
  const parts = [
    `Vestream indexes ${tokens} ${symbol} currently locked across ${overview.activeStreamCount.toLocaleString()} active vesting stream${overview.activeStreamCount === 1 ? "" : "s"}`,
    usd ? `worth about ${usd} at the current price` : "",
  ].filter(Boolean);
  let out = parts.join(", ") + ".";
  if (fdvPct != null && fdvPct > 0.5) {
    out += ` That is roughly ${fdvPct.toFixed(1)}% of the fully diluted valuation.`;
  }
  return out;
}

function ansProtocolAllocation(input: BuildFAQInput): string {
  const { symbol, overview } = input;
  if (!overview || overview.protocolMix.length === 0) {
    return `Vestream has no indexed vesting protocols holding ${symbol} yet.`;
  }
  const distinct = distinctProtocolsByLock(overview.protocolMix);
  if (distinct.length === 1) {
    return `All indexed ${symbol} vesting is on ${distinct[0].name} (${fmtTokens(distinct[0].tokens)} ${symbol} locked).`;
  }
  const breakdown = distinct
    .slice(0, 4) // keep the answer short for rich-snippet truncation
    .map((p) => `${p.name} (${fmtTokens(p.tokens)})`)
    .join(", ");
  return `${symbol} vesting is distributed across ${distinct.length} protocol${distinct.length === 1 ? "" : "s"}: ${breakdown}.`;
}

function ansNext30Days(input: BuildFAQInput): string {
  const { symbol, overview, market } = input;
  if (!overview || overview.upcoming30dTokens <= 0) {
    return `No significant ${symbol} unlocks are scheduled in the next 30 days according to Vestream's indexed data.`;
  }
  const tokens = fmtTokens(overview.upcoming30dTokens);
  const usd    = market.priceUsd ? fmtUsd(overview.upcoming30dTokens * market.priceUsd) : "";
  const lockedShare = overview.lockedTokensWhole > 0
    ? (overview.upcoming30dTokens / overview.lockedTokensWhole) * 100
    : null;
  const parts = [`About ${tokens} ${symbol}${usd ? ` (${usd})` : ""} is scheduled to unlock in the next 30 days`];
  if (lockedShare != null && lockedShare > 0) {
    parts.push(`representing ${lockedShare.toFixed(1)}% of currently locked supply`);
  }
  return parts.join(", ") + ".";
}

function ansTopRecipients(input: BuildFAQInput): string {
  const { symbol, overview, recipients } = input;
  if (recipients.length === 0) {
    return `Vestream has not indexed any vested ${symbol} recipients yet.`;
  }
  const totalLocked = overview?.lockedTokensWhole ?? 0;
  const top = recipients.slice(0, 3);

  // % of locked supply — always computable from our own cache, no external
  // data needed. We floor to 0.1% so the snippet doesn't fill with noise
  // like "0.0003% of locked supply" for tiny positions.
  const supplyShare = (tokens: number): string => {
    if (totalLocked <= 0) return "";
    const pct = (tokens / totalLocked) * 100;
    if (pct < 0.1) return "";
    return ` (${pct.toFixed(1)}% of locked supply)`;
  };

  if (top.length === 1) {
    const r = top[0];
    return `The largest indexed ${symbol} vesting position belongs to ${truncateAddr(r.recipient)} with approximately ${fmtTokens(r.lockedTokensWhole)} ${symbol}${supplyShare(r.lockedTokensWhole)}.`;
  }

  const list = top
    .map((r, i) => `${i + 1}. ${truncateAddr(r.recipient)} with ${fmtTokens(r.lockedTokensWhole)} ${symbol}${supplyShare(r.lockedTokensWhole)}`)
    .join("; ");
  return `The top ${top.length} wallets by indexed ${symbol} vesting positions are: ${list}.`;
}

function ansFdv(input: BuildFAQInput): string {
  const { symbol, market } = input;
  const fdv = market.fdv ?? market.marketCap;
  if (!fdv) {
    return `DexScreener has no fully diluted valuation data for ${symbol} on this chain.`;
  }
  const price = market.priceUsd ? ` At the current price of $${market.priceUsd.toPrecision(4)}` : "";
  const mc    = market.marketCap && market.marketCap !== fdv
    ? `. Current market cap is ${fmtUsd(market.marketCap)}`
    : "";
  return `${symbol}'s fully diluted valuation is approximately ${fmtUsd(fdv)}, sourced from DexScreener.${price ? `${price}.` : ""}${mc}.`;
}

function ansTrack(input: BuildFAQInput): string {
  const { symbol, overview } = input;
  const protocols = overview ? distinctProtocolsByLock(overview.protocolMix).map((p) => p.name) : [];
  const coverageSentence = protocols.length > 0
    ? `Vestream already indexes ${symbol} activity on ${protocols.slice(0, 4).join(", ")}${protocols.length > 4 ? ", and others" : ""}.`
    : `Vestream indexes Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid, and PinkSale.`;
  return `Add ${symbol} — or any wallet holding ${symbol} — to your Vestream watchlist to receive push and email notifications ahead of every scheduled unlock. ${coverageSentence}`;
}

function ansCirculatingVsTotal(input: BuildFAQInput): string {
  const { symbol } = input;
  return `Circulating supply is the amount of ${symbol} that is freely tradable on the open market. Total supply includes every token ever minted — including amounts still locked in vesting contracts, team allocations, treasury reserves, and other non-circulating pools. Vesting unlocks move tokens from the "locked" bucket into circulating supply on a predetermined schedule, which is what Vestream tracks.`;
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Produce an ordered list of FAQ entries for a token page.
 *
 * Questions are deliberately phrased in conversational Vestream voice
 * rather than the stock "What is the X token vesting schedule?" template
 * that several competitors use — both to read less like a page clone and
 * because the rephrasings match real long-tail search phrasing better
 * (e.g. "next X unlock" beats "When is the next X unlock?" for intent
 * parity with how users actually type).
 *
 * Order is deliberate — soonest-urgency questions first, educational at
 * the bottom. The same list feeds both the accordion and the JSON-LD
 * schema so on-page and search-result views stay in sync.
 */
export function buildTokenFAQ(input: BuildFAQInput): FAQItem[] {
  const { symbol } = input;
  return [
    {
      question: `What does the ${symbol} unlock schedule look like over the next year?`,
      answer:   ansVestingSchedule(input),
    },
    {
      question: `When is the very next ${symbol} unlock event?`,
      answer:   ansNextUnlock(input),
    },
    {
      question: `How much ${symbol} is still locked in vesting right now, and what is it worth?`,
      answer:   ansLockedSupply(input),
    },
    {
      question: `Which vesting protocols are holding ${symbol}?`,
      answer:   ansProtocolAllocation(input),
    },
    {
      question: `How much ${symbol} will unlock in the next 30 days?`,
      answer:   ansNext30Days(input),
    },
    {
      question: `Who are the largest ${symbol} recipients with active vesting?`,
      answer:   ansTopRecipients(input),
    },
    {
      question: `What is ${symbol} worth fully diluted today?`,
      answer:   ansFdv(input),
    },
    {
      question: `How do I get notified before a ${symbol} unlock happens?`,
      answer:   ansTrack(input),
    },
    {
      question: `Why does ${symbol} circulating supply differ from the locked amount Vestream shows?`,
      answer:   ansCirculatingVsTotal(input),
    },
  ];
}
