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

// ─── Cross-protocol summary (the /research/unclaimed-vesting page + CSV) ─────
//
// One row per protocol, exactly as measured. Definitions differ slightly by
// protocol (third-party only vs all, schedules vs allocations); `scope` says
// which. Do not sum the rate columns.

export interface UnclaimedSummaryRow {
  protocol:        string;
  slug:            string;
  chains:          string;
  method:          "Full census" | "Random sample";
  /** Finished schedules measured (sampled protocols: the sample size). */
  finished:        number;
  /** Sampled protocols only: estimated finished population. */
  finishedEst?:    number;
  scope:           string;
  unclaimedPct:    number;
  /** Optional second rate with the dominant mass distributions removed. */
  unclaimedPctAdj?: { pct: number; note: string };
  /** 95% confidence interval for sampled protocols. */
  ci?:             [number, number];
  /** Share of unclaimed positions that were never claimed at all. */
  neverTouchedPct: number;
  /** Unclaimed value in tokens with at least $10k liquidity (USD), if valued. */
  valueUsd?:       { low: number; high: number; note: string };
  measured:        string;
  report:          string;
}

export const UNCLAIMED_SUMMARY: UnclaimedSummaryRow[] = [
  { protocol: "Sablier", slug: "sablier", chains: "25 EVM chains", method: "Full census",
    finished: 447_661, scope: "Non-cancelled finished streams",
    unclaimedPct: 51.0, unclaimedPctAdj: { pct: 30.3, note: "excluding one airdrop token (GX) that is 61% of the unclaimed count" },
    neverTouchedPct: 90.5,
    valueUsd: { low: 2_610_000, high: 6_160_000, note: "Third-party streams only; low end capped at pool depth and limited to tokens with ≥$100k liquidity and ≥$10k daily volume" },
    measured: "2026-10-06", report: "research-unclaimed-sablier.md" },
  { protocol: "Hedgey", slug: "hedgey", chains: "Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism", method: "Full census",
    finished: 140_464, scope: "Third-party plans on all four Hedgey contracts",
    unclaimedPct: 40.9, unclaimedPctAdj: { pct: 42.6, note: "excluding two mass distributions (MASA, GX)" },
    neverTouchedPct: 82.7,
    valueUsd: { low: 1_900_000, high: 2_300_000, note: "Capped at pool depth; excludes projects vesting to themselves" },
    measured: "2026-10-09", report: "research-unclaimed-hedgey.md" },
  { protocol: "UNCX", slug: "uncx", chains: "Ethereum, BNB Chain, Base", method: "Full census",
    finished: 58_550, scope: "Third-party TokenVesting locks",
    unclaimedPct: 59.9, unclaimedPctAdj: { pct: 48.1, note: "excluding the two largest mass distributions (HUH, CHEESUS)" },
    neverTouchedPct: 79.4,
    valueUsd: { low: 91_000, high: 400_000, note: "Capped at pool depth; excludes projects locking to themselves, incl. a $7.5M team lock" },
    measured: "2026-10-06", report: "research-unclaimed-uncx.md" },
  { protocol: "Team Finance", slug: "team-finance", chains: "Ethereum, BNB Chain, Polygon, Avalanche, zkSync Era", method: "Full census",
    finished: 152_260, scope: "Third-party allocations (1,467 finished vesting contracts; 63.1% of contracts still hold tokens)",
    unclaimedPct: 80.5, unclaimedPctAdj: { pct: 66.3, note: "excluding 41 mass distributions with over 1,000 recipients each" },
    neverTouchedPct: 92.5,
    valueUsd: { low: 242_000, high: 467_000, note: "Capped at pool depth; the low figure excludes one large allocation still being actively claimed" },
    measured: "2026-10-07", report: "research-unclaimed-team-finance.md" },
  { protocol: "Unvest", slug: "unvest", chains: "Ethereum, BNB Chain, Polygon, Base, Arbitrum", method: "Full census",
    finished: 35_278, scope: "Holder positions",
    unclaimedPct: 87.0, neverTouchedPct: 77.9,
    valueUsd: { low: 53_000, high: 53_000, note: "Mostly two thinly traded tokens; lead with the rate, not the value" },
    measured: "2026-10-06", report: "research-unclaimed-unvest.md" },
  { protocol: "Smithii", slug: "smithii", chains: "Solana", method: "Full census",
    finished: 1_695, scope: "Vesting schedules",
    unclaimedPct: 60.7, neverTouchedPct: 96.7,
    valueUsd: { low: 5_000, high: 94_000, note: "83% of the tokens involved have no price; the high figure is mostly three positions larger than their own pools" },
    measured: "2026-10-06", report: "research-unclaimed-solana.md" },
  { protocol: "Streamflow", slug: "streamflow", chains: "Solana", method: "Random sample",
    finished: 3_469, finishedEst: 41_800, scope: "Vesting contracts (sample of 6,000 of 72,215)",
    unclaimedPct: 26.1, ci: [24.6, 27.5], neverTouchedPct: 83.4,
    measured: "2026-10-06", report: "research-unclaimed-solana.md" },
  { protocol: "Jupiter Lock", slug: "jupiter-lock", chains: "Solana", method: "Random sample",
    finished: 5_751, finishedEst: 400_700, scope: "Escrows (sample of 6,000 of 418,098)",
    unclaimedPct: 2.9, ci: [2.4, 3.3], neverTouchedPct: 92.7,
    measured: "2026-10-06", report: "research-unclaimed-solana.md" },
];

/** Finished schedules read individually (full-census protocols only). */
export const UNCLAIMED_FULL_CENSUS_TOTAL = UNCLAIMED_SUMMARY
  .filter((r) => r.method === "Full census").reduce((s, r) => s + r.finished, 0);
/** Estimated finished population of the sampled protocols. */
export const UNCLAIMED_SAMPLED_EST_TOTAL = UNCLAIMED_SUMMARY
  .filter((r) => r.method === "Random sample").reduce((s, r) => s + (r.finishedEst ?? 0), 0);
