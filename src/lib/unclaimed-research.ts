// src/lib/unclaimed-research.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-protocol findings from Vestream's unclaimed-vesting research (Oct 2026),
// shown on each /protocols/[slug] page.
//
// Every figure here was measured from the protocol's contracts on-chain and the
// largest positions were re-verified; the full method, caveats and the numbers
// deliberately NOT published are in docs/content/research-unclaimed-*.md.
// Only add a protocol after its research is complete. Hand-maintained: these
// are dated findings, not live data.
// ─────────────────────────────────────────────────────────────────────────────

export interface UnclaimedFinding {
  /** The headline figure, e.g. "6 in 10" or "~$2.3M". */
  headline: string;
  /** What the headline measures. */
  headlineLabel: string;
  stats: { value: string; label: string }[];
  /** e.g. "6 Oct 2026" */
  measured: string;
  /** One-line method, shown as the source note. */
  method: string;
  /** Plain-sentence answer for the page FAQ. */
  faq: string;
}

export const UNCLAIMED_FINDINGS: Record<string, UnclaimedFinding> = {
  sablier: {
    headline: "Up to $6M",
    headlineLabel: "in vested tokens sitting unclaimed in finished Sablier streams",
    stats: [
      { value: "20,000+", label: "finished streams still unclaimed, in tokens that still trade" },
      { value: "433",     label: "unclaimed positions worth over $1,000" },
      { value: "1 in 3",  label: "finished streams never fully claimed" },
    ],
    measured: "6 Oct 2026",
    method: "Every finished Sablier stream across 25 chains, read from Sablier's live indexer and spot-checked on-chain. Value counts tokens with at least $10k of liquidity and excludes projects streaming to themselves.",
    faq: "About 1 in 3 finished Sablier streams still hold tokens the recipient never withdrew. Counting only tokens that still trade, that is more than 20,000 streams worth up to about $6M, measured on 6 Oct 2026.",
  },
  smithii: {
    headline: "6 in 10",
    headlineLabel: "finished Smithii vestings on Solana still hold unclaimed tokens",
    stats: [
      { value: "1,029", label: "finished schedules still unclaimed, of 1,695" },
      { value: "995",   label: "schedules never claimed once" },
      { value: "972",   label: "wallets those tokens are owed to" },
    ],
    measured: "6 Oct 2026",
    method: "Every Smithii vesting schedule on Solana, with each vault balance re-read on-chain. Finished means ended 30+ days before measurement.",
    faq: "1,029 of 1,695 finished Smithii vesting schedules on Solana (about 6 in 10) still held unclaimed tokens on 6 Oct 2026, and 995 had never been claimed at all.",
  },
  streamflow: {
    headline: "~1 in 4",
    headlineLabel: "finished Streamflow vestings still hold unclaimed tokens",
    stats: [
      { value: "~10,900", label: "finished contracts still unclaimed, of ~41,800" },
      { value: "83%",     label: "of those never claimed a single token" },
      { value: "2+ years", label: "how long some have sat unclaimed" },
    ],
    measured: "6 Oct 2026",
    method: "A random on-chain sample of 6,000 Streamflow contracts, scaled to all 72,215.",
    faq: "About 1 in 4 finished Streamflow vesting contracts, roughly 10,900, still held unclaimed tokens on 6 Oct 2026. Most had never been claimed at all.",
  },
  "jupiter-lock": {
    headline: "97%",
    headlineLabel: "of finished Jupiter Lock escrows are fully claimed. The rest are not.",
    stats: [
      { value: "~11,500", label: "finished locks still unclaimed, of ~400,700" },
      { value: "93%",     label: "of those never claimed a single token" },
      { value: "$55K",    label: "the largest single one found, unclaimed for 21 months" },
    ],
    measured: "6 Oct 2026",
    method: "A random on-chain sample of 6,000 of 418,098 Jupiter Lock escrows.",
    faq: "About 97% of finished Jupiter Lock escrows have been fully claimed. Roughly 11,500 had not been on 6 Oct 2026, the largest worth about $55K and unclaimed for 21 months.",
  },
  uncx: {
    headline: "~$400K",
    headlineLabel: "in vested tokens sitting unclaimed in finished UNCX locks",
    stats: [
      { value: "14",      label: "unclaimed positions worth over $10,000" },
      { value: "36",      label: "unclaimed positions worth over $1,000" },
      { value: "9 in 10", label: "of those never touched once" },
    ],
    measured: "6 Oct 2026",
    method: "Every UNCX TokenVesting lock, read directly from the contracts. Value counts tokens with at least $10k of liquidity, capped at pool depth, and excludes projects locking to themselves.",
    faq: "About $400K of vested tokens sat unclaimed in finished UNCX locks on 6 Oct 2026, counting only tokens that still trade. Nine in ten of those positions had never been touched.",
  },
  unvest: {
    headline: "9 in 10",
    headlineLabel: "finished Unvest vestings still hold unclaimed tokens",
    stats: [
      { value: "30,709", label: "finished positions still unclaimed, of 35,278" },
      { value: "23,931", label: "positions never claimed once" },
      { value: "3+ years", label: "how long some have sat unclaimed" },
    ],
    measured: "6 Oct 2026",
    method: "Every Unvest holder balance on five chains, with the largest positions re-verified on-chain.",
    faq: "30,709 of 35,278 finished Unvest positions (nearly 9 in 10) still held unclaimed tokens on 6 Oct 2026. Most are small or in tokens that no longer trade.",
  },
  "team-finance": {
    headline: "6 in 10",
    headlineLabel: "finished Team Finance vestings still hold unclaimed tokens",
    stats: [
      { value: "925",    label: "finished vesting contracts still holding tokens, of 1,467" },
      { value: "~$240K", label: "of it in tokens that still trade" },
      { value: "Nearly 2 years", label: "how long some have sat untouched" },
    ],
    measured: "7 Oct 2026",
    method: "Every Team Finance vesting and allocation on five chains, read on-chain and checked against each contract's merkle root. Value capped at pool depth; excludes projects vesting to themselves.",
    faq: "925 of 1,467 finished Team Finance vesting contracts (about 6 in 10) still held unclaimed tokens on 7 Oct 2026, about $240K of it in tokens that still trade.",
  },
  hedgey: {
    headline: "~$2.3M",
    headlineLabel: "in vested tokens sitting unclaimed in finished Hedgey plans",
    stats: [
      { value: "1,080",       label: "unclaimed plans in tokens that still trade" },
      { value: "195",         label: "unclaimed plans worth over $1,000" },
      { value: "Over 8 in 10", label: "of those never touched once" },
    ],
    measured: "9 Oct 2026",
    method: "Every plan on Hedgey's four plan contracts across six chains, from on-chain events, with the largest re-verified. Value capped at pool depth; excludes projects vesting to themselves.",
    faq: "About $2.3M of vested tokens sat unclaimed in finished Hedgey plans on 9 Oct 2026, across 1,080 plans in tokens that still trade. More than 8 in 10 had never been touched.",
  },
};
