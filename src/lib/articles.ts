// ─── Article content types ────────────────────────────────────────────────────

export type Block =
  | { type: "h2";      text: string }
  | { type: "h3";      text: string }
  | { type: "p";       html: string }
  | { type: "ul";      items: string[] }
  | { type: "ol";      items: string[] }
  | { type: "callout"; emoji: string; title: string; body: string }
  | { type: "table";   headers: string[]; rows: string[][] }
  | { type: "faq";     items: { q: string; a: string }[] };

export interface Article {
  slug:        string;
  title:       string;
  excerpt:     string;
  publishedAt: string;
  updatedAt:   string;
  readingTime: string;
  category:    string;
  tags:        string[];
  content:     Block[];
}

// ─── Articles ─────────────────────────────────────────────────────────────────

const articles: Article[] = [

  // ── Article 1 ────────────────────────────────────────────────────────────────
  {
    slug:        "what-is-token-vesting",
    title:       "What Is Token Vesting? A Complete Guide for Token Holders",
    excerpt:     "Token vesting controls when token recipients can access their allocation. This guide explains how it works, why it matters, and what every investor, founder, and team member needs to know.",
    publishedAt: "2025-03-10",
    updatedAt:   "2025-03-10",
    readingTime: "12 min read",
    category:    "Fundamentals",
    tags:        ["token vesting", "crypto vesting", "vesting schedule", "token unlock", "DeFi"],
    content: [
      {
        type: "p",
        html: "Token vesting is one of the most consequential mechanisms in crypto — and one of the least understood. Whether you received tokens as an early investor, a founding team member, an advisor, or through a community airdrop, your ability to access those tokens is almost certainly governed by a vesting schedule. Understanding how vesting works is not optional; it shapes your cash flow, your tax obligations, and your understanding of a project's long-term incentive structure.",
      },
      {
        type: "p",
        html: "This guide is written for <strong>token holders of all kinds</strong> — from first-time crypto investors who just received their first token allocation, to experienced fund managers overseeing vesting positions across dozens of projects. We cover everything: what vesting is, why it exists, the terminology you need to know, how smart contracts enforce it, and how to find out exactly when your tokens unlock.",
      },

      { type: "h2", text: "What Is Token Vesting?" },
      {
        type: "p",
        html: "Token vesting is a mechanism that locks a token allocation for a defined period, releasing tokens to the recipient gradually or in tranches according to a predetermined schedule. Tokens that are 'vested' have been unlocked and are freely transferable. Tokens that are 'unvested' remain locked in a smart contract until the schedule dictates they should be released.",
      },
      {
        type: "callout",
        emoji: "📌",
        title: "Simple definition",
        body:  "Token vesting = a time-locked release of tokens. Instead of receiving everything at once, you receive your allocation piece by piece over a set period — enforced by a smart contract.",
      },
      {
        type: "p",
        html: "The concept comes directly from traditional startup equity compensation. In Silicon Valley, it became standard practice in the 1980s to grant employees stock options that vest over four years, with a one-year cliff. This prevented employees from joining a company, receiving equity, and leaving immediately. The same logic applies in crypto: vesting prevents token recipients from immediately selling their entire allocation after a token lists on an exchange.",
      },

      { type: "h2", text: "Why Token Vesting Exists" },
      {
        type: "p",
        html: "Vesting solves a fundamental problem in token economies: the misalignment between short-term and long-term incentives. Without vesting, every team member, investor, and advisor would receive their full token allocation at the moment of the Token Generation Event (TGE). The rational short-term move for many of these recipients would be to sell immediately — creating enormous selling pressure at the worst possible time for a nascent project.",
      },
      {
        type: "ul",
        items: [
          "<strong>Aligns incentives:</strong> Founders and team members who hold unvested tokens are economically incentivised to work on the project for the full vesting duration.",
          "<strong>Protects early buyers:</strong> Retail investors purchasing tokens on exchanges are protected from sudden massive sell-offs from insiders.",
          "<strong>Signals commitment:</strong> A project whose team accepts a four-year vesting schedule is signalling long-term commitment. Investors use vesting terms as a due-diligence signal.",
          "<strong>Manages token supply:</strong> Gradual token release prevents the circulating supply from spiking overnight, which would dilute existing holders.",
          "<strong>Industry standard:</strong> Institutional investors (VCs, hedge funds) now require vesting as a baseline condition before investing in any token project.",
        ],
      },
      {
        type: "p",
        html: "The <strong>absence</strong> of vesting, or very short vesting schedules with large TGE unlocks, is one of the most reliable red flags in tokenomics analysis. Projects that allow insiders to dump their full allocation at launch frequently see catastrophic price collapses within weeks of listing.",
      },

      { type: "h2", text: "Who Receives Vested Tokens?" },
      {
        type: "p",
        html: "Virtually every category of token recipient is subject to some form of vesting. The exact schedules differ by role and negotiation, but the principle is universal across well-structured projects.",
      },
      {
        type: "table",
        headers: ["Recipient Type", "Typical Vesting Period", "Typical Cliff", "Notes"],
        rows: [
          ["Founding team", "3–4 years", "12 months", "Longest vesting to reflect company-building timeline"],
          ["Early-stage investors (Seed/Private)", "2–3 years", "6–12 months", "VCs and angels accept vesting as standard"],
          ["Public sale participants", "6–18 months or no vesting", "Often none", "Shorter vesting; community pressure limits lockups"],
          ["Advisors", "1–2 years", "6 months", "Monthly or quarterly release typical"],
          ["Employees & contractors", "2–4 years", "6–12 months", "Mirrors traditional startup equity structures"],
          ["Treasury / ecosystem fund", "3–5 years", "Varies", "Often controlled by DAO governance"],
          ["Marketing / community incentives", "Variable", "Sometimes none", "Airdrops may vest to prevent immediate sell-off"],
        ],
      },

      { type: "h2", text: "Key Token Vesting Terminology" },
      {
        type: "p",
        html: "Before reading a vesting schedule or smart contract, you need to understand the core vocabulary. These terms appear across every protocol and every project.",
      },
      {
        type: "ul",
        items: [
          "<strong>Vesting period:</strong> The total duration over which your token allocation unlocks. A 24-month vesting period means your tokens release over two years.",
          "<strong>Cliff period:</strong> A minimum holding duration before any tokens unlock. During the cliff, zero tokens vest — then at the cliff date, a lump sum unlocks (often the pro-rata share for the cliff period).",
          "<strong>Vesting schedule:</strong> The specific timeline and formula governing how tokens unlock — for example, 'monthly linear over 24 months after a 6-month cliff'.",
          "<strong>TGE (Token Generation Event):</strong> The moment a token is first created and distributed. Some schedules include a TGE unlock — a percentage of your allocation released immediately at launch.",
          "<strong>Unlock event:</strong> Any moment when a tranche of locked tokens becomes accessible to the recipient.",
          "<strong>Claimable balance:</strong> The quantity of tokens that have vested and are available to withdraw from the vesting contract right now.",
          "<strong>Locked amount:</strong> Tokens still subject to vesting — not yet accessible.",
          "<strong>Stream:</strong> A term used by platforms like Sablier and Unvest for a continuous, real-time token vesting position. Instead of monthly steps, tokens unlock per second.",
          "<strong>Tranche:</strong> A batch of tokens that unlocks at a specific point in time, as opposed to continuous streaming.",
          "<strong>Fully vested:</strong> The point at which 100% of an allocation has unlocked and the vesting schedule is complete.",
        ],
      },

      { type: "h2", text: "How Token Vesting Is Enforced On-Chain" },
      {
        type: "p",
        html: "In the early days of crypto, vesting agreements existed only as legal documents — off-chain contracts with no technical enforcement. A team member who wanted to sell before their vest date could simply do so, and the only recourse was litigation.",
      },
      {
        type: "p",
        html: "Today, the industry has moved decisively to <strong>smart contract-enforced vesting</strong>. Tokens are deposited into an audited smart contract at the time of allocation. The contract holds the tokens and releases them to the recipient's wallet address automatically, according to the schedule — without any human involvement. No one can override the schedule, including the project team.",
      },
      {
        type: "p",
        html: "Several protocols now provide standardised vesting infrastructure that projects can use rather than deploying custom contracts:",
      },
      {
        type: "ul",
        items: [
          "<strong>Sablier:</strong> Real-time streaming vesting on Ethereum and multiple L2s. Tokens unlock per second in a continuous stream.",
          "<strong>UNCX Network:</strong> Token locker and vesting platform widely used for project team and investor allocations.",
          "<strong>Team Finance:</strong> Vesting and locking service supporting multiple EVM chains.",
          "<strong>Hedgey Finance:</strong> Supports cliff, linear, and custom vesting with on-chain NFT-based positions.",
          "<strong>Unvest:</strong> Multi-chain vesting with support for delegated claiming and batch management.",
        ],
      },
      {
        type: "callout",
        emoji: "🔒",
        title: "Why on-chain enforcement matters",
        body:  "When vesting is enforced by a smart contract, you can verify your exact unlock schedule on a block explorer at any time. No trust required — the contract code is the agreement.",
      },

      { type: "h2", text: "Token Vesting vs Token Lockup: What's the Difference?" },
      {
        type: "p",
        html: "These terms are often used interchangeably but have a meaningful distinction:",
      },
      {
        type: "ul",
        items: [
          "<strong>Vesting</strong> describes a gradual release over time — tokens trickle out according to a schedule.",
          "<strong>Lockup</strong> typically refers to a hard lock for a fixed period with a single release at the end — all tokens unlock on one date.",
        ],
      },
      {
        type: "p",
        html: "In practice, many protocols use 'lock' and 'vest' interchangeably. The important question is always: <em>what is the actual release schedule?</em> A 12-month lockup that releases everything at once on day 365 behaves very differently from a 12-month vesting schedule with monthly unlocks.",
      },

      { type: "h2", text: "A Real-World Token Vesting Example" },
      {
        type: "p",
        html: "To make this concrete, here is a typical seed investor scenario:",
      },
      {
        type: "callout",
        emoji: "📊",
        title: "Example: Seed round investor",
        body:  "You invest $50,000 at $0.005 per token in the seed round, receiving 10,000,000 tokens. Your vesting terms are: 0% at TGE, 12-month cliff, then 24 months of linear monthly vesting. The token lists six months after your investment.",
      },
      {
        type: "ol",
        items: [
          "<strong>Month 0 (TGE):</strong> Token lists. You receive 0 tokens — the TGE unlock for your tranche is 0%.",
          "<strong>Months 1–12 post-TGE:</strong> Cliff period. Your tokens are locked. You watch the price but cannot sell.",
          "<strong>Month 12 (cliff unlocks):</strong> You receive the first vested tranche. With a cliff + linear structure, you receive approximately 1/24th of your total allocation (roughly 416,666 tokens) on the cliff date.",
          "<strong>Months 13–35:</strong> Each month, another 1/24th unlocks — approximately 416,666 tokens per month.",
          "<strong>Month 36:</strong> Final tranche unlocks. You are now fully vested and hold unrestricted access to all 10,000,000 tokens.",
        ],
      },
      {
        type: "p",
        html: "Over the 36-month post-TGE vesting period, you received your full allocation in 24 equal monthly instalments. At no point before the cliff could you access a single token — regardless of the market price.",
      },

      { type: "h2", text: "How to Find Your Token Vesting Schedule" },
      {
        type: "p",
        html: "If you hold vested tokens, there are several ways to check your schedule and current claimable balance:",
      },
      {
        type: "ol",
        items: [
          "<strong>Check the project documentation:</strong> Most serious projects publish tokenomics docs or a whitepaper detailing vesting terms by category. Look for 'tokenomics', 'token distribution', or 'vesting schedule' sections.",
          "<strong>Read your investment agreement:</strong> For private round participants, your SAFT (Simple Agreement for Future Tokens) or token purchase agreement specifies your exact vesting terms.",
          "<strong>Use a block explorer:</strong> If you know the vesting contract address, you can inspect it on Etherscan, BscScan, or Basescan to see your locked balance and schedule.",
          "<strong>Use a protocol-native dashboard:</strong> Platforms like Sablier, Team Finance, and Hedgey all provide dashboards where you can connect your wallet and view active positions.",
          "<strong>Use a dedicated vesting tracker:</strong> Tools like Vestream aggregate positions from all major vesting platforms across all chains in one dashboard — saving significant time if you hold positions on multiple protocols.",
        ],
      },

      { type: "h2", text: "What Happens When Tokens Fully Vest?" },
      {
        type: "p",
        html: "When your tokens are fully vested, they become freely transferable. In smart contract terms, the contract has no more hold over them — you can withdraw them to your wallet and do whatever you choose: hold, sell, delegate, or stake.",
      },
      {
        type: "p",
        html: "One important note: <strong>vesting is a taxable event in many jurisdictions.</strong> In the US, UK, and EU, receiving tokens through an employment or service relationship may create ordinary income tax liability at the point of vesting — not just when you sell. Token investors in financial instruments may have different treatment. Always consult a qualified tax professional familiar with digital assets.",
      },

      {
        type: "faq",
        items: [
          {
            q: "What does it mean when a token is vesting?",
            a: "When a token is 'vesting', it means the token allocation is being gradually unlocked over time according to a predetermined schedule. The tokens are held in a smart contract and released to the recipient's wallet either continuously (per second) or in discrete tranches (monthly, quarterly, etc.).",
          },
          {
            q: "What is a vesting cliff in crypto?",
            a: "A vesting cliff is a minimum waiting period before any tokens unlock. During the cliff — typically 6 or 12 months — the recipient receives nothing. At the cliff date, a lump sum unlocks (usually the pro-rata share for the cliff period), and then regular vesting continues afterward.",
          },
          {
            q: "How long does token vesting usually last?",
            a: "For founding teams and early employees, vesting typically lasts 3–4 years. For seed investors, 2–3 years is common. Public sale participants often have shorter schedules of 6–18 months. The industry has trended toward longer vesting periods following the lessons of the 2021–2022 cycle.",
          },
          {
            q: "Can vested tokens be taken back?",
            a: "Once tokens have vested and been claimed from the smart contract, they are owned by the recipient and cannot be clawed back. Unvested tokens in a smart contract may be clawable in some implementations if the contract includes a revocation function — though this is less common in public-facing vesting contracts.",
          },
          {
            q: "What is TGE in token vesting?",
            a: "TGE stands for Token Generation Event — the moment a token is first created and begins distribution. Many vesting schedules include a 'TGE unlock percentage', meaning some portion of the allocation is released immediately at launch. For example, 'TGE: 10%, then 12-month linear' means 10% is available immediately and the remaining 90% unlocks over 12 months.",
          },
          {
            q: "Is token vesting the same as token staking?",
            a: "No. Token vesting is a time-lock mechanism that controls when you receive your allocation. Token staking is when you voluntarily lock tokens you already own to earn rewards, validate a network, or gain governance power. They serve different purposes: vesting is about distribution; staking is about participation.",
          },
          {
            q: "How do I know if my wallet has vested tokens waiting to be claimed?",
            a: "You need to check the vesting contracts associated with your wallet address. Each protocol has its own dashboard (Sablier app, Team Finance, etc.), or you can use a cross-protocol tracker like Vestream to see all your vested-but-unclaimed balances across every supported platform in one view.",
          },
          {
            q: "Can I sell my unvested tokens?",
            a: "Generally, no. Unvested tokens are held in a smart contract and are not in your wallet — you cannot transfer or sell them until they unlock. Some protocols do support transferring the vesting position itself (as an NFT), which allows secondary market trading of unvested claims, but this varies by platform and carries significant risks.",
          },
          {
            q: "What happens to unvested tokens if a project fails?",
            a: "If a project shuts down but the vesting smart contract continues to run, tokens may still vest on schedule — but they may be worthless. In cases where the team controlled the contract, unvested tokens might be returned to the treasury. This varies entirely by contract design; always review the specific contract terms.",
          },
          {
            q: "What is the difference between linear and cliff vesting?",
            a: "Linear vesting releases tokens evenly over time — for example, 1/12th of your allocation every month for 12 months. Cliff vesting (or a 'cliff' in a hybrid schedule) means nothing unlocks until a specific date, after which vesting begins. Most real-world schedules combine both: a cliff period with no unlocks, followed by linear monthly vesting.",
          },
        ],
      },
    ],
  },

  // ── Article 2 ────────────────────────────────────────────────────────────────
  {
    slug:        "token-vesting-schedules-explained",
    title:       "Token Vesting Schedules Explained: Cliff, Linear, and Stepped Vesting",
    excerpt:     "A deep-dive into the three main types of token vesting schedules — cliff, linear, and stepped — with real examples, comparison tables, and the red flags every investor should know.",
    publishedAt: "2025-03-10",
    updatedAt:   "2025-03-10",
    readingTime: "14 min read",
    category:    "Tokenomics",
    tags:        ["vesting schedule", "cliff vesting", "linear vesting", "token unlock schedule", "tokenomics"],
    content: [
      {
        type: "p",
        html: "When a blockchain project raises capital or rewards contributors, one of the most important decisions it makes is the <strong>token vesting schedule</strong>: the exact timeline and formula by which locked tokens become accessible. Get it right and you align long-term incentives for everyone involved. Get it wrong — with too short a schedule, too-large a TGE unlock, or no cliff — and you create the conditions for an insider dump that destroys token value.",
      },
      {
        type: "p",
        html: "This guide is for <strong>investors evaluating a project's tokenomics</strong>, <strong>founders designing their vesting structure</strong>, and <strong>team members or advisors who want to fully understand the terms they're accepting</strong>. We cover every major schedule type in detail, with worked examples, a comparison table, industry benchmarks, and the red flags you should know.",
      },

      { type: "h2", text: "What Is a Token Vesting Schedule?" },
      {
        type: "p",
        html: "A token vesting schedule is a programmable timeline that determines when locked tokens are released to a recipient. It specifies:",
      },
      {
        type: "ul",
        items: [
          "The <strong>start date</strong> (when vesting begins — often TGE or a fixed date prior)",
          "The <strong>end date</strong> (when the full allocation becomes available)",
          "The <strong>release pattern</strong> (continuously, monthly, quarterly, or at milestones)",
          "Any <strong>cliff period</strong> (a waiting period before the first unlock)",
          "The <strong>TGE unlock percentage</strong> (tokens released immediately at launch, if any)",
        ],
      },
      {
        type: "p",
        html: "All of this is typically encoded in a smart contract at the time the allocation is created. The contract enforces the schedule without any human intermediary — not even the project team can override it (assuming the contract has no admin key).",
      },

      { type: "h2", text: "The Three Main Types of Token Vesting Schedules" },

      { type: "h3", text: "1. Linear Vesting" },
      {
        type: "p",
        html: "Linear vesting is the simplest and most predictable schedule. Tokens unlock at a constant rate over the vesting period — either continuously (per second, using platforms like Sablier) or in equal periodic batches (monthly is most common).",
      },
      {
        type: "callout",
        emoji: "📐",
        title: "Linear vesting formula",
        body:  "Tokens unlocked at time T = (Total allocation × elapsed time) ÷ total vesting duration. If you have 1,200,000 tokens vesting over 12 months, you unlock exactly 100,000 tokens per month — or ~3,333 per day in a continuous stream.",
      },
      {
        type: "p",
        html: "Example: An advisor receives 500,000 tokens on a 24-month linear monthly vest starting at TGE. Each month, 20,833 tokens unlock. By month 6, they have access to 125,000 tokens. By month 24, they hold the full 500,000.",
      },
      {
        type: "table",
        headers: ["Feature", "Detail"],
        rows: [
          ["Release pattern", "Equal amounts at each interval"],
          ["Predictability", "Very high — recipient knows exactly what unlocks when"],
          ["Sell pressure", "Consistent and gradual — easier for markets to absorb"],
          ["Common interval", "Monthly (most common), daily, or continuous (per-second)"],
          ["Best for", "Team members, long-term investors, protocol treasuries"],
          ["Downside", "No cliff means tokens start releasing from day one — a risk for projects pre-product-market-fit"],
        ],
      },

      { type: "h3", text: "2. Cliff Vesting" },
      {
        type: "p",
        html: "A cliff vesting schedule (or 'cliff' in a hybrid schedule) introduces a waiting period at the start of vesting during which <em>no tokens unlock at all</em>. At the end of the cliff period, the tokens that accumulated during that period unlock in a single lump sum, and regular vesting then continues.",
      },
      {
        type: "p",
        html: "The <strong>one-year cliff</strong> became standard in startup equity vesting after it was found that many early hires leave within the first year — and a 12-month cliff ensures they demonstrate real commitment before receiving any equity. Crypto adopted this convention wholesale.",
      },
      {
        type: "callout",
        emoji: "🧱",
        title: "Why the 1-year cliff is standard",
        body:  "The cliff protects against contributors who take an allocation and immediately disengage. It aligns team members and investors across the most volatile period of a project's life — typically the first year post-launch, when direction and execution matter most.",
      },
      {
        type: "p",
        html: "Example: 10,000,000 tokens on a 12-month cliff + 24-month linear monthly vest. At month 0 through 11: 0 tokens unlock. At month 12 (cliff date): 10,000,000 ÷ 36 × 12 = 3,333,333 tokens unlock in one tranche. Months 13–36: 277,777 tokens unlock per month.",
      },
      {
        type: "table",
        headers: ["Feature", "Detail"],
        rows: [
          ["Release pattern", "Nothing during cliff; lump sum at cliff; regular thereafter"],
          ["Cliff duration", "6 months (advisors), 12 months (team/investors) most common"],
          ["Alignment signal", "Very strong — recipient must stay committed through the cliff"],
          ["Market impact", "Cliff unlock can create short-term sell pressure on the cliff date"],
          ["Best for", "Team members, seed/private round investors, core contributors"],
          ["Risk", "Large unlock at cliff date is visible on vesting trackers and often anticipated by market"],
        ],
      },

      { type: "h3", text: "3. Stepped / Milestone Vesting" },
      {
        type: "p",
        html: "Stepped (also called 'graded' or 'tranche') vesting releases tokens in discrete batches at scheduled intervals — quarterly is common — rather than continuously. Milestone vesting is a variant where unlocks are triggered by project achievements (mainnet launch, TVL target, user growth) rather than calendar dates.",
      },
      {
        type: "p",
        html: "Example: 2,400,000 tokens in 8 quarterly tranches of 300,000 tokens each. Each quarter on the anniversary of the grant date, 300,000 tokens unlock. The full allocation vests over 2 years.",
      },
      {
        type: "table",
        headers: ["Feature", "Detail"],
        rows: [
          ["Release pattern", "Equal batches at fixed intervals (quarterly, semi-annual, annual)"],
          ["Predictability", "High — unlock dates are known in advance"],
          ["Market impact", "Unlock events are discrete and can cause price volatility on the dates"],
          ["Milestone variant", "Unlocks tied to product/growth targets rather than calendar"],
          ["Best for", "Advisors, strategic partners, ecosystem grants"],
          ["Downside", "Less flexible; milestone versions require oracle or governance verification"],
        ],
      },

      { type: "h2", text: "The Hybrid Schedule: Cliff + Linear (Most Common in Crypto)" },
      {
        type: "p",
        html: "In practice, the vast majority of real-world token vesting uses a <strong>hybrid cliff + linear</strong> schedule. This is the de facto standard across seed rounds, team grants, and advisor allocations. It combines the commitment-screening property of a cliff with the smooth, predictable unlocking of linear vesting.",
      },
      {
        type: "p",
        html: "A typical structure looks like: <strong>'TGE: 5%, then 12-month cliff, then 24-month monthly linear.'</strong> Breaking this down:",
      },
      {
        type: "ol",
        items: [
          "<strong>TGE unlock (5%):</strong> A small immediate allocation at launch, often to allow early participants to cover gas fees or provide initial liquidity.",
          "<strong>12-month cliff:</strong> Nothing else unlocks for 12 months post-TGE.",
          "<strong>24-month linear:</strong> The remaining 95% unlocks in equal monthly instalments over 24 months.",
        ],
      },

      { type: "h2", text: "Industry Benchmark Vesting Schedules by Recipient Type" },
      {
        type: "p",
        html: "The following benchmarks reflect the norms that have emerged across institutional token deals from 2021 through 2024. These are starting points for negotiation — not fixed rules — but deviating significantly from them in a less restrictive direction should raise questions.",
      },
      {
        type: "table",
        headers: ["Recipient", "TGE Unlock", "Cliff", "Linear Vesting", "Total Duration"],
        rows: [
          ["Founding team", "0%", "12 months", "36 months", "48 months"],
          ["Seed investors", "0–5%", "12 months", "18–24 months", "30–36 months"],
          ["Private round investors", "5–10%", "9–12 months", "12–18 months", "21–30 months"],
          ["KOL / strategic round", "10–20%", "6 months", "12 months", "18 months"],
          ["Advisors", "0–5%", "6 months", "12–18 months", "18–24 months"],
          ["Public sale / IDO", "20–100%", "0–3 months", "0–12 months", "Up to 15 months"],
          ["Ecosystem / treasury", "0%", "6–12 months", "24–48 months", "36–60 months"],
        ],
      },

      { type: "h2", text: "How to Read a Token Vesting Schedule" },
      {
        type: "p",
        html: "When evaluating a project's tokenomics doc or your own investment agreement, here is a step-by-step approach:",
      },
      {
        type: "ol",
        items: [
          "<strong>Find the total allocation:</strong> How many tokens, and what percentage of total supply does your category represent?",
          "<strong>Identify the TGE unlock:</strong> What percentage is released immediately at launch? A high TGE (>15% for insiders) is a warning sign.",
          "<strong>Note the cliff:</strong> Is there a cliff? How long? No cliff for team/investors is a significant red flag.",
          "<strong>Understand the release pattern:</strong> Linear monthly? Quarterly? Continuous? Calculate the monthly token release in absolute terms.",
          "<strong>Calculate the 'unlock events' calendar:</strong> Map out the dates when major tranches unlock. These create sell-side pressure and are often anticipated by the market.",
          "<strong>Check the on-chain implementation:</strong> Does a deployed smart contract match the documented terms? Use a block explorer or vesting tracker to verify.",
        ],
      },

      { type: "h2", text: "Red Flags in Token Vesting Schedules" },
      {
        type: "callout",
        emoji: "🚨",
        title: "Warning signs to watch for",
        body:  "These patterns in tokenomics are associated with projects designed to benefit insiders at the expense of public buyers. None is automatically disqualifying, but each warrants deeper scrutiny.",
      },
      {
        type: "ul",
        items: [
          "<strong>No cliff for the team:</strong> Means team members could sell from day one. Legitimate teams accept a 12-month cliff.",
          "<strong>High TGE unlock for insiders:</strong> If seed investors receive 30%+ at TGE, they can offload most of their position immediately after listing.",
          "<strong>Total vesting duration under 18 months for seed round:</strong> Well below the industry norm of 2–3 years.",
          "<strong>Undisclosed vesting terms:</strong> Any project that won't clearly disclose the vesting schedule for team and investors is hiding something.",
          "<strong>Vesting via off-chain agreements only:</strong> No smart contract enforcement means vesting is a legal promise, not a technical guarantee.",
          "<strong>Retroactively changed vesting terms:</strong> A red flag of the highest order. If a team can change vesting terms unilaterally, the schedule provides no protection.",
          "<strong>Concentration risk:</strong> If the top 5 wallets control >40% of supply with short vesting, one coordinated exit can crash the price.",
        ],
      },

      { type: "h2", text: "Comparison: Linear vs Cliff vs Stepped vs Hybrid" },
      {
        type: "table",
        headers: ["Schedule Type", "Predictability", "Alignment Signal", "Market Impact", "Complexity", "Best For"],
        rows: [
          ["Linear only", "Very high", "Moderate", "Smooth, gradual", "Low", "Long-term grants, treasury"],
          ["Cliff only", "High", "Strong", "Single large unlock", "Low", "Simple investor rounds"],
          ["Stepped / quarterly", "High", "Moderate", "Periodic spikes", "Low-medium", "Advisors, strategic"],
          ["Hybrid (cliff + linear)", "High", "Very strong", "Cliff event + gradual", "Medium", "Team, seed/private rounds"],
          ["Milestone-based", "Low", "Very strong", "Unpredictable timing", "High", "Grants, performance-linked"],
        ],
      },

      { type: "h2", text: "Which Protocols Support Each Schedule Type?" },
      {
        type: "table",
        headers: ["Protocol", "Linear", "Cliff", "Stepped", "Hybrid", "Chains"],
        rows: [
          ["Sablier", "✓ (real-time)", "✓", "✓", "✓", "Ethereum, Base, Arbitrum, others"],
          ["UNCX Network", "✓", "✓", "✓", "✓", "Ethereum, BSC, Base"],
          ["Team Finance", "✓", "✓", "✓", "✓", "Ethereum, BSC, Sepolia"],
          ["Hedgey Finance", "✓", "✓", "✓", "✓", "Ethereum, BSC, Base"],
          ["Unvest", "✓", "✓", "✓", "✓", "Ethereum, BSC, Polygon, others"],
        ],
      },

      {
        type: "faq",
        items: [
          {
            q: "What is the most common token vesting schedule?",
            a: "The most common structure for team and investor allocations is a 12-month cliff followed by 24 months of linear monthly vesting, sometimes with a small TGE unlock (0–10%). This '1+2 year' structure has been the de facto standard since at least 2020.",
          },
          {
            q: "What is a 4-year vesting schedule?",
            a: "A 4-year vesting schedule (48 months) is most common for founding team members. It typically includes a 1-year cliff, after which 25% of the allocation unlocks, followed by monthly or quarterly vesting for the remaining 36 months. This mirrors the equity vesting standard from Silicon Valley.",
          },
          {
            q: "What happens to unvested tokens during a bear market?",
            a: "Unvested tokens continue to vest on schedule regardless of market conditions. The smart contract does not pause, accelerate, or alter the schedule based on price. Recipients must hold through the full vesting period to receive their complete allocation, regardless of what happens to the token price.",
          },
          {
            q: "Can vesting schedules be changed after they are set?",
            a: "In properly structured smart contract-enforced vesting, no. The schedule is immutable once the contract is deployed. However, some contracts include admin functions that allow the deployer to modify terms — this is a risk factor that should be disclosed and ideally removed before tokens are distributed.",
          },
          {
            q: "What is the difference between vesting and a lock-up period?",
            a: "Vesting refers to gradual token release over time (e.g. monthly unlocks over 2 years). A lock-up is typically a single period at the end of which all tokens become available at once. Hybrid structures can include both: a lock-up period followed by linear vesting.",
          },
          {
            q: "How do quarterly vesting schedules work?",
            a: "Quarterly vesting unlocks tokens in batches every three months. If you have 1,200,000 tokens on an 8-quarter schedule, 150,000 tokens unlock every quarter. The unlock dates are fixed in the contract and visible to anyone reading the schedule.",
          },
          {
            q: "Is continuous (per-second) vesting better than monthly vesting?",
            a: "Continuous vesting (offered by platforms like Sablier) is more flexible — recipients can claim any amount at any time rather than waiting for a monthly date. It creates no discrete 'unlock events' for the market to anticipate. However, the economic outcome over a full vesting period is identical to monthly linear vesting.",
          },
        ],
      },
    ],
  },

  // ── Article 3 ────────────────────────────────────────────────────────────────
  {
    slug:        "how-to-track-token-vesting",
    title:       "How to Track Your Token Vesting: A Complete Guide for Investors and Teams",
    excerpt:     "From manual block explorer lookups to dedicated multi-protocol dashboards, this guide covers every method for tracking token vesting schedules — and how to make sure you never miss an unlock.",
    publishedAt: "2025-03-10",
    updatedAt:   "2025-03-10",
    readingTime: "11 min read",
    category:    "Guides",
    tags:        ["track token vesting", "token vesting tracker", "how to check vesting schedule", "token unlock tracker", "crypto portfolio"],
    content: [
      {
        type: "p",
        html: "Token vesting is easy to forget about — until you realise you missed a claim window, failed to account for an unlock in your portfolio planning, or discovered that three protocols have been accumulating claimable balances in your wallet for months. For anyone managing a serious position in vested tokens, tracking is not a nice-to-have. It is essential.",
      },
      {
        type: "p",
        html: "This guide is for <strong>investors with token allocations across multiple rounds or projects</strong>, <strong>crypto fund managers overseeing team and investor vestings</strong>, <strong>Web3 employees and advisors</strong> with on-chain employment grants, and <strong>project teams</strong> managing treasury and ecosystem fund disbursements. We cover every method from basic block explorer lookups to purpose-built multi-chain dashboards.",
      },

      { type: "h2", text: "Why Tracking Token Vesting Is Critical" },
      {
        type: "p",
        html: "The consequences of not tracking your vesting are real and varied:",
      },
      {
        type: "ul",
        items: [
          "<strong>Unclaimed balances:</strong> Tokens that have vested but remain unclaimed earn nothing and are at risk if the underlying contract is ever deprecated or exploited.",
          "<strong>Missed planning:</strong> Portfolio managers need to know when significant token tranches unlock to plan hedging, liquidation, or reinvestment strategies.",
          "<strong>Tax obligations:</strong> In many jurisdictions, vesting events create taxable income at the point of vesting — not just at sale. Missing these events means missed tax filings.",
          "<strong>Project monitoring:</strong> Tracking when major team and investor vestings unlock for a project you hold is essential due diligence — large unlock events consistently correlate with increased sell-side pressure.",
          "<strong>Fragmentation:</strong> A single wallet may have active positions on Sablier, Team Finance, and Hedgey simultaneously — across Ethereum, BSC, and Base. Without a unified view, this is nearly impossible to manage manually.",
        ],
      },

      { type: "h2", text: "The Problem: Token Vesting Is Fragmented" },
      {
        type: "p",
        html: "Unlike traditional equity vesting — where a single brokerage account shows your entire position — crypto vesting is spread across:",
      },
      {
        type: "ul",
        items: [
          "<strong>Multiple protocols:</strong> Sablier, UNCX, Team Finance, Hedgey, Unvest, and custom contracts each have their own dashboards and data formats",
          "<strong>Multiple blockchains:</strong> The same wallet address may hold vestings on Ethereum mainnet, BNB Chain, Base, and testnets simultaneously",
          "<strong>Multiple wallets:</strong> Fund managers and project teams often manage dozens of beneficiary wallets",
          "<strong>No universal standard:</strong> There is no shared data format or API across vesting protocols — each must be queried separately",
        ],
      },
      {
        type: "p",
        html: "This fragmentation is the core problem that dedicated vesting tracking tools exist to solve.",
      },

      { type: "h2", text: "Method 1: Manual Block Explorer Lookup" },
      {
        type: "p",
        html: "The most basic method is querying a block explorer like <strong>Etherscan</strong>, <strong>BscScan</strong>, or <strong>Basescan</strong> directly.",
      },
      {
        type: "ol",
        items: [
          "Find the vesting contract address from your investment agreement or project documentation",
          "Open the contract on the relevant chain's explorer",
          "Use the 'Read Contract' function to query your balance, unlock dates, and claimable amounts",
          "For continuous-stream protocols like Sablier, look up your stream ID and query the stream details",
        ],
      },
      {
        type: "callout",
        emoji: "⚠️",
        title: "Limitations of the manual method",
        body:  "Block explorer lookups are time-consuming, require technical knowledge of contract ABIs, and only show one contract at a time. For anyone with more than one or two vesting positions, this approach does not scale.",
      },

      { type: "h2", text: "Method 2: Protocol-Native Dashboards" },
      {
        type: "p",
        html: "Every major vesting protocol provides its own dashboard where you can connect your wallet and view your active positions:",
      },
      {
        type: "table",
        headers: ["Protocol", "Dashboard URL", "What you can see"],
        rows: [
          ["Sablier", "app.sablier.com", "Active streams, claimable amount, start/end dates, withdrawal history"],
          ["UNCX Network", "uncx.network", "Locked positions, unlock schedule, claim interface"],
          ["Team Finance", "team.finance", "Vesting schedules, cliff dates, claimable balance"],
          ["Hedgey Finance", "hedgey.finance", "Token plans, unlock calendar, batch claiming"],
          ["Unvest", "unvest.io", "Positions by chain, real-time unlock amounts"],
        ],
      },
      {
        type: "p",
        html: "Protocol-native dashboards are reliable and up-to-date for their own contracts, but they only show positions on <em>that specific protocol</em>. If you have vestings across Sablier <em>and</em> Team Finance <em>and</em> Hedgey, you need to visit three separate sites, potentially across multiple chains.",
      },

      { type: "h2", text: "Method 3: Dedicated Token Vesting Trackers" },
      {
        type: "p",
        html: "Dedicated vesting trackers aggregate positions from all major protocols and all supported chains into a single dashboard, connected to one wallet address. They offer a unified view that protocol-native dashboards cannot provide.",
      },
      {
        type: "p",
        html: "Key features to look for in a vesting tracker:",
      },
      {
        type: "ul",
        items: [
          "<strong>Multi-protocol coverage:</strong> Should cover all major vesting platforms — Sablier, UNCX, Team Finance, Hedgey, Unvest at minimum",
          "<strong>Multi-chain coverage:</strong> Ethereum, BNB Chain, Base, and any chains where you hold positions",
          "<strong>Real-time data:</strong> Claimable balances change every second on streaming protocols — the tool should reflect current on-chain state",
          "<strong>Unlock calendar:</strong> A calendar view of upcoming unlock events so you can plan ahead",
          "<strong>Unlock alerts:</strong> Email or push notifications when tranches are about to unlock",
          "<strong>Multi-wallet support:</strong> Ability to track multiple addresses in one account",
          "<strong>CSV/data export:</strong> For accounting and tax preparation",
          "<strong>Discovery mode:</strong> Ability to scan any wallet address to find all vesting positions, even if you don't know which protocols are involved",
        ],
      },

      { type: "h2", text: "How to Track Your Vestings with Vestream" },
      {
        type: "p",
        html: "Vestream is a dedicated token vesting tracker that covers all five major vesting protocols (Sablier, UNCX, Team Finance, Hedgey, and Unvest) across Ethereum, BNB Chain, Base, and Sepolia. Here is a step-by-step guide to getting set up:",
      },
      {
        type: "ol",
        items: [
          "<strong>Connect your wallet:</strong> Go to vestream.io and sign in with your Ethereum wallet via Sign-In With Ethereum (SIWE). No password, no email required.",
          "<strong>Add your wallet address(es):</strong> Navigate to Settings → Tracked Wallets and add the addresses you want to monitor. You can specify which chains and protocols to track per wallet, or track all.",
          "<strong>View your dashboard:</strong> The dashboard aggregates all active vesting positions from all tracked wallets and protocols. You'll see locked amount, claimable balance, protocol, chain, and token for every stream.",
          "<strong>Check your unlock timeline:</strong> The Timeline section shows a visual calendar of upcoming unlock events across all your positions.",
          "<strong>Use Discover for unknown wallets:</strong> The Discover tab lets you scan any wallet address and find all vesting positions across all protocols and chains — useful for due diligence or tracking a wallet you've been given by a client.",
          "<strong>Set up alerts:</strong> Configure email notifications for upcoming unlocks in Settings → Notifications.",
          "<strong>Export data:</strong> Use the CSV export function in the dashboard for accounting records.",
        ],
      },

      { type: "h2", text: "Tracking Token Vestings for Due Diligence" },
      {
        type: "p",
        html: "Savvy investors don't just track <em>their own</em> vestings — they also track the vestings of <strong>team wallets and investor allocations</strong> for projects they hold. Large unlock events for insiders are consistently associated with increased sell-side pressure, and knowing when they occur gives you information to act on.",
      },
      {
        type: "p",
        html: "Using the Discover feature on Vestream, you can scan any public wallet address and immediately see all active vesting positions — including protocol, chain, claimable balance, and the unlock schedule. For known project team wallets (often disclosed in audit reports or DAO governance), this provides direct visibility into when key insiders might be able to sell.",
      },
      {
        type: "callout",
        emoji: "💡",
        title: "Pro tip: Watch project treasury wallets",
        body:  "Many DAOs publicly disclose their treasury multisig and vesting wallet addresses. Tracking these gives you advance notice of unlock events that affect circulating supply — information that professional traders use for position sizing.",
      },

      { type: "h2", text: "Setting Up Unlock Alerts" },
      {
        type: "p",
        html: "Unlock alerts are the most actionable feature of a vesting tracker. Rather than checking your dashboard manually, alerts notify you:",
      },
      {
        type: "ul",
        items: [
          "When a major tranche is about to unlock (useful for planning)",
          "When tokens have become claimable and are sitting in your contract waiting to be withdrawn",
          "When a new vesting position is detected for a tracked wallet (useful for monitoring project team wallets)",
        ],
      },
      {
        type: "p",
        html: "In Vestream, email alerts are configured in Settings → Notifications. You can set alert thresholds and choose how far in advance to be notified of upcoming unlocks.",
      },

      { type: "h2", text: "Exporting Vesting Data for Tax and Accounting" },
      {
        type: "p",
        html: "Token vesting events can be taxable in multiple jurisdictions — particularly if you received tokens as compensation for services (employment, advisory, or development work). In those cases, each vesting event may create ordinary income at the fair market value of the tokens on the vesting date.",
      },
      {
        type: "p",
        html: "For tax preparation, you need a complete record of:",
      },
      {
        type: "ul",
        items: [
          "The date of each vesting event",
          "The number of tokens that vested",
          "The fair market value (USD or local currency) of the tokens on that date",
          "The protocol and chain where vesting occurred",
        ],
      },
      {
        type: "p",
        html: "Vestream's CSV export provides the vesting event data you need. You will still need historical price data from a source like CoinGecko or CoinMarketCap to calculate fiat values — or use a dedicated crypto tax tool like Koinly or CoinTracker, and import the CSV for the vesting events.",
      },

      { type: "h2", text: "Best Practices for Token Vesting Management" },
      {
        type: "ul",
        items: [
          "<strong>Set up tracking immediately after receiving an allocation:</strong> Don't wait until your cliff date to understand your schedule. Know it from day one.",
          "<strong>Claim regularly:</strong> Don't let claimable balances sit in vesting contracts for months. Unclaimed tokens are at smart contract risk, earn no yield, and complicate tax records.",
          "<strong>Calendar your unlock events:</strong> Integrate your vesting tracker's calendar export with your personal calendar so unlock events don't surprise you.",
          "<strong>Track relevant project wallets:</strong> For projects you're invested in, monitor known team and investor wallets. Upcoming unlocks from major allocations are often leading indicators of sell pressure.",
          "<strong>Keep records for tax purposes:</strong> Export vesting data at least annually and reconcile with your tax accountant.",
          "<strong>Verify contract terms match documentation:</strong> Before claiming, confirm that the on-chain contract matches the vesting terms in your agreement. Discrepancies should be resolved with the project team immediately.",
          "<strong>Use a hardware wallet for valuable vestings:</strong> If your claimable balance is significant, ensure the receiving wallet is secured with a hardware wallet (Ledger, Trezor, Coldcard), not a hot wallet.",
        ],
      },

      {
        type: "faq",
        items: [
          {
            q: "How do I check my token vesting balance?",
            a: "You can check your vesting balance in several ways: connect your wallet to the protocol-native dashboard (e.g., app.sablier.com for Sablier), query the vesting contract directly on a block explorer using the 'Read Contract' function, or use a cross-protocol tracker like Vestream to see all your vesting positions across all protocols and chains in one dashboard.",
          },
          {
            q: "What is the best tool for tracking token vesting?",
            a: "A dedicated multi-protocol vesting tracker like Vestream provides the most comprehensive view, covering Sablier, UNCX, Team Finance, Hedgey, and Unvest across Ethereum, BNB Chain, Base, and Sepolia in one dashboard. For single-protocol users, the protocol's own dashboard (e.g., Sablier app) is sufficient.",
          },
          {
            q: "Can I track someone else's token vesting?",
            a: "Yes. All on-chain vesting data is publicly readable. You can enter any wallet address into a vesting tracker like Vestream's Discover feature to see all active vesting positions associated with that address across all supported protocols and chains.",
          },
          {
            q: "How often should I check my vesting dashboard?",
            a: "At minimum, check before each significant unlock event and whenever you plan to change your position. With email alerts configured, you can set the tracker to notify you of upcoming events rather than checking manually. Active traders might check daily; long-term holders monthly.",
          },
          {
            q: "Do I need to claim vested tokens manually?",
            a: "On most platforms, yes — vested tokens accumulate in the smart contract until you actively claim (withdraw) them. Platforms like Sablier allow you to claim the continuously-streamed amount at any time. Some protocols support automated claiming via scripts or third-party services, but manual claiming is the norm.",
          },
          {
            q: "What happens if I don't claim my vested tokens?",
            a: "Unclaimed vested tokens remain in the smart contract. They do not expire in most well-designed vesting contracts — you can claim them at any time after they vest. However, leaving large balances unclaimed introduces smart contract risk, and in some edge cases (contract upgrades, protocol deprecation), you may need to migrate positions. Claim regularly.",
          },
          {
            q: "Is token vesting income taxable?",
            a: "In most major jurisdictions (US, UK, EU), token vesting that results from employment, services, or advisory work is taxable as ordinary income at the point of vesting — based on the fair market value of the tokens on the vesting date. Token vesting from investment contracts (SAFTs) may be treated differently. Always consult a qualified crypto-specialist tax advisor.",
          },
          {
            q: "How do I track vestings across multiple blockchains?",
            a: "Use a multi-chain vesting tracker. Vestream supports Ethereum, BNB Chain, Base, and Sepolia simultaneously — the same wallet address is monitored across all chains. You can also track different wallets on different chains under a single account.",
          },
        ],
      },
    ],
  },
  // ── Article 4 ────────────────────────────────────────────────────────────────
  {
    slug:        "shadow-liquidity-vesting-token-price",
    title:       "Shadow Liquidity: How Vesting Schedules Quietly Control Token Price Floors",
    excerpt:     "Everyone tracks circulating supply. Almost no one models the shadow liquidity layer underneath it — the predictable, time-released sell pressure baked into every vesting schedule. Here is how it works and why it matters more than any chart pattern.",
    publishedAt: "2025-03-17",
    updatedAt:   "2025-03-17",
    readingTime: "13 min read",
    category:    "Market Analysis",
    tags:        ["shadow liquidity", "token vesting price impact", "token unlock sell pressure", "vesting calendar", "circulating supply"],
    content: [
      {
        type: "p",
        html: "When analysts discuss a token's price action, they reach for the usual toolkit: order book depth, RSI, on-chain volume, whale movements, macro sentiment. Almost universally, one factor gets ignored — or mentioned only in passing when something goes wrong. Vesting schedules. The structured, time-locked release of insider allocations is not just a governance mechanism; it is a <strong>forward-looking supply schedule</strong> that sophisticated market participants model months in advance. Those who understand it have a structural informational edge over those who don't.",
      },
      {
        type: "p",
        html: "This piece is for <strong>traders and fund managers</strong> who want to understand why unlock events consistently move markets, <strong>investors evaluating new projects</strong> who want to stress-test reported supply metrics, and <strong>protocol teams</strong> designing vesting structures and wondering how the market will react. We are going to go deep on a concept we call shadow liquidity — and why it is arguably more important to token price dynamics than anything on a price chart.",
      },

      { type: "h2", text: "What Is Shadow Liquidity?" },
      {
        type: "p",
        html: "Shadow liquidity is the supply of tokens that does not yet appear in official circulating supply metrics but is committed to enter circulation on a known, predictable schedule. It lives in vesting smart contracts — technically locked, but mathematically certain to unlock.",
      },
      {
        type: "callout",
        emoji: "🔦",
        title: "Shadow liquidity defined",
        body:  "Shadow liquidity = the sum of all unvested token allocations whose unlock dates are known. It is supply that will exist, is priced into informed market participants' models, and will be distributed to recipients who have a choice about whether to sell.",
      },
      {
        type: "p",
        html: "The key insight is that shadow liquidity is not random. It is <em>deterministic</em>. A vesting contract deployed at TGE specifies exactly how many tokens unlock on exactly which dates for the entire vesting duration. This makes token supply dynamics fundamentally different from equity markets, where future share issuance is subject to board votes and market windows. In crypto, the supply curve is already written — it is just hidden in contract state.",
      },

      { type: "h2", text: "How Vesting Schedules Create Predictable Sell Pressure Curves" },
      {
        type: "p",
        html: "Consider a typical mid-cap token with the following allocation structure (not uncommon for a 2022–2024 vintage project):",
      },
      {
        type: "table",
        headers: ["Allocation", "% of Supply", "TGE Unlock", "Cliff", "Linear Vesting"],
        rows: [
          ["Team",          "18%", "0%",  "12 months", "24 months"],
          ["Seed investors","12%", "0%",  "12 months", "18 months"],
          ["Private round", "8%",  "5%",  "9 months",  "12 months"],
          ["Advisors",      "4%",  "0%",  "6 months",  "12 months"],
          ["Public sale",   "5%",  "40%", "0 months",  "6 months"],
          ["Ecosystem fund","20%", "0%",  "12 months", "36 months"],
          ["Treasury",      "15%", "0%",  "6 months",  "48 months"],
          ["Liquidity",     "8%",  "100%","—",         "—"],
          ["Community",     "10%", "20%", "3 months",  "12 months"],
        ],
      },
      {
        type: "p",
        html: "Mapping these allocations to a monthly unlock curve produces something dramatic: <strong>months 9–15 post-TGE represent the single most dangerous window for sell pressure</strong>. Advisors start unlocking at month 6. Private round recipients unlock their remaining 95% starting at month 9. Seed and team cliff at month 12 — simultaneously. The ecosystem fund cliff also hits at month 12. This is not a coincidence; it is simply the consequence of standard vesting terms, but the compounded effect is a supply tsunami that most retail investors are completely unprepared for.",
      },
      {
        type: "callout",
        emoji: "📈",
        title: "The unlock cliff month is typically the most dangerous",
        body:  "When multiple stakeholder categories share the same cliff date (usually 12 months post-TGE), the simultaneous unlock creates the single largest supply expansion event in a token's lifecycle. Market makers price this in weeks or months before it arrives.",
      },

      { type: "h2", text: "Why Market Makers and Whales Track Vesting Calendars More Than Charts" },
      {
        type: "p",
        html: "Institutional traders and market makers in crypto have developed a discipline that most retail participants are unaware of: the <strong>vesting calendar</strong>. This is a forward-looking spreadsheet (or in sophisticated shops, a live data feed) that maps every significant unlock event for every token they trade or hold a position in.",
      },
      {
        type: "p",
        html: "Why? Because unlock events are one of the few truly predictable catalysts in a market otherwise dominated by sentiment, macro shocks, and narrative cycles. A market maker who knows that 80 million tokens (representing 12% of circulating supply) are going to unlock in 30 days can:",
      },
      {
        type: "ul",
        items: [
          "Narrow or widen their bid-ask spread in anticipation of increased sell-side flow",
          "Reduce inventory risk by cutting long exposure ahead of the event",
          "Position for mean-reversion after the unlock pressure is absorbed",
          "Use the unlock date as an anchor for options pricing (if a liquid derivatives market exists)",
        ],
      },
      {
        type: "p",
        html: "Whale wallets — particularly those associated with VC firms or early investors — are often tracked by on-chain analysts. When a known seed round wallet begins moving newly unlocked tokens toward an exchange deposit address, it functions as an observable leading indicator of sell pressure. Tools like Nansen, Arkham, and Vestream's Discover feature make this kind of monitoring accessible beyond the institutional tier.",
      },
      {
        type: "p",
        html: "The practical consequence: <strong>price weakness often begins before the unlock event itself</strong>. Informed sellers front-run the unlock by establishing short positions or reducing longs ahead of the date. This means the observable price impact of an unlock event is often distributed over the 2–4 weeks before and after it, not concentrated on the unlock date itself.",
      },

      { type: "h2", text: "The Concept of True Circulating Supply" },
      {
        type: "p",
        html: "Reported circulating supply — the figure that appears on CoinMarketCap, CoinGecko, and in research reports — is legally required to exclude locked tokens. But this creates a systematic distortion: it understates the supply pressure that is deterministically incoming.",
      },
      {
        type: "p",
        html: "A more analytically useful concept is <strong>true circulating supply</strong>, which adjusts for shadow liquidity across a defined forward time horizon. Here is one formulation:",
      },
      {
        type: "callout",
        emoji: "🧮",
        title: "True circulating supply formula",
        body:  "True Circulating Supply (90-day) = Reported circulating supply + All tokens scheduled to unlock in the next 90 days + Claimable-but-unclaimed vested balances. Dividing market cap by true circulating supply gives you an adjusted price per token that reflects near-term supply reality.",
      },
      {
        type: "p",
        html: "The delta between reported and true circulating supply is largest immediately after TGE (when all insider allocations are locked) and narrows progressively as vesting progresses. For many tokens in their first 18 months post-launch, true circulating supply is 3–8× the reported figure — meaning the reported market cap and FDV comparisons used to evaluate valuation are built on a foundation that systematically misrepresents supply.",
      },

      { type: "h2", text: "How to Visualise the Vesting Pressure Curve" },
      {
        type: "p",
        html: "A vesting pressure curve is a chart of monthly incremental token unlocks — not cumulative supply, but the <em>new supply entering circulation each month</em>. It is the derivative of the cumulative unlock chart, and it is what actually matters for price impact.",
      },
      {
        type: "p",
        html: "Building one requires:",
      },
      {
        type: "ol",
        items: [
          "<strong>The full tokenomics breakdown:</strong> Every allocation category, its size, TGE unlock percentage, cliff duration, and vesting period",
          "<strong>Absolute token quantities:</strong> Percentages converted to token counts using total supply",
          "<strong>A monthly distribution model:</strong> For each category, calculate tokens unlocking per month (accounting for cliff months of zero)",
          "<strong>A stacked chart:</strong> Layer each allocation category to show which stakeholders are driving unlock volume in each month",
        ],
      },
      {
        type: "p",
        html: "The resulting chart immediately reveals the months of peak supply pressure — the periods where a disproportionate share of total supply is entering circulation. <strong>These are the months to watch for price support tests or breakdowns.</strong> Projects that have done this analysis well often stagger their vesting terms across different categories specifically to smooth the pressure curve.",
      },

      { type: "h2", text: "Case Studies: When Unlock Events Acted as Support or Breakdown Levels" },
      {
        type: "p",
        html: "The relationship between unlock events and price is not always directionally negative. The impact depends on several variables: how much of the unlocking supply is held by motivated sellers, the prevailing market trend, the depth of the liquid order book, and whether the event was anticipated or a surprise.",
      },
      {
        type: "h3", text: "Pattern 1: The anticipated sell-off that didn't materialise" },
      {
        type: "p",
        html: "In strong bull markets, major unlock events often fail to produce the expected sell-off. Holders who have waited 12–18 months for their cliff to expire face a decision: sell into strength and potentially miss further upside, or hold and extend their position. When market sentiment is decisively bullish, many choose to hold. The price weakness that was expected around the unlock date instead becomes a brief consolidation, and the lack of selling becomes itself a bullish signal — confirming holder conviction.",
      },
      { type: "h3", text: "Pattern 2: The double-cliff convergence breakdown" },
      {
        type: "p",
        html: "The most reliably bearish unlock scenario involves multiple major stakeholder categories reaching their cliff simultaneously during a bear market. When seed investors (12%), team (18%), and an ecosystem fund (20%) all unlock in the same 30-day window, representing 50% of total supply becoming liquid, the combined sell pressure often exceeds what any level of buy-side demand can absorb. Price support levels — particularly psychological round numbers — often fail in these windows, triggering stop cascades that extend the move beyond what fundamental supply math would predict.",
      },
      { type: "h3", text: "Pattern 3: The unlock calendar as a floor" },
      {
        type: "p",
        html: "Counterintuitively, token prices sometimes find support <em>at</em> unlock dates rather than breaking. This occurs when the unlock tranche is held by known long-term participants (foundations, protocol treasuries, or investors with public track records of holding), and the market has priced in selling that does not materialise. Once the unlock date passes without the expected sell-off, the market re-prices the asset upward as supply-side risk is removed.",
      },

      { type: "h2", text: "How to Monitor Shadow Liquidity for Any Project" },
      {
        type: "p",
        html: "Integrating vesting schedule analysis into your investment process does not require running your own blockchain nodes. The practical steps:",
      },
      {
        type: "ol",
        items: [
          "<strong>Source the tokenomics document:</strong> Every legitimate project publishes detailed tokenomics. Map all allocation categories with their vesting terms into a spreadsheet.",
          "<strong>Convert to absolute quantities:</strong> Percentages are meaningless without the context of total supply. Calculate the token count for every monthly unlock.",
          "<strong>Identify the peak pressure months:</strong> Sum all monthly unlocks across categories. Flag any month where new supply exceeds 2% of reported circulating supply as a high-risk window.",
          "<strong>Track known wallet addresses:</strong> For projects where team or investor wallets are known (often from DAO governance or audit reports), monitor them on-chain using tools like Arkham, Nansen, or Vestream's Discover feature.",
          "<strong>Set calendar alerts:</strong> Mark cliff dates and major monthly tranches. Revisit your position sizing in the weeks approaching high-risk unlock windows.",
          "<strong>Cross-reference with market structure:</strong> Unlock pressure combined with bearish chart structure and declining volume is a significantly more reliable signal than either factor alone.",
        ],
      },

      { type: "h2", text: "Designing Against Shadow Liquidity Risk" },
      {
        type: "p",
        html: "For protocol teams, shadow liquidity is a design problem as much as a market dynamics problem. Some practices that reduce unlock-driven price instability:",
      },
      {
        type: "ul",
        items: [
          "<strong>Stagger cliff dates across stakeholder categories:</strong> Avoid having team, investors, and advisors all cliff on the same date. A 6-month offset dramatically smooths the pressure curve.",
          "<strong>Use continuous (per-second) vesting:</strong> Platforms like Sablier eliminate discrete unlock events entirely. Daily micro-flows are absorbed without market disruption; monthly tranches are not.",
          "<strong>Publish your vesting calendar proactively:</strong> Counterintuitively, transparency reduces impact. Markets that have modelled the unlock in advance react less violently than markets that are surprised by sudden supply.",
          "<strong>Design ecosystem fund disbursements with governance gates:</strong> Milestone-based or governance-controlled release of ecosystem allocations prevents large tranches from entering circulation during bear markets.",
        ],
      },

      {
        type: "faq",
        items: [
          {
            q: "What is shadow liquidity in crypto?",
            a: "Shadow liquidity refers to the supply of tokens that is locked in vesting contracts but is committed to enter circulation on a known schedule. It is called 'shadow' because it does not appear in official circulating supply figures but is fully deterministic and modelled by sophisticated market participants.",
          },
          {
            q: "Do token unlock events always cause price drops?",
            a: "No. The price impact of an unlock event depends on market conditions, the identity of the unlocking stakeholders, whether the event was anticipated, and the depth of buy-side liquidity. In strong bull markets, anticipated unlocks often fail to produce sell-offs. In bear markets, they frequently trigger significant price weakness, particularly when multiple stakeholder categories unlock simultaneously.",
          },
          {
            q: "How far in advance do markets price in unlock events?",
            a: "Sophisticated market participants begin positioning 2–8 weeks before major unlock dates. The observable price weakness associated with an unlock is typically distributed across this window rather than concentrated on the unlock date itself. The unlock date is the deadline, not the event horizon.",
          },
          {
            q: "What is true circulating supply?",
            a: "True circulating supply adjusts the reported circulating supply figure by adding tokens that are unlocking within a defined forward window (e.g., 30, 60, or 90 days) and claimable-but-unclaimed vested balances. It gives a more accurate picture of near-term supply pressure than the standard reported metric.",
          },
          {
            q: "How can I track vesting calendars for tokens I hold?",
            a: "The most reliable approach combines: (1) sourcing the tokenomics document and building a monthly unlock model in a spreadsheet, (2) tracking known team/investor wallets on-chain using tools like Vestream's Discover feature, and (3) setting calendar alerts for major cliff dates and monthly tranches.",
          },
          {
            q: "What is a vesting pressure curve?",
            a: "A vesting pressure curve charts the monthly incremental new supply entering circulation from vesting unlocks — not cumulative supply, but the new tokens unlocking each month. It is the most useful visual tool for identifying periods of peak sell-side risk in a token's lifecycle.",
          },
        ],
      },
    ],
  },

  // ── Article 5 ────────────────────────────────────────────────────────────────
  {
    slug:        "zombie-supply-unclaimed-vesting-tokens",
    title:       "Zombie Supply: The Hidden Impact of Unclaimed Vesting Tokens",
    excerpt:     "There is a category of tokens that have technically vested but will never trade, never vote, and never show up in any meaningful metric. Zombie supply distorts everything — circulating supply, FDV, governance, and liquidity models. Here is what it is and why protocols need to start measuring it.",
    publishedAt: "2025-03-17",
    updatedAt:   "2025-03-17",
    readingTime: "12 min read",
    category:    "Tokenomics",
    tags:        ["zombie supply", "unclaimed vesting tokens", "circulating supply distortion", "token FDV", "governance participation"],
    content: [
      {
        type: "p",
        html: "In every token ecosystem, there exists a category of supply that is technically alive but functionally dead. These are tokens that have fully vested — unlocked from their smart contracts, available to claim — but whose intended recipients have never claimed them, and likely never will. The wallet is inactive. The keys may be lost. The holder has moved on. The tokens sit in limbo: neither locked nor truly circulating, neither voting nor transferring. We call this <strong>zombie supply</strong>.",
      },
      {
        type: "p",
        html: "Zombie supply is not a theoretical edge case. It affects every protocol with significant vesting, particularly those that conducted broad airdrops or community distributions. Its consequences ripple through every metric that investors, analysts, and governance participants rely on. And almost nobody talks about it — because almost nobody measures it.",
      },

      { type: "h2", text: "What Is Zombie Supply?" },
      {
        type: "p",
        html: "Zombie supply is the aggregate of claimable vested tokens that have not been claimed and show strong evidence of never being claimed — due to wallet inactivity, lost private keys, disengaged recipients, or deceased holders.",
      },
      {
        type: "callout",
        emoji: "🧟",
        title: "Zombie supply defined",
        body:  "Zombie supply = tokens that have vested (are technically claimable) but remain unclaimed in vesting contracts, held by wallets with no recent on-chain activity. They count toward calculated circulating supply but contribute no real liquidity, no governance participation, and no economic activity.",
      },
      {
        type: "p",
        html: "The phenomenon is closely related to — but distinct from — the well-known problem of lost Bitcoin (estimated at 3–4 million BTC). Bitcoin loss is permanent: private keys are gone forever. Zombie supply is more ambiguous: the tokens could theoretically be claimed tomorrow if the recipient re-appears. In practice, for positions that have been claimable for more than 12–24 months with no on-chain activity from the recipient wallet, the effective probability of claiming approaches zero.",
      },

      { type: "h2", text: "How Unclaimed Tokens Distort Circulating Supply" },
      {
        type: "p",
        html: "Standard circulating supply calculations count all tokens that are not locked in smart contracts as 'circulating'. This is operationally sensible — there is no reliable way to distinguish between a token held by an active investor and one held by a wallet whose owner lost access five years ago. The problem is that this produces a circulating supply figure that <em>overstates effective supply</em>.",
      },
      {
        type: "p",
        html: "Consider the lifecycle of a typical broad community airdrop:",
      },
      {
        type: "ol",
        items: [
          "A protocol distributes 50 million tokens across 200,000 wallets that interacted with the protocol",
          "Tokens vest over 12 months with monthly unlocks",
          "At the end of the vesting period, aggregate claim data shows that only 68% of eligible wallets ever claimed <em>any</em> tokens",
          "Of wallets that did claim, 40% claimed only their first tranche and never returned",
          "The 16 million tokens allocated to never-claiming wallets are technically 'vested' but sit unclaimed in the vesting contract",
          "These 16 million tokens appear in circulating supply calculations once they are past their vest date, even though they have never moved and almost certainly never will",
        ],
      },
      {
        type: "p",
        html: "This is not a hypothetical. Claim rate analysis of major protocol airdrops consistently shows that 20–40% of airdrop recipients never claim their full allocation. For team and investor vestings, the numbers are better — financial motivation is higher — but even here, advisor wallets, small early contributors, and participants who left the ecosystem can accumulate years of unclaimed vested tokens.",
      },

      { type: "h2", text: "The FDV Problem: Why It Is Even More Misleading Than You Think" },
      {
        type: "p",
        html: "Fully Diluted Valuation (FDV) — the market cap if all tokens were in circulation at the current price — is already a controversial metric because it treats locked tokens as economically equivalent to liquid ones. Zombie supply makes this worse by introducing a third category: tokens that are neither locked nor truly liquid, but are counted as liquid.",
      },
      {
        type: "p",
        html: "The result is a double distortion:",
      },
      {
        type: "ul",
        items: [
          "<strong>Circulating supply is overstated</strong> by the volume of zombie supply that technically counts as circulating",
          "<strong>FDV is therefore understated</strong> relative to the true economically active token base (because price ÷ true active supply is higher than price ÷ stated circulating supply)",
          "<strong>Market cap calculations look larger</strong> than the economically meaningful supply warrants, which has downstream effects on ranking, collateral valuation, and risk modelling",
        ],
      },
      {
        type: "p",
        html: "Sophisticated valuation analysts sometimes attempt to adjust for this by estimating 'effective circulating supply' — active wallets only, excluding dust wallets, long-dormant addresses, and known custodial holding patterns. This is labour-intensive but produces materially more accurate valuations.",
      },

      { type: "h2", text: "Wallet Inactivity and Lost Keys: The Scale of the Problem" },
      {
        type: "p",
        html: "Wallet inactivity exists on a spectrum. At one end: wallets that haven't transacted in 30 days but whose owners remain engaged with the ecosystem. At the other end: wallets that have been silent for years and whose private keys are almost certainly gone. The following categories generate the most zombie supply:",
      },
      {
        type: "table",
        headers: ["Wallet category", "Likelihood of claiming", "Zombie supply contribution"],
        rows: [
          ["Airdrop recipient: never claimed", "Very low (15–25%)", "High — never activated vesting contract"],
          ["Airdrop recipient: claimed once, then silent", "Low (30–40%)", "Medium — partial claim, remainder zombie"],
          ["Early testnet contributor, inactive since mainnet", "Low", "High — often received vesting but left ecosystem"],
          ["Advisor with lost/inaccessible wallet", "Negligible", "High — full allocation becomes zombie"],
          ["Exchange wallet that received allocation", "Moderate", "Varies — depends on exchange policy"],
          ["DAO treasury with deprecated multisig", "Low", "High — governance friction prevents claim"],
          ["Deceased holder", "Very low", "High — key management rarely transferred"],
        ],
      },
      {
        type: "p",
        html: "The advisor category deserves special attention. Advisors in early-stage crypto projects frequently hold positions across dozens of projects, received tokens years ago on hardware wallets they no longer have, or used browser extension wallets that were tied to machines they have since replaced. Advisor allocations — typically 2–5% of supply — can be disproportionate contributors to zombie supply.",
      },

      { type: "h2", text: "The Governance Vacuum: Voting Power That Never Shows Up" },
      {
        type: "p",
        html: "In governance token systems, zombie supply creates a structural democratic deficit. If 25% of circulating governance tokens are zombie supply — claimable but held by inactive wallets — then the governance system is effectively operating at 75% participation capacity even before you account for voluntary voter apathy.",
      },
      {
        type: "p",
        html: "This has several compounding consequences:",
      },
      {
        type: "ul",
        items: [
          "<strong>Quorum thresholds become harder to reach:</strong> If a governance proposal requires 10% of circulating supply to vote for quorum, and 25% of that supply is zombie, then the effective quorum threshold is 13.3% of actively controlled supply — significantly harder to achieve.",
          "<strong>Vote concentration risk increases:</strong> When zombie supply is large, the effective voting power of active token holders is higher than nominal. A whale holding 5% of circulating supply may effectively control 6.5–7% of realistic votes.",
          "<strong>Governance attack surface widens:</strong> Quorum requirements calibrated against stated circulating supply may be inadequate against the true distribution of active holders.",
          "<strong>Treasury management is distorted:</strong> Treasury proposals are evaluated relative to total circulating supply, when the economically relevant denominator is active supply.",
        ],
      },
      {
        type: "callout",
        emoji: "🗳️",
        title: "Governance quorum math with zombie supply",
        body:  "If a protocol has 100M circulating tokens, and 22M are zombie supply, the governance system functionally has 78M active tokens. A 10% quorum threshold means getting 10M votes — but that represents 12.8% of active supply. Quorums calibrated to stated circulating supply systematically underestimate the difficulty of reaching meaningful participation.",
      },

      { type: "h2", text: "Protocol-Level Consequences Beyond Governance" },
      {
        type: "p",
        html: "Zombie supply distorts more than governance. It affects every metric built on circulating supply:",
      },
      {
        type: "ul",
        items: [
          "<strong>Liquidity ratios:</strong> The ratio of DEX liquidity to market cap looks healthier than it is, because market cap is inflated by zombie supply that will never trade",
          "<strong>Staking participation rates:</strong> Staking rates calculated as a percentage of circulating supply are understated — zombie supply never stakes, inflating the denominator",
          "<strong>Exchange listing requirements:</strong> Some exchanges have minimum free-float requirements; zombie supply may artificially satisfy these requirements",
          "<strong>Collateralisation models:</strong> Lending protocols that accept governance tokens as collateral may over-collateralise based on circulating supply figures that include zombie tokens",
          "<strong>Vesting contract audit risk:</strong> Tokens sitting unclaimed in vesting contracts for years become an underappreciated smart contract security risk — old contracts may contain vulnerabilities or be targeted for deprecated contract attacks",
        ],
      },

      { type: "h2", text: "\"Claimed vs Claimable\": The Metric Every Protocol Should Be Tracking" },
      {
        type: "p",
        html: "The most actionable response to zombie supply is a simple one: track the ratio of <strong>claimed tokens to claimable tokens</strong> as a first-class protocol metric, reported alongside circulating supply in tokenomics dashboards.",
      },
      {
        type: "p",
        html: "Claimed vs claimable gives you:",
      },
      {
        type: "ul",
        items: [
          "<strong>Active supply ratio:</strong> The percentage of vested tokens that have actually been claimed by recipients — a proxy for effective circulating supply",
          "<strong>Ecosystem engagement signal:</strong> Falling claim rates are an early warning signal for recipient disengagement, particularly for community and airdrop allocations",
          "<strong>Zombie accumulation rate:</strong> The rate at which claimable tokens are accumulating without being claimed — the higher this rate, the more zombie supply is building in the protocol",
          "<strong>Governance health indicator:</strong> In governance token systems, claim rate correlates with governance participation capacity",
        ],
      },
      {
        type: "p",
        html: "This metric is entirely computable from on-chain data. Vesting contracts store both the total vested amount and the amount claimed. The difference is unclaimed vested supply — the raw material for zombie supply analysis. Protocols that surface this data on their analytics dashboards are providing a level of transparency that is currently rare but should become standard.",
      },

      { type: "h2", text: "How to Identify Zombie Supply in Any Protocol" },
      {
        type: "p",
        html: "For investors and analysts performing due diligence, estimating zombie supply requires on-chain data work:",
      },
      {
        type: "ol",
        items: [
          "<strong>Identify the vesting contracts:</strong> Use a protocol's documentation, deployment records, or a tool like Vestream's Discover feature to locate active vesting positions for the token",
          "<strong>Query claimed vs deposited amounts:</strong> Most vesting contracts expose a function to query total deposited and total withdrawn for each position — the delta is unclaimed vested supply",
          "<strong>Cross-reference against wallet activity:</strong> For the wallets holding unclaimed positions, check their last transaction date on a block explorer. Wallets inactive for 12+ months are strong zombie supply candidates",
          "<strong>Segment by allocation category:</strong> Airdrop and community allocation positions will typically show higher unclaim rates than team and investor positions",
          "<strong>Estimate a zombie supply range:</strong> Conservative (90-day inactive wallets), moderate (180-day), and aggressive (365-day) thresholds each produce different zombie supply estimates",
        ],
      },

      { type: "h2", text: "What Protocols Can Do About Zombie Supply" },
      {
        type: "p",
        html: "Protocol teams are not passive observers of zombie supply. There are structural design choices that reduce it and responsive actions that can address it once identified:",
      },
      {
        type: "ul",
        items: [
          "<strong>Implement auto-claim mechanisms:</strong> Some vesting contracts support push-based distribution rather than pull-based claiming — tokens are sent to recipient wallets rather than waiting to be claimed. This eliminates the claiming friction that contributes to zombie accumulation.",
          "<strong>Set unclaim expiry windows:</strong> Contractually, unclaimed positions that exceed a defined inactivity threshold (e.g., 24 months after vesting) could be subject to governance vote for reallocation. This requires careful legal and contract design but has precedent in traditional equity (abandoned property laws).",
          "<strong>Build recipient re-engagement campaigns:</strong> Regular email and social outreach to allocation recipients — particularly for community rounds — with clear instructions on claiming can recover meaningful amounts of would-be zombie supply.",
          "<strong>Use claimed vs claimable in tokenomics disclosures:</strong> Publishing this ratio builds trust with sophisticated investors and acknowledges the reality that stated circulating supply overstates effective supply.",
          "<strong>Monitor and disclose in real time:</strong> A live claimed vs claimable dashboard, built on top of vesting contract data, is a powerful transparency signal that very few projects currently provide.",
        ],
      },

      {
        type: "faq",
        items: [
          {
            q: "What is zombie supply in crypto?",
            a: "Zombie supply refers to tokens that have vested (unlocked from their vesting contracts and technically claimable) but have never been claimed, typically because the recipient's wallet is inactive, the private keys are lost, or the holder has disengaged from the project. These tokens count toward circulating supply metrics but contribute no real liquidity, governance participation, or economic activity.",
          },
          {
            q: "How much zombie supply does a typical protocol have?",
            a: "This varies significantly by protocol and distribution method. Broad airdrops can have unclaim rates of 25–40%. Protocols with significant community distribution or early testnet contributor allocations tend to accumulate more zombie supply over time. Team and investor allocations typically have lower unclaim rates (5–15%) due to stronger financial motivation.",
          },
          {
            q: "Does zombie supply affect token price?",
            a: "Zombie supply affects token price indirectly by distorting the metrics used to evaluate it. Circulating supply overstatement makes market cap appear larger than effective liquidity justifies. More directly, zombie supply that is counted as circulating but will never trade removes real sell-side pressure that would otherwise exist — which is actually a mild positive for price stability, but introduces governance and metric distortion.",
          },
          {
            q: "What is the claimed vs claimable metric?",
            a: "Claimed vs claimable is the ratio of tokens that have been claimed from vesting contracts to the total tokens that have vested and are available to claim. It is a direct measure of recipient engagement and a proxy for effective circulating supply. A 70% claim rate means 30% of vested tokens are sitting unclaimed — potential zombie supply.",
          },
          {
            q: "Can zombie supply tokens ever be recovered?",
            a: "If the private key to the wallet is still accessible, yes — the recipient can claim at any time. If keys are permanently lost, the tokens are effectively destroyed (like lost Bitcoin). Some vesting contracts include expiry mechanisms or governance-controlled reclamation after long inactivity periods, but this is uncommon and legally complex.",
          },
          {
            q: "Why don't protocols track zombie supply?",
            a: "Primarily because the metrics do not demand it. Standard reporting norms only require disclosure of total circulating supply. There is also a reputational incentive not to: protocols benefit from appearing to have a large circulating supply (it inflates market cap rankings). Proactive disclosure of high zombie supply rates requires a level of transparency that most teams have not yet adopted.",
          },
        ],
      },
    ],
  },

  // ── Article 6 ────────────────────────────────────────────────────────────────
  {
    slug:        "vesting-unlock-frequency-investor-psychology",
    title:       "Micro-Cadences: How Unlock Frequency Shapes Investor Psychology and Market Dynamics",
    excerpt:     "It is not just how many tokens unlock — it is how often. The frequency of unlock events drives measurable differences in sell pressure patterns, recipient decision-making, and token price stability that most vesting designs completely overlook.",
    publishedAt: "2025-03-17",
    updatedAt:   "2025-03-17",
    readingTime: "11 min read",
    category:    "Research",
    tags:        ["vesting unlock frequency", "token unlock cadence", "investor psychology", "drip vesting", "vesting design"],
    content: [
      {
        type: "p",
        html: "Ask most protocol designers about their vesting structure and they will give you two numbers: how long and how much. Four-year vest, 12-month cliff. Two-year vest, 5% at TGE. These are the parameters that get disclosed in tokenomics docs, discussed in investor calls, and modelled in financial projections.",
      },
      {
        type: "p",
        html: "Almost no one asks the third question: <em>how often?</em> The unlock cadence — whether tokens release daily, weekly, monthly, quarterly, or continuously — turns out to have outsized effects on recipient behaviour, market dynamics, and the long-term health of a token ecosystem. This piece is an attempt to map those effects rigorously, for <strong>protocol designers choosing their vesting parameters</strong>, <strong>investors evaluating tokenomics</strong>, and <strong>traders modelling unlock event timing</strong>.",
      },

      { type: "h2", text: "What Is Unlock Cadence?" },
      {
        type: "p",
        html: "Unlock cadence is the frequency at which vesting events occur — the intervals between successive releases of locked tokens. A vesting contract releases tokens on a schedule that can range from continuous (per-second streaming) to annual (single cliff unlock).",
      },
      {
        type: "table",
        headers: ["Cadence type", "Release interval", "Platforms/examples", "Unlock events over 24mo"],
        rows: [
          ["Continuous (streaming)", "Per second", "Sablier, Unvest", "~63 million"],
          ["Daily", "Every 24 hours", "Custom contracts", "730"],
          ["Weekly", "Every 7 days", "Some custom grants", "104"],
          ["Monthly", "Every ~30 days", "Most protocols (default)", "24"],
          ["Quarterly", "Every ~90 days", "Advisory, strategic", "8"],
          ["Semi-annual", "Every 6 months", "Lockup-style", "4"],
          ["Annual", "Once per year", "Cliff-only structures", "2"],
        ],
      },
      {
        type: "p",
        html: "The same total allocation and the same total vesting duration can be structured at any of these cadences. A 2,400,000 token grant over 24 months could release 100,000 per month, 25,000 per week, ~3,288 per day, or stream at 1.52 tokens per second — the recipient's total allocation is identical. The market dynamics and recipient behaviour are not.",
      },

      { type: "h2", text: "The Psychology of Drip vs Chunk Unlocks" },
      {
        type: "p",
        html: "Behavioural economics gives us a useful framework here: the distinction between <strong>drip</strong> (frequent small releases) and <strong>chunk</strong> (infrequent large releases) income patterns.",
      },
      {
        type: "p",
        html: "In traditional finance, research on dividend policy and salary frequency shows that the payment cadence affects spending and saving behaviour independently of the total amount. Workers paid weekly spend less per dollar than workers paid monthly. Homeowners who pay property taxes annually budget differently than those who escrow monthly payments. The same psychological dynamics play out in token vesting.",
      },
      { type: "h3", text: "The drip effect (high frequency)" },
      {
        type: "p",
        html: "Recipients receiving tokens weekly or continuously tend to make smaller, more habitual decisions about each tranche. Each release is a small decision — sell this week's portion, hold it, stake it? The <strong>decision cost is low because the stakes are low</strong>. This produces a pattern of micro-decisions rather than one or two large, high-stakes choices. Behavioural research suggests that small, frequent decisions are more likely to default to the prior decision — which, in the context of a hold-biased recipient, means more holding.",
      },
      {
        type: "p",
        html: "There is also a salience effect: weekly token releases quickly fade into the background. Recipients start to treat them like a salary — expected, routine, and not requiring active attention. This reduces the likelihood of large reactive selling triggered by news events or price volatility.",
      },
      { type: "h3", text: "The chunk effect (low frequency)" },
      {
        type: "p",
        html: "Monthly or quarterly unlock events are <em>discrete decision moments</em>. They are marked on calendars. They are anticipated. And — critically — they carry higher per-event stakes. When 416,000 tokens unlock at once, that is a materially larger decision than 13,000 tokens unlocking daily. The recipient is more likely to consciously deliberate, to consult tax advisors, to evaluate current market conditions, and — in stressed market conditions — to treat the unlock as a forced decision point.",
      },
      {
        type: "p",
        html: "Monthly vesting also creates <strong>anticipatory sell behaviour</strong>: recipients who have decided to sell often begin reducing exposure ahead of the unlock date rather than waiting. This means the observable market impact of a monthly unlock event is distributed unevenly, with some pressure appearing in the days before the event.",
      },
      {
        type: "callout",
        emoji: "🧠",
        title: "The decision-fatigue inversion",
        body:  "Counterintuitively, more frequent smaller decisions often produce better long-term outcomes than fewer larger decisions, because large decisions are more susceptible to loss aversion, recency bias, and market-timing attempts. High-frequency vesting partially automates a discipline that many token holders lack when they receive large quarterly chunks.",
      },

      { type: "h2", text: "Weekly Vesting: The Underused Sweet Spot" },
      {
        type: "p",
        html: "Weekly vesting — releasing 1/104th of a 2-year allocation every seven days — is underused in crypto despite having significant advantages. It produces 104 unlock events over a 24-month period, each releasing about 1% of the total allocation. The market impact of any individual event is negligible. Recipients develop a weekly rhythm that reduces the psychological salience of each release.",
      },
      {
        type: "p",
        html: "The downside is operational: early crypto infrastructure made weekly claims expensive in gas terms, and the ecosystem standardised on monthly before the L2/low-fee era. With gas costs now negligible on most chains where vesting occurs (BNB Chain, Base, Sepolia), the historical objection no longer applies. Continuous streaming goes further still, but weekly is a practical middle ground for contracts that need discrete event structures.",
      },

      { type: "h2", text: "Monthly Vesting: The Industry Default and Its Hidden Costs" },
      {
        type: "p",
        html: "Monthly vesting became the industry default for understandable reasons: it aligns with how people think about time (calendar months), it is easy to communicate and document, and it produces a manageable number of unlock events. These are real advantages.",
      },
      {
        type: "p",
        html: "The hidden cost is the creation of <strong>24 or 36 discrete sell decision moments</strong> over a vesting period. In a bear market, each of these moments is a potential exit point. Research on investor behaviour in declining markets shows that decision moments — points where a holder must actively choose to hold rather than automatically holding — increase the probability of selling. Monthly vesting creates more of these moments than weekly vesting, more sell decisions per year, and more opportunities for loss aversion to drive premature exits.",
      },
      {
        type: "p",
        html: "This does not mean monthly vesting is bad — it is appropriate for many contexts. But designers should be aware that 'monthly' is not a neutral default; it is a specific psychological structure with specific behavioural consequences.",
      },

      { type: "h2", text: "Quarterly Vesting: The Corporate Holdover with Volatility Costs" },
      {
        type: "p",
        html: "Quarterly vesting is inherited from traditional equity compensation, where it was practical (quarterly payroll cycles, annual audits, etc.). In crypto, it has questionable utility beyond advisor relationships where recipients are infrequently engaged and need only occasional reminders of their stake.",
      },
      {
        type: "p",
        html: "The market dynamics of quarterly vesting are closer to cliff behaviour than to smooth linear vesting. Eight unlock events over two years means each event releases approximately 12.5% of the total allocation. These are not micro-events — they are major supply additions that, for sizeable positions, can be individually market-moving. Quarterly unlock dates for large stakeholder categories are often visible in price charts as volatility inflection points.",
      },
      {
        type: "p",
        html: "The one genuine advantage of quarterly vesting is simplicity for recipients who are not active market participants — advisors, academics, early community members — for whom monthly decisions would be burdensome and annual decisions too infrequent. For these recipients, the reduced decision frequency is a feature, not a bug.",
      },

      { type: "h2", text: "How Cadence Interacts With Market Cycles" },
      {
        type: "p",
        html: "Unlock cadence does not operate in a vacuum — it interacts with the prevailing market environment in ways that amplify or dampen its effects.",
      },
      { type: "h3", text: "Bull markets: high frequency wins" },
      {
        type: "p",
        html: "In rising markets, frequent small unlocks are fully absorbed by buy-side pressure. Each weekly or daily tranche enters a market with enough demand to buy it. Recipients who sell immediately are replaced by new buyers, and the net price impact is negligible. The market's ability to absorb frequent small releases in bull conditions makes high-frequency vesting the optimal design for launch phases — assuming the launch coincides with favourable conditions.",
      },
      { type: "h3", text: "Bear markets: cadence becomes critical" },
      {
        type: "p",
        html: "In declining markets, unlock frequency becomes one of the most important variables in a token's survival. The dynamic reverses: in a bear market, each unlock event is a potential trigger for recipient selling, and the market's ability to absorb new supply is constrained. Here, <strong>lower-frequency unlocks paradoxically create more sell pressure per event</strong>, because each large quarterly tranche arrives into a market with limited bid depth, while high-frequency daily or continuous releases are small enough to be absorbed without disrupting price.",
      },
      {
        type: "p",
        html: "This creates a design dilemma: the cadence that minimises sell pressure in bear markets (high frequency, small tranches) also creates the highest decision frequency for recipients, which may increase aggregate selling by creating more decision moments. The optimal resolution, supported by both behavioural economics research and observable crypto market dynamics, leans toward <strong>continuous or near-continuous vesting</strong> for allocation categories where the holder base is likely to be active market participants.",
      },

      { type: "h2", text: "Continuous Streaming: Removing the Event Entirely" },
      {
        type: "p",
        html: "The logical extreme of high-frequency vesting is continuous streaming — the approach taken by Sablier and, to a lesser extent, Unvest. In a streaming model, tokens unlock at a constant per-second rate. There is no 'unlock event'. There is no date to mark on a calendar. There is no discrete decision moment.",
      },
      {
        type: "p",
        html: "The psychological effect is profound: streaming vesting effectively converts a token allocation into a continuous income stream rather than a sequence of capital events. This reframes the recipient's mental model from 'when should I sell this tranche?' to 'what is my target withdrawal rate?' — a fundamentally different and more stable decision framework.",
      },
      {
        type: "p",
        html: "For markets, the effect is equally significant. Because there are no observable unlock events, there is nothing for market participants to front-run, anticipate, or model as a discrete catalyst. Supply enters circulation in a smooth, continuous flow that is invisible to the order book. This does not eliminate sell pressure, but it distributes it so finely that it becomes impossible to distinguish from normal market activity.",
      },
      {
        type: "callout",
        emoji: "💧",
        title: "Why streaming vesting is underutilised",
        body:  "Despite its significant advantages for market stability and recipient psychology, continuous streaming is used by a minority of protocols. Reasons include: familiarity bias toward monthly structures, the perception that streaming is 'complicated', and the need to use specific protocols (Sablier, Unvest) rather than custom contracts. As vesting infrastructure matures, streaming adoption is likely to grow.",
      },

      { type: "h2", text: "Cadence Optimisation by Recipient Type" },
      {
        type: "p",
        html: "There is no universal optimal cadence — the right frequency depends on the recipient type, their expected behaviour, and the intended relationship between recipient and protocol.",
      },
      {
        type: "table",
        headers: ["Recipient type", "Recommended cadence", "Rationale"],
        rows: [
          ["Founding team", "Continuous or monthly", "Long-term alignment; salary-like framing reduces sell events"],
          ["Seed/private investors", "Monthly", "Standard; manageable decision frequency for professional investors"],
          ["Advisors", "Quarterly", "Low engagement expected; quarterly is administratively sufficient"],
          ["Core developers", "Continuous or weekly", "Minimises distraction from unlock decisions; salary-like framing"],
          ["Community/airdrop", "Monthly or continuous", "Monthly increases claim engagement; continuous removes barriers"],
          ["Ecosystem grants", "Milestone-based or monthly", "Milestone gates ensure capital is deployed before release"],
          ["Treasury / DAO", "Governance-controlled", "DAO vote on each disbursement; no automatic cadence needed"],
        ],
      },

      { type: "h2", text: "Design Recommendations for Protocol Teams" },
      {
        type: "ul",
        items: [
          "<strong>Default to monthly at minimum:</strong> Quarterly vesting for team or investor allocations creates excessive per-event sell pressure. Monthly is the safe floor for significant allocations.",
          "<strong>Consider continuous streaming for core team:</strong> Reframe team compensation as a salary stream rather than a series of capital events. Sablier and Unvest make this operationally simple.",
          "<strong>Stagger cadences across recipient categories:</strong> If team vests monthly on the 1st and investors vest quarterly on the 15th, the unlock events are distributed rather than concentrated. This is underappreciated vesting design sophistication.",
          "<strong>Design for the bear market, not the bull:</strong> Your vesting structure will be stress-tested in adverse conditions. High-frequency, small-tranche releases perform better under bear market conditions than quarterly chunks.",
          "<strong>Consider the decision-moment effect:</strong> Every unlock event is a sell decision opportunity. Fewer events per year reduces the aggregate probability of selling, but increases per-event sell pressure. More events reduces per-event pressure but creates more decision moments. The optimal balance depends on recipient characteristics.",
          "<strong>Disclose cadence explicitly:</strong> Most tokenomics documents state vesting duration and cliff but are ambiguous about cadence ('monthly' often means 'approximately monthly' and exact dates are unspecified). Precise cadence disclosure reduces uncertainty and front-running.",
        ],
      },

      {
        type: "faq",
        items: [
          {
            q: "What is vesting unlock cadence?",
            a: "Vesting unlock cadence is the frequency at which locked tokens are released to recipients — for example, daily, weekly, monthly, or quarterly. Two vesting schedules with the same total duration and allocation can have very different market effects depending on how often the unlocks occur.",
          },
          {
            q: "Is monthly or quarterly vesting better?",
            a: "For most allocation types, monthly vesting is preferable to quarterly. Monthly releases create smaller per-event supply additions that are easier for markets to absorb, particularly in bear conditions. Quarterly releases create larger, less frequent events that can be individually market-moving. Quarterly vesting is acceptable for advisors and strategic partners with low engagement expectations.",
          },
          {
            q: "What is continuous vesting (token streaming)?",
            a: "Continuous vesting — offered by platforms like Sablier — releases tokens in real-time, second by second, rather than in monthly or quarterly batches. There are no discrete unlock events. This eliminates the front-running and anticipatory selling associated with scheduled unlocks and reframes the recipient's mental model from a series of capital events to a continuous income stream.",
          },
          {
            q: "How does unlock frequency affect token price?",
            a: "Higher-frequency unlocks (daily, weekly) create smaller per-event supply additions that are easier for markets to absorb without price disruption. Lower-frequency unlocks (quarterly, semi-annual) create larger discrete events that can move price, particularly when the unlocking allocation is large relative to daily trading volume. In bear markets, high-frequency unlocks generally produce less concentrated sell pressure than low-frequency ones.",
          },
          {
            q: "Does unlock cadence affect governance participation?",
            a: "Indirectly, yes. Recipients who receive tokens through high-frequency vesting tend to accumulate and engage with them more steadily than those who receive large quarterly tranches. Quarterly recipients may leave tokens unclaimed between vesting events, reducing their governance participation in the interim periods.",
          },
          {
            q: "What is the best vesting cadence for a founding team?",
            a: "Continuous streaming or monthly vesting is generally optimal for founding teams. Continuous streaming reframes compensation as a salary stream, reducing the psychological salience of each release and the temptation to time the market. Monthly is the practical alternative for teams that want discrete events but need a manageable decision cadence.",
          },
          {
            q: "Why do most protocols use monthly vesting?",
            a: "Monthly vesting became the default because it aligns with how teams and investors think about time (calendar months), it is easy to communicate, and it was established as a norm before the infrastructure for higher-frequency vesting was readily accessible. The rise of low-cost L2 chains and streaming vesting platforms like Sablier is gradually enabling more sophisticated cadence designs.",
          },
        ],
      },
    ],
  },

  // ── Article 7 ────────────────────────────────────────────────────────────────
  {
    slug:        "estimating-token-unlock-price-impact",
    title:       "How to Estimate the Price Impact of a Token Unlock Event",
    excerpt:     "Token unlocks are public knowledge — so why do prices still dump? This framework shows you how to model sell pressure, adjust for holder type, and identify the unlocks that genuinely move markets.",
    publishedAt: "2025-04-02",
    updatedAt:   "2025-04-02",
    readingTime: "14 min read",
    category:    "Research",
    tags:        ["token unlock price impact", "vesting sell pressure", "circulating supply", "token unlock model", "DeFi research", "crypto markets"],
    content: [
      {
        type: "p",
        html: "Every token unlock event is announced months in advance. The vesting schedule is written into a smart contract, visible on-chain to anyone who looks. And yet, time after time, prices drop when cliff dates arrive. The question isn't whether unlocks cause sell pressure — they often do. The question is <strong>how much</strong>, under what conditions, and whether that pressure is already priced in before the date arrives.",
      },
      {
        type: "p",
        html: "This article builds a practical framework for estimating the price impact of a token unlock event. It is aimed at investors who want to size positions around vesting events, project teams who want to understand their own unlock risk, and analysts building vesting-aware models. We cover supply shock mechanics, a simple quantitative model, holder-type adjustments, and the real-world patterns the on-chain data reveals.",
      },

      { type: "h2", text: "The Mechanics of Unlock-Driven Sell Pressure" },
      {
        type: "p",
        html: "An unlock event increases the <strong>liquid supply</strong> of a token: tokens that were previously locked — and therefore unable to be sold — become transferable. This creates a potential supply shock. The magnitude of that shock depends on three variables:",
      },
      {
        type: "ul",
        items: [
          "<strong>The size of the unlock relative to current circulating supply.</strong> Unlocking 2% of circulating supply is a rounding error. Unlocking 40% is a structural event.",
          "<strong>The propensity of recipients to sell.</strong> A protocol treasury receiving tokens rarely dumps immediately. A VC fund at the end of a 12-month lockup often does.",
          "<strong>Market depth at the time of unlock.</strong> A token with $50m daily volume absorbs $5m in sell orders differently than one with $500k.",
        ],
      },
      {
        type: "p",
        html: "The core concept is <strong>adjusted float</strong>: the percentage of total supply that becomes newly liquid as a result of the unlock. If a token has 100m tokens in circulation and an upcoming cliff releases 20m tokens, the adjusted float change is 20%. This is the single most predictive variable for post-unlock price behaviour.",
      },
      {
        type: "callout",
        emoji: "📐",
        title: "The Float Change Formula",
        body: "Adjusted Float Change (%) = Unlock Amount ÷ (Current Circulating Supply + Unlock Amount) × 100. A 20m unlock into a 100m circulating supply = 16.7% float change. A 5m unlock into 500m = 1.0%. The difference in expected price impact is enormous.",
      },

      { type: "h2", text: "Building a Simple Price Impact Model" },
      {
        type: "p",
        html: "A workable first-order model combines the float change with two adjustments: <strong>holder type</strong> (who is receiving the unlocked tokens) and <strong>market depth</strong> (how much daily volume the token trades). The formula below is deliberately simple — the goal is a directional signal, not a precise prediction.",
      },
      {
        type: "ol",
        items: [
          "<strong>Compute the float change percentage.</strong> Unlock size ÷ (circulating supply + unlock size).",
          "<strong>Apply the holder-type multiplier.</strong> VC funds and early investors: 0.8–1.0 (high sell likelihood). Team and advisor tokens: 0.4–0.7 (moderate, depends on lockup culture). Community and ecosystem tokens: 0.1–0.3 (low immediate sell pressure). Protocol treasury: 0.05–0.15 (near-zero short-term sales).",
          "<strong>Compute the volume-adjusted impact.</strong> Divide (Unlock Amount × Holder Multiplier) by 30-day average daily volume. This gives you a rough estimate of how many trading days' worth of sell pressure the unlock represents.",
          "<strong>Sanity-check against market cap.</strong> If the adjusted sell pressure exceeds 5% of market cap, the event is high-risk regardless of other factors.",
        ],
      },
      {
        type: "p",
        html: "This model is intentionally conservative — it tells you <em>potential</em> sell pressure, not <em>actual</em> sell pressure. Real-world outcomes depend on market sentiment, token utility demand, and whether buyers step in. But the model reliably flags the events worth paying attention to.",
      },

      { type: "h2", text: "The Holder Type Matrix" },
      {
        type: "p",
        html: "The most important input to the model is holder type. Not all vesting recipients have the same incentive to sell. Here is a breakdown of the five main recipient categories and their historical sell tendencies:",
      },
      {
        type: "table",
        headers: ["Holder Type", "Typical Lock Duration", "Expected Sell Pressure", "Rationale"],
        rows: [
          ["Venture Capital / Seed Fund", "12–18 months", "High (70–90%)", "Return-focused, LPs expect distributions, cost basis often 5–20× below market"],
          ["Strategic Investor / Launchpad", "6–12 months", "Moderate–High (50–70%)", "Similar to VC but sometimes subject to reputation incentives to hold"],
          ["Founding Team", "12–24 months", "Moderate (30–60%)", "Depends heavily on runway needs, public commitments, and market conditions"],
          ["Advisors", "6–12 months", "Moderate–High (50–80%)", "Token-compensated work often treated as income; advisors frequently sell at unlock"],
          ["Community / Airdrop", "0–6 months", "Variable (10–90%)", "Highly sensitive to recipient size; small amounts sold immediately, large grants often staked"],
          ["Protocol Treasury", "N/A (internal)", "Very Low (5–15%)", "Treasury tokens deployed into liquidity, grants, or buybacks — rarely dumped on open market"],
        ],
      },

      { type: "h2", text: "Historical Patterns from On-Chain Data" },
      {
        type: "p",
        html: "Analysing on-chain vesting data across hundreds of unlock events reveals several consistent patterns. Understanding these patterns helps investors decide <em>when</em> to act, not just <em>whether</em> to act.",
      },
      {
        type: "ul",
        items: [
          "<strong>Pre-unlock front-running (days −14 to −7).</strong> Sophisticated short-sellers and informed insiders often position ahead of large cliff releases. Tokens with high anticipated sell pressure frequently decline 5–15% in the two weeks before a major cliff date.",
          "<strong>The cliff-day overshoot.</strong> On the day of a large cliff unlock, price often falls further than the fundamental sell pressure justifies. This is partly because of forced selling, partly because of stop-loss cascades, and partly because thin order books magnify moves.",
          "<strong>The post-dump recovery window.</strong> Within 7–21 days after a cliff event, prices often partially recover as selling exhausts itself. Buyers who waited for the dust to settle frequently find better entry points than those who bought before the cliff.",
          "<strong>Linear unlocks are quieter but cumulatively larger.</strong> Monthly linear vesting generates less day-of volatility than cliff events, but the cumulative supply addition over a 24-month schedule is often 3–5× larger than the initial cliff. The market tends to underappreciate this sustained pressure.",
        ],
      },
      {
        type: "callout",
        emoji: "⚠️",
        title: "\"The Unlock Is Priced In\" — Until It Isn't",
        body: "Market participants frequently claim that scheduled unlock events are already priced in. This is sometimes true — for small unlocks into liquid markets. It is often false for cliff events where the recipient is a VC fund with a cost basis 10× below market, or where the unlock represents more than 10% of circulating supply. Do the arithmetic before assuming the market has.",
      },

      { type: "h2", text: "Adjustments for Real-World Complexity" },
      {
        type: "p",
        html: "The simple model above is a starting point. Several real-world factors can significantly raise or lower the expected impact:",
      },
      {
        type: "ul",
        items: [
          "<strong>Cascading vesting schedules.</strong> Many projects have multiple recipient cohorts on slightly different schedules. A month where team, advisor, and investor vesting all overlap can produce 3× the single-cohort pressure.",
          "<strong>Staking and re-lock programs.</strong> If a project offers 20% APY staking, a significant proportion of newly unlocked tokens may be immediately re-staked rather than sold. This reduces effective sell pressure but is sensitive to rate changes.",
          "<strong>Protocol revenue and token utility.</strong> Tokens with genuine utility demand (gas fees, governance power, protocol access) have a demand floor that absorbs supply additions. Tokens with no utility are pure supply-demand dynamics and more sensitive to unlocks.",
          "<strong>Market regime.</strong> During bull markets, even large unlocks are often absorbed. During bear markets or risk-off periods, the same unlock can become a significant price event because buy-side depth evaporates.",
        ],
      },

      { type: "h2", text: "Putting It Together: A Worked Example" },
      {
        type: "p",
        html: "Suppose a mid-cap DeFi token (<strong>$VEST</strong>) has the following characteristics: 200m tokens circulating, $180m market cap, 30-day average daily volume of $8m. An upcoming cliff releases 40m tokens to the project's VC investors, whose cost basis is $0.30 versus a current price of $0.90.",
      },
      {
        type: "ol",
        items: [
          "<strong>Float change:</strong> 40m ÷ (200m + 40m) = 16.7%",
          "<strong>Holder type multiplier:</strong> VC investors at current price 3× cost basis → multiplier 0.85 (high sell pressure expected)",
          "<strong>Adjusted sell amount:</strong> 40m × 0.85 × $0.90 = $30.6m in potential selling",
          "<strong>Volume-adjusted impact:</strong> $30.6m ÷ $8m daily volume = 3.8 trading days of sell pressure",
          "<strong>Sanity check:</strong> $30.6m ÷ $180m market cap = 17% of market cap — high-risk threshold clearly breached",
          "<strong>Conclusion:</strong> This unlock warrants serious attention. Watch for pre-cliff positioning in the −14 day window, and consider the post-dump recovery trade 7–14 days after the cliff if fundamentals are intact.",
        ],
      },

      {
        type: "faq",
        items: [
          {
            q: "Why do token prices sometimes pump at a cliff unlock?",
            a: "Occasionally, unlock events are followed by price increases. This usually happens when: (1) sell pressure was already anticipated and over-priced into the token, causing a short-squeeze when actual selling is lighter than expected; (2) the project announces positive news timed to coincide with the unlock to offset negative sentiment; or (3) the unlocked recipients are insiders who immediately deploy tokens into liquidity provision rather than selling, creating buy-side depth.",
          },
          {
            q: "What float change percentage should be considered high risk?",
            a: "As a rough guide: under 3% is generally low impact, 3–8% warrants monitoring, 8–15% is significant and should factor into position sizing, and above 15% is a high-risk event regardless of holder type. These thresholds scale down in bear markets and up in strong bull markets where buy-side depth is deeper.",
          },
          {
            q: "Does vesting through Sablier vs UNCX vs Team Finance affect price impact?",
            a: "The protocol itself does not change the fundamental supply dynamics — the price impact comes from recipient incentives and market conditions, not which smart contract holds the tokens. However, streaming protocols like Sablier produce continuous micro-unlocks rather than discrete cliff events, which tend to spread sell pressure more evenly and reduce day-of volatility compared to cliff-based protocols.",
          },
          {
            q: "How do I find upcoming unlock events for a token I hold?",
            a: "The most reliable method is to read the project's smart contracts directly — vesting schedules are public on-chain data. Tools like Vestream aggregate this data across multiple protocols and chains, allowing you to see all upcoming cliff and linear unlock events in a single calendar view. Always cross-reference with the project's tokenomics documentation, as not all vesting is on-chain.",
          },
        ],
      },
    ],
  },

  // ── Article 9 ────────────────────────────────────────────────────────────────
  {
    slug:        "vesting-cliff-explained",
    title:       "The Vesting Cliff Explained: What It Is, Why It Exists, and Why It Moves Markets",
    excerpt:     "The cliff is the most misunderstood mechanism in token vesting — and the one most likely to catch investors off guard. This guide covers the mechanics, the market dynamics, and what the data shows about cliff-driven price events.",
    publishedAt: "2025-04-18",
    updatedAt:   "2025-04-18",
    readingTime: "13 min read",
    category:    "Fundamentals",
    tags:        ["vesting cliff", "cliff period", "token cliff unlock", "token vesting cliff", "crypto vesting schedule", "cliff mechanics"],
    content: [
      {
        type: "p",
        html: "Ask most crypto investors what a vesting cliff is, and they will tell you it is 'a waiting period before tokens unlock.' That is technically correct, but it misses what makes the cliff structurally significant. The cliff is not just a delay — it is a <strong>concentrated release event</strong> that can deliver 12 to 24 months' worth of token allocation in a single transaction. Understanding the cliff at a mechanical level changes how you analyse a project's tokenomics and how you position around unlock events.",
      },
      {
        type: "p",
        html: "This article covers cliff mechanics in depth: what they are, how they are encoded in smart contracts, why they became standard practice, the market dynamics they generate, and how to identify cliff events before they arrive. By the end, you will be able to read any vesting schedule and quickly determine whether the cliff presents a risk, an opportunity, or a non-event.",
      },

      { type: "h2", text: "What Is a Vesting Cliff?" },
      {
        type: "p",
        html: "A vesting cliff is a period at the start of a vesting schedule during which <strong>zero tokens are released</strong>. Once the cliff date is reached, a pre-defined lump sum — typically corresponding to the proportion of the total allocation that 'accrued' during the cliff period — unlocks immediately. After the cliff, remaining tokens vest according to the ongoing schedule (usually linear).",
      },
      {
        type: "p",
        html: "The classic structure in crypto is: <strong>12-month cliff, 36-month total vest</strong>. Under this schedule, 1/3 of the total allocation unlocks on the one-year anniversary of the grant date. The remaining 2/3 then vests linearly over the following 24 months, releasing in monthly increments. This is borrowed directly from startup equity compensation, where the same structure has been standard since the 1980s.",
      },
      {
        type: "callout",
        emoji: "💡",
        title: "The Cliff vs Linear Distinction",
        body: "Without a cliff, linear vesting begins from day one — the recipient earns tokens continuously from grant date. With a cliff, nothing is earned (or at least nothing is withdrawable) until the cliff date, at which point all accrued tokens release at once. The cliff is a threshold, not a gradual ramp.",
      },

      { type: "h2", text: "How Cliff Calculations Work On-Chain" },
      {
        type: "p",
        html: "On-chain, a cliff is implemented by comparing the current block timestamp to a stored cliff timestamp. Before the cliff, withdrawal functions revert with a 'cliff not reached' error. After the cliff, the claimable amount includes the cliff allocation.",
      },
      {
        type: "p",
        html: "Different protocols model cliffs differently. In <strong>Sablier v2 LockupLinear</strong>, two separate amounts are specified: a cliff amount (released at the cliff timestamp) and a streaming amount (released linearly from cliff to end). This allows precise control — a 25% cliff with 75% linear, for example, or a 0% cliff with 100% linear.",
      },
      {
        type: "p",
        html: "In <strong>Team Finance and UNCX</strong>, the cliff is modelled as a single timestamp before which nothing vests. After the cliff, the contract calculates how many full periods have elapsed since the start and releases the proportional amount. Some implementations allow multiple cliff stages — a <strong>cascading cliff</strong> where partial amounts release at defined intervals before the full schedule begins.",
      },
      {
        type: "ul",
        items: [
          "<strong>Cliff timestamp precision:</strong> Cliffs are encoded as Unix timestamps (seconds since January 1, 1970). The practical precision is one second, but actual block timestamps vary by chain — Ethereum blocks target 12 seconds, making cliff execution within 1–2 blocks of the target timestamp.",
          "<strong>Discrete vs continuous models:</strong> Streaming protocols (Sablier) release tokens continuously, so the 'cliff event' is technically the moment streaming begins rather than a discrete batch release. Non-streaming protocols release a fixed amount at the cliff block, making the event more discrete and visible on-chain.",
          "<strong>Gas and execution:</strong> The cliff release does not happen automatically. Recipients must call a claim or withdraw function. This means the actual on-chain transfer may happen hours or days after the cliff timestamp, depending on recipient attention and gas prices.",
        ],
      },

      { type: "h2", text: "Why Cliffs Exist" },
      {
        type: "p",
        html: "The cliff serves three distinct functions, each of which is relevant to how you evaluate a project's tokenomics design:",
      },
      {
        type: "ol",
        items: [
          "<strong>Commitment signalling.</strong> A cliff creates a minimum tenure requirement: recipients must stay engaged with the project for at least the cliff duration to receive any tokens. For team members, this is a retention mechanism. For investors, it is a signal that they are committing to the project's trajectory rather than looking for a quick exit.",
          "<strong>Anti-dump protection.</strong> Without a cliff, linear vesting begins on day one. For a token that is newly listed, early investors could immediately begin selling their first month's vesting allocation. The cliff delays this entirely, giving the token time to establish market depth and price discovery before meaningful selling from insiders begins.",
          "<strong>Alignment with project milestones.</strong> In practice, the 12-month cliff roughly corresponds to the time it takes for a project to launch its mainnet product, build early community, and establish some track record. Releasing tokens before this milestone would be premature for all parties.",
        ],
      },
      {
        type: "callout",
        emoji: "📜",
        title: "Why 12 Months Became the Standard",
        body: "The 12-month cliff in crypto traces directly to Silicon Valley startup equity. Typical startup equity grants use a 4-year vest with 1-year cliff — the same '1+3' or '1+2' structures common in crypto. When the first token-compensated crypto projects structured their allocations, they borrowed from equity compensation norms. The structure stuck, even though the liquidity dynamics of tokens are fundamentally different from illiquid startup equity.",
      },

      { type: "h2", text: "The Cliff Release Problem" },
      {
        type: "p",
        html: "Here is where the cliff becomes a market structure event rather than just a schedule mechanism. When the cliff fires, a <strong>large discrete quantity of tokens</strong> — potentially 20–35% of total allocation — becomes immediately liquid. The size of this event relative to the existing circulating supply determines whether the cliff is a market-moving occurrence or a non-event.",
      },
      {
        type: "table",
        headers: ["Unlock Type", "Market Impact Profile", "Price Predictability", "Seller Incentive"],
        rows: [
          ["Cliff release", "Large discrete shock on cliff date", "Low (single-day event, hard to predict timing)", "High pressure if cost basis well below market"],
          ["Linear monthly", "Steady incremental supply addition", "High (predictable monthly amounts)", "Moderate — small per-event, but cumulative"],
          ["Quarterly tranches", "Medium discrete events 4× per year", "Medium", "Moderate — larger than monthly, smaller than cliff"],
          ["Continuous stream (Sablier)", "Per-second micro-additions", "Very high (fully predictable)", "Low per-moment, but meaningful on long timescales"],
        ],
      },
      {
        type: "p",
        html: "Sophisticated market participants — particularly those with access to vesting schedule data — often begin positioning <strong>before the cliff date</strong>. This typically manifests as increased short interest, reduced buy-side depth, or direct selling by recipients who hold pre-cliff positions through derivatives or OTC agreements. The result is that many cliff events show price weakness in the 7–14 days before the cliff fires.",
      },

      { type: "h2", text: "Cliff Variations in the Wild" },
      {
        type: "p",
        html: "Not all projects use the standard 12-month cliff. Here is a taxonomy of cliff structures and what they signal about a project's incentive design:",
      },
      {
        type: "ul",
        items: [
          "<strong>No cliff (fully linear from day one).</strong> Common for community allocations and public sale tokens. Signals that the project wants recipients to feel immediate ownership. Watch for projects claiming 'no cliff' for team and investor allocations — this is a yellow flag for commitment.",
          "<strong>Short cliff (3–6 months).</strong> Used when liquidity is needed quickly — bootstrapping liquidity provider incentives, early ecosystem grants. Appropriate for operational allocations, but concerning for investor/team tokens.",
          "<strong>Standard cliff (12 months).</strong> The baseline. Reasonable alignment signal. Evaluate based on total vesting duration: a 12-month cliff with 14-month total vest is almost as risky as no cliff. A 12-month cliff with 36-month total vest is genuinely aligned.",
          "<strong>Extended cliff (18–24 months).</strong> Strong commitment signal, particularly for founding teams. Rare but increasingly seen in 'long-term narrative' projects that want to communicate multi-year conviction.",
          "<strong>Back-loaded schedules.</strong> Some projects use a reverse-cliff structure: small early tranches that increase in size over time. This discourages early selling but creates growing supply pressure in later years.",
        ],
      },

      { type: "h2", text: "How to Find and Track Cliff Dates" },
      {
        type: "p",
        html: "Identifying cliff dates for tokens you hold or are researching requires reading the vesting contract data directly. The process varies by protocol:",
      },
      {
        type: "ol",
        items: [
          "<strong>Find the vesting contract address.</strong> The project's documentation, tokenomics page, or initial token deployment transaction should reference the vesting contract. Many projects post this on their website or GitHub.",
          "<strong>Read the contract storage.</strong> Using a block explorer (Etherscan, BscScan, etc.), navigate to the contract and call the read functions. Look for <code>cliffTime</code>, <code>cliffDate</code>, <code>vestingStart</code>, or equivalent variables.",
          "<strong>Use a vesting aggregator.</strong> Tools like Vestream index vesting contracts across Sablier, UNCX, Team Finance, Hedgey, and Unvest, surfacing your cliff dates and unlock calendar in a single dashboard without manual contract interrogation.",
          "<strong>Verify against tokenomics documentation.</strong> On-chain data is ground truth, but project documentation often explains the intent behind the schedule. Discrepancies between documented schedules and on-chain data are a significant red flag.",
        ],
      },

      {
        type: "faq",
        items: [
          {
            q: "What happens to unvested tokens during the cliff period?",
            a: "During the cliff period, tokens remain in the vesting contract — they are not accessible to the recipient or the project. The project deposited them at vesting schedule creation; neither party can access them until the cliff date. If the schedule is revocable, the project can cancel the schedule and recover unvested tokens, but cannot access them without cancellation.",
          },
          {
            q: "Can a cliff be modified or removed after vesting has started?",
            a: "Generally no. Vesting schedules in smart contracts are largely immutable once created. The cliff timestamp is written into the contract at deployment and cannot be changed without deploying an entirely new vesting contract. Some multi-sig controlled contracts allow parameter modification, but this requires transparent governance and is rare in practice.",
          },
          {
            q: "Do all tokens have vesting cliffs?",
            a: "No. Public sale tokens and community distribution tokens often have no cliff — they vest immediately or on a short linear schedule. Mining and staking rewards typically have no cliff at all. Cliffs are most common for team, investor, and advisor allocations where long-term alignment is the goal. Always check the specific allocation category you are tracking.",
          },
          {
            q: "What is a 'hard cliff' vs 'soft cliff'?",
            a: "In some documentation, a 'hard cliff' refers to a schedule where zero tokens are accessible before the cliff date regardless of circumstances — the smart contract enforces it unconditionally. A 'soft cliff' sometimes refers to a revocable schedule where, while tokens don't vest before the cliff, the depositor can cancel the schedule and change the terms. In strict technical usage, all on-chain cliffs are 'hard' (the contract enforces them), but the revocability of the overall schedule affects the practical security of the recipient's allocation.",
          },
          {
            q: "Can I sell or transfer my vesting position before the cliff fires?",
            a: "On protocols that represent vesting as NFTs (Sablier, Hedgey), you can transfer the vesting NFT to another address, effectively selling the future claim to the tokens. The new holder then waits for the cliff and claims. On address-locked protocols (UNCX, Team Finance, Unvest), you cannot transfer the vesting position — it is permanently tied to the recipient address set at creation.",
          },
        ],
      },
    ],
  },

];

export default articles;

export function getArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): Article[] {
  return articles;
}
