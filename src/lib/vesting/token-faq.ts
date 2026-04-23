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
  const { symbol, recipients } = input;
  if (recipients.length === 0) {
    return `Vestream has not indexed any vested ${symbol} recipients yet.`;
  }
  const top = recipients.slice(0, 3);
  if (top.length === 1) {
    return `The wallet with the largest indexed ${symbol} vesting position is ${truncateAddr(top[0].recipient)} with approximately ${fmtTokens(top[0].lockedTokensWhole)} ${symbol} locked.`;
  }
  const list = top.map((r, i) => `${i + 1}. ${truncateAddr(r.recipient)} (${fmtTokens(r.lockedTokensWhole)} ${symbol})`).join("; ");
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
 * Produce an ordered list of FAQ entries for a token page. The order is
 * deliberate — most-searched questions first, generic educational at the
 * bottom. Callers render in order and pass the same list to the JSON-LD
 * schema so on-page and search-engine views stay in sync.
 */
export function buildTokenFAQ(input: BuildFAQInput): FAQItem[] {
  const { symbol } = input;
  return [
    {
      question: `What is the ${symbol} token vesting schedule?`,
      answer:   ansVestingSchedule(input),
    },
    {
      question: `When is the next ${symbol} unlock?`,
      answer:   ansNextUnlock(input),
    },
    {
      question: `How much ${symbol} is currently locked in vesting contracts?`,
      answer:   ansLockedSupply(input),
    },
    {
      question: `Which vesting protocols hold ${symbol}?`,
      answer:   ansProtocolAllocation(input),
    },
    {
      question: `How much ${symbol} unlocks in the next 30 days?`,
      answer:   ansNext30Days(input),
    },
    {
      question: `Which wallets hold the most vested ${symbol}?`,
      answer:   ansTopRecipients(input),
    },
    {
      question: `What is ${symbol}'s Fully Diluted Valuation (FDV)?`,
      answer:   ansFdv(input),
    },
    {
      question: `How can I track upcoming ${symbol} unlocks?`,
      answer:   ansTrack(input),
    },
    {
      question: `What is the difference between ${symbol} circulating supply and total supply?`,
      answer:   ansCirculatingVsTotal(input),
    },
  ];
}
