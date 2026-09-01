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
// intentionally omitted – it's merged into the `uncx` display entry.
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
  /** Accent hex – used on badges, logo tile, highlights. */
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
  /** Testimonials – empty array renders a "collecting" call-out instead. */
  testimonials: Testimonial[];
  /**
   * True while per-wallet stream indexing is still rolling out for this
   * protocol (e.g. a merkle-based protocol whose claim indexer hasn't shipped
   * yet). The protocol page then hides the empty cache-derived stat cells and
   * shows an honest "rolling out" note instead of the seed-scanner copy.
   */
  perWalletIndexingPending?: boolean;
  /**
   * Optional: use an external TVL source instead of computing from the
   * local cache. Set for protocols where we don't run our own seeder (e.g.
   * Streamflow → DefiLlama). When set, the /protocols card displays this
   * source's number with an attribution tag.
   *
   * `slug` accepts either a single DefiLlama slug or an array – the array
   * form is summed at fetch time. Used when DefiLlama splits a protocol
   * across multiple entries (e.g. UNCX was one entry `uncx-network`, became
   * `uncx-network-v2` + `uncx-network-v3` – sum them for the combined TVL).
   */
  externalTvl?: {
    source:    "defillama";
    slug:      string | readonly string[];
    category?: string;     // Optional filter – "vesting" for Streamflow
  };
  /**
   * If true, the protocol is hidden from public surfaces (UI cards, /protocols
   * index, search) AND skipped by the seeder + TVL snapshot cron – no
   * outbound API/RPC calls are made on its behalf. Existing cache rows are
   * left in place so re-enabling is one line + a deep-seed.
   *
   * Use sparingly – this exists for "temporarily pause an integration"
   * scenarios (e.g. upstream API outage, rebrand, legal review). Permanent
   * removal should delete the entry entirely instead.
   */
  disabled?: boolean;
  /**
   * Primary product category – drives the /protocols category-split UI
   * and the homepage messaging. "vesting" = cliff/unlock investor or
   * team-grant tokens; "stream" = continuous per-second payments
   * (payroll, contributor pay). Defaults to "vesting" when omitted so
   * existing entries don't need updating.
   *
   * If a protocol legitimately serves both (e.g. Sablier's Lockup product
   * + their separate Flow product), the secondary category will be added
   * via a future "categories" array. For now: pick the dominant one.
   */
  category?: "vesting" | "stream";
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const PROTOCOLS: Record<string, ProtocolMeta> = {
  sablier: {
    slug: "sablier",
    adapterIds: ["sablier"],
    name: "Sablier",
    tagline: "Linear & tranched token vesting",
    description:
      "Sablier is the most widely-used non-custodial streaming payments protocol in crypto. DAOs, token teams and investors use it to vest tokens per-second with linear and tranched schedules. Vestream tracks every Sablier stream across Ethereum, Base, BSC and Polygon and alerts the recipient the moment a cliff or tranche unlocks.",
    color: "#F0992E",
    bg:    "rgba(240,153,46,0.08)",
    border:"rgba(240,153,46,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.ARBITRUM, CHAIN_IDS.OPTIMISM, CHAIN_IDS.AVALANCHE],
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
      { title: "Investor cliff tranches",   body: "Seed and Series A investors typically receive LockupTranched streams. Vestream surfaces every tranche date with its exact token amount – so no cliff ever sneaks past you." },
      { title: "DAO contributor grants",    body: "DAOs that pay contributors via Sablier can point recipients at Vestream to track their own stream with push alerts. No more opening Etherscan every week." },
    ],
    relatedSlugs: ["superfluid", "hedgey", "uncx"],
    testimonials: [],
    // DefiLlama publishes per-chain `chainTvls.{Chain}-vesting` breakdowns;
    // runDefiLlamaSnapshot filters to chains we index (CHAIN_NAME_TO_ID in
    // tvl-snapshot.ts) and sums. Apples-to-apples with our self-indexed
    // protocols, but using DefiLlama's curated pricing – orders of
    // magnitude more accurate than DexScreener-only at the per-token level.
    externalTvl: { source: "defillama", slug: "sablier-lockup" },
  },

  // Sablier Flow – distinct product from Sablier Lockup. Per-second
  // streaming for payroll / contributor pay. Same Envio indexer, different
  // entity (FlowStream vs LockupStream). Worker-pivot's second stream
  // protocol after LlamaPay; widest chain coverage of any stream protocol
  // we index (24 chains supported by Sablier; we currently surface 6).
  "sablier-flow": {
    slug: "sablier-flow",
    adapterIds: ["sablier-flow"],
    name: "Sablier Flow",
    tagline: "Per-second streaming for crypto payroll",
    category: "stream",
    description:
      "Sablier Flow is the streaming-payments product from Sablier – distinct from Sablier Lockup (vesting). Used for DAO contributor pay, real-time payroll, grant streams, and any continuous on-chain transfer of value. Vestream gives every recipient a personal dashboard with their accrued-but-unclaimed balance, claim alerts, and tax-ready income exports – across six EVM chains.",
    // Sablier-orange shifted slightly cooler to distinguish Flow from Lockup
    // visually when both cards sit side-by-side on /protocols.
    color: "#E07B1A",
    bg:    "rgba(224,123,26,0.08)",
    border:"rgba(224,123,26,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.BASE, CHAIN_IDS.ARBITRUM, CHAIN_IDS.OPTIMISM],
    officialUrl: "https://sablier.com",
    claimUrl:   "https://app.sablier.com/portfolio",
    searchKeywords: [
      "sablier flow tracker",
      "sablier payroll alerts",
      "sablier streaming payments",
      "crypto payroll dashboard",
    ],
    useCases: [
      { title: "DAO contributor pay",       body: "DAOs paying contributors via Sablier Flow can point recipients at Vestream to see their own stream – accrued balance, runway, and claim alerts in one view." },
      { title: "Real-time crypto payroll",  body: "Companies paying remote teams in stablecoins use Flow to drip salaries per second. Vestream's tax-export tooling treats each stream as ordinary income at FMV-on-receipt – payslip-ready CSV." },
      { title: "Grant-programme streams",   body: "Grant DAOs use Flow to release funding linearly across the grant period. Vestream tracks accrued-but-unclaimed balance across every grant you receive in one dashboard." },
    ],
    relatedSlugs: ["llamapay", "sablier", "superfluid"],
    testimonials: [],
    // No DefiLlama vesting slice for Flow specifically – Sablier's DefiLlama
    // entry rolls Lockup + Flow into one number. We'll compute Flow TVL
    // ourselves via tvl-walker once volumes are meaningful.
  },

  hedgey: {
    slug: "hedgey",
    adapterIds: ["hedgey"],
    name: "Hedgey",
    tagline: "NFT-based team vesting plans",
    description:
      "Hedgey represents every vesting plan as an NFT – portable, on-chain, and fully visible in any wallet. It's the default for team token distribution at dozens of mid-cap projects. Vestream indexes every Hedgey plan across Ethereum, Base, BSC, Polygon and Arbitrum and reminds the beneficiary before each unlock.",
    color: "#33406B",
    bg:    "rgba(51,64,107,0.08)",
    border:"rgba(51,64,107,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.ARBITRUM, CHAIN_IDS.OPTIMISM, CHAIN_IDS.AVALANCHE],
    officialUrl: "https://hedgey.finance",
    claimUrl:   "https://app.hedgey.finance",
    searchKeywords: [
      "hedgey unlock",
      "hedgey vesting tracker",
      "hedgey plan alerts",
      "hedgey nft vesting",
    ],
    useCases: [
      { title: "Team plan distribution",     body: "Issuers allocate hundreds of Hedgey plan NFTs to their team at TGE – Vestream gives every recipient a single dashboard for their plan, no CSV needed." },
      { title: "Private round investors",    body: "Investors holding Hedgey plan NFTs see the exact unlock schedule, next cliff, and claimable amount – not a vague 'check the contract' page." },
      { title: "Transferable vesting",       body: "Because Hedgey plans are NFTs, you can transfer or sell them. Vestream keeps tracking a plan even after it changes wallets – unlock alerts follow the current owner." },
    ],
    relatedSlugs: ["sablier", "uncx"],
    testimonials: [],
    // DefiLlama per-chain breakdown; chain-filtered to our 6 supported
    // chains. Self-indexed walker (tvl-walker/hedgey.ts) is kept as a
    // fallback path but DefiLlama is preferred while it gives more
    // accurate pricing per-token than our DexScreener-first pipeline.
    externalTvl: { source: "defillama", slug: "hedgey" },
  },

  "team-finance": {
    slug: "team-finance",
    adapterIds: ["team-finance"],
    name: "Team Finance",
    tagline: "Team token vesting and lock proof",
    description:
      "Team Finance lets token issuers lock team and treasury tokens with transparent on-chain proof and scheduled release – the standard tool many launchpad-era projects rely on. Vestream indexes every Team Finance vesting contract across each chain it's deployed on so holders and the team can see the next unlock at a glance.",
    color: "#2563EB",
    bg:    "rgba(37,99,235,0.08)",
    border:"rgba(45,179,106,0.22)",
    // Base dropped 2026-07-06: Team Finance's Squid subgraph (our discovery +
    // TVL source) indexes ZERO Base vestings, and the claims Squid has no Base
    // either, so we can't get correct withdrawn amounts even via the per-wallet
    // REST fallback. Rather than show incomplete/incorrect Base data (or a
    // permanent "$0 on Base"), we don't claim Base coverage. Re-add if/when TF
    // indexes Base upstream.
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.AVALANCHE],
    officialUrl: "https://www.team.finance",
    claimUrl:   "https://app.team.finance",
    searchKeywords: [
      "team finance unlock",
      "team finance vesting",
      "team.finance unlock tracker",
      "team token unlock alerts",
    ],
    useCases: [
      { title: "Team token locks",           body: "Most Team Finance schedules lock founder allocations for 12–36 months. Vestream notifies the beneficiary before each instalment releases – no manual calendar needed." },
      { title: "Investor proof-of-lock",     body: "Buyers checking whether a project's team is still time-locked can cross-reference Vestream's index against the claim URL to verify what's actually on-chain." },
      { title: "Multi-chain coverage",       body: "Teams often lock on the cheapest chain – Base or BSC – even when their token lives on Ethereum. Vestream follows the lock regardless." },
    ],
    relatedSlugs: ["uncx", "hedgey", "pinksale"],
    testimonials: [],
    // No externalTvl: DefiLlama's `team-finance` slug is Token Locker category
    // – it includes LP locks and general token locks. We compute the
    // vesting-specific slice ourselves via tvl-walker/team-finance.ts walking
    // the Squid `vestingFactoryVestings` entity.
    //
    // Re-enabled 2026-06-29 – permission to go live granted. Paused May 1 2026;
    // the Squid GraphQL source, adapter, TVL walker and claim-ingestor were all
    // kept intact, so re-enabling is this flag flip + a deep-seed to repopulate
    // the purged cache + TVL rows.
    disabled: false,
  },

  uncx: {
    slug: "uncx",
    adapterIds: ["uncx", "uncx-vm"],       // display-merged
    name: "UNCX",
    tagline: "Token vesting and locker suite",
    description:
      "UNCX Network (formerly UniCrypt) runs one of crypto's longest-standing token-locker and vesting suites. Projects use it to lock LP tokens and team allocations with customisable cliff-plus-cycle schedules. Vestream tracks both the classic TokenVesting and newer VestingManager contracts across Ethereum, Base, and BNB Chain.",
    color: "#22C55E",
    bg:    "rgba(34,197,94,0.08)",
    border:"rgba(34,197,94,0.22)",
    // Polygon dropped May 5 2026 – UNCX's Polygon subgraph
    // (Ln3stVsr8YYQ7YDQf3LhMV4gUaBQWbis5db5hzHgkMD) was deprecated by The
    // Graph network and no replacement has been published. UNCX still
    // deploys on Polygon, we just have no data source. Re-add when a
    // working subgraph URL is available – see the comment in
    // src/lib/vesting/adapters/uncx.ts SUBGRAPH_IDS map.
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC],
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
      { title: "Cycle-based drips",          body: "UNCX supports complex cliff-plus-cycle release – e.g. 10% at TGE then 5% monthly for 18 months. Vestream flattens that into a clean next-unlock timestamp." },
      { title: "Side-by-side variants",      body: "We merge the classic TokenVesting and newer VestingManager contracts into one unified view so you don't need to know which variant you're on." },
    ],
    relatedSlugs: ["pinksale", "unvest"],
    testimonials: [],
    // No externalTvl: DefiLlama's `uncx-network-v2` + `-v3` entries are
    // Token Locker category – includes LP locks (the majority of UNCX's TVL
    // is actually LP-locked, not vesting). We compute the vesting-only
    // slice ourselves via tvl-walker/uncx.ts (TokenVesting V3 subgraph) +
    // tvl-walker/uncx-vm.ts (VestingManager contract events).
  },

  unvest: {
    slug: "unvest",
    adapterIds: ["unvest"],
    name: "Unvest",
    tagline: "Step and milestone vesting",
    description:
      "Unvest gives token issuers fine-grained control over release schedules – step-by-step milestones, custom cliffs, and per-beneficiary plans. Common for token sales that need deliberate, event-driven release. Vestream indexes every Unvest V3 contract across Ethereum, Base, BSC, Polygon, Arbitrum, and Optimism.",
    color: "#2563EB",
    bg:    "rgba(37,99,235,0.08)",
    border:"rgba(37,99,235,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.ARBITRUM, CHAIN_IDS.OPTIMISM],
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
      { title: "Per-beneficiary plans",      body: "Each recipient on an Unvest contract can have a different schedule – Vestream reads them individually so your view is exactly your allocation." },
      { title: "TGE + post-TGE drip",        body: "A classic split is 25% at TGE and the rest in six monthly tranches. Vestream sorts tranches chronologically and tells you when each is due." },
    ],
    relatedSlugs: ["sablier", "uncx", "hedgey"],
    testimonials: [],
  },

  superfluid: {
    slug: "superfluid",
    adapterIds: ["superfluid"],
    name: "Superfluid",
    tagline: "Cliff + continuous per-second streaming",
    description:
      "Superfluid streams tokens per second with a cliff-plus-linear VestingScheduler – the rails behind DAO payroll, real-time subscriptions, and continuous vesting at projects like Aave. Each schedule has a discrete start (often a cliff lump) and an end date – the milestones in the upcoming queue – with per-second streaming in between. Vestream indexes Superfluid's vesting scheduler across Ethereum, Base, BSC, Polygon, Arbitrum and Optimism.",
    color: "#16B364",
    bg:    "rgba(22,179,100,0.08)",
    border:"rgba(22,179,100,0.22)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.ARBITRUM, CHAIN_IDS.OPTIMISM],
    officialUrl: "https://superfluid.finance",
    claimUrl:   "https://app.superfluid.finance",
    searchKeywords: [
      "superfluid unlock",
      "superfluid vesting",
      "superfluid stream tracker",
      "superfluid scheduler alerts",
    ],
    useCases: [
      { title: "DAO payroll streams",        body: "DAOs that pay contributors via continuous streams need a simple way for each contributor to see their own flow – Vestream is that view." },
      { title: "Cliff-then-linear vests",    body: "Superfluid's VestingScheduler is the only major protocol that combines an upfront cliff with a truly continuous per-second drip. Vestream displays both phases clearly." },
      { title: "Real-time value tracking",   body: "Because Superfluid pays per second, every page refresh shows a slightly higher claimable amount. Vestream's countdown matches the chain exactly." },
    ],
    relatedSlugs: ["sablier", "hedgey", "unvest"],
    testimonials: [],
    // No externalTvl: DefiLlama's `superfluid` entry is Payments category
    // and its ~$5M total is dominated by streaming + subscriptions, not
    // vesting. We compute the vesting-only slice ourselves via
    // tvl-walker/superfluid.ts walking the VestingScheduler subgraph.
  },

  pinksale: {
    slug: "pinksale",
    adapterIds: ["pinksale"],
    name: "PinkSale",
    tagline: "PinkLock token locker",
    // CONTRACT ADDRESSES: see PINKSALE_CONTRACT_ADDRESSES export at the
    // bottom of this file. Three downstream consumers (walker, adapter,
    // claims-ingestor) all import that single map. See its docstring
    // for the V1/V2 history and audit trail.
    description:
      "PinkSale is the launchpad many token projects used for their initial offering – and PinkLock is its on-chain token locker for team allocations and LP proofs. Vestream reads every PinkLock contract directly (no subgraph) across Ethereum, Base, BSC and Polygon and lines up each TGE + cycle release in one view.",
    color: "#F23E8C",
    bg:    "rgba(242,62,140,0.08)",
    border:"rgba(242,62,140,0.22)",
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
      { title: "Cycle-based schedules",      body: "PinkLock supports TGE% + regular cycle unlocks. Vestream flattens that into a simple 'next unlock in Xd Yh' countdown for every recipient." },
    ],
    relatedSlugs: ["uncx", "hedgey"],
    testimonials: [],
    // No externalTvl: DefiLlama's `pinksale` entry is Launchpad category and
    // its ~$157M includes active sales + LP locks on top of PinkLock V2's
    // vesting. We compute the vesting-only slice ourselves via
    // tvl-walker/pinksale.ts (LockAdded event scan → normalLocksForUser
    // contract multicall).
  },

  streamflow: {
    slug: "streamflow",
    adapterIds: ["streamflow"],
    name: "Streamflow",
    tagline: "Solana's #1 vesting protocol",
    description:
      "Streamflow is the dominant token-vesting protocol on Solana – the go-to rail for SPL token launches, team vesting and investor unlocks. Vestream indexes Streamflow alongside the EVM ecosystem so cross-chain holders see every unlock – Ethereum, BSC, Polygon, Base and Solana – in one dashboard.",
    color: "#2F54EB",         // Streamflow blue
    bg:    "rgba(47,84,235,0.08)",
    border:"rgba(47,84,235,0.24)",
    chainIds: [CHAIN_IDS.SOLANA],
    officialUrl: "https://streamflow.finance",
    claimUrl:   "https://app.streamflow.finance/vesting",
    searchKeywords: [
      "streamflow unlock",
      "streamflow vesting",
      "solana vesting tracker",
      "spl token unlock",
      "streamflow tracker",
    ],
    useCases: [
      { title: "Solana token launches",     body: "Streamflow is the default vesting rail for new Solana projects. Team, investor and advisor allocations almost always pass through it – and Vestream surfaces every unlock date the moment the stream is created." },
      { title: "Cross-ecosystem holders",   body: "Many active traders hold both EVM and Solana positions. Vestream is the first tracker that puts Streamflow unlocks next to Sablier and Hedgey in one view – no per-chain app switching." },
      { title: "SPL payroll + grants",      body: "Solana-native teams using Streamflow for recurring SPL token payments get the same unlock calendar, push alerts and claim reminders as their EVM-paid counterparts." },
    ],
    relatedSlugs: ["sablier", "hedgey", "superfluid"],
    testimonials: [],
    externalTvl: {
      source:   "defillama",
      slug:     "streamflow",
      category: "vesting",   // excludes DefiLlama's "Payments" TVL (~$500k)
                             // which is a different Streamflow product
    },
  },

  llamapay: {
    slug: "llamapay",
    adapterIds: ["llamapay"],
    name: "LlamaPay",
    tagline: "Per-second token streaming for crypto payroll",
    category: "stream",
    description:
      "LlamaPay is the leading per-second token streaming protocol – pay or get paid in real time, claim anytime. Used by DAO contributors, remote contractors, grant programmes, and crypto-native payroll. Vestream tracks every stream you receive on Ethereum and Optimism, with accrued-balance updates and tax-ready income exports.",
    // Llama brown – distinctive from the existing palette (no other entry
    // sits in warm neutral). Matches the protocol's literal name + branding.
    color: "#1FBE9A",
    bg:    "rgba(31,190,154,0.08)",
    border:"rgba(31,190,154,0.22)",
    // BSC/Polygon/Arbitrum/Base dropped May 5 2026 – LlamaPay subgraphs on
    // those chains have lost their indexer allocations on The Graph
    // network ("subgraph not found: no allocations" / "bad indexers"
    // errors). LlamaPay still deploys on those chains; we just can't
    // index them right now. TVL on those chains was ~$5M combined
    // (per DefiLlama). Re-add when LlamaPay redeploys their subgraphs
    // OR we build an on-chain factory adapter – see comments in
    // src/lib/vesting/adapters/llamapay.ts SUBGRAPH_IDS for the full
    // verification log.
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.OPTIMISM, CHAIN_IDS.AVALANCHE],
    officialUrl: "https://llamapay.io",
    claimUrl:   "https://llamapay.io/withdraw",
    searchKeywords: [
      "llamapay unlock",
      "llamapay vesting tracker",
      "llamapay payroll",
      "llamapay stream tracker",
    ],
    useCases: [
      { title: "Crypto-native payroll",     body: "LlamaPay is the default rail for paying remote contractors and DAO contributors in stablecoins. Vestream gives every recipient their own dashboard – see accrued balance, set claim alerts, export year-end income for tax." },
      { title: "DAO contributor pay",       body: "DAOs that pay core contributors via per-second streams need a recipient-side view. Vestream surfaces the live stream rate, projected monthly income, and a payslip-ready CSV per payer." },
      { title: "Grant-programme streams",   body: "Grant DAOs use LlamaPay to release funding linearly to recipients over a vesting period. Vestream tracks accrued-but-unclaimed balance across every grant you receive in one place." },
    ],
    relatedSlugs: ["superfluid", "sablier", "hedgey"],
    testimonials: [],
    // DefiLlama per-chain breakdown; chain-filtered to our 6 supported
    // chains. Self-indexed walker (tvl-walker/llamapay.ts) is kept as a
    // fallback path; DefiLlama wins for now because its numbers reflect
    // the full deposited-balance-per-stream rather than just the streamed
    // slice the walker computes.
    externalTvl: { source: "defillama", slug: "llamapay" },
  },

  "jupiter-lock": {
    slug: "jupiter-lock",
    adapterIds: ["jupiter-lock"],
    name: "Jupiter Lock",
    tagline: "Time-released token vesting on Solana",
    description:
      "Jupiter Lock is the default token-vesting rail in the Jupiter ecosystem – used by JUP's own team-and-investor allocations and the majority of Solana launchpad deals since late 2024. Vestream reads every active VestingEscrow directly from the program so recipients see their cliff, periodic drip, and claimable amount in one view – no need to open the Jupiter UI.",
    color: "#14B8A6",        // Jupiter teal
    bg:    "rgba(20,184,166,0.08)",
    border:"rgba(20,184,166,0.26)",
    chainIds: [CHAIN_IDS.SOLANA],
    officialUrl: "https://lock.jup.ag",
    claimUrl:   "https://lock.jup.ag",
    searchKeywords: [
      "jupiter lock unlock",
      "jupiter lock vesting",
      "jup lock tracker",
      "solana vesting escrow",
    ],
    useCases: [
      { title: "Solana token launches",     body: "Almost every new Solana project vests team and investor tokens via Jupiter Lock since late 2024. Vestream surfaces every unlock date the moment the escrow is created on-chain." },
      { title: "Cliff + periodic drip",     body: "Jupiter Lock uses a clean cliff-then-periodic-release model: cliff_unlock_amount at cliff_time, then amount_per_period every frequency seconds. Vestream flattens that into a per-step timeline with live countdown." },
      { title: "Second Solana protocol",    body: "Vestream now indexes two Solana rails – Streamflow and Jupiter Lock – so holders get full coverage whether they received tokens via streaming vesting or traditional lock escrows." },
    ],
    relatedSlugs: ["streamflow", "sablier", "hedgey"],
    testimonials: [],
    // Jupiter Lock is not listed on DefiLlama as a standalone protocol (it
    // underlies JUP's own locked allocations which DefiLlama credits to JUP
    // Station). Our computed TVL from cache-read is the primary source here;
    // will switch to a DefiLlama entry if one appears later.
  },

  hoodlock: {
    slug: "hoodlock",
    adapterIds: ["hoodlock"],
    name: "HoodLock",
    tagline: "Token locker on Robinhood Chain",
    // CONTRACT: RobinhoodLocker, verified on Blockscout — see
    // HOODLOCK_CONTRACTS in src/lib/vesting/adapters/hoodlock.ts. Three
    // consumers (adapter, TVL walker, event indexer + claim ingestor) all
    // import that single map + ABI.
    description:
      "HoodLock is the token & liquidity locker on Robinhood Chain, projects lock a token amount until a chosen date, then withdraw it in full once it unlocks. Vestream reads the verified locker contract directly (no subgraph) and lines up every lock's unlock date and status in one view. Vestream is the first vesting tracker to cover Robinhood Chain.",
    color: "#00C805",
    bg:    "rgba(0,200,5,0.08)",
    border:"rgba(0,200,5,0.22)",
    chainIds: [CHAIN_IDS.ROBINHOOD],
    officialUrl: "https://hoodlock.tech",
    claimUrl:   "https://hoodlock.tech/app",
    searchKeywords: [
      "robinhood chain vesting",
      "robinhood chain token unlock",
      "hoodlock unlock",
      "hoodlock vesting tracker",
      "robinhood chain token lock",
    ],
    useCases: [
      { title: "Team & treasury locks",     body: "Projects launching on Robinhood Chain lock team supply or treasury tokens until a set date. Vestream shows each lock's unlock countdown and current status." },
      { title: "Liquidity-lock proof",      body: "HoodLock is used to lock LP or project tokens as an on-chain trust signal. Buyers can verify the schedule live on Vestream instead of reading the contract by hand." },
      { title: "First-mover chain coverage", body: "Vestream is the first vesting tracker to index Robinhood Chain, every HoodLock lock is searchable by wallet or token the moment it's created." },
    ],
    relatedSlugs: ["pinksale", "uncx", "team-finance"],
    testimonials: [],
    category: "vesting",
    // No externalTvl: DefiLlama has no Robinhood Chain / HoodLock entry. We
    // self-index the vesting-locked slice via tvl-walker/hoodlock.ts (enumerate
    // nextLockId → getLock), priced through the standard pipeline. DexScreener
    // covers Robinhood Chain (slug "robinhood", wired into DS_CHAIN_SLUG in
    // quick-prices.ts + tvl.ts), so chain-4663 tokens price normally.
    disabled: false,
  },

  magna: {
    slug: "magna",
    adapterIds: ["magna"],
    name: "Magna",
    tagline: "Enterprise token vesting & distribution",
    // CONTRACTS: published Airlock factory addresses (docs.magna.so → Magna
    // Contract Deployments), verified live on-chain 2026-08-31. V2.1 factory
    // = MerkleFactoryV2 (verified source on Blockscout); children are
    // MerkleVester escrow contracts. See tvl-walker/magna.ts for the full
    // discovery + escrow-balance methodology, and tvl-walker/magna-seed.ts
    // for the explorer backfill of every existing vester.
    description:
      "Magna is the enterprise token-distribution platform behind vesting, unlocks and claim portals for major projects across Solana, Ethereum, and every large EVM chain. Distributions run through on-chain escrow contracts deployed from Magna's Airlock factories. Vestream indexes those factories directly, so you can see the value still locked in Magna vesting escrows per chain and per token, live.",
    // Magna's brand mark is pink (#F88CE5 sampled from their webclip icon);
    // accent darkened slightly for text-on-white legibility.
    color: "#E05FCB",
    bg:    "rgba(248,140,229,0.10)",
    border:"rgba(248,140,229,0.28)",
    chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.BASE, CHAIN_IDS.ARBITRUM, CHAIN_IDS.OPTIMISM, CHAIN_IDS.AVALANCHE],
    officialUrl: "https://www.magna.so",
    claimUrl:   "https://app.magna.so",
    searchKeywords: [
      "magna vesting",
      "magna token unlock",
      "magna airlock",
      "magna claim portal",
      "magna vesting tracker",
    ],
    useCases: [
      { title: "Investor & team unlocks",  body: "Projects run investor and employee vesting through Magna's escrow contracts. Vestream shows the value still locked per token, per chain, straight from the contracts." },
      { title: "TGE distributions",        body: "Magna powers claim portals for large token generation events. Vestream tracks the escrowed supply as it unlocks and gets claimed down." },
      { title: "Cross-chain coverage",     body: "Magna deploys the same factory system on every major EVM chain. Vestream indexes all of them, one view of Magna vesting across 7 chains." },
    ],
    relatedSlugs: ["team-finance", "sablier", "streamflow"],
    testimonials: [],
    category: "vesting",
    // Per-wallet stream indexing ships with the Phase 2 claim indexer — until
    // then the cache-derived stat strip has nothing to show for Magna.
    perWalletIndexingPending: true,
    // No externalTvl: DefiLlama has no Magna entry. Self-indexed via
    // tvl-walker/magna.ts — factory event scan → vester escrow balances —
    // priced through the standard pipeline (contract-reads-v1). NOTE: Magna
    // is merkle-based, so per-recipient allocations are off-chain; escrow
    // balances (locked + claimable-unclaimed) are the honest on-chain TVL.
    disabled: false,
  },
};

