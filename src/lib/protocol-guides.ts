// src/lib/protocol-guides.ts
// ─────────────────────────────────────────────────────────────────────────────
// Which /resources articles belong to which protocol.
//
// Used to link protocol pages and token pages into the article cluster. Those
// are the site's most numerous pages (a page per protocol, 270+ token pages),
// and before this they linked to no protocol-specific article at all — only
// 3 protocols linked a "how to track" guide and none linked their explainer.
//
// Where two near-duplicate articles cover one protocol, the MORE COMPLETE one
// is linked (Sablier, UNCX, Streamflow, Hedgey each have a pair). For UNCX that
// is also the one Google already surfaces. Consolidating the duplicates is a
// separate decision; this map only chooses where internal links point.
//
// Anchor text is the article's own title, resolved at render, so it can never
// drift from the page it points to.
// ─────────────────────────────────────────────────────────────────────────────

import { getArticle } from "./articles";

interface GuideSlugs { explainer?: string; howTo?: string; claim?: string }

export const PROTOCOL_GUIDE_SLUGS: Record<string, GuideSlugs> = {
  "sablier":      { explainer: "sablier-token-streaming-vesting-explained", howTo: "how-to-track-sablier-unlocks", claim: "how-to-withdraw-sablier-vested-tokens" },
  "sablier-flow": { explainer: "sablier-token-streaming-vesting-explained" },
  "hedgey":       { explainer: "hedgey-nft-vesting-plans-explained",        howTo: "how-to-track-hedgey-unlocks", claim: "how-to-claim-hedgey-vesting-tokens" },
  "team-finance": { explainer: "how-to-track-team-finance-vesting" },
  "uncx":         { explainer: "uncx-token-lockers-and-vesting" },
  "unvest":       { explainer: "what-is-unvest-token-vesting", claim: "how-to-claim-unvest-vested-tokens" },
  "superfluid":   { explainer: "superfluid-cliff-and-streaming-vesting", claim: "how-to-receive-superfluid-vested-tokens" },
  "pinksale":     { explainer: "what-is-pinksale-pinklock-token-locker", claim: "how-to-unlock-pinksale-pinklock-tokens" },
  "streamflow":   { explainer: "streamflow-solana-vesting", claim: "how-to-claim-streamflow-vested-tokens" },
  "llamapay":     { explainer: "crypto-payroll-and-contributor-income-guide", claim: "how-to-withdraw-llamapay-stream" },
  "jupiter-lock": { explainer: "what-is-jupiter-lock-solana-token-vesting", claim: "how-to-claim-jupiter-lock-tokens" },
  "smithii":      { explainer: "what-is-smithii-solana-token-vesting", claim: "how-to-claim-smithii-vested-tokens" },
  "hoodlock":     { explainer: "what-is-hoodlock-robinhood-chain-token-locker", claim: "how-to-withdraw-hoodlock-tokens" },
  "magna":        { explainer: "what-is-magna-token-vesting", claim: "how-to-claim-magna-tokens" },
};

export interface ProtocolGuide { slug: string; title: string; href: string }

/** Article title without the trailing "(2026)" year tag, for link text. */
function linkTitle(title: string): string {
  return title.replace(/\s*\(\d{4}\)\s*$/, "");
}

/** Explainer first, then the tracking guide, then the claim guide. Missing articles are skipped. */
export function protocolGuides(protocolSlug: string): ProtocolGuide[] {
  const slugs = PROTOCOL_GUIDE_SLUGS[protocolSlug];
  if (!slugs) return [];
  const out: ProtocolGuide[] = [];
  for (const s of [slugs.explainer, slugs.howTo, slugs.claim]) {
    if (!s) continue;
    const a = getArticle(s);
    if (a) out.push({ slug: a.slug, title: linkTitle(a.title), href: `/resources/${a.slug}` });
  }
  return out;
}
