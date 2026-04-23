// src/lib/protocol-constants.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for public-facing protocol metadata.
//
// Used by:
//   • /protocols/[slug] SEO landing pages
//   • /protocols index page
//   • Any cross-protocol UI that needs colour / name / chains / claim URL
//
// Adapter IDs here MUST match VestingStream.protocol values emitted by the
// adapters in src/lib/vesting/adapters/*. The `uncx-vm` adapter is
// intentionally omitted — it's merged into the `uncx` display entry.
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "./vesting/types";

export interface Testimonial {
  quote: string;                     // ≤ 200 chars, plain text
  author: string;                    // "Anon founder · seed-stage AI co."
  role?: string;                     // optional free-text role
}

export interface ProtocolMeta {
  /** URL segment: `/protocols/{slug}`. Also matches VestingStream.protocol. */
  slug: string;
  /** Adapter IDs this page aggregates from (usually [slug], but see uncx). */
  adapterIds: string[];
  /** Display name, used in <h1> and nav labels. */
  name: string;
  /** One-liner shown in the hero under the <h1>. */
  tagline: string;
  /** 2–3 sentence descriptive paragraph for the hero + meta description. */
  description: string;
  /** Accent hex — used on badges, logo tile, highlights. */
  color: string;
  /** Translucent background tint (rgba). */
  bg: string;
  /** Translucent border (rgba). */
  border: string;
  /** Mainnet chain IDs this protocol is indexed on. */
  chainIds: SupportedChainId[];
  /** Canonical public site. */
  officialUrl: string;
  /** Where users go to claim on the real protocol UI. */
  claimUrl: string;
  /** SEO keyword phrases this page targets. */
  searchKeywords: string[];
  /** 3 use-case cards specific to this protocol. */
  useCases: { title: string; body: string }[];
  /** 3 related protocol slugs for cross-linking (improves internal SEO). */
  relatedSlugs: string[];
  /** Testimonials — empty array renders a "collecting" call-out instead. */
  testimonials: Testimonial[];
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const PROTOCOLS: Record<string, ProtocolMeta> = {
  sablier: {
    slug: "sablier",
    adapterIds: ["sablier"],
    name: "Sablier",
    tagline: "Real-time streaming token vesting",
    description:
      "Sablier is the most widely-used non-custodial streaming payments protocol in crypto. DAOs, token teams and investors use it to vest tokens per-second with linear and tranched schedules. Vestream tracks every Sablier stream across Ethereum, Base, BSC and Polygon and alerts the recipient the moment a cliff or tranche unlocks.",
    color: "#f97316",
    bg:    "rgba(249,115,22,0.08)",
    border:"rgba(249,115,22,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON],
    officialUrl: "https://sablier.com",
    claimUrl:   "https://app.sablier.com/portfolio",
    searchKeywords: [
      "sablier unlock",
      "sablier vesting tracker",
      "sablier stream alerts",
      "sablier unlock notification",
    ],
    useCases: [
      { title: "Founder equity streams",    body: "Most protocol teams on Sablier vest founder and core-team tokens over 3–4 years with a 1-year cliff. Vestream pings you the moment each per-second drip crosses a meaningful claim threshold." },
      { title: "Investor cliff tranches",   body: "Seed and Series A investors typically receive LockupTranched streams. Vestream surfaces every tranche date with its exact token amount — so no cliff ever sneaks past you." },
      { title: "DAO contributor grants",    body: "DAOs that pay contributors via Sablier can point recipients at Vestream to track their own stream with push alerts. No more opening Etherscan every week." },
    ],
    relatedSlugs: ["superfluid", "hedgey", "uncx"],
    testimonials: [],
  },

  hedgey: {
    slug: "hedgey",
    adapterIds: ["hedgey"],
    name: "Hedgey",
    tagline: "NFT-based team vesting plans",
    description:
      "Hedgey represents every vesting plan as an NFT — portable, on-chain, and fully visible in any wallet. It's the default for team token distribution at dozens of mid-cap projects. Vestream indexes every Hedgey plan across Ethereum, Base, BSC and Polygon and reminds the beneficiary before each unlock.",
    color: "#7c3aed",
    bg:    "rgba(124,58,237,0.08)",
    border:"rgba(124,58,237,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON],
    officialUrl: "https://hedgey.finance",
    claimUrl:   "https://app.hedgey.finance",
    searchKeywords: [
      "hedgey unlock",
      "hedgey vesting tracker",
      "hedgey plan alerts",
      "hedgey nft vesting",
    ],
    useCases: [
      { title: "Team plan distribution",     body: "Issuers allocate hundreds of Hedgey plan NFTs to their team at TGE — Vestream gives every recipient a single dashboard for their plan, no CSV needed." },
      { title: "Private round investors",    body: "Investors holding Hedgey plan NFTs see the exact unlock schedule, next cliff, and claimable amount — not a vague 'check the contract' page." },
      { title: "Transferable vesting",       body: "Because Hedgey plans are NFTs, you can transfer or sell them. Vestream keeps tracking a plan even after it changes wallets — unlock alerts follow the current owner." },
    ],
    relatedSlugs: ["sablier", "team-finance", "uncx"],
    testimonials: [],
  },

  "team-finance": {
    slug: "team-finance",
    adapterIds: ["team-finance"],
    name: "Team Finance",
    tagline: "Team token vesting and lock proof",
    description:
      "Team Finance lets token issuers lock team and treasury tokens with transparent on-chain proof and scheduled release — the standard tool many launchpad-era projects rely on. Vestream indexes every Team Finance vesting contract across four chains so holders and the team can see the next unlock at a glance.",
    color: "#10b981",
    bg:    "rgba(16,185,129,0.08)",
    border:"rgba(16,185,129,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON],
    officialUrl: "https://www.team.finance",
    claimUrl:   "https://app.team.finance",
    searchKeywords: [
      "team finance unlock",
      "team finance vesting",
      "team.finance unlock tracker",
      "team token unlock alerts",
    ],
    useCases: [
      { title: "Team token locks",           body: "Most Team Finance schedules lock founder allocations for 12–36 months. Vestream notifies the beneficiary before each instalment releases — no manual calendar needed." },
      { title: "Investor proof-of-lock",     body: "Buyers checking whether a project's team is still time-locked can cross-reference Vestream's index against the claim URL to verify what's actually on-chain." },
      { title: "Multi-chain coverage",       body: "Teams often lock on the cheapest chain — Base or BSC — even when their token lives on Ethereum. Vestream follows the lock regardless." },
    ],
    relatedSlugs: ["uncx", "hedgey", "pinksale"],
    testimonials: [],
  },

  uncx: {
    slug: "uncx",
    adapterIds: ["uncx", "uncx-vm"],       // display-merged
    name: "UNCX",
    tagline: "Token vesting and locker suite",
    description:
      "UNCX Network (formerly UniCrypt) runs one of crypto's longest-standing token-locker and vesting suites. Projects use it to lock LP tokens and team allocations with customisable cliff-plus-cycle schedules. Vestream tracks both the classic TokenVesting and newer VestingManager contracts across four chains.",
    color: "#2563eb",
    bg:    "rgba(37,99,235,0.08)",
    border:"rgba(37,99,235,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON],
    officialUrl: "https://app.uncx.network",
    claimUrl:   "https://app.uncx.network/services/token-vesting/list",
    searchKeywords: [
      "uncx unlock",
      "uncx vesting tracker",
      "unicrypt unlock alerts",
      "uncx token vesting",
    ],
    useCases: [
      { title: "Launchpad-era team locks",   body: "Many projects that listed through UNCX still use its TokenVesting contract for their team allocation. Vestream tells the team when each cliff is due." },
      { title: "Cycle-based drips",          body: "UNCX supports complex cliff-plus-cycle release — e.g. 10% at TGE then 5% monthly for 18 months. Vestream flattens that into a clean next-unlock timestamp." },
      { title: "Side-by-side variants",      body: "We merge the classic TokenVesting and newer VestingManager contracts into one unified view so you don't need to know which variant you're on." },
    ],
    relatedSlugs: ["team-finance", "pinksale", "unvest"],
    testimonials: [],
  },

  unvest: {
    slug: "unvest",
    adapterIds: ["unvest"],
    name: "Unvest",
    tagline: "Step and milestone vesting",
    description:
      "Unvest gives token issuers fine-grained control over release schedules — step-by-step milestones, custom cliffs, and per-beneficiary plans. Common for token sales that need deliberate, event-driven release. Vestream indexes every Unvest V3 contract across Ethereum, Base, BSC and Polygon.",
    color: "#0891b2",
    bg:    "rgba(8,145,178,0.08)",
    border:"rgba(8,145,178,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON],
    officialUrl: "https://unvest.io",
    claimUrl:   "https://app.unvest.io",
    searchKeywords: [
      "unvest unlock",
      "unvest tracker",
      "unvest vesting schedule",
      "unvest milestone unlock",
    ],
    useCases: [
      { title: "Event-driven unlocks",       body: "Some Unvest schedules release on milestone events rather than linear time. Vestream tracks the step timestamps and surfaces the next scheduled release." },
      { title: "Per-beneficiary plans",      body: "Each recipient on an Unvest contract can have a different schedule — Vestream reads them individually so your view is exactly your allocation." },
      { title: "TGE + post-TGE drip",        body: "A classic split is 25% at TGE and the rest in six monthly tranches. Vestream sorts tranches chronologically and tells you when each is due." },
    ],
    relatedSlugs: ["sablier", "uncx", "hedgey"],
    testimonials: [],
  },

  superfluid: {
    slug: "superfluid",
    adapterIds: ["superfluid"],
    name: "Superfluid",
    tagline: "Continuous per-second streaming",
    description:
      "Superfluid streams tokens per second with a cliff-plus-linear VestingScheduler — the rails behind DAO payroll, real-time subscriptions, and continuous vesting at projects like Aave. Vestream indexes Superfluid's vesting scheduler across Ethereum, Base, BSC and Polygon.",
    color: "#1db954",
    bg:    "rgba(29,185,84,0.08)",
    border:"rgba(29,185,84,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON],
    officialUrl: "https://superfluid.finance",
    claimUrl:   "https://app.superfluid.finance",
    searchKeywords: [
      "superfluid unlock",
      "superfluid vesting",
      "superfluid stream tracker",
      "superfluid scheduler alerts",
    ],
    useCases: [
      { title: "DAO payroll streams",        body: "DAOs that pay contributors via continuous streams need a simple way for each contributor to see their own flow — Vestream is that view." },
      { title: "Cliff-then-linear vests",    body: "Superfluid's VestingScheduler is the only major protocol that combines an upfront cliff with a truly continuous per-second drip. Vestream displays both phases clearly." },
      { title: "Real-time value tracking",   body: "Because Superfluid pays per second, every page refresh shows a slightly higher claimable amount. Vestream's countdown matches the chain exactly." },
    ],
    relatedSlugs: ["sablier", "hedgey", "unvest"],
    testimonials: [],
  },

  pinksale: {
    slug: "pinksale",
    adapterIds: ["pinksale"],
    name: "PinkSale",
    tagline: "PinkLock V2 token locker",
    description:
      "PinkSale is the launchpad many token projects used for their initial offering — and PinkLock V2 is its on-chain token locker for team allocations and LP proofs. Vestream reads every PinkLock V2 contract directly (no subgraph) across Ethereum, Base, BSC and Polygon and lines up each TGE + cycle release in one view.",
    color: "#ec4899",
    bg:    "rgba(236,72,153,0.08)",
    border:"rgba(236,72,153,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON],
    officialUrl: "https://pinksale.finance",
    claimUrl:   "https://www.pinksale.finance/pinklock",
    searchKeywords: [
      "pinksale unlock",
      "pinklock unlock",
      "pinksale vesting",
      "pinklock v2 tracker",
    ],
    useCases: [
      { title: "Post-launch team locks",     body: "Most PinkSale launches end with the team allocation moved into PinkLock for a 6–12 month lock. Vestream tells the team when each cycle unlocks." },
      { title: "LP-lock transparency",       body: "PinkLock is commonly used for LP-token locks. Buyers verifying a project's liquidity schedule can pull live status from Vestream rather than spelunking the contract." },
      { title: "Cycle-based schedules",      body: "PinkLock V2 supports TGE% + regular cycle unlocks. Vestream flattens that into a simple 'next unlock in Xd Yh' countdown for every recipient." },
    ],
    relatedSlugs: ["uncx", "team-finance", "hedgey"],
    testimonials: [],
  },
};

/** Publicly-listed protocols in nav/footer/sitemap order (the 7 consumer-facing ones). */
export const PROTOCOL_SLUGS = [
  "sablier",
  "hedgey",
  "superfluid",
  "uncx",
  "team-finance",
  "unvest",
  "pinksale",
] as const;

export type ProtocolSlug = typeof PROTOCOL_SLUGS[number];

/** Safe lookup helper — returns undefined for unknown slugs. */
export function getProtocol(slug: string): ProtocolMeta | undefined {
  return PROTOCOLS[slug];
}

/** All protocols in display order. */
export function listProtocols(): ProtocolMeta[] {
  return PROTOCOL_SLUGS.map((s) => PROTOCOLS[s]);
}