/** Publicly-listed protocols in nav/footer/sitemap order. */
export const PROTOCOL_SLUGS = [
  "sablier",
  "hedgey",
  "superfluid",
  "uncx",
  "team-finance",
  "unvest",
  "pinksale",
  "streamflow",
  "jupiter-lock",
  "llamapay",
  "hoodlock",
  "magna",
] as const;

export type ProtocolSlug = typeof PROTOCOL_SLUGS[number];

/** Safe lookup helper – returns undefined for unknown slugs. */
export function getProtocol(slug: string): ProtocolMeta | undefined {
  return PROTOCOLS[slug];
}

// ── Official & community links ───────────────────────────────────────────────
// Curated outbound links per protocol, rendered as an "Official & community"
// card on /protocols/[slug] and emitted as schema.org `sameAs` (entity markup
// → better Google entity association + LLM citability). `officialUrl` already
// lives on ProtocolMeta; these are the socials/docs.
//
// ⚠️ ACCURACY MATTERS — a wrong link in crypto reads as a scam. Vet every URL
// here before shipping. Keyed by slug; only set fields you're confident are the
// protocol's OFFICIAL channel. Omit anything uncertain rather than guess.
export interface ProtocolLinks {
  twitter?:  string;   // X / Twitter
  discord?:  string;
  telegram?: string;
  github?:   string;
  docs?:     string;
}

