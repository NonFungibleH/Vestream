// src/lib/article-seo.ts
// ─────────────────────────────────────────────────────────────────────────────
// Search-result title and description per article, kept apart from the
// on-page headline and excerpt (which can run long). Google cuts titles at
// roughly 60 characters and descriptions at roughly 158, and 48 of our titles
// and most excerpts ran past that (audit, 2026-10-31).
//
// `title` is the base; resources/[slug] appends " | Vestream" only when the
// result still fits in 60 characters. Either field may be left out to fall back
// to the article's own title / excerpt. scripts/seo-check.ts enforces the
// lengths on the rendered pages.
// ─────────────────────────────────────────────────────────────────────────────

export interface ArticleSeo {
  title?:       string;
  description?: string;
  /** Answer-first summary shown at the top of the article ("The short
   *  version") and emitted as the Article schema's `abstract`. Only for
   *  articles that don't already open with one; facts come from the article. */
  quickAnswer?: string;
}

export const ARTICLE_SEO: Record<string, ArticleSeo> = {
  "what-happens-to-unclaimed-vested-tokens": {
    description: "Unclaimed vested tokens stay in the vesting contract until you claim them, and they rarely expire. What happens to them, and how to check if you have any.",
  },
  "how-to-unlock-pinksale-pinklock-tokens": {
    title:       "How to Unlock Tokens from a PinkSale PinkLock",
    description: "PinkLock never sends tokens automatically: the owner wallet clicks Unlock when a lock or vesting cycle ends. Step by step, plus how to find a lost lock.",
  },
  "how-to-claim-jupiter-lock-tokens": {
    description: "Jupiter Lock never pushes unlocked tokens to you; the recipient claims at lock.jup.ag. How to claim, why a lock may not show, and what if you never claim.",
  },
  "how-to-claim-unvest-vested-tokens": {
    description: "Unvest releases your allocation over time, but you still have to claim it. How to claim from the investor dashboard, what it costs, and finding lost rounds.",
  },
  "how-to-claim-hedgey-vesting-tokens": {
    title:       "How to Claim Hedgey Vesting and Lockup Tokens",
    description: "A Hedgey grant is an NFT, and its tokens only move when you claim. How to claim a Hedgey grant step by step, including from a Safe, and why one may not show.",
  },
  "how-to-withdraw-hoodlock-tokens": {
    title:       "How to Withdraw Tokens from a HoodLock Lock",
    description: "An expired HoodLock lock doesn't return your tokens by itself; the owner withdraws. How to withdraw on Robinhood Chain, how vesting claims work, and the cost.",
  },
  "how-to-track-team-finance-vesting": {
    title:       "How to Track Team Finance Vesting and Unlocks",
    description: "Team Finance vesting is on-chain but has no dashboard for recipients. How it works and three ways to track your unlocks, including a free wallet scan.",
  },
  "arbitrum-arb-token-unlock-schedule": {
    quickAnswer: "ARB has a maximum supply of 10 billion tokens, and roughly 61% had unlocked by mid-2026. Most of the rest, mainly team and investor allocations, releases through cliff unlocks that run into 2027, so ARB unlocks land as large single-day supply events. Check a live tracker for the next date and amount, as schedules can change.",
    title:       "ARB Token Unlock Schedule and Vesting (2026)",
    description: "Arbitrum's ARB still has a large share of supply unlocking through 2027 on cliff-based vesting. How the ARB unlock schedule works and where to see it live.",
  },
  "what-is-pinksale-pinklock-token-locker": {
    title:       "What Is PinkSale PinkLock? Locks Explained",
    description: "PinkLock is PinkSale's tool for locking liquidity and vesting team tokens. How it works, which chains it covers, and how to verify any PinkSale lock.",
  },
  "kaito-token-unlock-schedule": {
    quickAnswer: "KAITO has a total supply of 1 billion tokens, and only about a quarter was circulating by mid-2026. The rest, led by Ecosystem & Network Growth (32.2%) and Core Contributors (25%), unlocks over the following years, with major allocations released in cliff-style steps into 2029. Each cliff adds supply on a single day, so check a live tracker for the next one.",
    description: "KAITO has a large share of supply still locked and vesting into 2029. How its unlock schedule is structured, what to watch at the next unlock, and live data.",
  },
  "what-is-jupiter-lock-solana-token-vesting": {
    title:       "What Is Jupiter Lock? Solana Token Vesting",
    description: "Jupiter Lock is Jupiter's token vesting tool on Solana. How its cliff-then-periodic schedule works, what the on-chain data shows, and how to track an unlock.",
  },
  "what-is-magna-token-vesting": {
    title:       "What Is Magna? Token Vesting and Distribution",
    description: "Magna runs vesting, airdrops and claim portals for token projects. How its Merkle-based vesting works, why it's hard to see on-chain, and how to track it.",
  },
  "what-is-smithii-solana-token-vesting": {
    title:       "What Is Smithii? No-Code Solana Token Vesting",
    description: "Smithii lets Solana projects lock and vest tokens without writing a contract. How its vesting tool works, what it costs, and how to track a Smithii unlock.",
  },
  "what-is-hoodlock-robinhood-chain-token-locker": {
    title:       "What Is HoodLock? Robinhood Chain Token Locker",
    description: "HoodLock is a token and liquidity locker on Robinhood Chain. What it can lock, how its fee works, what the on-chain data shows, and how to track an unlock.",
  },
  "what-is-unvest-token-vesting": {
    title:       "What Is Unvest? Milestone and Custom Vesting",
    description: "Unvest is a no-code vesting platform with cliffs, linear release and milestone unlocks. How it works, what on-chain data shows, and how to track an unlock.",
  },
  "hedgey-vesting-pricing-and-alternatives": {
    title:       "Hedgey Vesting: Pricing and Alternatives",
    description: "How Hedgey's on-chain vesting plans and token grants work, what its pricing model really costs, and the main alternatives if you're choosing a vesting tool.",
  },
  "best-crypto-token-unlock-trackers": {
    quickAnswer: "A good token unlock tracker reads vesting straight from on-chain contracts across many protocols, shows what your own wallet is owed, and alerts you before each unlock. Market-wide calendars cover the big tokens' schedules, while wallet-level trackers show the vestings you personally hold. Free access matters: you shouldn't pay to see when your own tokens unlock.",
    title:       "Best Token Unlock Trackers and Calendars (2026)",
    description: "Token unlocks move markets only if you see them coming. What makes a good unlock tracker, and how the main token unlock calendars compare in 2026.",
  },
  "what-is-token-vesting": {
    quickAnswer: "Token vesting locks a token allocation and releases it to the recipient gradually or in tranches on a set schedule. Vested tokens are unlocked and free to move; unvested tokens stay in a smart contract until the schedule releases them. It exists so founders, investors and team members can't sell their whole allocation the moment a token lists.",
    title:       "What Is Token Vesting? A Complete Guide",
    description: "Token vesting controls when recipients can access their tokens. How it works, why it matters, and what investors, founders and team members need to know.",
  },
  "token-vesting-schedules-explained": {
    quickAnswer: "A token vesting schedule sets when locked tokens reach the recipient: a start date, an end date, a release pattern and often a cliff and a TGE unlock. Cliff schedules release in one jump, linear ones continuously, and stepped ones in regular tranches. Too short a schedule, a large TGE unlock or no cliff are the main red flags.",
    title:       "Token Vesting Schedules: Cliff, Linear, Stepped",
    description: "The three main token vesting schedules, cliff, linear and stepped, with real examples, comparison tables and the red flags every investor should check.",
  },
  "how-to-track-token-vesting": {
    quickAnswer: "You can track token vesting by reading the vesting contract on a block explorer, by checking each protocol's own app, or with a multi-protocol tracker that reads every contract for your wallet at once. The first two work for a single position. Across several protocols and chains, a tracker with unlock alerts is the practical option.",
    title:       "How to Track Token Vesting: A Complete Guide",
    description: "Every way to track token vesting, from block explorer lookups to multi-protocol dashboards, and how to make sure you never miss an unlock again.",
  },
  "shadow-liquidity-vesting-token-price": {
    title:       "Shadow Liquidity: How Vesting Sets Price Floors",
    description: "Everyone tracks circulating supply; few model the time-released sell pressure built into vesting schedules. How shadow liquidity works and why it matters.",
  },
  "zombie-supply-unclaimed-vesting-tokens": {
    title:       "Zombie Supply: Unclaimed Vesting Tokens",
    description: "Vested tokens that never trade, vote or move distort circulating supply, FDV and governance. What zombie supply is and why protocols should measure it.",
  },
  "vesting-unlock-frequency-investor-psychology": {
    title:       "Unlock Frequency and Investor Psychology",
    description: "It's not just how many tokens unlock but how often. How unlock frequency changes sell pressure, recipient decisions and price stability in vesting designs.",
  },
  "why-token-prices-fall-before-unlocks": {
    quickAnswer: "A Keyrock study of more than 16,000 token unlocks found about 90% were followed by price declines, with prices starting to fall around 30 days before the unlock. Because unlock dates are public, holders sell early and institutions hedge ahead of time. Team unlocks were the most disruptive; ecosystem unlocks were the gentlest.",
    title:       "Why Token Prices Fall Before an Unlock, Not On It",
    description: "Research on 16,000+ token unlocks found prices usually fell, starting weeks before the release. Why that happens, which unlocks hit hardest, how to read one.",
  },
  "estimating-token-unlock-price-impact": {
    title:       "How to Estimate a Token Unlock's Price Impact",
    description: "Token unlocks are public, so why do prices still drop? A framework to model sell pressure, adjust for holder type and spot the unlocks that move markets.",
  },
  "vesting-cliff-explained": {
    title:       "Vesting Cliff Explained: Why It Moves Markets",
    description: "The cliff is the most misunderstood part of token vesting. How it works, why it exists, and what the data shows about price moves around cliff unlocks.",
  },
  "great-vesting-vs-terrible-vesting": {
    title:       "Great vs Terrible Vesting: Two Real Case Studies",
    description: "The gap between a well-designed vesting schedule and a poor one can decide a token's future. We compare Uniswap and dYdX to show what separates them.",
  },
  "token-allocation-vesting-red-flags": {
    title:       "Token Allocation Red Flags in Vesting Terms",
    description: "How to read the vesting terms for every stakeholder in a token's allocation chart, and the red flags that should make you reconsider an investment.",
  },
  "token-vesting-health-signal": {
    title:       "What a Vesting Schedule Says About a Project",
    description: "Before you invest, read the vesting schedule. How a project structures its token releases says more about its long-term intentions than its whitepaper.",
  },
  "token-unlock-calendar": {
    title:       "Token Unlock Calendar: When Your Tokens Unlock",
    description: "Every vested token has an unlock schedule. How to understand when your tokens release, and how to track those dates across your whole crypto portfolio.",
  },
  "what-is-a-token": {
    quickAnswer: "A token is a unit of value or utility recorded in a smart contract on a blockchain: an entry in a ledger saying which address owns how much of it. Holding a token means controlling a wallet address that the contract credits with it. A coin, like ETH, is native to its own blockchain; a token is issued by a contract running on one.",
    title:       "What Is a Token? A Plain-English Crypto Guide",
    description: "A token is a unit of value inside a smart contract. What tokens are, how they differ from coins, the main types, and how to track the tokens you own.",
  },
  "sablier-vs-hedgey-vs-uncx-comparison": {
    title:       "Sablier vs Hedgey vs UNCX: Vesting Compared",
    description: "Three protocols lead token vesting on EVM chains. How Sablier, Hedgey and UNCX differ in mechanics, cost and features, for projects and for recipients.",
  },
  "sablier-token-streaming-vesting-explained": {
    quickAnswer: "Sablier holds tokens in a smart contract and releases them to the recipient per second, so the claimable balance grows continuously instead of in monthly steps. The release rate is the locked total divided by the duration, and the recipient can withdraw whatever has accrued at any time. Vestream tracks Sablier streams across chains alongside your other vestings.",
    title:       "Sablier Vesting and Streaming: How It Works",
  },
  "hedgey-nft-vesting-plans-explained": {
    description: "Hedgey turns each vesting plan into a transferable NFT. How that design changes the on-chain mechanics, the recipient experience and the tax picture.",
  },
  "uncx-token-lockers-and-vesting": {
    quickAnswer: "UNCX runs two separate products: token lockers, best known for locking a project's liquidity, and vesting contracts for team and investor tokens. Its vesting comes in two versions, TokenVesting v3 and the newer VestingManager, and both support cliff-plus-linear schedules. “Locked on UNCX” can mean either product, so check which contract holds the tokens.",
    title:       "UNCX Token Locker and Vesting: How It Works",
    description: "UNCX is best known for LP locks but also runs two vesting products, TokenVesting v3 and VestingManager. How to tell them apart and read a UNCX vest.",
  },
  "streamflow-solana-vesting": {
    quickAnswer: "Streamflow is the most-used token vesting protocol on Solana. It supports cliff-plus-linear, tranche and continuous payroll-style streams for SPL tokens, with each stream held in its own on-chain account rather than one shared contract. Vestream reads Streamflow streams alongside EVM vestings in one dashboard.",
    title:       "Streamflow Token Vesting on Solana Explained",
  },
  "cliff-vesting-vs-linear-vesting": {
    quickAnswer: "A cliff releases nothing for a fixed period, then unlocks a chunk at once; linear vesting releases tokens continuously or in small regular tranches with no jumps. Most real schedules combine them, typically a 1-year cliff followed by 3 years of linear release. The cliff rewards staying; the linear part smooths sell pressure.",
    title:       "Cliff vs Linear Vesting: Which Should You Use?",
  },
  "how-to-read-a-vesting-schedule": {
    title:       "How to Read a Vesting Schedule",
  },
  "uk-tax-vesting-tokens-vest-or-claim": {
    title:       "UK Tax on Vesting Tokens: At Vest or at Claim?",
    description: "For UK recipients the tax point is usually when tokens become yours, not when you claim. What HMRC guidance says, where it stops, and your 2025–26 return.",
  },
  "token-vesting-tax-guide": {
    title:       "Token Vesting Tax: How to File Vesting Income",
    description: "Vesting income is taxable, but the rules vary by country. How major jurisdictions treat it, what tax software needs, and how to stop reconciling by hand.",
  },
  "crypto-payroll-and-contributor-income-guide": {
    title:       "Crypto Payroll and Contributor Income Guide",
    description: "Getting paid in tokens is now mainstream for DAO contributors, contractors and grant recipients. How to track receipts and runway, and what tax offices want.",
  },
  "how-to-track-sablier-unlocks": {
    description: "Find your Sablier vesting streams, read their unlock schedule and get an alert before every tranche. Manual methods and automated tracking compared.",
  },
  "how-to-track-hedgey-unlocks": {
    title:       "How to Track Hedgey Vesting Plan Unlocks",
    description: "Hedgey vesting plans are NFTs: easy to hold, easy to lose track of. How to find your Hedgey plans, read their unlock dates and get alerted before each one.",
  },
  "sablier-maintenance-mode-what-it-means": {
    title:       "Sablier Maintenance Mode: What It Means for You",
    description: "Sablier Labs entered maintenance mode on 13 July 2026. Existing streams keep working on-chain. What changes, what doesn't, and how to keep tracking them.",
  },
};

const BRAND_SUFFIX = " | Vestream";
const MAX_TITLE = 60;

/** Search title: the SEO base (or headline), branded only when it still fits. */
export function articleSeoTitle(slug: string, headline: string): string {
  const base = ARTICLE_SEO[slug]?.title ?? headline;
  return (base + BRAND_SUFFIX).length <= MAX_TITLE ? base + BRAND_SUFFIX : base;
}

/** Answer-first summary for the top of the article, if one is set. */
export function articleQuickAnswer(slug: string): string | undefined {
  return ARTICLE_SEO[slug]?.quickAnswer;
}

/** Search description: the SEO description, else the article excerpt. */
export function articleSeoDescription(slug: string, excerpt: string): string {
  return ARTICLE_SEO[slug]?.description ?? excerpt;
}