export const PROTOCOL_LINKS: Record<string, ProtocolLinks> = {
  sablier: {
    twitter: "https://x.com/Sablier",
    github:  "https://github.com/sablier-labs",
    docs:    "https://docs.sablier.com",
  },
  "sablier-flow": {
    twitter: "https://x.com/Sablier",
    github:  "https://github.com/sablier-labs",
    docs:    "https://docs.sablier.com",
  },
  hedgey: {
    twitter: "https://x.com/hedgeyfinance",
    github:  "https://github.com/hedgey-finance",
    docs:    "https://docs.hedgey.finance",
  },
  "team-finance": {
    twitter: "https://x.com/TeamFinance_",
    docs:    "https://docs.team.finance",
  },
  uncx: {
    twitter: "https://x.com/UNCX_token",
    docs:    "https://docs.uncx.network",
  },
  unvest: {
    twitter: "https://x.com/unvest_io",
    docs:    "https://docs.unvest.io",
  },
  superfluid: {
    twitter: "https://x.com/Superfluid_HQ",
    github:  "https://github.com/superfluid-finance",
    docs:    "https://docs.superfluid.finance",
  },
  pinksale: {
    twitter: "https://x.com/pinkecosystem",
    docs:    "https://docs.pinksale.finance",
  },
  streamflow: {
    twitter: "https://x.com/streamflow_fi",
    github:  "https://github.com/streamflow-finance",
    docs:    "https://docs.streamflow.finance",
  },
  llamapay: {
    twitter: "https://x.com/llamapay_io",
    github:  "https://github.com/LlamaPay",
    docs:    "https://docs.llamapay.io",
  },
  "jupiter-lock": {
    twitter: "https://x.com/JupiterExchange",
    github:  "https://github.com/jup-ag",
    docs:    "https://dev.jup.ag",
  },
  hoodlock: {
    twitter: "https://x.com/HoodLockRH",
    docs:    "https://hoodlock.tech/docs",
  },
  magna: {
    docs: "https://docs.magna.so",
  },
};

export function protocolLinks(slug: string): ProtocolLinks {
  return PROTOCOL_LINKS[slug] ?? {};
}

// ── Single source of truth for protocol brand colours ───────────────────────
// Derived from PROTOCOLS so changing a ProtocolMeta `color`/`bg`/`border`
// updates EVERY surface (homepage strip, tickers, find-vestings, dashboard,
// tag editor). Before this, ~10 files each hardcoded their own palette and
// drifted out of sync. Keyed by slug; `uncx-vm` aliases `uncx`.
export interface ProtocolBrand { color: string; bg: string; border: string; name: string }

export const PROTOCOL_BRAND: Record<string, ProtocolBrand> = (() => {
  const m: Record<string, ProtocolBrand> = {};
  for (const p of Object.values(PROTOCOLS)) {
    m[p.slug] = { color: p.color, bg: p.bg, border: p.border, name: p.name };
  }
  if (m["uncx"]) m["uncx-vm"] = m["uncx"]; // VM variant shares UNCX's brand
  return m;
})();

const PROTOCOL_BRAND_FALLBACK: ProtocolBrand = {
  color: "#64748b", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.20)", name: "",
};

/** Brand colours for a protocol slug. Falls back to a neutral slate (with the
 *  raw slug as name) for unknown protocols so callers never crash. */
export function protocolBrand(slug: string): ProtocolBrand {
  return PROTOCOL_BRAND[slug] ?? { ...PROTOCOL_BRAND_FALLBACK, name: slug };
}

// ── Protocol "chip" shape ────────────────────────────────────────────────────
// The dashboard / discover surfaces consume a `{ text, bg, border }` pill shape
// rather than `{ color, … }`. This adapter + the prebuilt map let those files
// drop their hardcoded palettes and read from the single source above.
export interface ProtocolChip { text: string; bg: string; border: string }

export function protocolChip(slug: string): ProtocolChip {
  const b = protocolBrand(slug);
  return { text: b.color, bg: b.bg, border: b.border };
}

/** Prebuilt chip map for every known slug (incl. the `uncx-vm` alias). Callers
 *  still `?? fallback` for unknowns, so missing keys are safe. */
export const PROTOCOL_CHIPS: Record<string, ProtocolChip> =
  Object.fromEntries(Object.keys(PROTOCOL_BRAND).map((s) => [s, protocolChip(s)]));

// ── Protocol logo icons ──────────────────────────────────────────────────────
// Normalised square marks live at /public/protocols/icons/<slug>.png. Filenames
// match the protocol slug exactly. Hedgey has no mark – it (and any future
// icon-less protocol) falls back to a colour-tinted monogram at the call site,
// matching how the homepage "Available on" strip renders it.
const SLUGS_WITH_ICON = new Set([
  "sablier", "superfluid", "uncx", "team-finance", "unvest",
  "pinksale", "streamflow", "jupiter-lock", "llamapay", "hoodlock",
  "magna",
]);

// Variant adapters that share a parent brand's mark — no separate asset needed.
// sablier-flow is Sablier's streaming product; uncx-vm is UNCX's VestingManager
// (hidden in UI, merged with uncx). Without this alias both fell back to a bare
// monogram on the hero + OG share cards.
const ICON_ALIASES: Record<string, string> = {
  "sablier-flow": "sablier",
  "uncx-vm":      "uncx",
};

/** Path to a protocol's logo icon, or null when there's no mark (→ monogram). */
export function protocolIcon(slug: string): string | null {
  const resolved = ICON_ALIASES[slug] ?? slug;
  return SLUGS_WITH_ICON.has(resolved) ? `/protocols/icons/${resolved}.png` : null;
}

// ── Single source of truth for chain brand colours ──────────────────────────
// Mirrors PROTOCOL_BRAND. Colours are the homepage "Available on" set (go-live,
// brand-accurate). bg/border are derived alpha tints so callers get a full pill
// without redefining opacities. Keyed by SupportedChainId.
export interface ChainBrand { color: string; bg: string; border: string; name: string }

const CHAIN_BASE: Record<number, { color: string; name: string }> = {
  1:        { color: "#627EEA", name: "Ethereum" },
  56:       { color: "#F0B90B", name: "BNB Chain" },
  137:      { color: "#8247E5", name: "Polygon" },
  8453:     { color: "#0052FF", name: "Base" },
  42161:    { color: "#12AAFF", name: "Arbitrum" },
  10:       { color: "#FF0420", name: "Optimism" },
  43114:    { color: "#E84142", name: "Avalanche" },
  4663:     { color: "#5B8C00", name: "Robinhood Chain" },
  101:      { color: "#9945FF", name: "Solana" },
  11155111: { color: "#B8BABD", name: "Sepolia" },
  84532:    { color: "#9AA0A6", name: "Base Sepolia" },
};

const CHAIN_BRAND_FALLBACK: ChainBrand = {
  color: "#64748b", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.20)", name: "",
};

/** Brand colours for a chain id. `bg`/`border` are 8%/20% alpha tints of the
 *  brand colour. Falls back to neutral slate for unknown chains. */
export function chainBrand(chainId: number): ChainBrand {
  const b = CHAIN_BASE[chainId];
  if (!b) return { ...CHAIN_BRAND_FALLBACK, name: String(chainId) };
  return { color: b.color, bg: `${b.color}14`, border: `${b.color}33`, name: b.name };
}

// ── Chain logo icons ─────────────────────────────────────────────────────────
// Official chain marks live at /public/chains/icons/<file>.png. Mainnets only –
// testnets (Sepolia / Base Sepolia) have no mark and return null (skipped in UI).
const CHAIN_ICON_FILE: Record<number, string> = {
  1:     "ethereum",
  56:    "bnb",
  137:   "polygon",
  8453:  "base",
  42161: "arbitrum",
  10:    "optimism",
  43114: "avalanche",
  4663:  "robinhood",
  101:   "solana",
};

/** Path to a chain's logo icon, or null for unknown / testnet chains. */
export function chainIcon(chainId: number): string | null {
  const f = CHAIN_ICON_FILE[chainId];
  return f ? `/chains/icons/${f}.png` : null;
}

// ── Chain URL slugs ──────────────────────────────────────────────────────────
// Powers the per-chain pages at /chains/<slug>. Mainnets only; testnets have no
// public page. Keep in sync with CHAIN_ICON_FILE + CHAIN_BASE.
const CHAIN_SLUG: Record<number, string> = {
  1:     "ethereum",
  56:    "bnb-chain",
  137:   "polygon",
  8453:  "base",
  42161: "arbitrum",
  10:    "optimism",
  43114: "avalanche",
  4663:  "robinhood-chain",
  101:   "solana",
};
const SLUG_TO_CHAIN: Record<string, number> =
  Object.fromEntries(Object.entries(CHAIN_SLUG).map(([id, slug]) => [slug, Number(id)]));

/** URL slug for a chain id (e.g. 4663 → "robinhood-chain"), or null if none. */
export function chainSlug(chainId: number): string | null {
  return CHAIN_SLUG[chainId] ?? null;
}
/** Resolve a chain slug back to its chain id (e.g. "robinhood-chain" → 4663). */
export function chainIdFromSlug(slug: string): number | undefined {
  return SLUG_TO_CHAIN[slug];
}
/** All public (mainnet) chain ids that have a /chains/<slug> page. */
export function publicChainIds(): number[] {
  return Object.keys(CHAIN_SLUG).map(Number);
}

/**
 * All protocols in display order.
 *
 * By default, protocols flagged `disabled: true` are filtered out – this is
 * what every public surface (UI cards, /protocols index, search, sitemap)
 * should call. Pass `{ includeDisabled: true }` for admin / diagnostic
 * surfaces that need the full registry (e.g. an internal "all protocols
 * including paused" view).
 */
export function listProtocols(opts: { includeDisabled?: boolean } = {}): ProtocolMeta[] {
  const all = PROTOCOL_SLUGS.map((s) => PROTOCOLS[s]);
  return opts.includeDisabled ? all : all.filter((p) => !p.disabled);
}

// ── Derived marketing counts ────────────────────────────────────────────────
// Marketing copy across the site quotes "N+ protocols" / "N+ chains". Those
// were hardcoded and repeatedly went stale as integrations shipped (they read
// "11+" while 12 protocols were live). Import these instead of typing a
// number, and the copy tracks the registry automatically.
//
// Both are floors ("12+"), so they stay honest even if a surface renders
// slightly ahead of a deploy.
export const PUBLIC_PROTOCOL_COUNT = listProtocols().length;
export const PUBLIC_CHAIN_COUNT    = publicChainIds().length;

// ── Derived filter options (chain / protocol pickers) ───────────────────────
// The wallet-settings and Discover filter UIs each carried their own literal
// option arrays. They drifted badly: both were missing Arbitrum, Optimism and
// Avalanche, plus LlamaPay, Team Finance, Streamflow, Jupiter Lock and Magna —
// so users literally could not scope a wallet to those chains or protocols.
// Deriving them from the registry makes that class of bug impossible.

/** Short ticker for a chain, e.g. 1 → "ETH". Falls back to the brand name. */
const CHAIN_SHORT: Record<number, string> = {
  1: "ETH", 56: "BSC", 137: "MATIC", 8453: "Base", 42161: "ARB",
  10: "OP", 43114: "AVAX", 4663: "RH", 101: "SOL",
};

/** Display order for chain pickers (roughly by vesting TVL, Solana last of the
 *  mainnets). publicChainIds() returns numeric-ascending order, which reads as
 *  arbitrary in a UI (Optimism between Ethereum and BNB Chain). */
const CHAIN_DISPLAY_ORDER = [1, 56, 137, 8453, 42161, 10, 43114, 4663, 101];

export function publicChainOptions(): { id: string; label: string; short: string }[] {
  const ids = publicChainIds();
  const rank = (id: number) => {
    const i = CHAIN_DISPLAY_ORDER.indexOf(id);
    return i === -1 ? CHAIN_DISPLAY_ORDER.length : i;   // unknown chains sort last
  };
  return [...ids].sort((a, b) => rank(a) - rank(b)).map((id) => ({
    id:    String(id),
    label: chainBrand(id).name,
    short: CHAIN_SHORT[id] ?? chainBrand(id).name,
  }));
}

/**
 * UI-visible protocol filter options. `uncx-vm` is deliberately absent — it's
 * the same product as `uncx` from a user's POV, and the backend expands the
 * `uncx` filter to cover both.
 */
export function publicProtocolOptions(): { id: string; label: string }[] {
  return listProtocols()
    .filter((p) => p.slug !== "uncx-vm")
    .map((p) => ({ id: p.slug, label: p.name }));
}

/**
 * Adapter-id-level enabled check. Used by the seeder + TVL snapshot cron to
 * skip outbound calls for paused protocols. Note this checks the PROTOCOL
 * meta (keyed by slug) – the merged `uncx` entry covers both `uncx` and
 * `uncx-vm` adapter IDs, so we look up by reverse-mapping adapterIds → slug.
 */
export function isAdapterEnabled(adapterId: string): boolean {
  for (const meta of Object.values(PROTOCOLS)) {
    if (meta.adapterIds.includes(adapterId)) {
      return !meta.disabled;
    }
  }
  // Adapters with no protocol-meta entry (shouldn't happen for any active
  // adapter) default to enabled – fail-open rather than silently skipping.
  return true;
}

// ─── Per-protocol contract address sources of truth ────────────────────────────
//
// Address-drift bugs are silent and expensive. Single source of truth here
// means a future address change happens in ONE place and propagates to every
// consumer (walker, adapter, claims-ingestor, etc) at once.
//
// History – May 1 2026 PinkSale ETH bug:
//   For months we had three copies of PINKSALE_CONTRACTS – in
//   tvl-walker/pinksale.ts, adapters/pinksale.ts, and
//   ingestors/pinksale-claims.ts. The walker was updated to point at the
//   V2 ETH contract (0x71b5759d...) but the adapter still pointed at the
//   dead V1 contract (0x33d4cc...). Discovery returned 50 valid wallets,
//   but the adapter then queried V1 for those wallets' streams and got
//   nothing – silent zero. Fixed in commit bb13dc2 by updating all three.
//   This export prevents that recurring.
//
// Add other protocols here as their address constants get extracted from
// per-file copies. See PR plan: similar consolidation for UNCX, Hedgey,
// etc.

/**
 * PinkLock V2 deployments. The V2 contract on each chain has the
 * `allNormalTokenLockedCount()` + `getCumulativeLockInfo()` ABI we use.
 *
 * NOT the V1 contracts – V1 (e.g. ETH 0x33d4cc...5e2a, BSC 0x7ee058...) is
 * basically abandoned. Verified May 1 2026 by direct
 * `allNormalTokenLockedCount()` calls:
 *   - ETH V2 (this map):  2,184 tokens locked
 *   - ETH V1 (NOT this):     30 tokens (dead)
 *   - BSC V2 (this map): 22,622 tokens
 *   - BSC V1 (NOT this):  4,668 tokens
 */
export const PINKSALE_CONTRACT_ADDRESSES: Partial<
  Record<SupportedChainId, `0x${string}`>
> = {
  [CHAIN_IDS.ETHEREUM]: "0x71b5759d73262fbb223956913ecf4ecc51057641",
  [CHAIN_IDS.BSC]:      "0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe",
  [CHAIN_IDS.POLYGON]:  "0x6C9A0D8B1c7a95a323d744dE30cf027694710633",
  [CHAIN_IDS.BASE]:     "0xdd6e31a046b828cbbafb939c2a394629aff8bbdc",
};
