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
    publishedAt: "2026-03-10",
    updatedAt:   "2026-03-10",
    readingTime: "12 min read",
    category:    "Fundamentals",
    tags:        ["token vesting", "crypto vesting", "vesting schedule", "token unlock", "DeFi"],
    content: [
      {
        type: "p",
        html: "Token vesting is one of the most consequential mechanisms in crypto – and one of the least understood. Whether you received tokens as an early investor, a founding team member, an advisor, or through a community airdrop, your ability to access those tokens is almost certainly governed by a vesting schedule. Understanding how vesting works is not optional; it shapes your cash flow, your tax obligations, and your understanding of a project's long-term incentive structure.",
      },
      {
        type: "p",
        html: "This guide is written for <strong>token holders of all kinds</strong> – from first-time crypto investors who just received their first token allocation, to experienced fund managers overseeing vesting positions across dozens of projects. We cover everything: what vesting is, why it exists, the terminology you need to know, how smart contracts enforce it, and how to find out exactly when your tokens unlock.",
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
        body:  "Token vesting = a time-locked release of tokens. Instead of receiving everything at once, you receive your allocation piece by piece over a set period – enforced by a smart contract.",
      },
      {
        type: "p",
        html: "The concept comes directly from traditional startup equity compensation. In Silicon Valley, it became standard practice in the 1980s to grant employees stock options that vest over four years, with a one-year cliff. This prevented employees from joining a company, receiving equity, and leaving immediately. The same logic applies in crypto: vesting prevents token recipients from immediately selling their entire allocation after a token lists on an exchange.",
      },

      { type: "h2", text: "Why Token Vesting Exists" },
      {
        type: "p",
        html: "Vesting solves a fundamental problem in token economies: the misalignment between short-term and long-term incentives. Without vesting, every team member, investor, and advisor would receive their full token allocation at the moment of the Token Generation Event (TGE). The rational short-term move for many of these recipients would be to sell immediately – creating enormous selling pressure at the worst possible time for a nascent project.",
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
          "<strong>Cliff period:</strong> A minimum holding duration before any tokens unlock. During the cliff, zero tokens vest – then at the cliff date, a lump sum unlocks (often the pro-rata share for the cliff period).",
          "<strong>Vesting schedule:</strong> The specific timeline and formula governing how tokens unlock – for example, 'monthly linear over 24 months after a 6-month cliff'.",
          "<strong>TGE (Token Generation Event):</strong> The moment a token is first created and distributed. Some schedules include a TGE unlock – a percentage of your allocation released immediately at launch.",
          "<strong>Unlock event:</strong> Any moment when a tranche of locked tokens becomes accessible to the recipient.",
          "<strong>Claimable balance:</strong> The quantity of tokens that have vested and are available to withdraw from the vesting contract right now.",
          "<strong>Locked amount:</strong> Tokens still subject to vesting – not yet accessible.",
          "<strong>Stream:</strong> A term used by platforms like Sablier and Unvest for a continuous, real-time token vesting position. Instead of monthly steps, tokens unlock per second.",
          "<strong>Tranche:</strong> A batch of tokens that unlocks at a specific point in time, as opposed to continuous streaming.",
          "<strong>Fully vested:</strong> The point at which 100% of an allocation has unlocked and the vesting schedule is complete.",
        ],
      },

      { type: "h2", text: "How Token Vesting Is Enforced On-Chain" },
      {
        type: "p",
        html: "In the early days of crypto, vesting agreements existed only as legal documents – off-chain contracts with no technical enforcement. A team member who wanted to sell before their vest date could simply do so, and the only recourse was litigation.",
      },
      {
        type: "p",
        html: "Today, the industry has moved decisively to <strong>smart contract-enforced vesting</strong>. Tokens are deposited into an audited smart contract at the time of allocation. The contract holds the tokens and releases them to the recipient's wallet address automatically, according to the schedule – without any human involvement. No one can override the schedule, including the project team.",
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
          "<strong>Hedgey Finance:</strong> Supports cliff, linear, and custom vesting with on-chain NFT-based positions.",
          "<strong>Unvest:</strong> Multi-chain vesting with support for delegated claiming and batch management.",
        ],
      },
      {
        type: "callout",
        emoji: "🔒",
        title: "Why on-chain enforcement matters",
        body:  "When vesting is enforced by a smart contract, you can verify your exact unlock schedule on a block explorer at any time. No trust required – the contract code is the agreement.",
      },

      { type: "h2", text: "Token Vesting vs Token Lockup: What's the Difference?" },
      {
        type: "p",
        html: "These terms are often used interchangeably but have a meaningful distinction:",
      },
      {
        type: "ul",
        items: [
          "<strong>Vesting</strong> describes a gradual release over time – tokens trickle out according to a schedule.",
          "<strong>Lockup</strong> typically refers to a hard lock for a fixed period with a single release at the end – all tokens unlock on one date.",
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
          "<strong>Month 0 (TGE):</strong> Token lists. You receive 0 tokens – the TGE unlock for your tranche is 0%.",
          "<strong>Months 1–12 post-TGE:</strong> Cliff period. Your tokens are locked. You watch the price but cannot sell.",
          "<strong>Month 12 (cliff unlocks):</strong> You receive the first vested tranche. With a cliff + linear structure, you receive approximately 1/24th of your total allocation (roughly 416,666 tokens) on the cliff date.",
          "<strong>Months 13–35:</strong> Each month, another 1/24th unlocks – approximately 416,666 tokens per month.",
          "<strong>Month 36:</strong> Final tranche unlocks. You are now fully vested and hold unrestricted access to all 10,000,000 tokens.",
        ],
      },
      {
        type: "p",
        html: "Over the 36-month post-TGE vesting period, you received your full allocation in 24 equal monthly instalments. At no point before the cliff could you access a single token – regardless of the market price.",
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
          "<strong>Use a protocol-native dashboard:</strong> Platforms like Sablier and Hedgey all provide dashboards where you can connect your wallet and view active positions.",
          "<strong>Use a dedicated vesting tracker:</strong> Tools like Vestream aggregate positions from all major vesting platforms across all chains in one dashboard – saving significant time if you hold positions on multiple protocols.",
        ],
      },

      { type: "h2", text: "What Happens When Tokens Fully Vest?" },
      {
        type: "p",
        html: "When your tokens are fully vested, they become freely transferable. In smart contract terms, the contract has no more hold over them – you can withdraw them to your wallet and do whatever you choose: hold, sell, delegate, or stake.",
      },
      {
        type: "p",
        html: "One important note: <strong>vesting is a taxable event in many jurisdictions.</strong> In the US, UK, and EU, receiving tokens through an employment or service relationship may create ordinary income tax liability at the point of vesting – not just when you sell. Token investors in financial instruments may have different treatment. Always consult a qualified tax professional familiar with digital assets.",
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
            a: "A vesting cliff is a minimum waiting period before any tokens unlock. During the cliff – typically 6 or 12 months – the recipient receives nothing. At the cliff date, a lump sum unlocks (usually the pro-rata share for the cliff period), and then regular vesting continues afterward.",
          },
          {
            q: "How long does token vesting usually last?",
            a: "For founding teams and early employees, vesting typically lasts 3–4 years. For seed investors, 2–3 years is common. Public sale participants often have shorter schedules of 6–18 months. The industry has trended toward longer vesting periods following the lessons of the 2021–2022 cycle.",
          },
          {
            q: "Can vested tokens be taken back?",
            a: "Once tokens have vested and been claimed from the smart contract, they are owned by the recipient and cannot be clawed back. Unvested tokens in a smart contract may be clawable in some implementations if the contract includes a revocation function – though this is less common in public-facing vesting contracts.",
          },
          {
            q: "What is TGE in token vesting?",
            a: "TGE stands for Token Generation Event – the moment a token is first created and begins distribution. Many vesting schedules include a 'TGE unlock percentage', meaning some portion of the allocation is released immediately at launch. For example, 'TGE: 10%, then 12-month linear' means 10% is available immediately and the remaining 90% unlocks over 12 months.",
          },
          {
            q: "Is token vesting the same as token staking?",
            a: "No. Token vesting is a time-lock mechanism that controls when you receive your allocation. Token staking is when you voluntarily lock tokens you already own to earn rewards, validate a network, or gain governance power. They serve different purposes: vesting is about distribution; staking is about participation.",
          },
          {
            q: "How do I know if my wallet has vested tokens waiting to be claimed?",
            a: "You need to check the vesting contracts associated with your wallet address. Each protocol has its own dashboard (the Sablier app, etc.), or you can use a cross-protocol tracker like Vestream to see all your vested-but-unclaimed balances across every supported platform in one view.",
          },
          {
            q: "Can I sell my unvested tokens?",
            a: "Generally, no. Unvested tokens are held in a smart contract and are not in your wallet – you cannot transfer or sell them until they unlock. Some protocols do support transferring the vesting position itself (as an NFT), which allows secondary market trading of unvested claims, but this varies by platform and carries significant risks.",
          },
          {
            q: "What happens to unvested tokens if a project fails?",
            a: "If a project shuts down but the vesting smart contract continues to run, tokens may still vest on schedule – but they may be worthless. In cases where the team controlled the contract, unvested tokens might be returned to the treasury. This varies entirely by contract design; always review the specific contract terms.",
          },
          {
            q: "What is the difference between linear and cliff vesting?",
            a: "Linear vesting releases tokens evenly over time – for example, 1/12th of your allocation every month for 12 months. Cliff vesting (or a 'cliff' in a hybrid schedule) means nothing unlocks until a specific date, after which vesting begins. Most real-world schedules combine both: a cliff period with no unlocks, followed by linear monthly vesting.",
          },
        ],
      },
    ],
  },

  // ── Article 2 ────────────────────────────────────────────────────────────────
  {
    slug:        "token-vesting-schedules-explained",
    title:       "Token Vesting Schedules Explained: Cliff, Linear, and Stepped Vesting",
    excerpt:     "A deep-dive into the three main types of token vesting schedules – cliff, linear, and stepped – with real examples, comparison tables, and the red flags every investor should know.",
    publishedAt: "2026-03-11",
    updatedAt:   "2026-03-11",
    readingTime: "14 min read",
    category:    "Tokenomics",
    tags:        ["vesting schedule", "cliff vesting", "linear vesting", "token unlock schedule", "tokenomics"],
    content: [
      {
        type: "p",
        html: "When a blockchain project raises capital or rewards contributors, one of the most important decisions it makes is the <strong>token vesting schedule</strong>: the exact timeline and formula by which locked tokens become accessible. Get it right and you align long-term incentives for everyone involved. Get it wrong – with too short a schedule, too-large a TGE unlock, or no cliff – and you create the conditions for an insider dump that destroys token value.",
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
          "The <strong>start date</strong> (when vesting begins – often TGE or a fixed date prior)",
          "The <strong>end date</strong> (when the full allocation becomes available)",
          "The <strong>release pattern</strong> (continuously, monthly, quarterly, or at milestones)",
          "Any <strong>cliff period</strong> (a waiting period before the first unlock)",
          "The <strong>TGE unlock percentage</strong> (tokens released immediately at launch, if any)",
        ],
      },
      {
        type: "p",
        html: "All of this is typically encoded in a smart contract at the time the allocation is created. The contract enforces the schedule without any human intermediary – not even the project team can override it (assuming the contract has no admin key).",
      },

      { type: "h2", text: "The Three Main Types of Token Vesting Schedules" },

      { type: "h3", text: "1. Linear Vesting" },
      {
        type: "p",
        html: "Linear vesting is the simplest and most predictable schedule. Tokens unlock at a constant rate over the vesting period – either continuously (per second, using platforms like Sablier) or in equal periodic batches (monthly is most common).",
      },
      {
        type: "callout",
        emoji: "📐",
        title: "Linear vesting formula",
        body:  "Tokens unlocked at time T = (Total allocation × elapsed time) ÷ total vesting duration. If you have 1,200,000 tokens vesting over 12 months, you unlock exactly 100,000 tokens per month – or ~3,333 per day in a continuous stream.",
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
          ["Predictability", "Very high – recipient knows exactly what unlocks when"],
          ["Sell pressure", "Consistent and gradual – easier for markets to absorb"],
          ["Common interval", "Monthly (most common), daily, or continuous (per-second)"],
          ["Best for", "Team members, long-term investors, protocol treasuries"],
          ["Downside", "No cliff means tokens start releasing from day one – a risk for projects pre-product-market-fit"],
        ],
      },

      { type: "h3", text: "2. Cliff Vesting" },
      {
        type: "p",
        html: "A cliff vesting schedule (or 'cliff' in a hybrid schedule) introduces a waiting period at the start of vesting during which <em>no tokens unlock at all</em>. At the end of the cliff period, the tokens that accumulated during that period unlock in a single lump sum, and regular vesting then continues.",
      },
      {
        type: "p",
        html: "The <strong>one-year cliff</strong> became standard in startup equity vesting after it was found that many early hires leave within the first year – and a 12-month cliff ensures they demonstrate real commitment before receiving any equity. Crypto adopted this convention wholesale.",
      },
      {
        type: "callout",
        emoji: "🧱",
        title: "Why the 1-year cliff is standard",
        body:  "The cliff protects against contributors who take an allocation and immediately disengage. It aligns team members and investors across the most volatile period of a project's life – typically the first year post-launch, when direction and execution matter most.",
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
          ["Alignment signal", "Very strong – recipient must stay committed through the cliff"],
          ["Market impact", "Cliff unlock can create short-term sell pressure on the cliff date"],
          ["Best for", "Team members, seed/private round investors, core contributors"],
          ["Risk", "Large unlock at cliff date is visible on vesting trackers and often anticipated by market"],
        ],
      },

      { type: "h3", text: "3. Stepped / Milestone Vesting" },
      {
        type: "p",
        html: "Stepped (also called 'graded' or 'tranche') vesting releases tokens in discrete batches at scheduled intervals – quarterly is common – rather than continuously. Milestone vesting is a variant where unlocks are triggered by project achievements (mainnet launch, TVL target, user growth) rather than calendar dates.",
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
          ["Predictability", "High – unlock dates are known in advance"],
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
        html: "The following benchmarks reflect the norms that have emerged across institutional token deals from 2021 through 2024. These are starting points for negotiation – not fixed rules – but deviating significantly from them in a less restrictive direction should raise questions.",
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
            a: "In properly structured smart contract-enforced vesting, no. The schedule is immutable once the contract is deployed. However, some contracts include admin functions that allow the deployer to modify terms – this is a risk factor that should be disclosed and ideally removed before tokens are distributed.",
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
            a: "Continuous vesting (offered by platforms like Sablier) is more flexible – recipients can claim any amount at any time rather than waiting for a monthly date. It creates no discrete 'unlock events' for the market to anticipate. However, the economic outcome over a full vesting period is identical to monthly linear vesting.",
          },
        ],
      },
    ],
  },

  // ── Article 3 ────────────────────────────────────────────────────────────────
  {
    slug:        "how-to-track-token-vesting",
    title:       "How to Track Your Token Vesting: A Complete Guide for Investors and Teams",
    excerpt:     "From manual block explorer lookups to dedicated multi-protocol dashboards, this guide covers every method for tracking token vesting schedules – and how to make sure you never miss an unlock.",
    publishedAt: "2026-03-12",
    updatedAt:   "2026-03-12",
    readingTime: "11 min read",
    category:    "Guides",
    tags:        ["track token vesting", "token vesting tracker", "how to check vesting schedule", "token unlock tracker", "crypto portfolio"],
    content: [
      {
        type: "p",
        html: "Token vesting is easy to forget about – until you realise you missed a claim window, failed to account for an unlock in your portfolio planning, or discovered that three protocols have been accumulating claimable balances in your wallet for months. For anyone managing a serious position in vested tokens, tracking is not a nice-to-have. It is essential.",
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
          "<strong>Tax obligations:</strong> In many jurisdictions, vesting events create taxable income at the point of vesting – not just at sale. Missing these events means missed tax filings.",
          "<strong>Project monitoring:</strong> Tracking when major team and investor vestings unlock for a project you hold is essential due diligence – large unlock events consistently correlate with increased sell-side pressure.",
          "<strong>Fragmentation:</strong> A single wallet may have active positions on Sablier and Hedgey simultaneously – across Ethereum, BSC, and Base. Without a unified view, this is nearly impossible to manage manually.",
        ],
      },

      { type: "h2", text: "The Problem: Token Vesting Is Fragmented" },
      {
        type: "p",
        html: "Unlike traditional equity vesting – where a single brokerage account shows your entire position – crypto vesting is spread across:",
      },
      {
        type: "ul",
        items: [
          "<strong>Multiple protocols:</strong> Sablier, UNCX, Hedgey, Unvest, and custom contracts each have their own dashboards and data formats",
          "<strong>Multiple blockchains:</strong> The same wallet address may hold vestings on Ethereum mainnet, BNB Chain, Base, and testnets simultaneously",
          "<strong>Multiple wallets:</strong> Fund managers and project teams often manage dozens of beneficiary wallets",
          "<strong>No universal standard:</strong> There is no shared data format or API across vesting protocols – each must be queried separately",
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
          ["Hedgey Finance", "hedgey.finance", "Token plans, unlock calendar, batch claiming"],
          ["Unvest", "unvest.io", "Positions by chain, real-time unlock amounts"],
        ],
      },
      {
        type: "p",
        html: "Protocol-native dashboards are reliable and up-to-date for their own contracts, but they only show positions on <em>that specific protocol</em>. If you have vestings across Sablier <em>and</em> Hedgey <em>and</em> UNCX, you need to visit three separate sites, potentially across multiple chains.",
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
          "<strong>Multi-protocol coverage:</strong> Should cover all major vesting platforms – Sablier, UNCX, Hedgey, Unvest at minimum",
          "<strong>Multi-chain coverage:</strong> Ethereum, BNB Chain, Base, and any chains where you hold positions",
          "<strong>Real-time data:</strong> Claimable balances change every second on streaming protocols – the tool should reflect current on-chain state",
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
        html: "Vestream is a dedicated token vesting tracker that covers the major vesting protocols – Sablier, UNCX, Hedgey, Unvest, Superfluid, Team Finance, PinkSale, Streamflow, and Jupiter Lock – across Ethereum, BNB Chain, Base, Arbitrum, and Solana. Here is a step-by-step guide to getting set up:",
      },
      {
        type: "ol",
        items: [
          "<strong>Connect your wallet:</strong> Go to vestream.io and sign in with your Ethereum wallet via Sign-In With Ethereum (SIWE). No password, no email required.",
          "<strong>Add your wallet address(es):</strong> Navigate to Settings → Tracked Wallets and add the addresses you want to monitor. You can specify which chains and protocols to track per wallet, or track all.",
          "<strong>View your dashboard:</strong> The dashboard aggregates all active vesting positions from all tracked wallets and protocols. You'll see locked amount, claimable balance, protocol, chain, and token for every stream.",
          "<strong>Check your unlock timeline:</strong> The Timeline section shows a visual calendar of upcoming unlock events across all your positions.",
          "<strong>Use Discover for unknown wallets:</strong> The Discover tab lets you scan any wallet address and find all vesting positions across all protocols and chains – useful for due diligence or tracking a wallet you've been given by a client.",
          "<strong>Set up alerts:</strong> Configure email notifications for upcoming unlocks in Settings → Notifications.",
          "<strong>Export data:</strong> Use the CSV export function in the dashboard for accounting records.",
        ],
      },

      { type: "h2", text: "Tracking Token Vestings for Due Diligence" },
      {
        type: "p",
        html: "Savvy investors don't just track <em>their own</em> vestings – they also track the vestings of <strong>team wallets and investor allocations</strong> for projects they hold. Large unlock events for insiders are consistently associated with increased sell-side pressure, and knowing when they occur gives you information to act on.",
      },
      {
        type: "p",
        html: "Using the Discover feature on Vestream, you can scan any public wallet address and immediately see all active vesting positions – including protocol, chain, claimable balance, and the unlock schedule. For known project team wallets (often disclosed in audit reports or DAO governance), this provides direct visibility into when key insiders might be able to sell.",
      },
      {
        type: "callout",
        emoji: "💡",
        title: "Pro tip: Watch project treasury wallets",
        body:  "Many DAOs publicly disclose their treasury multisig and vesting wallet addresses. Tracking these gives you advance notice of unlock events that affect circulating supply – information that professional traders use for position sizing.",
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
        html: "Token vesting events can be taxable in multiple jurisdictions – particularly if you received tokens as compensation for services (employment, advisory, or development work). In those cases, each vesting event may create ordinary income at the fair market value of the tokens on the vesting date.",
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
        html: "Vestream's CSV export provides the vesting event data you need. You will still need historical price data from a source like CoinGecko or CoinMarketCap to calculate fiat values – or use a dedicated crypto tax tool like Koinly or CoinTracker, and import the CSV for the vesting events.",
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
            a: "A dedicated multi-protocol vesting tracker like Vestream provides the most comprehensive view – covering Sablier, UNCX, Hedgey, Unvest, Superfluid, Team Finance, PinkSale, Streamflow, and Jupiter Lock across Ethereum, BNB Chain, Base, Arbitrum, and Solana in one dashboard. For single-protocol users, the protocol's own dashboard (e.g., Sablier app) is sufficient.",
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
            a: "On most platforms, yes – vested tokens accumulate in the smart contract until you actively claim (withdraw) them. Platforms like Sablier allow you to claim the continuously-streamed amount at any time. Some protocols support automated claiming via scripts or third-party services, but manual claiming is the norm.",
          },
          {
            q: "What happens if I don't claim my vested tokens?",
            a: "Unclaimed vested tokens remain in the smart contract. They do not expire in most well-designed vesting contracts – you can claim them at any time after they vest. However, leaving large balances unclaimed introduces smart contract risk, and in some edge cases (contract upgrades, protocol deprecation), you may need to migrate positions. Claim regularly.",
          },
          {
            q: "Is token vesting income taxable?",
            a: "In most major jurisdictions (US, UK, EU), token vesting that results from employment, services, or advisory work is taxable as ordinary income at the point of vesting – based on the fair market value of the tokens on the vesting date. Token vesting from investment contracts (SAFTs) may be treated differently. Always consult a qualified crypto-specialist tax advisor.",
          },
          {
            q: "How do I track vestings across multiple blockchains?",
            a: "Use a multi-chain vesting tracker. Vestream supports Ethereum, BNB Chain, Base, and Sepolia simultaneously – the same wallet address is monitored across all chains. You can also track different wallets on different chains under a single account.",
          },
        ],
      },
    ],
  },
  // ── Article 4 ────────────────────────────────────────────────────────────────
  {
    slug:        "shadow-liquidity-vesting-token-price",
    title:       "Shadow Liquidity: How Vesting Schedules Quietly Control Token Price Floors",
    excerpt:     "Everyone tracks circulating supply. Almost no one models the shadow liquidity layer underneath it – the predictable, time-released sell pressure baked into every vesting schedule. Here is how it works and why it matters more than any chart pattern.",
    publishedAt: "2026-03-13",
    updatedAt:   "2026-03-13",
    readingTime: "13 min read",
    category:    "Market Analysis",
    tags:        ["shadow liquidity", "token vesting price impact", "token unlock sell pressure", "vesting calendar", "circulating supply"],
    content: [
      {
        type: "p",
        html: "When analysts discuss a token's price action, they reach for the usual toolkit: order book depth, RSI, on-chain volume, whale movements, macro sentiment. Almost universally, one factor gets ignored – or mentioned only in passing when something goes wrong. Vesting schedules. The structured, time-locked release of insider allocations is not just a governance mechanism; it is a <strong>forward-looking supply schedule</strong> that sophisticated market participants model months in advance. Those who understand it have a structural informational edge over those who don't.",
      },
      {
        type: "p",
        html: "This piece is for <strong>traders and fund managers</strong> who want to understand why unlock events consistently move markets, <strong>investors evaluating new projects</strong> who want to stress-test reported supply metrics, and <strong>protocol teams</strong> designing vesting structures and wondering how the market will react. We are going to go deep on a concept we call shadow liquidity – and why it is arguably more important to token price dynamics than anything on a price chart.",
      },

      { type: "h2", text: "What Is Shadow Liquidity?" },
      {
        type: "p",
        html: "Shadow liquidity is the supply of tokens that does not yet appear in official circulating supply metrics but is committed to enter circulation on a known, predictable schedule. It lives in vesting smart contracts – technically locked, but mathematically certain to unlock.",
      },
      {
        type: "callout",
        emoji: "🔦",
        title: "Shadow liquidity defined",
        body:  "Shadow liquidity = the sum of all unvested token allocations whose unlock dates are known. It is supply that will exist, is priced into informed market participants' models, and will be distributed to recipients who have a choice about whether to sell.",
      },
      {
        type: "p",
        html: "The key insight is that shadow liquidity is not random. It is <em>deterministic</em>. A vesting contract deployed at TGE specifies exactly how many tokens unlock on exactly which dates for the entire vesting duration. This makes token supply dynamics fundamentally different from equity markets, where future share issuance is subject to board votes and market windows. In crypto, the supply curve is already written – it is just hidden in contract state.",
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
          ["Liquidity",     "8%",  "100%","–",         "–"],
          ["Community",     "10%", "20%", "3 months",  "12 months"],
        ],
      },
      {
        type: "p",
        html: "Mapping these allocations to a monthly unlock curve produces something dramatic: <strong>months 9–15 post-TGE represent the single most dangerous window for sell pressure</strong>. Advisors start unlocking at month 6. Private round recipients unlock their remaining 95% starting at month 9. Seed and team cliff at month 12 – simultaneously. The ecosystem fund cliff also hits at month 12. This is not a coincidence; it is simply the consequence of standard vesting terms, but the compounded effect is a supply tsunami that most retail investors are completely unprepared for.",
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
        html: "Whale wallets – particularly those associated with VC firms or early investors – are often tracked by on-chain analysts. When a known seed round wallet begins moving newly unlocked tokens toward an exchange deposit address, it functions as an observable leading indicator of sell pressure. Tools like Nansen, Arkham, and Vestream's Discover feature make this kind of monitoring accessible beyond the institutional tier.",
      },
      {
        type: "p",
        html: "The practical consequence: <strong>price weakness often begins before the unlock event itself</strong>. Informed sellers front-run the unlock by establishing short positions or reducing longs ahead of the date. This means the observable price impact of an unlock event is often distributed over the 2–4 weeks before and after it, not concentrated on the unlock date itself.",
      },

      { type: "h2", text: "The Concept of True Circulating Supply" },
      {
        type: "p",
        html: "Reported circulating supply – the figure that appears on CoinMarketCap, CoinGecko, and in research reports – is legally required to exclude locked tokens. But this creates a systematic distortion: it understates the supply pressure that is deterministically incoming.",
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
        html: "The delta between reported and true circulating supply is largest immediately after TGE (when all insider allocations are locked) and narrows progressively as vesting progresses. For many tokens in their first 18 months post-launch, true circulating supply is 3–8× the reported figure – meaning the reported market cap and FDV comparisons used to evaluate valuation are built on a foundation that systematically misrepresents supply.",
      },

      { type: "h2", text: "How to Visualise the Vesting Pressure Curve" },
      {
        type: "p",
        html: "A vesting pressure curve is a chart of monthly incremental token unlocks – not cumulative supply, but the <em>new supply entering circulation each month</em>. It is the derivative of the cumulative unlock chart, and it is what actually matters for price impact.",
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
        html: "The resulting chart immediately reveals the months of peak supply pressure – the periods where a disproportionate share of total supply is entering circulation. <strong>These are the months to watch for price support tests or breakdowns.</strong> Projects that have done this analysis well often stagger their vesting terms across different categories specifically to smooth the pressure curve.",
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
        html: "In strong bull markets, major unlock events often fail to produce the expected sell-off. Holders who have waited 12–18 months for their cliff to expire face a decision: sell into strength and potentially miss further upside, or hold and extend their position. When market sentiment is decisively bullish, many choose to hold. The price weakness that was expected around the unlock date instead becomes a brief consolidation, and the lack of selling becomes itself a bullish signal – confirming holder conviction.",
      },
      { type: "h3", text: "Pattern 2: The double-cliff convergence breakdown" },
      {
        type: "p",
        html: "The most reliably bearish unlock scenario involves multiple major stakeholder categories reaching their cliff simultaneously during a bear market. When seed investors (12%), team (18%), and an ecosystem fund (20%) all unlock in the same 30-day window, representing 50% of total supply becoming liquid, the combined sell pressure often exceeds what any level of buy-side demand can absorb. Price support levels – particularly psychological round numbers – often fail in these windows, triggering stop cascades that extend the move beyond what fundamental supply math would predict.",
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
            a: "A vesting pressure curve charts the monthly incremental new supply entering circulation from vesting unlocks – not cumulative supply, but the new tokens unlocking each month. It is the most useful visual tool for identifying periods of peak sell-side risk in a token's lifecycle.",
          },
        ],
      },
    ],
  },

  // ── Article 5 ────────────────────────────────────────────────────────────────
  {
    slug:        "zombie-supply-unclaimed-vesting-tokens",
    title:       "Zombie Supply: The Hidden Impact of Unclaimed Vesting Tokens",
    excerpt:     "There is a category of tokens that have technically vested but will never trade, never vote, and never show up in any meaningful metric. Zombie supply distorts everything – circulating supply, FDV, governance, and liquidity models. Here is what it is and why protocols need to start measuring it.",
    publishedAt: "2026-03-14",
    updatedAt:   "2026-03-14",
    readingTime: "12 min read",
    category:    "Tokenomics",
    tags:        ["zombie supply", "unclaimed vesting tokens", "circulating supply distortion", "token FDV", "governance participation"],
    content: [
      {
        type: "p",
        html: "In every token ecosystem, there exists a category of supply that is technically alive but functionally dead. These are tokens that have fully vested – unlocked from their smart contracts, available to claim – but whose intended recipients have never claimed them, and likely never will. The wallet is inactive. The keys may be lost. The holder has moved on. The tokens sit in limbo: neither locked nor truly circulating, neither voting nor transferring. We call this <strong>zombie supply</strong>.",
      },
      {
        type: "p",
        html: "Zombie supply is not a theoretical edge case. It affects every protocol with significant vesting, particularly those that conducted broad airdrops or community distributions. Its consequences ripple through every metric that investors, analysts, and governance participants rely on. And almost nobody talks about it – because almost nobody measures it.",
      },

      { type: "h2", text: "What Is Zombie Supply?" },
      {
        type: "p",
        html: "Zombie supply is the aggregate of claimable vested tokens that have not been claimed and show strong evidence of never being claimed – due to wallet inactivity, lost private keys, disengaged recipients, or deceased holders.",
      },
      {
        type: "callout",
        emoji: "🧟",
        title: "Zombie supply defined",
        body:  "Zombie supply = tokens that have vested (are technically claimable) but remain unclaimed in vesting contracts, held by wallets with no recent on-chain activity. They count toward calculated circulating supply but contribute no real liquidity, no governance participation, and no economic activity.",
      },
      {
        type: "p",
        html: "The phenomenon is closely related to – but distinct from – the well-known problem of lost Bitcoin (estimated at 3–4 million BTC). Bitcoin loss is permanent: private keys are gone forever. Zombie supply is more ambiguous: the tokens could theoretically be claimed tomorrow if the recipient re-appears. In practice, for positions that have been claimable for more than 12–24 months with no on-chain activity from the recipient wallet, the effective probability of claiming approaches zero.",
      },

      { type: "h2", text: "How Unclaimed Tokens Distort Circulating Supply" },
      {
        type: "p",
        html: "Standard circulating supply calculations count all tokens that are not locked in smart contracts as 'circulating'. This is operationally sensible – there is no reliable way to distinguish between a token held by an active investor and one held by a wallet whose owner lost access five years ago. The problem is that this produces a circulating supply figure that <em>overstates effective supply</em>.",
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
        html: "This is not a hypothetical. Claim rate analysis of major protocol airdrops consistently shows that 20–40% of airdrop recipients never claim their full allocation. For team and investor vestings, the numbers are better – financial motivation is higher – but even here, advisor wallets, small early contributors, and participants who left the ecosystem can accumulate years of unclaimed vested tokens.",
      },

      { type: "h2", text: "The FDV Problem: Why It Is Even More Misleading Than You Think" },
      {
        type: "p",
        html: "Fully Diluted Valuation (FDV) – the market cap if all tokens were in circulation at the current price – is already a controversial metric because it treats locked tokens as economically equivalent to liquid ones. Zombie supply makes this worse by introducing a third category: tokens that are neither locked nor truly liquid, but are counted as liquid.",
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
        html: "Sophisticated valuation analysts sometimes attempt to adjust for this by estimating 'effective circulating supply' – active wallets only, excluding dust wallets, long-dormant addresses, and known custodial holding patterns. This is labour-intensive but produces materially more accurate valuations.",
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
          ["Airdrop recipient: never claimed", "Very low (15–25%)", "High – never activated vesting contract"],
          ["Airdrop recipient: claimed once, then silent", "Low (30–40%)", "Medium – partial claim, remainder zombie"],
          ["Early testnet contributor, inactive since mainnet", "Low", "High – often received vesting but left ecosystem"],
          ["Advisor with lost/inaccessible wallet", "Negligible", "High – full allocation becomes zombie"],
          ["Exchange wallet that received allocation", "Moderate", "Varies – depends on exchange policy"],
          ["DAO treasury with deprecated multisig", "Low", "High – governance friction prevents claim"],
          ["Deceased holder", "Very low", "High – key management rarely transferred"],
        ],
      },
      {
        type: "p",
        html: "The advisor category deserves special attention. Advisors in early-stage crypto projects frequently hold positions across dozens of projects, received tokens years ago on hardware wallets they no longer have, or used browser extension wallets that were tied to machines they have since replaced. Advisor allocations – typically 2–5% of supply – can be disproportionate contributors to zombie supply.",
      },

      { type: "h2", text: "The Governance Vacuum: Voting Power That Never Shows Up" },
      {
        type: "p",
        html: "In governance token systems, zombie supply creates a structural democratic deficit. If 25% of circulating governance tokens are zombie supply – claimable but held by inactive wallets – then the governance system is effectively operating at 75% participation capacity even before you account for voluntary voter apathy.",
      },
      {
        type: "p",
        html: "This has several compounding consequences:",
      },
      {
        type: "ul",
        items: [
          "<strong>Quorum thresholds become harder to reach:</strong> If a governance proposal requires 10% of circulating supply to vote for quorum, and 25% of that supply is zombie, then the effective quorum threshold is 13.3% of actively controlled supply – significantly harder to achieve.",
          "<strong>Vote concentration risk increases:</strong> When zombie supply is large, the effective voting power of active token holders is higher than nominal. A whale holding 5% of circulating supply may effectively control 6.5–7% of realistic votes.",
          "<strong>Governance attack surface widens:</strong> Quorum requirements calibrated against stated circulating supply may be inadequate against the true distribution of active holders.",
          "<strong>Treasury management is distorted:</strong> Treasury proposals are evaluated relative to total circulating supply, when the economically relevant denominator is active supply.",
        ],
      },
      {
        type: "callout",
        emoji: "🗳️",
        title: "Governance quorum math with zombie supply",
        body:  "If a protocol has 100M circulating tokens, and 22M are zombie supply, the governance system functionally has 78M active tokens. A 10% quorum threshold means getting 10M votes – but that represents 12.8% of active supply. Quorums calibrated to stated circulating supply systematically underestimate the difficulty of reaching meaningful participation.",
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
          "<strong>Staking participation rates:</strong> Staking rates calculated as a percentage of circulating supply are understated – zombie supply never stakes, inflating the denominator",
          "<strong>Exchange listing requirements:</strong> Some exchanges have minimum free-float requirements; zombie supply may artificially satisfy these requirements",
          "<strong>Collateralisation models:</strong> Lending protocols that accept governance tokens as collateral may over-collateralise based on circulating supply figures that include zombie tokens",
          "<strong>Vesting contract audit risk:</strong> Tokens sitting unclaimed in vesting contracts for years become an underappreciated smart contract security risk – old contracts may contain vulnerabilities or be targeted for deprecated contract attacks",
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
          "<strong>Active supply ratio:</strong> The percentage of vested tokens that have actually been claimed by recipients – a proxy for effective circulating supply",
          "<strong>Ecosystem engagement signal:</strong> Falling claim rates are an early warning signal for recipient disengagement, particularly for community and airdrop allocations",
          "<strong>Zombie accumulation rate:</strong> The rate at which claimable tokens are accumulating without being claimed – the higher this rate, the more zombie supply is building in the protocol",
          "<strong>Governance health indicator:</strong> In governance token systems, claim rate correlates with governance participation capacity",
        ],
      },
      {
        type: "p",
        html: "This metric is entirely computable from on-chain data. Vesting contracts store both the total vested amount and the amount claimed. The difference is unclaimed vested supply – the raw material for zombie supply analysis. Protocols that surface this data on their analytics dashboards are providing a level of transparency that is currently rare but should become standard.",
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
          "<strong>Query claimed vs deposited amounts:</strong> Most vesting contracts expose a function to query total deposited and total withdrawn for each position – the delta is unclaimed vested supply",
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
          "<strong>Implement auto-claim mechanisms:</strong> Some vesting contracts support push-based distribution rather than pull-based claiming – tokens are sent to recipient wallets rather than waiting to be claimed. This eliminates the claiming friction that contributes to zombie accumulation.",
          "<strong>Set unclaim expiry windows:</strong> Contractually, unclaimed positions that exceed a defined inactivity threshold (e.g., 24 months after vesting) could be subject to governance vote for reallocation. This requires careful legal and contract design but has precedent in traditional equity (abandoned property laws).",
          "<strong>Build recipient re-engagement campaigns:</strong> Regular email and social outreach to allocation recipients – particularly for community rounds – with clear instructions on claiming can recover meaningful amounts of would-be zombie supply.",
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
            a: "Zombie supply affects token price indirectly by distorting the metrics used to evaluate it. Circulating supply overstatement makes market cap appear larger than effective liquidity justifies. More directly, zombie supply that is counted as circulating but will never trade removes real sell-side pressure that would otherwise exist – which is actually a mild positive for price stability, but introduces governance and metric distortion.",
          },
          {
            q: "What is the claimed vs claimable metric?",
            a: "Claimed vs claimable is the ratio of tokens that have been claimed from vesting contracts to the total tokens that have vested and are available to claim. It is a direct measure of recipient engagement and a proxy for effective circulating supply. A 70% claim rate means 30% of vested tokens are sitting unclaimed – potential zombie supply.",
          },
          {
            q: "Can zombie supply tokens ever be recovered?",
            a: "If the private key to the wallet is still accessible, yes – the recipient can claim at any time. If keys are permanently lost, the tokens are effectively destroyed (like lost Bitcoin). Some vesting contracts include expiry mechanisms or governance-controlled reclamation after long inactivity periods, but this is uncommon and legally complex.",
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
    excerpt:     "It is not just how many tokens unlock – it is how often. The frequency of unlock events drives measurable differences in sell pressure patterns, recipient decision-making, and token price stability that most vesting designs completely overlook.",
    publishedAt: "2026-03-15",
    updatedAt:   "2026-03-15",
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
        html: "Almost no one asks the third question: <em>how often?</em> The unlock cadence – whether tokens release daily, weekly, monthly, quarterly, or continuously – turns out to have outsized effects on recipient behaviour, market dynamics, and the long-term health of a token ecosystem. This piece is an attempt to map those effects rigorously, for <strong>protocol designers choosing their vesting parameters</strong>, <strong>investors evaluating tokenomics</strong>, and <strong>traders modelling unlock event timing</strong>.",
      },

      { type: "h2", text: "What Is Unlock Cadence?" },
      {
        type: "p",
        html: "Unlock cadence is the frequency at which vesting events occur – the intervals between successive releases of locked tokens. A vesting contract releases tokens on a schedule that can range from continuous (per-second streaming) to annual (single cliff unlock).",
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
        html: "The same total allocation and the same total vesting duration can be structured at any of these cadences. A 2,400,000 token grant over 24 months could release 100,000 per month, 25,000 per week, ~3,288 per day, or stream at 1.52 tokens per second – the recipient's total allocation is identical. The market dynamics and recipient behaviour are not.",
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
        html: "Recipients receiving tokens weekly or continuously tend to make smaller, more habitual decisions about each tranche. Each release is a small decision – sell this week's portion, hold it, stake it? The <strong>decision cost is low because the stakes are low</strong>. This produces a pattern of micro-decisions rather than one or two large, high-stakes choices. Behavioural research suggests that small, frequent decisions are more likely to default to the prior decision – which, in the context of a hold-biased recipient, means more holding.",
      },
      {
        type: "p",
        html: "There is also a salience effect: weekly token releases quickly fade into the background. Recipients start to treat them like a salary – expected, routine, and not requiring active attention. This reduces the likelihood of large reactive selling triggered by news events or price volatility.",
      },
      { type: "h3", text: "The chunk effect (low frequency)" },
      {
        type: "p",
        html: "Monthly or quarterly unlock events are <em>discrete decision moments</em>. They are marked on calendars. They are anticipated. And – critically – they carry higher per-event stakes. When 416,000 tokens unlock at once, that is a materially larger decision than 13,000 tokens unlocking daily. The recipient is more likely to consciously deliberate, to consult tax advisors, to evaluate current market conditions, and – in stressed market conditions – to treat the unlock as a forced decision point.",
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
        html: "Weekly vesting – releasing 1/104th of a 2-year allocation every seven days – is underused in crypto despite having significant advantages. It produces 104 unlock events over a 24-month period, each releasing about 1% of the total allocation. The market impact of any individual event is negligible. Recipients develop a weekly rhythm that reduces the psychological salience of each release.",
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
        html: "The hidden cost is the creation of <strong>24 or 36 discrete sell decision moments</strong> over a vesting period. In a bear market, each of these moments is a potential exit point. Research on investor behaviour in declining markets shows that decision moments – points where a holder must actively choose to hold rather than automatically holding – increase the probability of selling. Monthly vesting creates more of these moments than weekly vesting, more sell decisions per year, and more opportunities for loss aversion to drive premature exits.",
      },
      {
        type: "p",
        html: "This does not mean monthly vesting is bad – it is appropriate for many contexts. But designers should be aware that 'monthly' is not a neutral default; it is a specific psychological structure with specific behavioural consequences.",
      },

      { type: "h2", text: "Quarterly Vesting: The Corporate Holdover with Volatility Costs" },
      {
        type: "p",
        html: "Quarterly vesting is inherited from traditional equity compensation, where it was practical (quarterly payroll cycles, annual audits, etc.). In crypto, it has questionable utility beyond advisor relationships where recipients are infrequently engaged and need only occasional reminders of their stake.",
      },
      {
        type: "p",
        html: "The market dynamics of quarterly vesting are closer to cliff behaviour than to smooth linear vesting. Eight unlock events over two years means each event releases approximately 12.5% of the total allocation. These are not micro-events – they are major supply additions that, for sizeable positions, can be individually market-moving. Quarterly unlock dates for large stakeholder categories are often visible in price charts as volatility inflection points.",
      },
      {
        type: "p",
        html: "The one genuine advantage of quarterly vesting is simplicity for recipients who are not active market participants – advisors, academics, early community members – for whom monthly decisions would be burdensome and annual decisions too infrequent. For these recipients, the reduced decision frequency is a feature, not a bug.",
      },

      { type: "h2", text: "How Cadence Interacts With Market Cycles" },
      {
        type: "p",
        html: "Unlock cadence does not operate in a vacuum – it interacts with the prevailing market environment in ways that amplify or dampen its effects.",
      },
      { type: "h3", text: "Bull markets: high frequency wins" },
      {
        type: "p",
        html: "In rising markets, frequent small unlocks are fully absorbed by buy-side pressure. Each weekly or daily tranche enters a market with enough demand to buy it. Recipients who sell immediately are replaced by new buyers, and the net price impact is negligible. The market's ability to absorb frequent small releases in bull conditions makes high-frequency vesting the optimal design for launch phases – assuming the launch coincides with favourable conditions.",
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
        html: "The logical extreme of high-frequency vesting is continuous streaming – the approach taken by Sablier and, to a lesser extent, Unvest. In a streaming model, tokens unlock at a constant per-second rate. There is no 'unlock event'. There is no date to mark on a calendar. There is no discrete decision moment.",
      },
      {
        type: "p",
        html: "The psychological effect is profound: streaming vesting effectively converts a token allocation into a continuous income stream rather than a sequence of capital events. This reframes the recipient's mental model from 'when should I sell this tranche?' to 'what is my target withdrawal rate?' – a fundamentally different and more stable decision framework.",
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
        html: "There is no universal optimal cadence – the right frequency depends on the recipient type, their expected behaviour, and the intended relationship between recipient and protocol.",
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
            a: "Vesting unlock cadence is the frequency at which locked tokens are released to recipients – for example, daily, weekly, monthly, or quarterly. Two vesting schedules with the same total duration and allocation can have very different market effects depending on how often the unlocks occur.",
          },
          {
            q: "Is monthly or quarterly vesting better?",
            a: "For most allocation types, monthly vesting is preferable to quarterly. Monthly releases create smaller per-event supply additions that are easier for markets to absorb, particularly in bear conditions. Quarterly releases create larger, less frequent events that can be individually market-moving. Quarterly vesting is acceptable for advisors and strategic partners with low engagement expectations.",
          },
          {
            q: "What is continuous vesting (token streaming)?",
            a: "Continuous vesting – offered by platforms like Sablier – releases tokens in real-time, second by second, rather than in monthly or quarterly batches. There are no discrete unlock events. This eliminates the front-running and anticipatory selling associated with scheduled unlocks and reframes the recipient's mental model from a series of capital events to a continuous income stream.",
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
    excerpt:     "Token unlocks are public knowledge – so why do prices still dump? This framework shows you how to model sell pressure, adjust for holder type, and identify the unlocks that genuinely move markets.",
    publishedAt: "2026-03-16",
    updatedAt:   "2026-03-16",
    readingTime: "14 min read",
    category:    "Research",
    tags:        ["token unlock price impact", "vesting sell pressure", "circulating supply", "token unlock model", "DeFi research", "crypto markets"],
    content: [
      {
        type: "p",
        html: "Every token unlock event is announced months in advance. The vesting schedule is written into a smart contract, visible on-chain to anyone who looks. And yet, time after time, prices drop when cliff dates arrive. The question isn't whether unlocks cause sell pressure – they often do. The question is <strong>how much</strong>, under what conditions, and whether that pressure is already priced in before the date arrives.",
      },
      {
        type: "p",
        html: "This article builds a practical framework for estimating the price impact of a token unlock event. It is aimed at investors who want to size positions around vesting events, project teams who want to understand their own unlock risk, and analysts building vesting-aware models. We cover supply shock mechanics, a simple quantitative model, holder-type adjustments, and the real-world patterns the on-chain data reveals.",
      },

      { type: "h2", text: "The Mechanics of Unlock-Driven Sell Pressure" },
      {
        type: "p",
        html: "An unlock event increases the <strong>liquid supply</strong> of a token: tokens that were previously locked – and therefore unable to be sold – become transferable. This creates a potential supply shock. The magnitude of that shock depends on three variables:",
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
        html: "A workable first-order model combines the float change with two adjustments: <strong>holder type</strong> (who is receiving the unlocked tokens) and <strong>market depth</strong> (how much daily volume the token trades). The formula below is deliberately simple – the goal is a directional signal, not a precise prediction.",
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
        html: "This model is intentionally conservative – it tells you <em>potential</em> sell pressure, not <em>actual</em> sell pressure. Real-world outcomes depend on market sentiment, token utility demand, and whether buyers step in. But the model reliably flags the events worth paying attention to.",
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
          ["Protocol Treasury", "N/A (internal)", "Very Low (5–15%)", "Treasury tokens deployed into liquidity, grants, or buybacks – rarely dumped on open market"],
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
        title: "\"The Unlock Is Priced In\" – Until It Isn't",
        body: "Market participants frequently claim that scheduled unlock events are already priced in. This is sometimes true – for small unlocks into liquid markets. It is often false for cliff events where the recipient is a VC fund with a cost basis 10× below market, or where the unlock represents more than 10% of circulating supply. Do the arithmetic before assuming the market has.",
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
          "<strong>Sanity check:</strong> $30.6m ÷ $180m market cap = 17% of market cap – high-risk threshold clearly breached",
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
            q: "Does vesting through Sablier vs UNCX affect price impact?",
            a: "The protocol itself does not change the fundamental supply dynamics – the price impact comes from recipient incentives and market conditions, not which smart contract holds the tokens. However, streaming protocols like Sablier produce continuous micro-unlocks rather than discrete cliff events, which tend to spread sell pressure more evenly and reduce day-of volatility compared to cliff-based protocols.",
          },
          {
            q: "How do I find upcoming unlock events for a token I hold?",
            a: "The most reliable method is to read the project's smart contracts directly – vesting schedules are public on-chain data. Tools like Vestream aggregate this data across multiple protocols and chains, allowing you to see all upcoming cliff and linear unlock events in a single calendar view. Always cross-reference with the project's tokenomics documentation, as not all vesting is on-chain.",
          },
        ],
      },
    ],
  },

  // ── Article 9 ────────────────────────────────────────────────────────────────
  {
    slug:        "vesting-cliff-explained",
    title:       "The Vesting Cliff Explained: What It Is, Why It Exists, and Why It Moves Markets",
    excerpt:     "The cliff is the most misunderstood mechanism in token vesting – and the one most likely to catch investors off guard. This guide covers the mechanics, the market dynamics, and what the data shows about cliff-driven price events.",
    publishedAt: "2026-03-17",
    updatedAt:   "2026-03-17",
    readingTime: "13 min read",
    category:    "Fundamentals",
    tags:        ["vesting cliff", "cliff period", "token cliff unlock", "token vesting cliff", "crypto vesting schedule", "cliff mechanics"],
    content: [
      {
        type: "p",
        html: "Ask most crypto investors what a vesting cliff is, and they will tell you it is 'a waiting period before tokens unlock.' That is technically correct, but it misses what makes the cliff structurally significant. The cliff is not just a delay – it is a <strong>concentrated release event</strong> that can deliver 12 to 24 months' worth of token allocation in a single transaction. Understanding the cliff at a mechanical level changes how you analyse a project's tokenomics and how you position around unlock events.",
      },
      {
        type: "p",
        html: "This article covers cliff mechanics in depth: what they are, how they are encoded in smart contracts, why they became standard practice, the market dynamics they generate, and how to identify cliff events before they arrive. By the end, you will be able to read any vesting schedule and quickly determine whether the cliff presents a risk, an opportunity, or a non-event.",
      },

      { type: "h2", text: "What Is a Vesting Cliff?" },
      {
        type: "p",
        html: "A vesting cliff is a period at the start of a vesting schedule during which <strong>zero tokens are released</strong>. Once the cliff date is reached, a pre-defined lump sum – typically corresponding to the proportion of the total allocation that 'accrued' during the cliff period – unlocks immediately. After the cliff, remaining tokens vest according to the ongoing schedule (usually linear).",
      },
      {
        type: "p",
        html: "The classic structure in crypto is: <strong>12-month cliff, 36-month total vest</strong>. Under this schedule, 1/3 of the total allocation unlocks on the one-year anniversary of the grant date. The remaining 2/3 then vests linearly over the following 24 months, releasing in monthly increments. This is borrowed directly from startup equity compensation, where the same structure has been standard since the 1980s.",
      },
      {
        type: "callout",
        emoji: "💡",
        title: "The Cliff vs Linear Distinction",
        body: "Without a cliff, linear vesting begins from day one – the recipient earns tokens continuously from grant date. With a cliff, nothing is earned (or at least nothing is withdrawable) until the cliff date, at which point all accrued tokens release at once. The cliff is a threshold, not a gradual ramp.",
      },

      { type: "h2", text: "How Cliff Calculations Work On-Chain" },
      {
        type: "p",
        html: "On-chain, a cliff is implemented by comparing the current block timestamp to a stored cliff timestamp. Before the cliff, withdrawal functions revert with a 'cliff not reached' error. After the cliff, the claimable amount includes the cliff allocation.",
      },
      {
        type: "p",
        html: "Different protocols model cliffs differently. In <strong>Sablier v2 LockupLinear</strong>, two separate amounts are specified: a cliff amount (released at the cliff timestamp) and a streaming amount (released linearly from cliff to end). This allows precise control – a 25% cliff with 75% linear, for example, or a 0% cliff with 100% linear.",
      },
      {
        type: "p",
        html: "In <strong>UNCX</strong>, the cliff is modelled as a single timestamp before which nothing vests. After the cliff, the contract calculates how many full periods have elapsed since the start and releases the proportional amount. Some implementations allow multiple cliff stages – a <strong>cascading cliff</strong> where partial amounts release at defined intervals before the full schedule begins.",
      },
      {
        type: "ul",
        items: [
          "<strong>Cliff timestamp precision:</strong> Cliffs are encoded as Unix timestamps (seconds since January 1, 1970). The practical precision is one second, but actual block timestamps vary by chain – Ethereum blocks target 12 seconds, making cliff execution within 1–2 blocks of the target timestamp.",
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
        body: "The 12-month cliff in crypto traces directly to Silicon Valley startup equity. Typical startup equity grants use a 4-year vest with 1-year cliff – the same '1+3' or '1+2' structures common in crypto. When the first token-compensated crypto projects structured their allocations, they borrowed from equity compensation norms. The structure stuck, even though the liquidity dynamics of tokens are fundamentally different from illiquid startup equity.",
      },

      { type: "h2", text: "The Cliff Release Problem" },
      {
        type: "p",
        html: "Here is where the cliff becomes a market structure event rather than just a schedule mechanism. When the cliff fires, a <strong>large discrete quantity of tokens</strong> – potentially 20–35% of total allocation – becomes immediately liquid. The size of this event relative to the existing circulating supply determines whether the cliff is a market-moving occurrence or a non-event.",
      },
      {
        type: "table",
        headers: ["Unlock Type", "Market Impact Profile", "Price Predictability", "Seller Incentive"],
        rows: [
          ["Cliff release", "Large discrete shock on cliff date", "Low (single-day event, hard to predict timing)", "High pressure if cost basis well below market"],
          ["Linear monthly", "Steady incremental supply addition", "High (predictable monthly amounts)", "Moderate – small per-event, but cumulative"],
          ["Quarterly tranches", "Medium discrete events 4× per year", "Medium", "Moderate – larger than monthly, smaller than cliff"],
          ["Continuous stream (Sablier)", "Per-second micro-additions", "Very high (fully predictable)", "Low per-moment, but meaningful on long timescales"],
        ],
      },
      {
        type: "p",
        html: "Sophisticated market participants – particularly those with access to vesting schedule data – often begin positioning <strong>before the cliff date</strong>. This typically manifests as increased short interest, reduced buy-side depth, or direct selling by recipients who hold pre-cliff positions through derivatives or OTC agreements. The result is that many cliff events show price weakness in the 7–14 days before the cliff fires.",
      },

      { type: "h2", text: "Cliff Variations in the Wild" },
      {
        type: "p",
        html: "Not all projects use the standard 12-month cliff. Here is a taxonomy of cliff structures and what they signal about a project's incentive design:",
      },
      {
        type: "ul",
        items: [
          "<strong>No cliff (fully linear from day one).</strong> Common for community allocations and public sale tokens. Signals that the project wants recipients to feel immediate ownership. Watch for projects claiming 'no cliff' for team and investor allocations – this is a yellow flag for commitment.",
          "<strong>Short cliff (3–6 months).</strong> Used when liquidity is needed quickly – bootstrapping liquidity provider incentives, early ecosystem grants. Appropriate for operational allocations, but concerning for investor/team tokens.",
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
          "<strong>Use a vesting aggregator.</strong> Tools like Vestream index vesting contracts across Sablier, UNCX, Hedgey, and Unvest, surfacing your cliff dates and unlock calendar in a single dashboard without manual contract interrogation.",
          "<strong>Verify against tokenomics documentation.</strong> On-chain data is ground truth, but project documentation often explains the intent behind the schedule. Discrepancies between documented schedules and on-chain data are a significant red flag.",
        ],
      },

      {
        type: "faq",
        items: [
          {
            q: "What happens to unvested tokens during the cliff period?",
            a: "During the cliff period, tokens remain in the vesting contract – they are not accessible to the recipient or the project. The project deposited them at vesting schedule creation; neither party can access them until the cliff date. If the schedule is revocable, the project can cancel the schedule and recover unvested tokens, but cannot access them without cancellation.",
          },
          {
            q: "Can a cliff be modified or removed after vesting has started?",
            a: "Generally no. Vesting schedules in smart contracts are largely immutable once created. The cliff timestamp is written into the contract at deployment and cannot be changed without deploying an entirely new vesting contract. Some multi-sig controlled contracts allow parameter modification, but this requires transparent governance and is rare in practice.",
          },
          {
            q: "Do all tokens have vesting cliffs?",
            a: "No. Public sale tokens and community distribution tokens often have no cliff – they vest immediately or on a short linear schedule. Mining and staking rewards typically have no cliff at all. Cliffs are most common for team, investor, and advisor allocations where long-term alignment is the goal. Always check the specific allocation category you are tracking.",
          },
          {
            q: "What is a 'hard cliff' vs 'soft cliff'?",
            a: "In some documentation, a 'hard cliff' refers to a schedule where zero tokens are accessible before the cliff date regardless of circumstances – the smart contract enforces it unconditionally. A 'soft cliff' sometimes refers to a revocable schedule where, while tokens don't vest before the cliff, the depositor can cancel the schedule and change the terms. In strict technical usage, all on-chain cliffs are 'hard' (the contract enforces them), but the revocability of the overall schedule affects the practical security of the recipient's allocation.",
          },
          {
            q: "Can I sell or transfer my vesting position before the cliff fires?",
            a: "On protocols that represent vesting as NFTs (Sablier, Hedgey), you can transfer the vesting NFT to another address, effectively selling the future claim to the tokens. The new holder then waits for the cliff and claims. On address-locked protocols (UNCX, Unvest), you cannot transfer the vesting position – it is permanently tied to the recipient address set at creation.",
          },
        ],
      },
    ],
  },

  // ── Article: Great vs Terrible Vesting ───────────────────────────────────────
  {
    slug:        "great-vesting-vs-terrible-vesting",
    title:       "The Anatomy of a Great Vesting vs. a Terrible One: Two Real Case Studies",
    excerpt:     "Vesting schedules are often treated as fine print. But the difference between a well-designed schedule and a poorly designed one can be the difference between a project that sustains long-term value and one that collapses under its own unlock calendar. We compare Uniswap and dYdX to show exactly what separates them.",
    publishedAt: "2026-03-18",
    updatedAt:   "2026-03-18",
    readingTime: "14 min read",
    category:    "Tokenomics",
    tags:        ["vesting schedule", "token unlock", "tokenomics", "Uniswap", "dYdX", "case study", "token design"],
    content: [
      {
        type: "p",
        html: "Most token investors read the whitepaper. Far fewer read the vesting schedule with the same level of scrutiny. That is a mistake. A token's vesting design is one of the most reliable signals of how a team thinks about long-term alignment – and one of the most direct levers on price. A badly designed schedule creates a predictable, calendar-driven overhang that the market can front-run months in advance. A well-designed one builds trust, signals conviction, and avoids the kind of concentrated unlock events that send community members scrambling for the exit.",
      },
      {
        type: "p",
        html: "This article uses two real, documented case studies – <strong>Uniswap (UNI)</strong> and <strong>dYdX (DYDX)</strong> – to illustrate what separates a great vesting structure from a terrible one. Both are major DeFi protocols. Both have large, institutional investor allocations. But their approach to releasing those tokens could not be more different – and the market has judged them accordingly.",
      },
      {
        type: "callout",
        emoji: "📋",
        title: "Note on data",
        body: "Token allocations and vesting terms referenced here are drawn from official documentation, governance posts, and widely-cited public analyses. Price figures are approximate and used to illustrate structural dynamics, not to make investment claims.",
      },

      { type: "h2", text: "What Makes a Vesting Schedule 'Good' or 'Bad'?" },
      {
        type: "p",
        html: "Before diving into the case studies, it helps to establish the criteria. A vesting schedule is not good or bad in isolation – it is good or bad relative to what it is trying to achieve. For a typical token-backed project, the goal is to align incentives across insiders (team, early investors, advisors) and the broader community, while avoiding the kind of supply shock that destroys retail confidence. With that framing, a good vesting schedule tends to have the following properties:",
      },
      {
        type: "ul",
        items: [
          "<strong>Long lock-up relative to the project's development horizon</strong> – insiders should not be able to exit before the product has shipped and proven itself.",
          "<strong>Gradual, continuous release rather than large cliff tranches</strong> – a single large unlock creates a predictable sell event that the market can anticipate and trade around.",
          "<strong>Cliffs that meaningfully separate insiders from liquidity</strong> – a 6-month cliff on a 3-year token does not signal long-term conviction. A 12-month cliff on a 4-year schedule is materially different.",
          "<strong>Consistent treatment across stakeholder groups</strong> – when investors get shorter vesting than the team, it signals a misalignment of risk. Both groups should have comparable exposure to the project's timeline.",
          "<strong>Transparent, on-chain enforcement</strong> – vesting enforced by smart contracts is auditable and cannot be quietly amended. Off-chain agreements with trusted custodians are far weaker guarantees.",
        ],
      },
      {
        type: "p",
        html: "A bad schedule often fails on multiple of these dimensions simultaneously: short total duration, large tranche releases, and an investor vesting timeline that is misaligned with the community's holding period. Let's look at how each plays out in practice.",
      },

      { type: "h2", text: "Case Study 1: Uniswap (UNI) – The Gold Standard" },
      {
        type: "p",
        html: "Uniswap launched its governance token, UNI, in September 2020 – a surprise airdrop that became one of the most discussed distribution events in DeFi history. The immediate narrative was the airdrop itself: 400 UNI to every address that had ever used the protocol. But the more important story was in the vesting structure governing the remaining 60% of supply allocated to team members, investors, and advisors.",
      },

      { type: "h3", text: "The Allocation Breakdown" },
      {
        type: "table",
        headers: ["Recipient Group", "Allocation (% of supply)", "Vesting Schedule"],
        rows: [
          ["Community treasury", "43.0%", "Governance-controlled release over 4+ years"],
          ["Team & future employees", "21.3%", "4-year vesting, 1-year cliff"],
          ["Investors", "17.8%", "4-year vesting, 1-year cliff"],
          ["Advisors", "0.7%", "4-year vesting, 1-year cliff"],
          ["Community airdrop", "15.0%", "Immediately liquid at launch"],
          ["Liquidity mining", "2.0%", "Distributed over first 2 months"],
        ],
      },
      {
        type: "p",
        html: "Several things stand out. First, the team and investors received <em>identical</em> vesting terms – a 4-year schedule with a 1-year cliff. This matters because it removes the common structural injustice where sophisticated capital can exit long before the team that built the product. Second, the cliff period is a full year. Anyone holding UNI in September 2020 knew that no insider tokens would hit the market until September 2021 at the earliest – giving the protocol twelve months of runway without the noise of insider selling.",
      },
      {
        type: "p",
        html: "Third, and perhaps most importantly, the 4-year total vesting duration signals something about how the Uniswap team viewed the project's timeline. It was not a 12 or 18-month sprint to token liquidity – it was a multi-year commitment to building the most important decentralised exchange in DeFi. The vesting schedule communicated that intent clearly, and the market respected it.",
      },

      { type: "h3", text: "What Happened When the Cliff Hit" },
      {
        type: "p",
        html: "September 2021 – one year after launch – was when the first insider tokens began to unlock. At that point, UNI was trading between $20 and $30, compared to a launch-day price of around $3–4. Insiders were sitting on substantial gains. Yet the unlock did not produce the kind of concentrated selling event that destroys a token's price chart in a single week. Why?",
      },
      {
        type: "p",
        html: "Because the schedule released tokens <em>linearly</em> over the remaining three years, not all at once. After the cliff, team and investor tokens unlocked continuously – a small fraction of the total each day. There was no single date circled on a calendar as a sell signal. The supply entered circulation gradually, in a way that liquid demand could absorb. The 1-year cliff gave the protocol time to establish its value proposition; the linear release prevented a subsequent cliff from undoing that work.",
      },
      {
        type: "callout",
        emoji: "✅",
        title: "Why this works",
        body: "A 4-year linear vest with a 1-year cliff means that after the cliff, approximately 1/36th of the remaining allocation unlocks each month. At no point does a large, discrete tranche of tokens hit the market simultaneously. The supply increase is gradual, predictable, and can be absorbed organically.",
      },
      {
        type: "p",
        html: "Uniswap's vesting structure is now frequently cited in tokenomics literature as a reference design. It is not the only valid approach, but it demonstrates the key principles: long duration, meaningful cliff, linear release, and identical treatment of insiders. The protocol has gone on to become the most used DEX in DeFi by volume – and its token's vesting design contributed meaningfully to maintaining community confidence through its most critical growth period.",
      },

      { type: "h2", text: "Case Study 2: dYdX (DYDX) – A Textbook Unlock Crisis" },
      {
        type: "p",
        html: "dYdX is one of the largest decentralised derivatives exchanges by volume. Its DYDX token launched in August 2021 with significant fanfare – a retroactive airdrop, active governance, and a protocol generating hundreds of millions in annualised trading fees. On paper, it was a strong project with a real product. But its token vesting structure contained a time bomb that the market began pricing in months before it detonated.",
      },

      { type: "h3", text: "The Structure That Created the Problem" },
      {
        type: "p",
        html: "The original DYDX tokenomics allocated approximately 27.7% of total supply to investors and 15.3% to founders, employees, and advisors – a combined insider allocation of roughly 43%. The initial lock-up placed these tokens behind a cliff of around 18 months from the token's August 2021 launch, pointing to a significant unlock window opening in early-to-mid 2023.",
      },
      {
        type: "p",
        html: "The critical structural problem was what happened <em>after</em> the cliff. Rather than a multi-year linear release, a very substantial portion of the investor and team allocation was set to unlock in a concentrated period. Token analytics services and the dYdX community had the unlock date circled on a calendar: <strong>February 1, 2023</strong>. On that date, approximately 150 million DYDX tokens – representing a significant fraction of the entire circulating supply at the time – were set to unlock for investors and employees simultaneously.",
      },
      {
        type: "callout",
        emoji: "⚠️",
        title: "The scale of the unlock",
        body: "The February 2023 dYdX unlock was one of the largest single-event token releases in DeFi history by dollar value. With DYDX trading between $2 and $3 in the weeks leading up to the event, the unlocking tokens represented hundreds of millions of dollars of latent selling pressure entering the market on a single date.",
      },

      { type: "h3", text: "How the Market Responded" },
      {
        type: "p",
        html: "The market did not wait for February 1st. As is typical with large, predictable unlock events, DYDX's price came under sustained pressure in the weeks and months before the unlock date. Token investors who had been tracking the unlock calendar began reducing exposure. Short sellers positioned in anticipation of insider selling. The token underperformed its DeFi peers significantly in the period leading up to the unlock – not because the underlying product was deteriorating, but because rational market participants were front-running a known, scheduled supply shock.",
      },
      {
        type: "p",
        html: "When February 1st arrived, on-chain data showed substantial outflows from the unlocked addresses in the days that followed. Some recipients held. Many others – particularly the earlier institutional investors who had been waiting 18 months to access their position – chose to sell into whatever liquidity was available. The concentrated nature of the unlock made it impossible for organic demand to absorb the supply cleanly.",
      },
      {
        type: "p",
        html: "It is worth being precise about what caused the problem: it was not that insiders were bad actors. Selling a long-locked position after 18 months is entirely rational behaviour. The failure was structural. The vesting schedule created a situation where rational individual behaviour – each investor selling their unlock – produced a collective outcome that was deeply harmful to the protocol and its community holders. That is the definition of a poorly aligned incentive system.",
      },

      { type: "h3", text: "The Contrast in Numbers" },
      {
        type: "table",
        headers: ["Metric", "Uniswap (UNI)", "dYdX (DYDX)"],
        rows: [
          ["Total insider allocation", "~40%", "~43%"],
          ["Cliff period", "12 months", "~18 months"],
          ["Release after cliff", "Linear over 3 years", "Large tranche on a single date"],
          ["Predictable sell event?", "No (gradual daily release)", "Yes (single unlock date)"],
          ["Market pre-positioning", "Low – no target date to front-run", "High – months of anticipated selling pressure"],
          ["Community confidence through cliff", "Maintained", "Significantly eroded before and after unlock"],
          ["Token vesting enforced on-chain?", "Yes (smart contracts)", "Yes (smart contracts)"],
        ],
      },
      {
        type: "p",
        html: "The comparison reveals something important: the total insider allocation was nearly identical. This was not a story of greed vs. restraint at the allocation level. It was a story of <em>schedule design</em>. The same 40–43% insider allocation, structured differently, produced radically different outcomes for the communities holding each token.",
      },

      { type: "h2", text: "The Five Structural Mistakes in dYdX's Vesting" },
      {
        type: "ol",
        items: [
          "<strong>Short cliff relative to vesting maturity.</strong> An 18-month cliff sounds long, but when paired with a large tranche release immediately after the cliff, the effective period before significant insider liquidity is still just 18 months – barely enough time for a DeFi protocol to reach product maturity.",
          "<strong>Tranche release rather than linear release.</strong> Releasing a substantial portion of insider tokens on a single calendar date created an identifiable, front-runnable event. Linear release would have distributed the same supply over months or years, eliminating the spike.",
          "<strong>No differentiation between investor groups.</strong> Earlier seed investors carrying more risk were vesting on similar timelines to later investors who paid higher prices. A tiered approach – longer vesting for earlier, cheaper rounds – would have reduced the concentration of selling at a single price level.",
          "<strong>Insufficient post-cliff vesting tail.</strong> A well-designed schedule keeps a significant portion of insider tokens locked even after the initial cliff, continuing to incentivise long-term participation. A short post-cliff tail eliminates that ongoing alignment.",
          "<strong>Insufficient communication and community management.</strong> While the unlock was technically disclosed, the community was largely unprepared for the scale of the event. Proactive treasury actions or buyback programs in the lead-up can partially offset unlock pressure – but these require planning, not reaction.",
        ],
      },

      { type: "h2", text: "What This Means for Token Investors" },
      {
        type: "p",
        html: "If you are evaluating a token allocation – whether as an investor, a community member, or an advisor – the vesting schedule deserves as much scrutiny as the technology, the team, and the market opportunity. Here is a practical framework for assessing any vesting schedule you encounter:",
      },
      {
        type: "ul",
        items: [
          "<strong>Find the total insider %.</strong> Any insider allocation above 40% of supply warrants close inspection. Above 50% is a red flag.",
          "<strong>Map every unlock date.</strong> Use token unlock trackers (or a tool like Vestream's explorer) to identify every date when a significant tranche of supply enters circulation. Mark these as potential selling windows.",
          "<strong>Check if the release is linear or tranche-based.</strong> A continuous linear release after the cliff is structurally superior to a large single unlock. Both can appear in whitepapers as '4-year vesting' – the difference is in the specifics.",
          "<strong>Compare investor and team vesting.</strong> If investors vest faster than the team, the incentive alignment is asymmetric. The team should have at least as long a lock as the capital.",
          "<strong>Check on-chain enforcement.</strong> Vesting enforced by a smart contract is independently auditable. A legal agreement with a custodian is not the same thing.",
          "<strong>Look for protocol-owned liquidity or buyback programs.</strong> These can partially offset unlock pressure, but they are a patch on a structural weakness – not a substitute for a well-designed schedule in the first place.",
        ],
      },

      { type: "h2", text: "The Lesson: Vesting Is a Signal, Not Just a Schedule" },
      {
        type: "p",
        html: "The most important takeaway from comparing these two cases is that a vesting schedule is not just a legal mechanism for distributing tokens – it is a signal of how the team thinks about alignment, fairness, and the long-term health of the token economy. Teams that design vesting schedules with community holders in mind – building in long cliffs, linear release, and consistent insider treatment – are signalling that they view themselves as long-term stakeholders in the same ecosystem. Teams that optimise their own liquidity at the expense of schedule design are, often unknowingly, signalling the opposite.",
      },
      {
        type: "p",
        html: "The dYdX case is particularly instructive because dYdX is a legitimately strong protocol with real revenue and a real product. The February 2023 unlock did not happen because the team was acting in bad faith – it happened because a structural design decision made 18 months earlier created an outcome that served no stakeholder group well. The insiders who sold into thin liquidity got worse prices than they would have with a linear release. The community holders experienced months of selling pressure. The protocol's reputation suffered unnecessarily. Better vesting design would have been better for everyone.",
      },
      {
        type: "callout",
        emoji: "🔑",
        title: "The single most important question to ask",
        body: "Before committing to any token allocation, ask: 'Is there a single date – or a narrow window of dates – when a large amount of insider tokens enters circulation simultaneously?' If the answer is yes, that date is a sell event that the market will price in well before it arrives.",
      },

      {
        type: "faq",
        items: [
          {
            q: "Did dYdX change its vesting structure after the February 2023 event?",
            a: "dYdX v4 launched on its own Cosmos-based chain in late 2023, with a new tokenomics structure for the v4 token (also called DYDX). The v4 allocation and vesting design reflected lessons from the v3 experience, with a greater emphasis on gradual release and ecosystem incentives. The v3 token unlock event is now widely cited in tokenomics discussions as a cautionary example of cliff-heavy vesting.",
          },
          {
            q: "Is Uniswap's vesting structure still considered the gold standard?",
            a: "UNI's structure is frequently cited as a strong reference design, but the space has evolved. Projects like Arbitrum, Optimism, and Eigenlayer have each approached vesting differently – with varying results. No single structure suits every project; what matters is the underlying principles: long duration, linear release, insider alignment, and on-chain enforceability.",
          },
          {
            q: "How can I find out when a token's unlock events are scheduled?",
            a: "Several dedicated services track token unlock calendars, including Token Unlocks and Vesting.finance. On-chain data is the most reliable source – smart contract events and vesting contract state can be read directly from the blockchain. Vestream's Token Vesting Explorer provides on-chain vesting data across Sablier, UNCX, and Hedgey protocols.",
          },
          {
            q: "What should a project team do if they already have a poorly structured vesting schedule?",
            a: "Options are limited after the fact, since vesting contracts are typically immutable. However, teams can voluntarily extend their own lock-ups through new smart contract commitments (adding credibility by making it on-chain), establish buyback programs to provide counter-pressure ahead of known unlock dates, and communicate proactively with the community about planned selling intentions. Governance proposals to modify treasury-controlled vesting have also been used in some projects, though they require broad community support.",
          },
          {
            q: "Does a longer vesting schedule always mean a better token?",
            a: "Not necessarily. An extremely long vesting schedule can demotivate early contributors if they see no near-term upside, potentially leading to team attrition. The goal is alignment, not punishment. The sweet spot for most projects is a 3–4 year total vesting period with a 12-month cliff – long enough to create meaningful alignment, short enough to remain motivating.",
          },
        ],
      },
    ],
  },

  // ── Article 10 ───────────────────────────────────────────────────────────────
  {
    slug:        "token-allocation-vesting-red-flags",
    title:       "Token Allocation: What Each Stakeholder's Vesting Terms Tell You Before You Invest",
    excerpt:     "A token's allocation chart is one of the most information-dense documents in crypto. This guide teaches you how to read vesting terms for every stakeholder category – and which red flags should make you reconsider an investment.",
    publishedAt: "2026-03-19",
    updatedAt:   "2026-03-19",
    readingTime: "14 min read",
    category:    "Tokenomics",
    tags:        ["token allocation", "token", "tokenomics", "vesting schedule", "crypto due diligence", "token unlock"],
    content: [
      {
        type: "p",
        html: "Before a single token trades on a public market, its fate is largely determined by a document that most retail investors never read carefully: the token allocation table. This table – sometimes buried in a whitepaper, sometimes published as a pie chart on a project website – tells you who owns what, and crucially, <strong>when they can sell it</strong>. Decoding that information is one of the highest-value skills in crypto investing.",
      },
      {
        type: "p",
        html: "Every token project distributes its supply across different stakeholder groups. Each group has different incentives, different lock-up periods, and different behaviours when their tokens unlock. Understanding how to interpret these terms – not just accept them at face value – separates informed token holders from those who are perpetually surprised by price action.",
      },
      {
        type: "callout",
        emoji: "🎯",
        title: "What you will learn",
        body: "How to interpret vesting terms for each stakeholder category (team, investors, advisors, community, foundation), what the standard terms look like, and the specific patterns that signal a poorly designed or potentially exploitative token allocation.",
      },

      { type: "h2", text: "The Six Stakeholder Categories" },
      {
        type: "p",
        html: "Most token allocations divide supply across some combination of six stakeholder groups. Each group has a distinct relationship with the project – and that relationship should be reflected in their vesting terms. When it isn't, that misalignment is worth investigating.",
      },
      {
        type: "table",
        headers: ["Stakeholder", "Typical Allocation", "Expected Vesting", "Incentive Alignment"],
        rows: [
          ["Core Team", "15–25%", "12-month cliff, 3–4 year linear", "Long-term project success"],
          ["Early Investors (Seed/Private)", "10–20%", "6–12 month cliff, 12–24 month linear", "Return on capital"],
          ["Public Sale / IDO", "5–15%", "Partial TGE unlock, 3–12 month linear", "Community participation"],
          ["Ecosystem / Community", "20–35%", "Long-term emission, 3–5 years", "Protocol usage and growth"],
          ["Foundation / Treasury", "10–20%", "Locked, released by governance", "Protocol sustainability"],
          ["Advisors", "1–5%", "6-month cliff, 12–24 month linear", "Strategic guidance"],
        ],
      },
      {
        type: "p",
        html: "These ranges are not arbitrary – they represent what market participants have come to expect after years of observing which token structures succeed and which fail. Significant deviations from these norms are not always red flags, but they always deserve an explanation.",
      },

      { type: "h2", text: "Reading Team Token Allocations" },
      {
        type: "p",
        html: "The team allocation is the single most important vesting tranche to scrutinise. It tells you how much financial risk the founders are genuinely taking, and for how long their economic interests are tied to the token's performance.",
      },
      {
        type: "h3", text: "What good team vesting looks like",
      },
      {
        type: "ul",
        items: [
          "<strong>Cliff of at least 12 months:</strong> A one-year cliff means the team receives nothing before the project has had at least a year to prove itself.",
          "<strong>Total vesting period of 3–4 years:</strong> Aligns with the average time it takes for a Web3 project to reach meaningful adoption.",
          "<strong>Linear monthly or quarterly release:</strong> Gradual release avoids concentrated selling pressure on specific dates.",
          "<strong>No TGE unlock for the team:</strong> Any immediate team allocation at Token Generation Event is a warning sign – it means founders can sell on day one.",
        ],
      },
      {
        type: "h3", text: "Team vesting red flags",
      },
      {
        type: "ul",
        items: [
          "<strong>Short cliff (under 6 months):</strong> A 3- or 6-month cliff gives the team very little time before they can exit. This is especially concerning when combined with a public sale.",
          "<strong>TGE unlock percentage above 0%:</strong> Some projects grant team members 5–10% of their allocation at TGE. This is always worth questioning.",
          "<strong>Overly high allocation (above 30%):</strong> When the team holds more than 30% of supply, even gradual vesting creates persistent selling pressure over years.",
          "<strong>Unlisted or vague vesting terms:</strong> A project that does not publish its team vesting schedule is a project that does not want you to know its team vesting schedule.",
        ],
      },
      {
        type: "callout",
        emoji: "⚠️",
        title: "The three-month cliff trick",
        body: "Some projects advertise a 'cliff and vesting' structure to appear credible, but on inspection the cliff is only 90 days. This provides almost no protection against immediate insider selling. A real cliff – one that meaningfully aligns incentives – is 12 months minimum.",
      },

      { type: "h2", text: "Investor Token Allocations: Seed, Private, and Strategic Rounds" },
      {
        type: "p",
        html: "Private sale investors – seed funds, venture capital firms, and angel investors – typically receive the largest discount to public sale price, sometimes 80–95% below the eventual listing price. The vesting terms attached to these tranches determine how much sell pressure the token absorbs from sophisticated, profit-motivated capital.",
      },
      {
        type: "p",
        html: "The key metric here is <strong>multiple on invested capital at TGE</strong>. If seed investors bought tokens at $0.01 and the token lists at $0.20, they are sitting on a 20x return from day one. Even if those tokens are locked for 12 months, the moment their cliff ends, the incentive to sell is overwhelming. This is mathematically unavoidable – which is why investor vesting terms need to be evaluated in the context of their entry price.",
      },
      {
        type: "h3", text: "What to look for in investor vesting",
      },
      {
        type: "ul",
        items: [
          "<strong>Cliff length relative to entry price:</strong> A 10x+ seed discount with a 6-month cliff is a structural problem regardless of the project's quality.",
          "<strong>Staggered unlock schedules:</strong> The best structures stagger investor unlocks over 18–36 months, reducing the concentrated selling event at cliff expiry.",
          "<strong>Small TGE percentage:</strong> A 5–10% TGE unlock for investors is common and acceptable. Anything above 20% creates immediate listing-day sell pressure.",
          "<strong>Strategic vs. financial investors:</strong> Vesting terms are sometimes more generous for strategic investors (exchanges, ecosystem funds) because they provide ongoing value. This is acceptable if disclosed.",
        ],
      },

      { type: "h2", text: "Community and Ecosystem Allocations" },
      {
        type: "p",
        html: "Community allocations – often labelled 'ecosystem fund', 'community incentives', 'liquidity mining', or 'airdrops' – are the most complex to evaluate because they are not governed by fixed vesting schedules. Instead, they are typically released over time according to emission schedules or governance decisions.",
      },
      {
        type: "p",
        html: "This category can represent 20–40% of total supply in DeFi protocols, and how it is distributed has an enormous impact on token price dynamics. Aggressive liquidity mining that emits tokens quickly stimulates usage but creates sustained selling pressure as yield farmers harvest and sell rewards.",
      },
      {
        type: "ul",
        items: [
          "<strong>Ask: what is the emission rate?</strong> Annual emission as a percentage of circulating supply tells you how much dilution current holders face each year.",
          "<strong>Ask: who qualifies?</strong> Community allocations distributed to active users (proof-of-work style) create healthier dynamics than those distributed to wallet snapshots.",
          "<strong>Ask: is there a lockup on distributed tokens?</strong> Some protocols require staking or locking received tokens before they can be sold – this meaningfully changes the supply dynamics.",
        ],
      },

      { type: "h2", text: "Foundation and Treasury Tokens" },
      {
        type: "p",
        html: "The foundation or treasury allocation is typically the most locked-up tranche in any token allocation. These tokens are meant to fund long-term protocol development, grants, partnerships, and operational costs for years after the TGE.",
      },
      {
        type: "p",
        html: "The key question is not when these tokens vest – it is <strong>who controls the release</strong>. Treasury tokens governed by a multisig held by the founding team give the team enormous discretionary power over the token supply. Treasury tokens governed by on-chain DAO voting are meaningfully more decentralised.",
      },
      {
        type: "callout",
        emoji: "🔍",
        title: "Check the multisig",
        body: "Before investing, verify who controls the treasury. A Gnosis Safe with 5 signers who are all unnamed team members is not decentralised governance – it is a pseudonymous centralised treasury. Look for independently verifiable signers, public identities, or time-lock contracts on treasury movements.",
      },

      { type: "h2", text: "Advisor Allocations: Small but Telling" },
      {
        type: "p",
        html: "Advisor allocations are typically small (1–5% of supply) but they reveal something important about how a project values accountability. Advisors are typically influential individuals – exchange executives, protocol founders, investment managers – who lend their name and network to a project.",
      },
      {
        type: "p",
        html: "The problem is that many advisor arrangements are <em>entirely informal</em>. The advisor receives a token allocation in exchange for a short call, a tweet, or an introduction – and the vesting terms are often the most lenient in the entire structure. Watch for:",
      },
      {
        type: "ul",
        items: [
          "<strong>Advisor cliffs under 6 months:</strong> An advisor who can sell in three months has almost no accountability.",
          "<strong>Unnamed advisors:</strong> If the whitepaper lists 'strategic advisors' without naming them, those allocations may be reserved for undisclosed insiders.",
          "<strong>Advisor allocation above 5%:</strong> Anything above this suggests the 'advisor' label may be covering what is effectively an additional private sale round.",
        ],
      },

      { type: "h2", text: "The Full Picture: Calculating Unlock Overhang" },
      {
        type: "p",
        html: "The most useful analytical exercise when reviewing a token allocation is to calculate the <strong>unlock overhang</strong> – the ratio of locked supply to circulating supply at any given point in time. A token trading with a circulating supply of 100 million and a locked supply of 900 million has a 9x unlock overhang. Even a small percentage of locked holders choosing to sell at their first unlock can represent a significant multiple of current daily volume.",
      },
      {
        type: "ol",
        items: [
          "Find the current circulating supply (CoinGecko, CoinMarketCap, or the project's own dashboard).",
          "Find the total supply and the fully diluted valuation (FDV).",
          "Divide FDV by market cap: this ratio tells you how much supply is still locked. A ratio of 10x means 90% of supply is not yet circulating.",
          "Identify the next major unlock date and the size of that tranche as a percentage of current circulating supply.",
          "Compare that unlock size to average daily trading volume. Unlock size &gt; 5 days of volume is a meaningful overhang event.",
        ],
      },
      {
        type: "p",
        html: "This calculation will not tell you what price will do – markets are forward-looking and a well-anticipated unlock can be fully priced in. But it tells you the <em>structural risk</em> you are accepting as a token holder, and whether the current valuation is sustainable once locked supply enters circulation.",
      },

      { type: "h2", text: "How On-Chain Vesting Changes the Picture" },
      {
        type: "p",
        html: "Not all token vesting is created equal. There is a critical difference between <strong>contractual vesting</strong> (a promise that tokens will be locked) and <strong>on-chain vesting</strong> (tokens that are mathematically impossible to access before their scheduled unlock).",
      },
      {
        type: "p",
        html: "On-chain vesting – enforced by protocols like Sablier, UNCX, Hedgey, or Unvest – is verifiable by anyone. You can look at the vesting contract address on a block explorer and confirm exactly how many tokens are locked, when they unlock, and who the beneficiary is. <strong>If a project's team vesting is not on-chain, the only thing preventing early access to those tokens is the team's word.</strong>",
      },
      {
        type: "callout",
        emoji: "✅",
        title: "Verify on-chain vesting yourself",
        body: "Ask the project team for the vesting contract address. Paste it into Etherscan, Arbiscan, or the relevant explorer. If they cannot provide one – or if the address shows tokens that are already withdrawn – treat that as material information.",
      },

      {
        type: "faq",
        items: [
          {
            q: "What is a healthy team token allocation percentage?",
            a: "Most well-structured projects allocate 15–25% of total supply to the core team. Below 10% may fail to adequately incentivise founders and key hires over a multi-year build. Above 30% creates long-term selling pressure that can weigh on price even with extended vesting.",
          },
          {
            q: "What does TGE unlock percentage mean?",
            a: "TGE (Token Generation Event) unlock percentage refers to the portion of a vesting tranche that becomes immediately available when the token launches. A '10% TGE unlock' for investors means 10% of their allocation is transferable from day one, with the remaining 90% subject to the vesting schedule.",
          },
          {
            q: "How do I find a project's token allocation?",
            a: "Check the project's whitepaper, tokenomics page, or official documentation. On-chain vesting contracts can be verified directly via block explorers. Token unlock tracking tools like Vestream aggregate this data across multiple vesting protocols in one view.",
          },
          {
            q: "Is a high FDV/market cap ratio always bad?",
            a: "Not always, but it warrants scrutiny. A high FDV/MC ratio means most supply is still locked. If that supply belongs to well-aligned long-term holders (a DAO treasury, a foundation with a 5-year lock), it is less concerning than if it belongs to early investors with short vesting periods sitting on large unrealised gains.",
          },
          {
            q: "Can vesting terms be changed after launch?",
            a: "For on-chain vesting, the smart contract terms are immutable – they cannot be changed without beneficiary consent. For contractual vesting (off-chain legal agreements), terms can theoretically be renegotiated. This is another reason why on-chain enforcement is preferable to contractual promises.",
          },
        ],
      },
    ],
  },

  // ─── Token Vesting as a Health Signal ────────────────────────────────────────
  {
    slug:        "token-vesting-health-signal",
    title:       "How a Project's Token Vesting Schedule Reveals Its True Health",
    excerpt:     "Before you invest, look at the vesting schedule. The way a project structures token releases tells you more about its long-term intentions than any whitepaper ever will.",
    publishedAt: "2026-03-20",
    updatedAt:   "2026-03-20",
    readingTime: "9 min read",
    category:    "Analysis",
    tags:        ["token", "token vesting", "crypto investing", "project health", "tokenomics", "due diligence"],
    content: [
      {
        type: "p",
        html: "Most crypto investors spend hours reading whitepapers, studying tokenomics PDFs, and watching founder interviews. Very few spend ten minutes looking at the vesting schedule – which is a mistake, because the vesting schedule is the one document a project cannot fake.",
      },
      {
        type: "p",
        html: "A whitepaper is a marketing document. A pitch deck is a best-case scenario. But a token vesting contract, deployed on-chain, is a legally and cryptographically binding commitment. It tells you exactly when every insider – every founder, every VC, every advisor – can sell. And that, more than anything else, reveals what they actually believe about the project's future.",
      },
      {
        type: "callout",
        emoji: "🔍",
        title: "The core insight",
        body:  "Insiders design their own vesting schedules. When those schedules are short, front-loaded, or full of loopholes, it tells you something important: they are not confident enough in the project to lock up their tokens for long.",
      },

      { type: "h2", text: "What a Token Vesting Schedule Actually Contains" },
      {
        type: "p",
        html: "A token vesting schedule defines three things for each recipient group (team, investors, advisors, ecosystem fund, etc.): the <strong>cliff</strong> (the minimum time before any tokens unlock), the <strong>vesting period</strong> (the total duration over which tokens release), and the <strong>TGE unlock</strong> (the percentage available immediately at token launch).",
      },
      {
        type: "p",
        html: "A typical healthy schedule for a project team looks like: 0% TGE, 12-month cliff, 36-month linear vesting. This means founders receive nothing for the first year, then gradually receive their allocation over the following three years. Seed investors might receive: 5% TGE, 6-month cliff, 24-month vesting.",
      },
      {
        type: "p",
        html: "The numbers matter less than the <em>ratio</em> between what insiders can sell quickly versus what they have to hold long-term. That ratio is your signal.",
      },

      { type: "h2", text: "Five Vesting Patterns That Should Concern You" },
      {
        type: "p",
        html: "After analysing hundreds of token vesting schedules, these are the patterns that most reliably predict poor long-term performance:",
      },
      {
        type: "ul",
        items: [
          "<strong>High TGE unlocks for insiders (above 15%).</strong> If founders or seed investors can sell 20%+ of their allocation the day the token lists, the incentive structure is broken. Watch for projects where the team's TGE unlock is higher than the community's.",
          "<strong>Vesting periods shorter than 18 months for the team.</strong> Building a meaningful protocol takes years. A team whose tokens fully vest in 12 months has no structural reason to stay past month 12. Many don't.",
          "<strong>No cliff for seed or private round investors.</strong> Early-stage investors who can sell from day one are not long-term believers – they are short-term speculators. If VCs have no cliff, expect selling pressure the moment the token lists.",
          "<strong>Ecosystem and treasury funds with short vesting.</strong> A '40% community fund' sounds generous. A 40% community fund that fully unlocks in 6 months is a dumping mechanism disguised as altruism.",
          "<strong>Vesting changes after launch.</strong> On-chain vesting contracts are immutable – a project that announces it is 'adjusting' its vesting schedule post-launch is using off-chain (contractual) rather than on-chain enforcement. That is a red flag for the entire token's integrity.",
        ],
      },

      { type: "h2", text: "What Good Token Vesting Looks Like" },
      {
        type: "p",
        html: "The best vesting schedules are almost boring. Long cliffs, linear releases, conservative TGE unlocks, and no special carve-outs for any individual. Here is what to look for as a positive signal:",
      },
      {
        type: "ul",
        items: [
          "<strong>Team vesting longer than investor vesting.</strong> Founders should be tied to the project longer than the VCs backing them. If the team's vesting is shorter, ask why.",
          "<strong>On-chain enforcement.</strong> Vesting contracts deployed to Ethereum, Base, or another L2 via protocols like Sablier or UNCX are verifiable and immutable. Contractual vesting ('trust us, it's in the legal agreements') is not.",
          "<strong>No cliff exceptions.</strong> Some projects grant early liquidity to certain advisors or strategic partners. Each exception is a sell event you did not see coming.",
          "<strong>Community allocation vesting longer than private round.</strong> This signals the team wants retail holders to have earlier access than institutions – a genuine alignment with the community.",
          "<strong>Published, verified on-chain addresses.</strong> The project should publish the smart contract addresses for every vesting tranche. If you cannot independently verify when tokens will unlock, assume the worst.",
        ],
      },

      { type: "h2", text: "How to Read a Vesting Schedule in Practice" },
      {
        type: "p",
        html: "Start with the tokenomics table – usually in the whitepaper or on the project website. Note the allocation percentages (team, investors, advisors, ecosystem, etc.) and their respective vesting terms. Then ask three questions:",
      },
      {
        type: "ol",
        items: [
          "<strong>When can the largest single group of insiders first sell?</strong> Identify the earliest unlock event that involves a significant percentage of total supply (more than 5%). This is the first moment of meaningful sell pressure.",
          "<strong>What percentage of total supply unlocks in the first six months?</strong> Add up TGE unlocks plus any cliff-free linear vesting in the first six months. If this number exceeds 15–20% of total supply, the token faces structural selling pressure during its most vulnerable price discovery phase.",
          "<strong>Is the vesting on-chain or contractual?</strong> Check block explorers or use a tool like Vestream to verify whether vesting contracts are actually deployed. If you cannot find on-chain contracts, the schedule is an unenforceable promise.",
        ],
      },
      {
        type: "callout",
        emoji: "💡",
        title: "A practical benchmark",
        body:  "For a project you are seriously considering investing in: total insider unlocks in the first 12 months should be below 10% of total supply. If it is above 20%, the token price will struggle to hold gains regardless of fundamentals.",
      },

      { type: "h2", text: "Why This Matters More Than Fundamentals (Short Term)" },
      {
        type: "p",
        html: "In traditional equity markets, a company's stock can rise on strong fundamentals even while insiders are selling – because the selling pressure is spread across millions of public shares and many liquidity providers. Crypto tokens are different. Supply floats are small, liquidity is thin, and a single unlock event involving 5% of total supply can move the price by 20–30%.",
      },
      {
        type: "p",
        html: "This means that even a fundamentally strong project with a poor vesting schedule will struggle to hold its price in the year after launch. Conversely, a mediocre project with a well-designed vesting schedule may <em>appear</em> to perform well simply because there is limited sell pressure. Vesting schedules do not tell you about a project's long-term quality – but they tell you a great deal about its short-to-medium term price dynamics.",
      },
      {
        type: "p",
        html: "For traders, this means vesting unlock calendars are a first-order input to any position sizing decision. For long-term investors, a strong vesting structure is a prerequisite – not a nice-to-have – before doing deeper research.",
      },

      { type: "h2", text: "Tracking Vesting Unlocks Across Your Portfolio" },
      {
        type: "p",
        html: "The practical problem is that tracking vesting across multiple projects is genuinely hard. Different protocols (Sablier, UNCX, Hedgey, Unvest) use different contract structures. Different chains (Ethereum, Base, BSC) require different tooling. And most projects do not send you a notification when a major unlock is approaching.",
      },
      {
        type: "p",
        html: "This is the problem Vestream was built to solve. Connect your wallet and Vestream surfaces every active vesting stream across every major protocol and chain in a single view – with an unlock calendar that shows you exactly when tokens are scheduled to release, weeks in advance.",
      },

      {
        type: "faq",
        items: [
          {
            q: "Does a long vesting period guarantee a project is legitimate?",
            a: "No. Vesting periods can be gamed – for example, by setting long public vesting periods while quietly granting shorter vesting to individual insiders via separate contracts. Always verify on-chain. Long vesting is necessary but not sufficient for legitimacy.",
          },
          {
            q: "What is the difference between a cliff and a lock-up?",
            a: "A cliff is the minimum period before vesting begins – after the cliff, tokens release gradually. A lock-up typically means 100% of tokens are locked until a specific date, then release all at once. Lock-ups without subsequent vesting create a single large sell event; cliffs followed by linear vesting create gradual, smaller releases.",
          },
          {
            q: "Can I see another wallet's vesting schedule?",
            a: "Yes – vesting contracts are public on-chain. Any blockchain explorer will show the contract state. Tools like Vestream make this easier by normalising data across multiple protocols into a readable format.",
          },
          {
            q: "What happens to unvested tokens if a project fails?",
            a: "It depends on the vesting contract design. Some contracts allow the project to revoke unvested tokens (common for employee grants, less common for investor tranches). Others are irrevocable – even if the project shuts down, tokens continue to vest on the original schedule. Always check whether the contract has a revocation function.",
          },
        ],
      },
    ],
  },

  // ── Article 12 ───────────────────────────────────────────────────────────────
  {
    slug:        "token-unlock-calendar",
    title:       "Token Unlock Calendar: How to Track When Your Tokens Become Available",
    excerpt:     "Every vested token has an unlock schedule. Understanding when your tokens release – and how to track those dates – is essential for managing your crypto portfolio.",
    publishedAt: "2026-03-21",
    updatedAt:   "2026-03-21",
    readingTime: "8 min read",
    category:    "Fundamentals",
    tags:        ["token", "token unlock", "token vesting", "crypto portfolio", "vesting schedule", "unlock calendar"],
    content: [
      {
        type: "p",
        html: "If you have received tokens through a vesting agreement – as an investor, a project team member, or through a community program – you almost certainly cannot access all of them right now. Your tokens are unlocking on a schedule, and that schedule has a direct impact on your portfolio value, your tax planning, and your decisions about when and whether to sell.",
      },
      {
        type: "p",
        html: "A <strong>token unlock calendar</strong> is a structured view of exactly when your vested tokens become available. It shows you each future release date, the quantity unlocking at each point, and the cumulative percentage of your allocation you have received so far. For anyone holding meaningful token positions, it is one of the most practical financial tools you can maintain.",
      },
      {
        type: "callout",
        emoji: "📅",
        title: "Why this matters",
        body:  "Most token holders have only a vague sense of when their next unlock is. This leads to two mistakes: selling too early (before a large unlock you forgot about) or holding too long (not realising significant supply is about to hit the market from other vesting recipients).",
      },

      { type: "h2", text: "What Is a Token Unlock?" },
      {
        type: "p",
        html: "A token unlock is the moment a portion of previously locked tokens becomes transferable. Tokens are locked by smart contracts – code deployed on a blockchain that holds your tokens in escrow and releases them according to a predefined schedule. Until the contract releases them, you can see your allocation but cannot move, sell, or use those tokens.",
      },
      {
        type: "p",
        html: "Unlocks can be structured in several ways. A <strong>linear unlock</strong> releases a fixed fraction of your allocation every second, every day, or every month. A <strong>cliff unlock</strong> releases nothing until a specific date, then either releases everything at once or switches to linear vesting. A <strong>tranche unlock</strong> releases fixed percentages at predetermined milestones – for example, 25% every six months.",
      },
      {
        type: "ul",
        items: [
          "<strong>Linear vesting:</strong> Smooth, continuous release – e.g., 1/1440th of your allocation unlocks every minute for 1,000 days.",
          "<strong>Cliff + linear:</strong> Nothing unlocks for 12 months (the cliff), then linear release begins over 24 months.",
          "<strong>Milestone-based:</strong> Tranches release when protocol metrics are hit (TVL targets, user counts), though this requires off-chain oracle input and is less common.",
          "<strong>TGE unlock:</strong> A percentage (often 5–20%) unlocks immediately at Token Generation Event; the remainder vests over time.",
        ],
      },

      { type: "h2", text: "The Anatomy of a Token Unlock Event" },
      {
        type: "p",
        html: "Every unlock event has four components worth tracking: the <strong>date</strong> (or block height) when tokens release, the <strong>quantity</strong> unlocking at that moment, the <strong>recipient group</strong> (team, seed investors, public sale participants, ecosystem fund), and the <strong>percentage of total supply</strong> that event represents.",
      },
      {
        type: "p",
        html: "The last point – percentage of total supply – is the one most investors ignore. An unlock of 1,000,000 tokens sounds large. But if total supply is 10 billion, it represents 0.01% of supply and is unlikely to move the price. Conversely, an unlock of 500,000 tokens from a 2,000,000-token circulating supply is a 25% supply increase in a single event – a genuinely significant market event.",
      },
      {
        type: "callout",
        emoji: "📊",
        title: "The right metric",
        body:  "Always express unlock quantities as a percentage of current circulating supply – not total supply, and not your personal allocation. That percentage tells you how much new sell pressure the market must absorb.",
      },

      { type: "h2", text: "Why Token Unlocks Move Prices" },
      {
        type: "p",
        html: "Token unlocks have a measurable effect on price – particularly in the days immediately before and after a large unlock event. The mechanism is straightforward: recipients who have been waiting for liquidity will, in aggregate, sell some portion of what they receive. The market anticipates this, and professional traders often build short positions ahead of large known unlock events.",
      },
      {
        type: "p",
        html: "Research across DeFi tokens consistently shows that tokens underperform in the 30 days following a major unlock (typically defined as an unlock representing more than 1% of total supply). The underperformance is most pronounced when the unlocking recipients are early-stage investors (seed or private round VCs) who purchased at a significant discount to the current market price.",
      },
      {
        type: "ul",
        items: [
          "<strong>Seed investor unlocks:</strong> Highest sell probability. Early investors often bought at 5–20% of the current price and may have fund mandates to realise returns.",
          "<strong>Team unlocks:</strong> Mixed. Founders often hold long-term, but early employees who have moved on will sell.",
          "<strong>Community/ecosystem unlocks:</strong> Lower sell pressure. These tokens are typically distributed to active users who are already engaged with the protocol.",
          "<strong>Treasury/DAO unlocks:</strong> Lowest sell pressure. These tokens are controlled by governance and rarely sold directly.",
        ],
      },

      { type: "h2", text: "How to Find Your Token's Unlock Schedule" },
      {
        type: "p",
        html: "There are three places to find authoritative unlock information, in increasing order of reliability:",
      },
      {
        type: "ol",
        items: [
          "<strong>The project's official tokenomics documentation.</strong> Most projects publish a vesting schedule in their whitepaper or tokenomics page. This tells you the intended schedule – but does not confirm it is actually enforced on-chain.",
          "<strong>Block explorers.</strong> For any token with on-chain vesting, the vesting contract is publicly visible. Search the token's contract address on Etherscan, BscScan, or Polygonscan to find associated vesting contracts. This requires understanding how to read smart contract state, which is not beginner-friendly.",
          "<strong>Vesting aggregator tools.</strong> Platforms like Vestream read vesting contracts across Ethereum, Base, BNB Chain, and Polygon, normalise the data, and present unlock schedules in a readable format. Connect your wallet and you can see every active vesting stream you are party to, with future unlock dates displayed on a calendar.",
        ],
      },
      {
        type: "p",
        html: "The third option – a dedicated vesting aggregator – is the only one that gives you a consolidated view if you hold multiple token positions across different protocols. Most investors have vesting positions spread across Sablier, UNCX, and Hedgey simultaneously, and checking each protocol manually is impractical.",
      },

      { type: "h2", text: "Building Your Personal Token Unlock Calendar" },
      {
        type: "p",
        html: "A useful personal unlock calendar should show, at minimum: the next 12 months of unlock dates for every position you hold, the quantity and estimated value unlocking at each event, and the protocol managing the vesting contract. For tax purposes, you will also want a record of the token price at each unlock date, since in most jurisdictions a token unlock is a taxable event at the fair market value at time of receipt.",
      },
      {
        type: "p",
        html: "Beyond your own positions, serious token holders also track <em>market-wide</em> unlock calendars – the aggregate unlocks happening across the entire market, not just their own wallet. A large unlock in a competing protocol can affect sentiment across an entire sector. A massive team unlock in a high-profile token can pull liquidity from the whole market as investors sell to reallocate.",
      },
      {
        type: "callout",
        emoji: "🗓️",
        title: "What to track",
        body:  "For each position: unlock date · quantity · estimated USD value · protocol · recipient category. For market-wide awareness: total supply unlocking in the next 30 and 90 days across the tokens in your sector.",
      },

      { type: "h2", text: "Protocols That Manage Token Vesting On-Chain" },
      {
        type: "p",
        html: "Not all vesting is created equal. On-chain vesting – enforced by immutable smart contracts – is verifiable and tamper-proof. Off-chain vesting – managed by legal agreements and manual token transfers – is not. The following protocols handle on-chain vesting and are widely used by major token projects:",
      },
      {
        type: "table",
        headers: ["Protocol", "Model", "Chains"],
        rows: [
          ["Sablier", "Per-second linear streaming", "Ethereum, Base, Polygon, BNB Chain"],
          ["UNCX", "Configurable lock & vest", "Ethereum, Base, Polygon, BNB Chain"],
          ["Hedgey", "Batch grants, DAO payroll", "Ethereum, Base, Polygon, BNB Chain"],
          ["Unvest", "Milestone + linear vesting", "Ethereum, Base, Polygon, BNB Chain"],
        ],
      },
      {
        type: "p",
        html: "If your token's vesting is managed by any of these protocols, the schedule is verifiable on-chain and trackable via aggregators like Vestream. If your project uses a custom vesting contract, you will need to find and read that specific contract on the relevant block explorer.",
      },

      {
        type: "faq",
        items: [
          {
            q: "Do I owe taxes when my tokens unlock?",
            a: "In most jurisdictions, yes – a token unlock is treated as receipt of income at the fair market value at the time of unlocking, regardless of whether you sell. Consult a tax professional familiar with crypto in your country, as treatment varies significantly by jurisdiction.",
          },
          {
            q: "Can a project change my vesting schedule after the fact?",
            a: "Not if the vesting is enforced by an immutable smart contract. Contracts deployed on-chain cannot be altered unless they were specifically designed with upgradeability. If a project claims it is 'adjusting' its vesting schedule, ask whether the on-chain contracts have actually been changed – or whether only off-chain legal agreements have been modified.",
          },
          {
            q: "What happens if I miss a claim on my vesting contract?",
            a: "Most vesting contracts continue accruing tokens regardless of whether you actively claim them. You do not forfeit unclaimed tokens by failing to claim on a specific date – they accumulate and can be claimed whenever you choose. Check your specific contract, as behaviour varies by protocol.",
          },
          {
            q: "How do I track token unlocks for projects I am invested in but not directly holding vesting positions?",
            a: "For market-wide unlock tracking, use a token unlock aggregator that monitors all vesting contracts for a given token – not just your personal wallet. This gives you visibility into upcoming sell pressure from all recipient groups, even if you purchased tokens on the open market rather than through a vesting agreement.",
          },
        ],
      },
    ],
  },

  // ── Article 12 ───────────────────────────────────────────────────────────────
  {
    slug:        "what-is-a-token",
    title:       "What Is a Token? A Plain-English Guide for People New to Crypto",
    excerpt:     "A token is a unit of value that lives inside a smart contract. This guide explains what tokens are, how they differ from coins, the main types you will encounter, and how to track tokens you actually own – without the jargon.",
    publishedAt: "2026-04-24",
    updatedAt:   "2026-04-24",
    readingTime: "9 min read",
    category:    "Fundamentals",
    tags:        ["token", "crypto token", "ERC-20", "utility token", "governance token", "stablecoin"],
    content: [
      {
        type: "p",
        html: "Almost every article about crypto starts by saying \"token\" as though everyone already knows what that means. Most people do not – and asking feels like admitting you have not been paying attention. This guide fixes that. No jargon, no handwaving: just a clear explanation of what a token is, the different kinds you will run into, and what actually happens when you hold one.",
      },
      {
        type: "p",
        html: "By the end of this you will be able to read almost any crypto-project landing page, token-sale announcement, or vesting contract and understand exactly what is being offered. You will also know why tokens – not blockchains – are the primary unit you interact with when you use crypto in daily life.",
      },

      { type: "h2", text: "What Is a Token, Really?" },
      {
        type: "p",
        html: "A token is a unit of value or utility that is recorded inside a smart contract on a blockchain. That is the precise definition, but it is not the most useful one. The more useful way to think about it: a token is an entry in a ledger that says <em>\"this address owns X of this thing.\"</em> The smart contract is the set of rules that says how the thing can move, who can move it, and how many can exist.",
      },
      {
        type: "callout",
        emoji: "📌",
        title: "Simple definition",
        body:  "A token is a digital unit of ownership that lives inside a smart contract. The contract keeps track of who owns how much, and enforces the rules about how it can be transferred.",
      },
      {
        type: "p",
        html: "When you \"hold\" a token, you do not have a physical object and you do not have a file on your computer. What you have is a private key that proves control of a wallet address – and the smart contract's ledger says that address owns N units of the token. Moving tokens means signing a transaction with your key, which tells the contract to update the ledger.",
      },

      { type: "h2", text: "Tokens vs. Coins – The Distinction That Actually Matters" },
      {
        type: "p",
        html: "People use \"token\" and \"coin\" interchangeably, and most of the time it does not matter. But if you want to sound like you know what you are talking about, here is the distinction:",
      },
      {
        type: "ul",
        items: [
          "<strong>A coin is native to its own blockchain.</strong> ETH is the coin of the Ethereum network. BNB is the coin of BNB Chain. MATIC was the coin of Polygon. You need the coin to pay transaction fees on that chain.",
          "<strong>A token lives on top of an existing blockchain.</strong> USDC, UNI, LINK, and thousands of others are tokens that exist as smart contracts on Ethereum (and other chains). They use the chain's infrastructure but have their own rules.",
          "<strong>The practical difference:</strong> coins are backed by the economic security of the whole chain. Tokens are backed by whatever the issuing smart contract and its issuers say they are backed by.",
        ],
      },

      { type: "h2", text: "The Main Types of Tokens" },
      {
        type: "p",
        html: "Tokens are a general-purpose tool, and people have used them for a huge range of things. Most of what you will encounter falls into one of these categories:",
      },
      {
        type: "table",
        headers: ["Type", "What it represents", "Examples"],
        rows: [
          ["Utility token",    "Access to a product or service – think of it as a pre-paid credit",        "BAT, GRT, FIL"],
          ["Governance token", "A vote on decisions made by a protocol or DAO",                            "UNI, AAVE, MKR"],
          ["Stablecoin",       "A claim on a stable asset – usually $1 USD or a fiat equivalent",          "USDC, USDT, DAI"],
          ["Wrapped asset",    "A tokenised version of another asset (often cross-chain)",                 "WBTC, WETH"],
          ["Security token",   "A regulated security represented on-chain (ownership, dividends, etc.)",   "Real-estate tokens, tokenised equity"],
          ["NFT",              "A unique, non-interchangeable token – usually ERC-721 rather than ERC-20", "Bored Apes, ENS names, game items"],
          ["LP token",         "Proof that you supplied liquidity to a DEX pool",                          "Uniswap V2/V3 positions, Curve LP"],
        ],
      },
      {
        type: "p",
        html: "A single project often issues more than one token. A DeFi protocol might have a governance token you vote with, LP tokens you get for providing liquidity, and receipt tokens you get for depositing into a vault. Each is a separate smart contract with its own rules.",
      },

      { type: "h2", text: "Token Standards: Why ERC-20 Matters" },
      {
        type: "p",
        html: "The reason wallets, exchanges, and dashboards can display any token without special-casing each one is a set of technical standards that define what functions a token contract must implement. The most important standard is <strong>ERC-20</strong>, which defines fungible tokens on Ethereum and every EVM-compatible chain.",
      },
      {
        type: "ul",
        items: [
          "<strong>ERC-20</strong> – fungible tokens (every unit is interchangeable: 1 USDC = 1 USDC)",
          "<strong>ERC-721</strong> – non-fungible tokens (each one is unique – this is the NFT standard)",
          "<strong>ERC-1155</strong> – a multi-token standard that can hold both fungible and non-fungible together, popular in gaming",
          "<strong>BEP-20, TRC-20, SPL</strong> – the equivalent standards on BNB Chain, Tron, and Solana respectively",
        ],
      },
      {
        type: "p",
        html: "If a token is ERC-20 compliant, any wallet, exchange, or protocol that supports ERC-20 supports that token – automatically. This is why listing a new token on Uniswap or MetaMask does not require any engineering work: the standard does the heavy lifting.",
      },

      { type: "h2", text: "How You Actually Get Tokens" },
      {
        type: "p",
        html: "There are five common ways a token ends up in a wallet. Understanding which applies to your situation matters, because each has different tax, unlock, and risk implications.",
      },
      {
        type: "ol",
        items: [
          "<strong>Purchase on an exchange.</strong> You buy the token on a centralised exchange (Coinbase, Binance) or a decentralised one (Uniswap, 1inch). The token is delivered to your wallet immediately – no vesting, no lock-up.",
          "<strong>Airdrop.</strong> The project sends tokens to eligible wallets for free – usually to reward early users, protocol activity, or governance participation.",
          "<strong>Token sale / ICO / IDO.</strong> You buy the token directly from the project at an agreed price. These allocations are almost always subject to a vesting schedule.",
          "<strong>Rewards or yield.</strong> You stake, provide liquidity, or use a protocol, and it emits tokens to you over time.",
          "<strong>Grant or compensation.</strong> You are a founder, team member, advisor, or investor, and the project has granted you a token allocation – almost always with a multi-year vesting schedule enforced by a vesting contract.",
        ],
      },
      {
        type: "callout",
        emoji: "🔒",
        title: "Vested tokens are not liquid tokens",
        body:  "If you received tokens through a token sale, grant, or advisory role, you probably do not have full access to them yet. They sit in a vesting contract that releases them gradually. This is where token holders most often get confused: seeing a large allocation on paper and assuming it is immediately sellable. It usually is not.",
      },

      { type: "h2", text: "Where Tokens Live: Chains" },
      {
        type: "p",
        html: "Every token is deployed on a specific chain. An ERC-20 token on Ethereum is a different thing from an ERC-20 token with the same name on Base or Polygon – even if they share a symbol. This trips people up often: USDC on Ethereum, USDC on Base, and USDC on Solana are three different smart contracts (bridged or natively issued by Circle), and moving between them requires a bridge.",
      },
      {
        type: "p",
        html: "The main EVM chains you will encounter tokens on are <strong>Ethereum</strong> (the most liquid, most expensive), <strong>Base</strong> (Coinbase's L2, low fees, growing fast), <strong>BNB Chain</strong> (large retail user base, cheap), and <strong>Polygon</strong> (general-purpose, widely used). There are many others, but those four cover most real volume.",
      },

      { type: "h2", text: "Tracking Tokens You Own" },
      {
        type: "p",
        html: "Once you have tokens, tracking them is more complex than it sounds – especially if you received them through a vesting agreement. Your wallet balance only shows you what you can move today. It does not show you tokens that are locked in vesting contracts, tokens that are staked, tokens that are earning yield, or tokens that are sitting in LP positions.",
      },
      {
        type: "p",
        html: "For vested tokens specifically, you need a dashboard that can read the vesting contract itself and calculate your actual unlock schedule. Most of the major vesting protocols (Sablier, Hedgey, UNCX, Unvest, Superfluid, PinkLock) have their own interfaces, but they only show you tokens vesting on that specific platform. If your allocations are spread across multiple protocols – which is common for active investors and team members – you need an aggregator. <a href=\"/\" style=\"color: #1CB8B8; text-decoration: underline;\">Vestream</a> is one option that indexes all the main vesting protocols across Ethereum, Base, BNB Chain, and Polygon.",
      },

      { type: "h2", text: "What to Know Before You Hold Any Token" },
      {
        type: "p",
        html: "Before you treat a token as an asset, ask four questions:",
      },
      {
        type: "ol",
        items: [
          "<strong>What does the smart contract actually do?</strong> Is it a standard ERC-20 with no special functions, or can the issuer mint more, pause transfers, or freeze balances? Look at the contract on a block explorer.",
          "<strong>Is my allocation vested?</strong> If it is, when do the tokens actually unlock? You can check this at the contract level on a vesting aggregator.",
          "<strong>Where does the liquidity live?</strong> If there is no DEX pool or exchange listing for the token, the paper value is meaningless.",
          "<strong>What is the circulating vs. total supply?</strong> A token with 1% circulating supply and a 12-month aggressive unlock schedule is exposed to massive sell pressure. Check the unlock calendar.",
        ],
      },
      {
        type: "p",
        html: "Holding tokens is not like holding equity. The rules are enforced by code, not contract law, and the only way to really know what you own is to read the contract and the vesting schedule. Fortunately, that information is all on-chain and publicly verifiable – you just need the right tools to surface it.",
      },

      {
        type: "faq",
        items: [
          {
            q: "What is the difference between a token and a cryptocurrency?",
            a: "Cryptocurrency is the general umbrella term. It includes both coins (native assets of a blockchain, like ETH or BTC) and tokens (assets built on top of an existing blockchain, like USDC or UNI). All tokens are cryptocurrencies; not all cryptocurrencies are tokens.",
          },
          {
            q: "Can I lose a token after I receive it?",
            a: "If you lose access to the private key of the wallet that holds the token, yes – no one else can recover it for you. There is no customer-support line. This is why self-custody requires discipline about backup and security.",
          },
          {
            q: "If a project issues a new token, where does it come from?",
            a: "The project deploys a smart contract that defines the token and the initial supply. The contract is code – it runs on the blockchain and has to follow the rules of the token standard (ERC-20, etc.). The initial supply is allocated to specific addresses at deployment, typically including treasury, team, investors, community, and liquidity.",
          },
          {
            q: "Do I pay tax when I receive a token?",
            a: "In most jurisdictions, yes – receiving tokens (via airdrop, reward, or vesting unlock) is usually treated as income at the fair market value at the time of receipt. Selling that token later creates a separate capital gains event. This varies significantly by country; consult a crypto-literate tax professional.",
          },
          {
            q: "How do I find out if my tokens are locked in a vesting contract?",
            a: "Ask the project which vesting protocol they use (Sablier, UNCX, Hedgey, etc.) and check your wallet on that protocol's dashboard. Or use an aggregator that reads all major vesting contracts and shows you the complete unlock schedule for your wallet – see our <a href=\"/resources/how-to-track-token-vesting\" style=\"color: #1CB8B8; text-decoration: underline;\">guide to tracking token vesting</a> for the step-by-step.",
          },
        ],
      },
    ],
  },

  // ── Article 14: Sablier vs Hedgey vs UNCX comparison ────────────────────────
  {
    slug:        "sablier-vs-hedgey-vs-uncx-comparison",
    title:       "Sablier vs Hedgey vs UNCX: Token Vesting Protocol Comparison (2026)",
    excerpt:     "Three protocols dominate token vesting on EVM chains. They look similar from the outside but differ in mechanics, cost, and feature scope. This guide breaks down when to use each – for projects designing vesting, and for recipients trying to understand what they were granted.",
    publishedAt: "2026-04-26",
    updatedAt:   "2026-04-26",
    readingTime: "11 min read",
    category:    "Guides",
    tags:        ["sablier", "hedgey", "uncx", "token vesting", "comparison", "tokenomics", "DeFi infrastructure"],
    content: [
      {
        type: "p",
        html: "If your project is about to launch a token, or you've just been granted one with a vesting schedule, you'll quickly run into three names: <strong>Sablier</strong>, <strong>Hedgey</strong>, and <strong>UNCX</strong>. Together they account for the majority of on-chain vesting positions across Ethereum, Base, BNB Chain, and Polygon. They all do roughly the same thing – lock tokens in a contract, release them on a schedule – but the mechanics differ in ways that matter when you're choosing one (or trying to claim from one).",
      },
      {
        type: "p",
        html: "This guide compares all three on the dimensions that actually drive a decision: vesting model, cliff support, claim UX, gas cost, multi-chain coverage, NFT representation, and ecosystem fit. We're protocol-neutral – Vestream tracks vestings across all three (and six others) so we have no horse in the race. The recommendations below are what we'd tell a friend asking which one to use.",
      },

      { type: "h2", text: "TL;DR – Quick verdict" },
      {
        type: "table",
        headers: ["Use case", "Best protocol", "Why"],
        rows: [
          ["Founder/team vesting on Ethereum", "Sablier", "Most battle-tested. Per-second streaming. Strong DAO adoption."],
          ["Investor allocations with NFT receipts", "Hedgey", "NFT-based plans are transferable and inheritable."],
          ["Token launch lockers (LP + team)", "UNCX", "Combined locker + vesting. Designed for token launches."],
          ["Lots of recipients, low cost per claim", "Sablier", "Streaming model means one contract serves many recipients."],
          ["Step/tranche unlocks (e.g. 25% every 6 months)", "Hedgey or UNCX", "Both support stepped schedules natively."],
          ["Multi-chain consistency", "Sablier or Hedgey", "Both have polished cross-chain UX. UNCX coverage is more chain-by-chain."],
        ],
      },
      {
        type: "callout",
        emoji: "ℹ️",
        title: "What to remember",
        body:  "There is no single 'best' protocol. The right choice depends on whether you're optimising for streaming UX (Sablier), transferability (Hedgey), or launch-bundled lockers (UNCX). All three are production-ready and audited – security is not the differentiator.",
      },

      { type: "h2", text: "Sablier" },
      {
        type: "p",
        html: "Sablier is the oldest and most widely-used streaming token vesting protocol in DeFi. Originally launched in 2020, the V2 contracts (LockupLinear and LockupTranched) are now the canonical reference for what 'crypto-native vesting' looks like. If you've heard of any vesting protocol, it's probably this one.",
      },
      { type: "h3", text: "How Sablier works" },
      {
        type: "p",
        html: "Sablier's flagship feature is <strong>per-second streaming</strong>. Instead of releasing tokens in chunks (e.g. monthly), the contract continuously increases the recipient's claimable balance, second by second. From the recipient's perspective, the math looks like: at any moment, claimable = (totalAmount × elapsedSeconds) / vestingDurationSeconds. The contract uses pure on-chain time arithmetic – no off-chain oracle, no scheduled tasks, no manual triggers.",
      },
      {
        type: "p",
        html: "Sablier supports two main shapes: <strong>LockupLinear</strong> (single linear stream, optionally with a cliff) and <strong>LockupTranched</strong> (multiple tranches with custom amounts and unlock times – good for milestone-based grants). A single Sablier contract on each chain serves all streams, which means recipients claim through the same dashboard regardless of which project granted them the tokens.",
      },
      { type: "h3", text: "Sablier strengths" },
      {
        type: "ul",
        items: [
          "<strong>Battle-tested</strong> – over $500M in cumulative vested value across all chains. Used by major DAOs (MakerDAO, Aave, Lido, etc.) for treasury vesting.",
          "<strong>Per-second streaming</strong> – recipients can claim any time without waiting for a calendar tick. Useful for cash-flow-sensitive recipients (advisors, contractors).",
          "<strong>Cancelable streams</strong> – projects can configure vests as cancelable (returning unvested tokens to the grantor) or non-cancelable. Both are common.",
          "<strong>Polished recipient UX</strong> – Sablier's own claim dashboard is the cleanest in the category, with clear schedules, claim history, and ENS integration.",
          "<strong>The Graph subgraphs</strong> – every chain has a public subgraph that aggregators (like Vestream) can read efficiently.",
        ],
      },
      { type: "h3", text: "Sablier weaknesses" },
      {
        type: "ul",
        items: [
          "<strong>No NFT receipts in V2</strong> (V1 had them, V2 dropped them) – vested positions are bound to the recipient address. If you lose access to that wallet, the tokens are stranded.",
          "<strong>No native LP locker</strong> – Sablier is purely vesting. If you also need to lock your token's liquidity pool, you'll be combining Sablier with another tool (often UNCX).",
          "<strong>Tranched math can confuse</strong> – for non-developers, the LockupTranched model is harder to reason about than a simple monthly schedule.",
        ],
      },

      { type: "h2", text: "Hedgey" },
      {
        type: "p",
        html: "Hedgey's distinctive design choice is that <strong>every vesting plan is an NFT</strong>. When a project grants you tokens through Hedgey, you don't just get a stream – you get an ERC-721 token in your wallet that represents the right to claim. This sounds like a small detail but it changes the economics meaningfully.",
      },
      { type: "h3", text: "How Hedgey works" },
      {
        type: "p",
        html: "Hedgey calls a vesting plan a <strong>TokenVestingPlan</strong>, and each one is minted as an NFT to the recipient. The NFT carries the schedule (start time, cliff, end time, total amount) and the right to claim accumulated tokens at any time. Crucially, NFTs are <strong>transferable</strong> – you can sell, gift, or move your unvested allocation to another wallet without breaking the schedule. This is impossible on Sablier where vests are bound to the original recipient.",
      },
      {
        type: "p",
        html: "Hedgey's plans support both linear and milestone (stepped) schedules, with optional cliffs. Like Sablier, claims are pull-based – the recipient calls <code>redeemPlans()</code> on the contract to claim the currently-vested portion.",
      },
      { type: "h3", text: "Hedgey strengths" },
      {
        type: "ul",
        items: [
          "<strong>Transferable plans</strong> – NFT representation means vesting positions can be transferred (e.g. to a multi-sig, to a new wallet for security, or sold OTC). Unique in this category.",
          "<strong>Inheritance-friendly</strong> – because the NFT is portable, estate planning is significantly easier than with bound-to-address vests.",
          "<strong>Strong investor allocation use case</strong> – VCs prefer Hedgey because they can transfer SAFT positions between fund vehicles without re-negotiating with the project.",
          "<strong>Comprehensive schedule shapes</strong> – supports linear with cliff, stepped, milestone-based, and combinations.",
          "<strong>Clean web app for project deployment</strong> – Hedgey's create-a-plan flow is the most polished if you're a project setting up vesting for the first time.",
        ],
      },
      { type: "h3", text: "Hedgey weaknesses" },
      {
        type: "ul",
        items: [
          "<strong>Higher gas at claim time</strong> – NFT contract overhead means each claim costs noticeably more than a Sablier claim. Adds up if you have many small vests.",
          "<strong>Smaller TVL than Sablier</strong> – meaningful but not dominant. Around $140M cumulative as of early 2026.",
          "<strong>NFT discoverability tradeoff</strong> – recipients sometimes don't realise they have a Hedgey NFT in their wallet. We've seen multiple cases of users missing claims because they didn't check NFT holdings.",
        ],
      },

      { type: "h2", text: "UNCX" },
      {
        type: "p",
        html: "UNCX (formerly Unicrypt) is positioned slightly differently from Sablier and Hedgey. It started as a <strong>liquidity locker</strong> for token projects – a way to lock your Uniswap LP tokens so investors trust that the founder won't rug-pull liquidity – and grew vesting features alongside that. As a result, UNCX is the natural choice for projects that need both LP locks AND team/investor vesting in one place.",
      },
      { type: "h3", text: "How UNCX works" },
      {
        type: "p",
        html: "UNCX has two distinct vesting products: <strong>TokenVesting</strong> (V3, the modern locker) and <strong>VestingManager</strong> (the legacy variant used in earlier launches). Both lock ERC-20 tokens with a schedule but the contract architecture differs. From a recipient's perspective they look similar – you go to the UNCX dashboard, connect your wallet, and claim.",
      },
      {
        type: "p",
        html: "UNCX's vesting model is cliff-plus-stepped: a cliff period during which nothing unlocks, then either linear release or fixed step amounts at fixed intervals. There's no per-second streaming like Sablier – UNCX vesting is checkpoint-based.",
      },
      { type: "h3", text: "UNCX strengths" },
      {
        type: "ul",
        items: [
          "<strong>Bundled LP locker + token vesting</strong> – the only one of the three that natively lets a project lock both LP and team tokens through the same UI/contract suite.",
          "<strong>Token-launch fit</strong> – projects launching on Uniswap/PancakeSwap who need to demonstrate rug-pull protection use UNCX because that's what audit firms and exchanges expect to see.",
          "<strong>Wide chain coverage</strong> – Ethereum, BNB Chain, Polygon, Base, plus more chain-specific deployments than Sablier or Hedgey.",
          "<strong>Reasonable claim costs</strong> – the contract is simpler than Hedgey's NFT path, so gas at claim time is competitive with Sablier.",
        ],
      },
      { type: "h3", text: "UNCX weaknesses" },
      {
        type: "ul",
        items: [
          "<strong>Less polished recipient UX</strong> – the dashboard works but feels older than Sablier's. Discovering whether you have a vest with UNCX often requires the project's pointer rather than self-discovery.",
          "<strong>Two contract variants is confusing</strong> – TokenVesting vs VestingManager means recipients sometimes claim from the wrong UI and miss positions. (Vestream merges both behind a single 'UNCX' tracker for exactly this reason.)",
          "<strong>Not associated with crypto-native DAOs</strong> – Sablier has the DAO/protocol audience; UNCX has the token-launch audience. Cultural fit matters when picking.",
        ],
      },

      { type: "h2", text: "Decision framework – which one to use?" },
      {
        type: "p",
        html: "Strip away the marketing and the choice usually comes down to three questions:",
      },
      {
        type: "ol",
        items: [
          "<strong>Do you need transferability?</strong> If yes (typically institutional investors who want to move SAFT positions between funds), use <strong>Hedgey</strong>. Sablier and UNCX bind vests to the original recipient address.",
          "<strong>Do you also need an LP locker?</strong> If yes (token launches, rug-protection signalling), use <strong>UNCX</strong>. Sablier and Hedgey are vesting-only.",
          "<strong>Otherwise, default to Sablier</strong> – most battle-tested, lowest gas, polished UX, dominant DAO adoption.",
        ],
      },
      {
        type: "p",
        html: "Many real projects use <strong>combinations</strong>. A typical token launch might use Sablier for team vesting (because the team trusts the protocol), Hedgey for institutional investor allocations (because investors want NFT transferability), and UNCX for LP locks (because exchanges audit for that specifically). This is fine – the only downside is recipients then need to check three dashboards. Or one aggregator (like ours).",
      },

      { type: "h2", text: "What's identical across all three" },
      {
        type: "p",
        html: "It's worth being explicit about what these protocols do <strong>not</strong> differ on, because it cuts down decision fatigue:",
      },
      {
        type: "ul",
        items: [
          "<strong>Security model</strong> – all three are audited by major firms. None has had a critical exploit affecting deposited funds.",
          "<strong>Pull-based claims</strong> – recipients always have to call a transaction to claim. None of them auto-distributes tokens to wallets.",
          "<strong>On-chain enforcement</strong> – schedules cannot be changed after deployment (with rare exceptions for cancelable streams). The smart contract is the source of truth.",
          "<strong>ERC-20 only</strong> – none of them currently support vesting NFTs or other token standards. If you need to vest a Bored Ape, you'll need a different solution.",
        ],
      },

      { type: "h2", text: "How Vestream tracks all three" },
      {
        type: "p",
        html: "We built Vestream specifically because crypto users frequently have vestings across multiple protocols and don't want to check three or four dashboards every month. Paste any wallet address and Vestream queries Sablier's subgraph, Hedgey's subgraph, both UNCX variants, and six other protocols in parallel – returning every active vesting in under three seconds.",
      },
      {
        type: "p",
        html: "On the protocol pages we maintain – <a href=\"/protocols/sablier\" style=\"color: #1CB8B8; text-decoration: underline;\">/protocols/sablier</a>, <a href=\"/protocols/hedgey\" style=\"color: #1CB8B8; text-decoration: underline;\">/protocols/hedgey</a>, <a href=\"/protocols/uncx\" style=\"color: #1CB8B8; text-decoration: underline;\">/protocols/uncx</a> – you can see live TVL, stream counts, and the upcoming unlock calendar. We don't favour one over another; the goal is to make it boring to track all of them.",
      },
      {
        type: "callout",
        emoji: "🔗",
        title: "Try it",
        body:  "Paste any wallet at vestream.io/find-vestings to see what's vested for that address across all three protocols (and six more). No signup, no email – just the data.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          {
            q: "Can a project switch vesting protocols mid-schedule?",
            a: "Effectively no. Vesting positions are smart-contract escrows on a specific protocol. Switching would mean cancelling existing vests (where cancellation is permitted), withdrawing the locked tokens, redeploying them to a new protocol, and getting recipients to migrate. We've seen it done once or twice during major protocol upgrades, but it's a coordination nightmare. Pick carefully up-front.",
          },
          {
            q: "Which protocol is cheapest for projects to deploy vesting on?",
            a: "Sablier and UNCX are roughly tied – both have a one-time deployment cost per stream/lock that scales linearly with the number of recipients. Hedgey is slightly more expensive due to the NFT mint per recipient. For a project granting tokens to 500 recipients, the difference is meaningful (low five figures vs low six figures of gas). Sablier on Layer 2 (Base, Optimism) is by far the cheapest path.",
          },
          {
            q: "Does any of them support cliff + linear unlock combinations?",
            a: "All three do. Sablier's LockupLinear takes an optional cliff parameter. Hedgey's TokenVestingPlan supports cliff durations explicitly. UNCX's TokenVesting allows a cliff timestamp before linear or stepped release begins. Pretty much every real-world vesting schedule is cliff-plus-something.",
          },
          {
            q: "What happens if the protocol's frontend goes offline?",
            a: "Your tokens are still claimable – the contracts run on-chain regardless of whether the project's website is up. You'd interact with the contract directly via Etherscan's 'Write Contract' tab, or use an aggregator. This is a real consideration: smaller protocols have shut down their frontends, and recipients still successfully claimed by going contract-direct. Sablier, Hedgey, and UNCX are all well-funded enough that frontend availability isn't a near-term concern.",
          },
          {
            q: "Can I tell from a token address which vesting protocol holds my tokens?",
            a: "Not directly from the token contract, no. The token doesn't 'know' it's locked – it just knows the vesting protocol's contract holds the balance. To find out which protocol, either ask the project or use an aggregator like Vestream that scans all of them automatically.",
          },
        ],
      },
    ],
  },

  // ── Article 17 ───────────────────────────────────────────────────────────────
  {
    slug:        "sablier-token-streaming-vesting-explained",
    title:       "Sablier: Token Streaming Vesting Explained",
    excerpt:     "Sablier pioneered real-time, per-second token streaming on Ethereum. Here is how it works, where it runs, and how to track Sablier streams on Vestream.",
    publishedAt: "2026-04-27",
    updatedAt:   "2026-04-27",
    readingTime: "9 min read",
    category:    "Guides",
    tags:        ["sablier", "token streaming", "vesting", "ethereum", "defi"],
    content: [
      {
        type: "p",
        html: "Sablier is the protocol that introduced the idea of <strong>real-time token streaming</strong> to Ethereum. Instead of releasing locked tokens in monthly tranches, Sablier releases them <em>per second</em> – turning a vesting schedule into a continuous flow of value from the contract to the recipient's claimable balance.",
      },
      {
        type: "p",
        html: "If you have received tokens from a project that uses Sablier, your unlock isn't a step function. It's a smooth line. Every time you load the contract, more tokens are claimable than the moment before. This article explains how Sablier works under the hood, the chains it supports, the most common use cases, and how to monitor your Sablier positions inside Vestream.",
      },

      { type: "h2", text: "What Sablier Actually Does" },
      {
        type: "p",
        html: "At its core, Sablier is a set of smart contracts that hold tokens on behalf of a sender and release them to a recipient over a specified duration. The release formula is linear in time: at any block timestamp, the contract calculates the proportion of the duration that has elapsed and treats that fraction of the total amount as withdrawable.",
      },
      {
        type: "callout",
        emoji: "💧",
        title: "Streaming, in one sentence",
        body:  "Locked total ÷ duration = release rate. Multiply by elapsed seconds and you have your claimable balance – updated every block.",
      },
      {
        type: "p",
        html: "Sablier currently ships two primary contract families. <strong>LockupLinear</strong> handles the classic continuous-stream case, optionally with a cliff. <strong>LockupTranched</strong> handles step-based unlocks (e.g. monthly tranches) for projects that prefer discrete events. Both produce on-chain positions that any wallet, indexer, or aggregator can read.",
      },

      { type: "h2", text: "Per-Second Release: Why It Matters" },
      {
        type: "p",
        html: "Most legacy vesting contracts release tokens in lump sums – you wait 30 days, then claim a chunk. Streaming dissolves that waiting. The benefits compound across several dimensions:",
      },
      {
        type: "ul",
        items: [
          "<strong>Smoother selling pressure:</strong> recipients can claim continuously rather than dumping a monthly tranche the moment it lands.",
          "<strong>No cliff-day chaos:</strong> there is no single timestamp where every team member rushes to withdraw, gas spikes, and prices wobble.",
          "<strong>Granular cash flow:</strong> contributors can claim only what they need today, leaving the rest to keep accruing.",
          "<strong>Composability:</strong> downstream protocols can treat the recipient's claimable balance as a real-time stream of income, not a periodic event.",
        ],
      },
      {
        type: "p",
        html: "For projects designing tokenomics, the trade-off is that streaming makes your unlock schedule slightly harder to communicate to a community used to thinking in monthly bars. That is one reason Sablier's <em>tranched</em> variant exists – sometimes you want the social clarity of a discrete monthly cliff.",
      },

      { type: "h2", text: "Supported Chains" },
      {
        type: "p",
        html: "Sablier is multi-chain and continues to add networks. The current production deployments most relevant to vesting use cases are:",
      },
      {
        type: "table",
        headers: ["Chain", "Chain ID", "Use case"],
        rows: [
          ["Ethereum", "1", "Mainnet vesting for institutional / treasury allocations"],
          ["Base", "8453", "Lower-fee streaming for high-frequency claim patterns"],
          ["BNB Chain", "56", "BSC-native projects and BEP-20 token vesting"],
          ["Polygon", "137", "Cheap continuous streaming for grants and payroll"],
          ["Sepolia", "11155111", "Ethereum testnet for development and audits"],
        ],
      },
      {
        type: "p",
        html: "Vestream's Sablier adapter covers all five of these networks, normalising every stream into the same <strong>VestingStream</strong> shape so you can view a Polygon stream and a Base stream side by side without translating fields.",
      },

      { type: "h2", text: "Common Sablier Use Cases" },
      {
        type: "p",
        html: "Sablier's flexibility makes it the de facto standard for several vesting-adjacent workflows. The four most common are:",
      },
      {
        type: "ol",
        items: [
          "<strong>Founder and team vesting:</strong> 4-year stream with a 1-year cliff is the canonical configuration. Tokens flow continuously after the cliff, eliminating the temptation of a single-day dump.",
          "<strong>Investor allocations:</strong> seed and private rounds frequently use linear streams over 18–36 months, sometimes with a TGE unlock implemented as a separate stream.",
          "<strong>Grants programs:</strong> DAOs use Sablier to disburse grants over the life of a project, with the option to cancel the stream if milestones aren't met.",
          "<strong>Onchain payroll:</strong> contractors paid in tokens prefer streams to monthly invoices – claimable balance grows in real time.",
        ],
      },
      {
        type: "p",
        html: "If you are evaluating a project's tokenomics, finding their team allocation in a Sablier <em>LockupLinear</em> contract is a strong commitment signal. The contract is non-revocable by default in many configurations, and the schedule is verifiable on-chain by anyone.",
      },

      { type: "h2", text: "Reading a Sablier Stream On-Chain" },
      {
        type: "p",
        html: "Every Sablier stream is identifiable by an <em>(chainId, contract, streamId)</em> tuple. The relevant fields you need to interpret the schedule are the same across the contract families:",
      },
      {
        type: "ul",
        items: [
          "<strong>startTime</strong> – when the stream began accruing.",
          "<strong>endTime</strong> – when the final token unlocks.",
          "<strong>cliffTime</strong> – the timestamp before which zero tokens are claimable (optional).",
          "<strong>depositedAmount</strong> – total tokens placed into the stream.",
          "<strong>withdrawnAmount</strong> – total tokens already pulled by the recipient.",
        ],
      },
      {
        type: "p",
        html: "Subtract <em>withdrawnAmount</em> from the time-prorated unlocked amount and you have the recipient's <strong>claimable balance</strong>. Sablier's frontend, block explorers, and aggregators all calculate this from the same on-chain primitives. For a wider primer on the underlying terms, see <a href=\"/resources/how-to-read-a-vesting-schedule\">How to Read a Vesting Schedule</a>.",
      },

      { type: "h2", text: "Tracking Sablier Streams on Vestream" },
      {
        type: "p",
        html: "Vestream indexes Sablier across all supported chains via its hosted subgraphs. When you add a wallet to your dashboard, the Sablier adapter is queried in parallel with every other supported protocol – Hedgey, UNCX, Superfluid, PinkSale, Streamflow, Jupiter Lock, and the rest. Streams are normalised into a unified card so you don't need to understand each contract's specific field naming.",
      },
      {
        type: "p",
        html: "You can also view all Sablier streams for a single token by using the <a href=\"/explore\">explore</a> page. This is especially useful for due diligence – confirming, for example, that a project's team allocation is indeed locked in a 4-year LockupLinear stream rather than sitting in a multisig.",
      },
      {
        type: "callout",
        emoji: "📡",
        title: "Track Sablier vesting on Vestream",
        body:  "Add any Ethereum, Base, BNB, Polygon or Sepolia address and Vestream will surface every Sablier stream it owns or receives – with claimable balance updated in real time. Sign in at <a href=\"/login\">Vestream</a> to get started.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Is Sablier audited?", a: "Yes – multiple independent audits across LockupLinear and LockupTranched are public. As with any contract, audits reduce but do not eliminate risk. Always confirm the deployed contract address matches Sablier's documented deployments before sending funds." },
          { q: "Can a Sablier stream be cancelled?", a: "Only if the sender enabled cancelability at creation. Many vesting deployments deliberately set cancelability to false so the recipient cannot have their stream pulled. Check the stream's metadata before assuming either way." },
          { q: "What happens if I never claim?", a: "Nothing bad. The tokens remain in the contract and continue to accrue against your claimable balance. There is no expiry – you can claim the full amount at any point after the stream ends." },
          { q: "Does Sablier support tokens with transfer fees?", a: "Some token types (rebasing, transfer-tax) interact poorly with streaming math. Sablier's docs flag the unsupported types – most vanilla ERC-20s work without issue." },
        ],
      },
    ],
  },

  // ── Article 18 ───────────────────────────────────────────────────────────────
  {
    slug:        "hedgey-nft-vesting-plans-explained",
    title:       "Hedgey: NFT-Based Vesting Plans Explained",
    excerpt:     "Hedgey turns each vesting plan into a transferable NFT. Here is how that design choice changes the on-chain mechanics, the user experience, and the tax considerations.",
    publishedAt: "2026-04-27",
    updatedAt:   "2026-04-27",
    readingTime: "8 min read",
    category:    "Guides",
    tags:        ["hedgey", "nft vesting", "vesting", "tokenomics"],
    content: [
      {
        type: "p",
        html: "Most vesting protocols treat a recipient's allocation as a row in a contract – a numeric position keyed to an address. <strong>Hedgey</strong> takes a different approach: each vesting plan is an <strong>NFT</strong>, owned by the recipient's wallet, with the underlying tokens locked behind it. Transfer the NFT and you transfer the entire vesting position.",
      },
      {
        type: "p",
        html: "That single design decision changes everything downstream – composability, transferability, accounting, and the user experience for revoking grants. This guide unpacks how Hedgey works, why projects choose it, and how Vestream surfaces Hedgey plans alongside streams from other protocols.",
      },

      { type: "h2", text: "The NFT-as-Vesting-Plan Model" },
      {
        type: "p",
        html: "A Hedgey vesting plan is an ERC-721 token. The NFT's tokenId points to a struct on the vesting contract that contains the schedule: total amount, start, cliff, period, end, and the underlying ERC-20 token. Whoever holds the NFT is entitled to claim against that schedule.",
      },
      {
        type: "callout",
        emoji: "🧾",
        title: "One plan, one NFT",
        body:  "If a project grants you tokens via Hedgey, you receive an NFT in your wallet. The NFT <em>is</em> your vesting position – it is not a receipt or a representation, it is the bearer instrument.",
      },
      {
        type: "p",
        html: "Hedgey ships several plan variants: <strong>TokenVestingPlan</strong> (revocable team-style vesting with cliff and linear release), <strong>TokenLockupPlan</strong> (non-revocable investor-style locks), and <strong>VotingTokenVestingPlan</strong> (vesting with delegated governance rights to retain voting power on locked tokens). Each is its own ERC-721 collection.",
      },

      { type: "h2", text: "Why Make Vesting Transferable?" },
      {
        type: "p",
        html: "Transferable vesting positions sound risky – they enable secondary markets in unvested tokens, which is precisely what some projects want to prevent. But transferability solves real problems too:",
      },
      {
        type: "ul",
        items: [
          "<strong>Wallet hygiene:</strong> recipients can move their vesting position to a fresh wallet without redeploying contracts.",
          "<strong>Estate planning:</strong> NFT-based positions can be willed or transferred to a custodian without coordination from the granting project.",
          "<strong>Liquidity for unvested tokens:</strong> third-party markets (e.g. OTC desks) can custody and price unvested positions if the project allows.",
          "<strong>Treasury management:</strong> a DAO holding granted tokens can move plans between subaccounts as the org structure evolves.",
        ],
      },
      {
        type: "p",
        html: "Projects that want to prevent transfer can do so by deploying a non-transferable variant. The default for team grants is usually transferable; for public sale or community allocations it is often locked.",
      },

      { type: "h2", text: "Supported Chains" },
      {
        type: "table",
        headers: ["Chain", "Chain ID", "Notes"],
        rows: [
          ["Ethereum", "1", "Largest deployment by TVL"],
          ["Base", "8453", "Frequently chosen for new launches"],
          ["BNB Chain", "56", "Hedgey adoption on BSC has grown post-2024"],
          ["Polygon", "137", "Cheap mints make NFT-per-recipient affordable at scale"],
        ],
      },
      {
        type: "p",
        html: "Hedgey's per-recipient NFT mint cost is non-trivial on Ethereum mainnet, which is why projects with hundreds of grantees tend to deploy on L2s. Vestream indexes Hedgey on all four production chains via The Graph subgraph.",
      },

      { type: "h2", text: "Reading a Hedgey Plan" },
      {
        type: "p",
        html: "When you open a Hedgey position, the on-chain fields you'll encounter are nearly identical to the cross-protocol vocabulary used by every other vesting tool – see <a href=\"/resources/how-to-read-a-vesting-schedule\">How to Read a Vesting Schedule</a> for a primer. Hedgey's twist is the <strong>period</strong> field, which controls the granularity of unlocks. A period of 1 means linear streaming (per-second). A period of 2,592,000 (30 days in seconds) means monthly tranches.",
      },
      {
        type: "ul",
        items: [
          "<strong>amount</strong> – total locked tokens",
          "<strong>start</strong> – schedule start (unix seconds)",
          "<strong>cliff</strong> – timestamp before which zero is claimable",
          "<strong>rate</strong> – tokens released per period",
          "<strong>period</strong> – release granularity in seconds",
          "<strong>token</strong> – underlying ERC-20",
          "<strong>vestingAdmin</strong> – the address authorised to revoke (TokenVestingPlan only)",
        ],
      },

      { type: "h2", text: "Revocation Mechanics" },
      {
        type: "p",
        html: "Hedgey's <em>TokenVestingPlan</em> supports revocation by the granting project. If a team member leaves before fully vesting, the project can call <strong>revokePlan</strong>, which returns the unvested portion to the project treasury and leaves the already-vested portion claimable by the recipient. The recipient's NFT is burned in the same transaction.",
      },
      {
        type: "callout",
        emoji: "⚠️",
        title: "Revocation is asymmetric",
        body:  "If you receive a TokenVestingPlan, the granting project retains the unilateral ability to revoke unvested tokens at any time. Lockup plans (TokenLockupPlan) cannot be revoked once funded.",
      },

      { type: "h2", text: "Voting Rights on Vesting Tokens" },
      {
        type: "p",
        html: "Hedgey's voting variants delegate the locked tokens' governance power to the recipient even before the tokens vest. This is important for projects whose token is also a governance token – without delegation, locked allocations are effectively disenfranchised, and a small number of unlocked holders dominate votes. Hedgey's voting plan calls <strong>delegate()</strong> on the underlying token in the same transaction that creates the plan.",
      },

      { type: "h2", text: "Tracking Hedgey on Vestream" },
      {
        type: "p",
        html: "Add any wallet to your Vestream dashboard and the Hedgey adapter scans Ethereum, Base, BNB, and Polygon for both granted and held vesting NFTs. Each plan is normalised into a unified stream card showing claimable, withdrawn, and locked amounts, plus the next unlock event.",
      },
      {
        type: "callout",
        emoji: "📡",
        title: "Track Hedgey vesting on Vestream",
        body:  "Vestream surfaces every Hedgey vesting NFT in a watched wallet – across Ethereum, Base, BNB, and Polygon. Sign in at <a href=\"/login\">Vestream</a> to monitor your plans alongside streams from Sablier, UNCX, and the rest.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Can I sell my Hedgey vesting NFT?", a: "Only if it is a transferable variant. Most team grants are transferable; most lockup plans are not. Check the contract's transfer restrictions before listing." },
          { q: "What happens to my vesting if I lose the NFT?", a: "Whoever holds the NFT controls the position. Lost NFTs mean lost vesting, with no recovery – the granting project cannot reissue without revoking and redeploying." },
          { q: "Why does Hedgey cost more gas than Sablier?", a: "Hedgey mints an ERC-721 per recipient, which is more expensive than Sablier's storage-only stream creation. The trade-off is the transferability and composability that NFT semantics provide." },
          { q: "Does Hedgey support cliff plus linear?", a: "Yes – every plan variant supports an explicit cliff timestamp before the linear (or stepped) release begins." },
        ],
      },
    ],
  },

  // ── Article 19 ───────────────────────────────────────────────────────────────
  {
    slug:        "uncx-token-lockers-and-vesting",
    title:       "UNCX: Token Lockers and Vesting Explained",
    excerpt:     "UNCX is best known for LP locks but also runs two vesting products: TokenVesting v3 and the newer VestingManager. Here is how to tell them apart and read a UNCX vest.",
    publishedAt: "2026-04-27",
    updatedAt:   "2026-04-27",
    readingTime: "10 min read",
    category:    "Guides",
    tags:        ["uncx", "token locker", "vesting", "liquidity", "guides"],
    content: [
      {
        type: "p",
        html: "If you have spent any time around new token launches you have seen the UNCX badge – the green lock icon on a token's listing page that confirms the project's liquidity is locked. <strong>UNCX</strong> is the most widely-used token locker in the EVM ecosystem, and over time it expanded from LP locks into team-token vesting too.",
      },
      {
        type: "p",
        html: "That expansion creates ambiguity: when someone says <em>'this token is locked on UNCX'</em>, they could mean the project's liquidity is locked, or they could mean an individual recipient's tokens are vesting. These are different products with different contracts. This article clears up the distinction and walks through both.",
      },

      { type: "h2", text: "Token Lockers vs Vesting on UNCX" },
      {
        type: "p",
        html: "UNCX runs two distinct product families on each chain it deploys to. The vocabulary overlaps, but the use cases don't.",
      },
      {
        type: "table",
        headers: ["Product", "What it locks", "Who uses it", "Release pattern"],
        rows: [
          ["LP Locker", "LP tokens (Uniswap V2/V3, PancakeSwap, etc.)", "Project teams locking pool liquidity", "Typically single unlock at end date"],
          ["TokenVesting v3", "Bare ERC-20 tokens", "Project teams vesting team/investor allocations", "Cliff + linear, multi-tranche"],
          ["VestingManager", "Bare ERC-20 tokens (per-recipient)", "Project teams running larger grant programs", "Cliff + linear, sub-position per recipient"],
        ],
      },
      {
        type: "callout",
        emoji: "🔓",
        title: "Quick rule of thumb",
        body:  "If the underlying asset is an LP token, it's a <em>liquidity lock</em>. If it is a regular ERC-20 going to specific recipient addresses, it's a <em>vesting</em> contract. UNCX runs both and they live in separate contracts.",
      },

      { type: "h2", text: "TokenVesting v3" },
      {
        type: "p",
        html: "TokenVesting v3 is UNCX's mature, widely-deployed vesting contract. A single vesting deployment can hold many separate vests, each with their own owner, schedule, and underlying token. The key concepts are:",
      },
      {
        type: "ul",
        items: [
          "<strong>Lock owner:</strong> the address that can claim from the vest. Usually the recipient.",
          "<strong>Token:</strong> the underlying ERC-20.",
          "<strong>Amount:</strong> total locked tokens for this vest.",
          "<strong>StartEmission:</strong> the timestamp at which linear vesting begins. Before this, only the cliff portion (if any) is claimable.",
          "<strong>EndEmission:</strong> the timestamp at which 100% has vested.",
        ],
      },
      {
        type: "p",
        html: "TokenVesting v3 supports cliff + linear schedules natively. The cliff is implemented as a TGE unlock plus a delay before <em>startEmission</em> – making it slightly less ergonomic than Sablier's explicit cliff parameter, but functionally equivalent.",
      },

      { type: "h2", text: "VestingManager: The Newer Architecture" },
      {
        type: "p",
        html: "VestingManager is UNCX's newer vesting contract. The architectural improvement is that one VestingManager deployment can manage many independent vesting plans for a single project, with cleaner per-recipient sub-positions and less administrative overhead than redeploying TokenVesting v3 for each grant.",
      },
      {
        type: "p",
        html: "From a recipient's perspective, the experience is similar – you see a vesting position keyed to your address, with a claimable balance that grows over time. From a project's perspective, VestingManager is the more convenient choice for distributing tokens to dozens or hundreds of contributors at once.",
      },
      {
        type: "callout",
        emoji: "📦",
        title: "Vestream merges them",
        body:  "Inside the Vestream UI, TokenVesting v3 and VestingManager positions are surfaced as a single <em>UNCX</em> protocol card. The underlying contract is recorded as metadata, but you don't have to think about which one your project deployed.",
      },

      { type: "h2", text: "Supported Chains" },
      {
        type: "p",
        html: "UNCX deploys to most major EVM networks. The chains Vestream indexes are:",
      },
      {
        type: "ul",
        items: [
          "<strong>Ethereum</strong> (chainId 1) – TokenVesting v3 and VestingManager",
          "<strong>BNB Chain</strong> (56) – both products, very high usage volume",
          "<strong>Polygon</strong> (137) – both products",
          "<strong>Base</strong> (8453) – both products",
          "<strong>Sepolia</strong> (11155111) – TokenVesting v3, for testnet flows",
        ],
      },

      { type: "h2", text: "Interpreting an UNCX Vest" },
      {
        type: "p",
        html: "Suppose you receive tokens from a project that vested them via UNCX. To verify the schedule yourself:",
      },
      {
        type: "ol",
        items: [
          "Find the UNCX vesting contract address on the project's docs or block explorer.",
          "Call the public read function to fetch your vest by lock owner address.",
          "Inspect the four key fields: <em>amount</em>, <em>startEmission</em>, <em>endEmission</em>, and <em>amountWithdrawn</em>.",
          "Compute claimable: pro-rata fraction of (now − startEmission) ÷ (endEmission − startEmission), capped at 100%, multiplied by amount, minus amountWithdrawn.",
          "Cross-check against the project's published vesting terms.",
        ],
      },
      {
        type: "p",
        html: "Or just paste your address into Vestream and skip the contract math entirely. For a deeper primer on these fields, see <a href=\"/resources/how-to-read-a-vesting-schedule\">How to Read a Vesting Schedule</a>.",
      },

      { type: "h2", text: "Why Projects Choose UNCX for Vesting" },
      {
        type: "ul",
        items: [
          "<strong>Brand trust:</strong> the UNCX badge is recognised by retail buyers and listing aggregators alike.",
          "<strong>Multi-product platform:</strong> teams that already use UNCX for LP locks tend to add team vesting on the same dashboard rather than onboarding to a second protocol.",
          "<strong>Battle-tested contracts:</strong> TokenVesting v3 has years of production usage with no major exploits.",
          "<strong>Cross-chain consistency:</strong> the same product semantics apply on every chain UNCX deploys to.",
        ],
      },

      { type: "h2", text: "Tracking UNCX on Vestream" },
      {
        type: "p",
        html: "Vestream queries both TokenVesting v3 and VestingManager subgraphs in parallel for every supported chain. Vests are merged, deduplicated, and presented as unified UNCX cards. You can compare an UNCX position to a Sablier or Hedgey position without translating between contract field names.",
      },
      {
        type: "callout",
        emoji: "📡",
        title: "Track UNCX vesting on Vestream",
        body:  "Add any wallet on Ethereum, BNB, Polygon, Base, or Sepolia to <a href=\"/login\">Vestream</a> and the UNCX adapter will surface every TokenVesting v3 and VestingManager position it holds.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Is the UNCX badge on a token listing the same as token vesting?", a: "Not necessarily. The most common UNCX badge refers to liquidity-pool token locks, not team vesting. Read the project's docs to confirm what is locked." },
          { q: "Can a UNCX vest be cancelled by the project?", a: "TokenVesting v3 vests are not unilaterally cancellable by the project once funded. Always verify on a per-deployment basis though – admin keys can vary." },
          { q: "What is the difference between UNCX TokenVesting v3 and VestingManager?", a: "TokenVesting v3 is the older, single-contract-per-deployment model. VestingManager is the newer architecture that handles many recipients more efficiently. Functionally they behave the same from a recipient's perspective." },
          { q: "Does UNCX support per-second streaming?", a: "No – UNCX vests use linear release between startEmission and endEmission, calculated on each claim. Effectively similar to streaming but you only realise the unlock when you withdraw." },
        ],
      },
    ],
  },

  // ── Article 21 ───────────────────────────────────────────────────────────────
  {
    slug:        "streamflow-solana-vesting",
    title:       "Streamflow on Solana: Token Vesting in the SVM Ecosystem",
    excerpt:     "Streamflow is the dominant vesting protocol on Solana. Here is how it differs from EVM equivalents and how Vestream tracks SPL-token vesting.",
    publishedAt: "2026-04-27",
    updatedAt:   "2026-04-27",
    readingTime: "9 min read",
    category:    "Guides",
    tags:        ["streamflow", "solana", "spl tokens", "vesting", "guides"],
    content: [
      {
        type: "p",
        html: "Solana's account model and SPL token standard make on-chain vesting feel different from the EVM equivalent – and that difference shows up clearly in <strong>Streamflow</strong>, the most-used vesting protocol on Solana. If you are coming from Sablier or Hedgey, the mental model needs a small adjustment.",
      },
      {
        type: "p",
        html: "This article walks through what Streamflow is, why it works the way it does, and how Vestream surfaces Streamflow positions next to your EVM streams in a single dashboard.",
      },

      { type: "h2", text: "What Streamflow Does" },
      {
        type: "p",
        html: "Streamflow provides token streaming and vesting for SPL tokens on Solana. It supports the same broad family of patterns familiar from EVM protocols: cliff + linear release, tranche-based release, payroll-style continuous streams, and revocable team grants. What is different is the underlying account architecture.",
      },
      {
        type: "callout",
        emoji: "🌊",
        title: "Account-based, not contract-based",
        body:  "On Solana, every stream is its own program-derived account holding state. There is no shared mapping of 'all streams' inside one contract – each stream is its own data account.",
      },

      { type: "h2", text: "How SPL Token Mechanics Differ from ERC-20" },
      {
        type: "p",
        html: "If you are EVM-native, the most surprising parts of SPL token vesting are:",
      },
      {
        type: "ul",
        items: [
          "<strong>Associated Token Accounts (ATAs):</strong> a wallet does not directly hold SPL tokens. It holds a token account per mint. Streamflow's escrow is a token account owned by a program-derived address (PDA).",
          "<strong>Rent-exempt accounts:</strong> creating a stream requires depositing a small SOL amount as rent for the new accounts. This is recoverable when the stream closes.",
          "<strong>Discriminators:</strong> Solana programs identify account types via an 8-byte discriminator at the start of the account data. To enumerate all Streamflow streams, you query <em>getProgramAccounts</em> with the right discriminator filter.",
          "<strong>No 'msg.sender' notion of revocation:</strong> Solana relies on signers being passed explicitly. Revocation is implemented as a separate instruction signed by the original sender.",
        ],
      },
      {
        type: "p",
        html: "These differences are infrastructural, not philosophical. The end result for a recipient is identical: tokens that unlock over time, with a claimable balance you can withdraw to your wallet.",
      },

      { type: "h2", text: "Streamflow Stream Variants" },
      {
        type: "p",
        html: "Streamflow exposes a few stream archetypes through its program. The main ones relevant to vesting:",
      },
      {
        type: "ul",
        items: [
          "<strong>Vesting Contract:</strong> the canonical schedule with start, end, optional cliff, and unlock granularity.",
          "<strong>Token Vesting (multi-recipient):</strong> bulk-create grants for a list of contributors in a single transaction.",
          "<strong>Payment streams:</strong> open-ended streams used for payroll and grants programs.",
          "<strong>AlignedContract:</strong> a specialised variant Vestream's adapter currently skips in favour of the standard vesting contract surface.",
        ],
      },

      { type: "h2", text: "Reading a Streamflow Stream" },
      {
        type: "p",
        html: "The fields you'll see on a Streamflow stream map cleanly to the cross-protocol vocabulary covered in <a href=\"/resources/how-to-read-a-vesting-schedule\">How to Read a Vesting Schedule</a>:",
      },
      {
        type: "table",
        headers: ["Streamflow field", "Maps to", "Meaning"],
        rows: [
          ["start", "startTime", "When the stream began accruing"],
          ["end", "endTime", "When the final SPL token unlocks"],
          ["cliff", "cliffTime", "Timestamp before which zero is claimable"],
          ["depositedAmount", "totalAmount", "Total SPL tokens placed into the stream"],
          ["withdrawnAmount", "withdrawnAmount", "Tokens already pulled by the recipient"],
          ["recipient", "recipient", "The wallet entitled to claim"],
          ["mint", "tokenAddress", "SPL token mint address (base58)"],
        ],
      },
      {
        type: "p",
        html: "Streamflow uses base58 addresses (e.g. <em>So11111111111111111111111111111111111111112</em> for wrapped SOL), unlike EVM's 0x-prefixed hex. Vestream handles the address-format normalisation for you, but it's worth knowing if you're reading on-chain data directly.",
      },

      { type: "h2", text: "Why Solana for Vesting at All?" },
      {
        type: "ul",
        items: [
          "<strong>Cost:</strong> creating a stream on Solana costs a fraction of what mainnet Ethereum charges. For projects vesting to hundreds of contributors, the savings are significant.",
          "<strong>Speed:</strong> Solana's sub-second finality makes the per-block accrual feel genuinely real-time.",
          "<strong>Ecosystem fit:</strong> any project whose token is an SPL token is going to vest there natively rather than bridging.",
          "<strong>SDK quality:</strong> the @streamflow/stream JS SDK is well-maintained and integrates cleanly with Solana wallet adapters.",
        ],
      },
      {
        type: "callout",
        emoji: "⚡",
        title: "TVL category caveat",
        body:  "Streamflow runs both vesting and payments products. When evaluating Streamflow's vesting-specific TVL, always isolate the vesting category – combined headline numbers can include open payment streams that are not strictly vesting.",
      },

      { type: "h2", text: "How Vestream Indexes Streamflow" },
      {
        type: "p",
        html: "Vestream's Streamflow adapter uses the official @streamflow/stream SDK against an Alchemy Solana RPC endpoint. For every wallet you track, the adapter calls Streamflow's per-recipient query and normalises every returned stream into the same VestingStream shape used for EVM protocols. This is what lets you view a Solana SPL vest and an Ethereum Sablier stream in the same dashboard view.",
      },
      {
        type: "p",
        html: "The Solana ecosystem in Vestream is feature-flagged – for environments without Solana RPC configured, the adapter is a no-op. Production users on Vestream get Streamflow coverage by default.",
      },
      {
        type: "callout",
        emoji: "📡",
        title: "Track Streamflow vesting on Vestream",
        body:  "Add any Solana wallet (base58 address) to <a href=\"/login\">Vestream</a> and every Streamflow vesting stream it holds will appear next to your EVM positions, with claimable balance updated in real time.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Does Streamflow support cliff schedules?", a: "Yes – every Streamflow vesting contract accepts a cliff parameter. It behaves the same as EVM cliffs: zero claimable until the cliff timestamp, then the cliff portion unlocks in one go." },
          { q: "Can a Streamflow stream be cancelled?", a: "Yes, if the stream was configured as cancelable at creation. The sender can call cancel and reclaim unvested tokens. Many vesting deployments deliberately set cancelable to false." },
          { q: "What's the difference between Streamflow's vesting and payments products?", a: "Vesting is finite, with a defined total amount and end date. Payments streams are open-ended, designed for payroll-style ongoing flows. Vestream surfaces the vesting category." },
          { q: "Why isn't Streamflow on EVM?", a: "Streamflow is a Solana-native protocol that takes advantage of Solana's account model and low fees. The EVM equivalent for similar UX is Sablier or Superfluid." },
        ],
      },
    ],
  },

  // ── Article 22 ───────────────────────────────────────────────────────────────
  {
    slug:        "superfluid-cliff-and-streaming-vesting",
    title:       "Superfluid: Cliff and Streaming Vesting Explained",
    excerpt:     "Superfluid's vesting scheduler combines a one-time cliff unlock with a continuous flow afterwards. Here is how it differs from Sablier.",
    publishedAt: "2026-04-27",
    updatedAt:   "2026-04-27",
    readingTime: "8 min read",
    category:    "Guides",
    tags:        ["superfluid", "streaming", "vesting", "cliff", "guides"],
    content: [
      {
        type: "p",
        html: "<strong>Superfluid</strong> is best known for streaming payments – its 'money streams' have powered DAO payroll and continuous subscriptions for years. The same primitive underlies a more recent product: the <strong>Vesting Scheduler</strong>, which combines a one-time cliff payment with a continuous Superfluid flow for the remainder of the schedule.",
      },
      {
        type: "p",
        html: "If you have used Sablier you'll find Superfluid's mental model adjacent but not identical. This guide walks through the differences and where Superfluid excels.",
      },

      { type: "h2", text: "How the Vesting Scheduler Works" },
      {
        type: "p",
        html: "Superfluid's vesting scheduler decomposes a vesting position into two parts:",
      },
      {
        type: "ol",
        items: [
          "<strong>Cliff payment:</strong> at the cliff timestamp, a one-time token transfer fires to the recipient. This represents the portion of the allocation that vests at the cliff.",
          "<strong>Continuous flow:</strong> immediately after the cliff transfer, a Superfluid flow opens, streaming the remaining tokens to the recipient at a constant flow rate until the end timestamp.",
        ],
      },
      {
        type: "callout",
        emoji: "🚰",
        title: "Cliff plus stream",
        body:  "Think of it as: 'lump-sum at cliff, then drip the rest continuously.' The cliff is a discrete transfer; the post-cliff portion uses the same Superfluid flow primitive that powers DAO payroll.",
      },

      { type: "h2", text: "How Superfluid Flows Differ From Sablier Streams" },
      {
        type: "p",
        html: "Both protocols release tokens continuously, but the underlying mechanics are meaningfully different:",
      },
      {
        type: "table",
        headers: ["Aspect", "Sablier", "Superfluid"],
        rows: [
          ["Token wrap", "Native ERC-20", "Wrapped 'Super Token' (1:1 wrapper)"],
          ["Accounting", "Per-stream balance", "Per-account net flow rate"],
          ["Cliff", "Inline parameter", "Separate cliff transfer + flow"],
          ["Cancelability", "Optional, at creation", "Flows always cancellable by sender"],
          ["Best fit", "Discrete vesting positions", "Mix of vesting + ongoing payroll"],
        ],
      },
      {
        type: "p",
        html: "The Super Token wrapper is the most important thing to understand. To use Superfluid, the underlying ERC-20 must be wrapped into a Super Token (e.g. USDC → USDCx). The wrapper is 1:1 and reversible, but recipients see Super Tokens in their wallet, not the underlying.",
      },

      { type: "h2", text: "Supported Chains" },
      {
        type: "ul",
        items: [
          "<strong>Ethereum</strong> – full vesting scheduler deployment",
          "<strong>Base</strong> – heavy Superfluid usage given low L2 fees",
          "<strong>BNB Chain</strong> – fewer projects, but supported",
          "<strong>Polygon</strong> – historical major deployment",
        ],
      },
      {
        type: "p",
        html: "Vestream queries Superfluid's hosted subgraphs for each chain – these don't require a Graph API key, so the adapter is unusually lightweight to operate.",
      },

      { type: "h2", text: "When to Choose Superfluid" },
      {
        type: "p",
        html: "Superfluid is the right fit when:",
      },
      {
        type: "ul",
        items: [
          "Your project is already running streaming payroll or subscriptions on Superfluid – you keep one financial primitive.",
          "You want a single cliff plus a smooth continuous flow, and you're comfortable with the Super Token wrapper.",
          "You value the option to ramp flow rate up or down later (Superfluid flows are dynamic).",
          "You're vesting on Base or Polygon where the gas savings make per-second flow economically natural.",
        ],
      },
      {
        type: "p",
        html: "If you don't already use Superfluid for payments, the wrapper friction may not be worth it for vesting alone. In that case, see <a href=\"/resources/sablier-token-streaming-vesting-explained\">Sablier</a> for a streaming-native alternative without the wrap step.",
      },

      { type: "h2", text: "Reading a Superfluid Vesting Position" },
      {
        type: "p",
        html: "On-chain, a Superfluid vesting schedule is recorded with these fields:",
      },
      {
        type: "ul",
        items: [
          "<strong>cliffDate</strong> – when the cliff payment fires",
          "<strong>cliffAmount</strong> – size of the one-time cliff transfer",
          "<strong>endDate</strong> – when the post-cliff flow ends",
          "<strong>flowRate</strong> – tokens per second after the cliff",
          "<strong>superToken</strong> – the wrapped ERC-20",
        ],
      },
      {
        type: "p",
        html: "Multiply <em>flowRate</em> by <em>(endDate − cliffDate)</em> and you get the total post-cliff allocation. Add <em>cliffAmount</em> for the grand total. Vestream surfaces all five fields plus the computed claimable balance in a single card.",
      },

      { type: "h2", text: "Cancellability and Edge Cases" },
      {
        type: "callout",
        emoji: "⚠️",
        title: "Flows can be ended",
        body:  "Unlike a hard-locked Sablier stream, the sender of a Superfluid flow can always close it. Vesting deployments rely on the sender (typically the project) honouring the schedule rather than on cryptographic enforcement of immutability.",
      },
      {
        type: "p",
        html: "This isn't a bug – it's a deliberate design choice that mirrors traditional employment vesting (where a company controls the eventual payout). For vesting that <em>must</em> be cryptographically immutable, Sablier or Hedgey lockup plans are stronger guarantees.",
      },

      { type: "h2", text: "Tracking Superfluid Vesting on Vestream" },
      {
        type: "callout",
        emoji: "📡",
        title: "Track Superfluid vesting on Vestream",
        body:  "Add any wallet on Ethereum, Base, BNB, or Polygon and Vestream surfaces every Superfluid vesting schedule it owns or receives. Sign in at <a href=\"/login\">Vestream</a> to view it alongside Sablier, Hedgey, UNCX, and Streamflow streams.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Do I have to wrap my tokens to use Superfluid?", a: "Yes – Superfluid operates on Super Tokens, which are 1:1 wrappers around an underlying ERC-20. Wrap and unwrap are permissionless and instant." },
          { q: "Can a Superfluid vesting flow be cancelled?", a: "The sender can close any Superfluid flow they originated. This is by design but can surprise recipients used to immutable streams." },
          { q: "How is Superfluid different from Sablier?", a: "Sablier holds tokens in a per-stream contract and computes claimable balance on read. Superfluid uses a per-account net-flow accounting model with a wrapper token. Sablier is more 'vesting-native'; Superfluid is more 'payments-native'." },
          { q: "Does Superfluid support tranched vesting?", a: "Not natively – Superfluid is flow-first. For tranched schedules, Sablier's LockupTranched is a better fit." },
        ],
      },
    ],
  },

  // ── Article 23 ───────────────────────────────────────────────────────────────
  {
    slug:        "cliff-vesting-vs-linear-vesting",
    title:       "Cliff Vesting vs Linear Vesting: Which Is Right for Your Project?",
    excerpt:     "Cliff and linear vesting solve different incentive problems. Here is a clear comparison, a decision matrix, and which vesting protocols support each pattern.",
    publishedAt: "2026-04-27",
    updatedAt:   "2026-04-27",
    readingTime: "9 min read",
    category:    "Fundamentals",
    tags:        ["cliff vesting", "linear vesting", "tokenomics", "fundamentals"],
    content: [
      {
        type: "p",
        html: "Almost every vesting schedule you'll encounter combines two primitives: a <strong>cliff</strong> (a fixed period during which nothing unlocks, followed by a lump-sum release) and a <strong>linear release</strong> (continuous or stepped unlocks over time). Used alone or together, they encode different incentive structures.",
      },
      {
        type: "p",
        html: "If you're designing tokenomics, the choice is consequential. If you're a token recipient, understanding which pattern your allocation uses changes how you plan around it. This guide compares the two patterns directly and helps you pick the right one for any given grant.",
      },

      { type: "h2", text: "The Two Patterns" },
      {
        type: "p",
        html: "First, plain definitions:",
      },
      {
        type: "ul",
        items: [
          "<strong>Cliff vesting:</strong> for a fixed period, zero tokens unlock. At the cliff date, a chunk unlocks at once. After that, either the full remainder unlocks or a separate linear schedule begins.",
          "<strong>Linear vesting:</strong> tokens unlock continuously (per-second) or in regular small tranches (e.g. monthly) from start to end, with no jump events.",
        ],
      },
      {
        type: "callout",
        emoji: "📐",
        title: "The combined pattern",
        body:  "Most real-world vesting is 'cliff + linear': a 1-year cliff followed by 3 years of monthly or per-second linear release. This gets the retention benefit of the cliff and the smoothing benefit of linear unlocks.",
      },

      { type: "h2", text: "Cliff Vesting: When and Why" },
      {
        type: "p",
        html: "Cliffs solve one specific problem: making sure a recipient stays long enough to be worth granting tokens to in the first place. The classic case is the four-year team vesting with a one-year cliff inherited from Silicon Valley equity practice.",
      },
      {
        type: "ul",
        items: [
          "<strong>Retention test:</strong> if you leave before the cliff, you walk away with zero tokens. This filters out short-tenure grants.",
          "<strong>Commitment signal:</strong> a project agreeing to a long cliff for its team signals to investors that the team is in for the long haul.",
          "<strong>Operational simplicity:</strong> 'no tokens for 12 months' is easier to communicate than continuous accrual math.",
        ],
      },
      {
        type: "p",
        html: "Cliffs alone (without a subsequent linear phase) are less common – they create cliff-day chaos when the entire allocation lands in one transaction.",
      },

      { type: "h2", text: "Linear Vesting: When and Why" },
      {
        type: "p",
        html: "Linear vesting smooths the unlock pressure on token markets and gives recipients steady cash flow. It is the right answer when you want the recipient to plan around continuous accrual rather than discrete events.",
      },
      {
        type: "ul",
        items: [
          "<strong>Smooth selling pressure:</strong> recipients claim continuously rather than dumping a monthly tranche the day it lands.",
          "<strong>Cash-flow predictability:</strong> contractors and team members can model their token income as a steady drip.",
          "<strong>No cliff-day shock:</strong> there is no single timestamp where the entire community refreshes their order books.",
          "<strong>Composability:</strong> downstream protocols can treat the recipient's claimable balance as a real-time stream.",
        ],
      },

      { type: "h2", text: "Decision Matrix" },
      {
        type: "p",
        html: "Use this matrix to pick the right shape for any given grant:",
      },
      {
        type: "table",
        headers: ["Recipient type", "Recommended shape", "Typical config", "Why"],
        rows: [
          ["Founders / executives", "Cliff + linear", "12mo cliff, 36mo linear", "Retention test plus smoothed sale"],
          ["Engineers / team", "Cliff + linear", "6-12mo cliff, 24-36mo linear", "Same logic, slightly shorter"],
          ["Seed investors", "Cliff + linear", "6-12mo cliff, 18-24mo linear", "Locks early-low-cost positions through key milestones"],
          ["Public sale buyers", "Linear only or none", "0-6mo linear or full at TGE", "Community pressure limits long lockups"],
          ["Advisors", "Cliff + linear", "3-6mo cliff, 12-18mo linear", "Reflects shorter advisory engagement"],
          ["Grants programs", "Linear", "12-24mo linear", "Continuous flow matches deliverable cadence"],
          ["DAO contributors", "Linear", "12mo linear, no cliff", "Reward ongoing work, not tenure proof"],
          ["Ecosystem incentives", "Cliff or no vest", "0-6mo cliff or vested airdrop", "Short cliff prevents instant dumping"],
        ],
      },

      { type: "h2", text: "Protocol Support" },
      {
        type: "p",
        html: "Not every vesting protocol supports both patterns equally. Here is the rough lay of the land:",
      },
      {
        type: "table",
        headers: ["Protocol", "Cliff supported", "Linear supported", "Tranched alternative"],
        rows: [
          ["Sablier (LockupLinear)", "Yes (inline param)", "Yes (per-second)", "LockupTranched"],
          ["Hedgey", "Yes", "Yes", "Yes (period-based)"],
          ["UNCX (TokenVesting v3)", "Yes (via emission delay)", "Yes (linear between two timestamps)", "No"],
          ["Superfluid", "Yes (separate cliff transfer)", "Yes (post-cliff flow)", "No"],
          ["Streamflow", "Yes", "Yes", "Yes"],
          ["PinkSale (PinkLock V2)", "Yes (TGE percent)", "Cycle-based", "Yes"],
        ],
      },
      {
        type: "p",
        html: "Every modern vesting protocol supports cliff plus linear in one form or another. The meaningful differences are about the underlying contract architecture and how unlocks are surfaced to the user, not whether the pattern is supported at all.",
      },

      { type: "h2", text: "Communicating Vesting to Your Community" },
      {
        type: "p",
        html: "Whatever shape you pick, the most common reason a vesting schedule generates community backlash is poor communication, not the schedule itself. A few tactics that help:",
      },
      {
        type: "ol",
        items: [
          "Publish the schedule as both a chart and a table – different audiences read different formats.",
          "List unlock dates explicitly. 'Q3 2026' is fine; '92 days from TGE' is better.",
          "Disclose the underlying protocol and contract address. <a href=\"/resources/how-to-read-a-vesting-schedule\">Anyone should be able to verify your schedule on-chain</a>.",
          "If you change anything mid-flight (e.g. extend a cliff voluntarily), publish the new schedule the same way.",
        ],
      },

      { type: "h2", text: "Tracking Vesting Across Protocols" },
      {
        type: "callout",
        emoji: "📡",
        title: "View any cliff or linear schedule on Vestream",
        body:  "Vestream normalises cliff dates, linear release rates, and tranche events into one dashboard across Sablier, Hedgey, UNCX, Superfluid, Streamflow, and more. Sign in at <a href=\"/login\">Vestream</a> to compare schedules side by side.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Is cliff vesting always better than linear?", a: "No. Cliffs are a retention test – they only make sense when continued contribution from the recipient matters. For investors, smaller cliffs plus longer linear is often a better fit." },
          { q: "Can I have multiple cliffs in one schedule?", a: "Most protocols support only a single cliff. If you need multiple cliffs, you typically chain multiple separate vesting positions or use a tranched product like Sablier's LockupTranched." },
          { q: "What's the standard cliff length?", a: "12 months for founders and team, 6 months for advisors, 6-12 months for seed investors. Shorter cliffs (3 months) are common for community contributors." },
          { q: "Do cliffs reduce sell pressure?", a: "They concentrate it. Without subsequent linear release, a cliff produces a single 'cliff day' of intense selling. Pair every meaningful cliff with a long linear tail to smooth this out." },
        ],
      },
    ],
  },

  // ── Article 24 ───────────────────────────────────────────────────────────────
  {
    slug:        "how-to-read-a-vesting-schedule",
    title:       "How to Read a Vesting Schedule: A Beginner's Guide",
    excerpt:     "Cliff date, vesting end, claimable now, total amount – the same five fields appear on every vesting protocol. Here is how to read them.",
    publishedAt: "2026-04-27",
    updatedAt:   "2026-04-27",
    readingTime: "8 min read",
    category:    "Fundamentals",
    tags:        ["vesting schedule", "fundamentals", "beginners", "guides"],
    content: [
      {
        type: "p",
        html: "If you have just received tokens from a project and someone has handed you a 'vesting schedule', the document might look intimidating – dates, percentages, tranches, claim functions. It isn't. Every vesting schedule, on every protocol, ultimately answers the same five questions.",
      },
      {
        type: "p",
        html: "This guide walks through the universal vocabulary, shows how to find the answers in a real vesting position, and points out the same fields on each major protocol. By the end you'll be able to read a Sablier stream, a Hedgey NFT, an UNCX vest, and a Streamflow contract using the same mental model.",
      },

      { type: "h2", text: "The Five Questions Every Vesting Schedule Answers" },
      {
        type: "ol",
        items: [
          "<strong>How much?</strong> – the total amount of tokens locked in this vest.",
          "<strong>When did it start?</strong> – the timestamp from which unlocks are calculated.",
          "<strong>When does it end?</strong> – the timestamp at which 100% has unlocked.",
          "<strong>What about the cliff?</strong> – the timestamp before which zero is claimable.",
          "<strong>How much can I claim right now?</strong> – the unlocked-but-not-yet-withdrawn balance.",
        ],
      },
      {
        type: "callout",
        emoji: "🧭",
        title: "Five fields, every protocol",
        body:  "Total amount, start time, end time, cliff time, claimable now. Once you can answer those five, you understand the schedule – regardless of which protocol or chain hosts it.",
      },

      { type: "h2", text: "Term-by-Term Breakdown" },
      {
        type: "p",
        html: "Here is the canonical vocabulary you'll see across documentation, contract code, and dashboards:",
      },
      {
        type: "ul",
        items: [
          "<strong>Total amount (a.k.a. depositedAmount):</strong> the full size of the locked allocation. This is fixed at creation and does not change.",
          "<strong>Vesting start (a.k.a. startTime, start, startEmission):</strong> the unix timestamp from which time-based release begins.",
          "<strong>Vesting end (a.k.a. endTime, end, endEmission):</strong> the unix timestamp at which the schedule completes – 100% unlocked.",
          "<strong>Cliff date (a.k.a. cliffTime, cliff):</strong> if non-zero, the timestamp before which zero tokens are claimable. At the cliff, the pro-rata portion for the cliff period unlocks at once.",
          "<strong>Claimable now (a.k.a. withdrawable, claimable):</strong> the dollar-or-token amount available to withdraw as of right now.",
          "<strong>Withdrawn amount (a.k.a. withdrawnAmount):</strong> the cumulative amount the recipient has already pulled.",
          "<strong>Locked amount:</strong> total amount minus withdrawn amount minus claimable now – the future portion still under lock.",
          "<strong>Claim cadence:</strong> how often you can call the claim function. Most protocols are continuous (call any time); some are tranched (only at unlock events).",
        ],
      },

      { type: "h2", text: "Worked Example" },
      {
        type: "p",
        html: "Suppose a project tells you: <em>'You receive 1,200,000 tokens, vesting over 24 months with a 6-month cliff, starting 1 January 2026.'</em> Translated into the canonical fields:",
      },
      {
        type: "table",
        headers: ["Field", "Value"],
        rows: [
          ["Total amount", "1,200,000 tokens"],
          ["Vesting start", "2026-01-01 00:00:00 UTC"],
          ["Vesting end", "2028-01-01 00:00:00 UTC (24 months later)"],
          ["Cliff date", "2026-07-01 00:00:00 UTC (6 months after start)"],
          ["Cliff unlock amount", "300,000 tokens (6/24 of total)"],
          ["Post-cliff release rate", "37,500 tokens per month, or roughly 0.0144 tokens/second"],
        ],
      },
      {
        type: "p",
        html: "Now imagine you check the contract on 1 October 2026 (9 months in). Pro-rata unlocked = 9/24 × 1,200,000 = 450,000. If you have already withdrawn 200,000, your <strong>claimable now</strong> is 250,000 and your <strong>locked</strong> remaining is 750,000.",
      },

      { type: "h2", text: "The Same Fields Across Protocols" },
      {
        type: "p",
        html: "Different vesting protocols use slightly different field names for the same concepts. Here is a translation table:",
      },
      {
        type: "table",
        headers: ["Canonical name", "Sablier", "Hedgey", "UNCX", "Streamflow"],
        rows: [
          ["Total amount", "depositedAmount", "amount", "amount", "depositedAmount"],
          ["Start time", "startTime", "start", "startEmission*", "start"],
          ["End time", "endTime", "end", "endEmission", "end"],
          ["Cliff time", "cliffTime", "cliff", "(via emission delay)", "cliff"],
          ["Withdrawn", "withdrawnAmount", "amountClaimed", "amountWithdrawn", "withdrawnAmount"],
        ],
      },
      {
        type: "p",
        html: "* UNCX models cliff differently – see <a href=\"/resources/uncx-token-lockers-and-vesting\">our UNCX guide</a> for the specifics. The end result is the same: zero claimable until the cliff, then the catch-up amount unlocks.",
      },

      { type: "h2", text: "How to Verify a Schedule On-Chain" },
      {
        type: "p",
        html: "Don't trust a schedule from a project deck or PDF. Verify it on-chain. The general procedure is:",
      },
      {
        type: "ol",
        items: [
          "Get the vesting contract address (from the project's docs, audit report, or block explorer).",
          "Open the contract on the relevant block explorer (Etherscan, BscScan, Solscan, etc.).",
          "Use the 'Read Contract' interface to query your specific vest by ID or recipient address.",
          "Confirm the total amount, start, end, and cliff match what you were told.",
          "Confirm the contract's actual token balance is sufficient to cover the schedule.",
        ],
      },
      {
        type: "callout",
        emoji: "🔬",
        title: "Or just use Vestream",
        body:  "Vestream queries every supported protocol on every supported chain and surfaces the canonical five fields on a single card per stream. No block explorer detective work required.",
      },

      { type: "h2", text: "Common Sources of Confusion" },
      {
        type: "ul",
        items: [
          "<strong>TGE unlock vs cliff:</strong> a TGE unlock releases tokens immediately at token launch. A cliff prevents any unlocks until a later date. Many schedules combine both: 'X% at TGE, then Y-month cliff before the rest starts vesting.'",
          "<strong>Cliff date vs cliff length:</strong> cliff length is the duration; cliff date is the timestamp at which the cliff unlocks. Confirm which one a doc is referring to.",
          "<strong>Linear release rate units:</strong> some protocols quote 'tokens per second', others 'tokens per month', others as a fraction. Always reconcile against total amount and duration.",
          "<strong>Time zones:</strong> vesting timestamps are unix seconds (UTC). Make sure any calendar dates you compute account for the time zone.",
        ],
      },

      { type: "h2", text: "Tracking Schedules on Vestream" },
      {
        type: "callout",
        emoji: "📡",
        title: "Read every schedule the same way",
        body:  "Whatever protocol holds your tokens, <a href=\"/login\">Vestream</a> presents the same five canonical fields plus claimable now, next unlock, and full schedule chart. Sign in to view your positions.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Why does my claimable balance never seem to update on the protocol's own page?", a: "Most UIs cache for performance. The on-chain truth always updates per block – try refreshing or query the contract directly. Vestream re-fetches per-stream when you open the card." },
          { q: "What does 'fully vested' mean?", a: "All tokens have unlocked – i.e. the current time is past the end timestamp. Fully vested doesn't mean fully claimed; you may still need to call the withdraw function to move them to your wallet." },
          { q: "What if my schedule was changed after the fact?", a: "On most protocols this is impossible – the schedule is immutable once created. If a project claims to have changed your schedule, ask them to point at the new on-chain position. There should be a fresh contract or a fresh sub-position." },
          { q: "Do I need to claim before vesting ends?", a: "No. Once vested, tokens remain claimable indefinitely. You can wait until the schedule completes and withdraw the full amount in one transaction if gas costs matter to you." },
        ],
      },
    ],
  },

  // ── Article 24 ───────────────────────────────────────────────────────────────
  {
    slug:        "token-vesting-tax-guide",
    title:       "How to File Taxes on Token Vesting Income (And the One Spreadsheet That Saves You Hours)",
    excerpt:     "Vesting income is taxable – but the rules vary by country. Here's how the major jurisdictions treat it, what tax software needs from you, and how to stop reconciling claim history by hand.",
    publishedAt: "2026-04-28",
    updatedAt:   "2026-04-28",
    readingTime: "12 min read",
    category:    "Taxes",
    tags:        ["taxes", "vesting income", "Koinly", "CoinTracker", "TurboTax", "year-end", "cost basis", "HMRC", "IRS"],
    content: [
      {
        type: "p",
        html: "If you've received tokens through vesting – as a founder, an early investor, an employee, an advisor, or via an airdrop with vesting attached – you have a tax problem most people misunderstand. <strong>Each tranche of vesting tokens is its own tax event.</strong> Not TGE. Not when you eventually sell. Each individual unlock or claim – depending on your jurisdiction – is a separate income-tax moment, valued in your local currency at that exact moment.",
      },
      {
        type: "p",
        html: "This guide explains how the tax actually works across major jurisdictions (and where they meaningfully differ), what software like Koinly, CoinTracker, and TurboTax need from you, and how Vestream collapses what is normally a 6-hour January spreadsheet into a 60-second download.",
      },

      {
        type: "callout",
        emoji: "⚠️",
        title: "This is general information, not tax advice",
        body:  "Tax rules for vesting tokens vary materially by country and continue to evolve. Use this guide to understand what data you need; verify the specific tax basis (claim-date vs unlock-date) and rates with a local accountant before filing.",
      },

      { type: "h2", text: "The Core Rule (And the Big Caveat)" },
      {
        type: "p",
        html: "The general two-step pattern across most major tax authorities looks like this:",
      },
      {
        type: "ol",
        items: [
          "<strong>At the taxable receipt event:</strong> the value of the tokens counts as ordinary income, taxed at your marginal rate. Value = (number of tokens) × (token's market price in your fiat currency at that moment).",
          "<strong>At each later sale:</strong> the difference between your sale price and the price at the receipt event counts as capital gain or loss. The <em>cost basis</em> for the capital-gains calculation is the same value you reported as income.",
        ],
      },
      {
        type: "p",
        html: "<strong>The big caveat is what counts as the 'receipt event'.</strong> This is where jurisdictions diverge:",
      },
      {
        type: "table",
        headers: ["Jurisdiction", "Receipt event", "Practical consequence"],
        rows: [
          ["United States (IRS)",  "When you claim – i.e. tokens move from the vesting contract into your wallet",          "If tokens are unlocked but you haven't claimed, no tax event yet (subject to constructive-receipt arguments)"],
          ["United Kingdom (HMRC)","When tokens are beneficially owned – typically the unlock date, even if unclaimed",   "You can owe tax on tokens you haven't physically received in your wallet yet (similar to RSU treatment)"],
          ["Australia (ATO)",      "Generally when you have legal ownership and control – often the unlock date",          "Similar to UK – unlocked-but-unclaimed tokens may be taxable"],
          ["Canada (CRA)",         "When tokens are received, with employment-context cases nuanced",                       "Closer to US treatment for most cases; talk to an accountant if employment-related"],
          ["Germany",              "When tokens are received; tax-free after 1-year hold",                                  "Closer to US treatment; the holding-period clock starts at receipt"],
        ],
      },
      {
        type: "callout",
        emoji: "🧾",
        title: "Two transactions, two tax events",
        body:  "When you claim 10,000 tokens at $5 each: $50,000 of income (taxed in the year of receipt under your local rules). When you sell them later at $8: $30,000 of capital gain. The $5 cost basis comes from the receipt event – get it wrong, and your eventual capital-gains calculation is wrong too.",
      },
      {
        type: "p",
        html: "This means the <strong>value-at-receipt</strong> is the most consequential single number in your year-end vesting tax position. Get it right and everything else flows. Get it wrong – by using TGE price, year-end price, or \"I'll figure it out later\" – and you risk under- or over-paying both income tax now AND capital-gains tax later.",
      },

      { type: "h2", text: "Vestream's Data Model: We Capture Claim Events" },
      {
        type: "p",
        html: "Important to understand what Vestream tracks: <strong>we index every on-chain claim transaction</strong> – the moment tokens leave the vesting contract and arrive in your wallet. For US filers, that's exactly the right tax event. For UK / Australia filers whose receipt event is the unlock date (not the claim), our claim-date data is still useful – but you'll need to map it forward to the unlock dates yourself or with your accountant.",
      },
      {
        type: "ul",
        items: [
          "<strong>If you're in the US, Canada, Germany, most EU:</strong> Vestream's claim-date data IS the tax event. Use the CSV exports as-is.",
          "<strong>If you're in the UK or Australia:</strong> Vestream's claim-date data tells your accountant <em>when you actually received the tokens</em>. Your unlock schedule (also visible per-stream on the dashboard) tells them when those tokens became beneficially owned. They reconcile both for the right tax basis.",
          "<strong>Either way:</strong> the on-chain claim record is the canonical source of truth for what landed in your wallet, when, and at what price. That's the foundation every tax basis builds on.",
        ],
      },
      {
        type: "callout",
        emoji: "🛣️",
        title: "On the roadmap",
        body:  "We're scoping unlock-date tax-basis exports for HMRC / ATO users – surfacing both the unlock schedule AND the claim history side-by-side, so the right basis is one click away regardless of jurisdiction. If this matters to you, ping us via the contact form so we know to prioritise it.",
      },

      { type: "h2", text: "What Counts as a 'Claim Event'?" },
      {
        type: "p",
        html: "A claim is any on-chain transaction that moves tokens from a vesting contract to your wallet. Different protocols call it different things:",
      },
      {
        type: "table",
        headers: ["Protocol",       "On-chain event name",          "Notes"],
        rows: [
          ["Sablier",                "Withdraw / withdrawMax",        "Continuous streaming – claim any time after start"],
          ["Hedgey",                 "PlanRedeemed",                  "Per-plan redemption against an NFT"],
          ["UNCX (V3 + VM)",         "WithdrawEvent / TokensReleased","Each unlock is a discrete event"],
          ["Unvest",                 "Claim",                         "Per-milestone or pro-rata draws"],
          ["Superfluid",             "VestingCliffAndFlowExecuted",   "Cliff payouts are discrete; continuous flow accrues every second"],
          ["PinkSale",               "LockUnlocked",                  "Cycle-based unlocks"],
          ["Streamflow / Jupiter Lock","Withdraw instruction",        "Solana – recorded against the program account"],
        ],
      },
      {
        type: "p",
        html: "The on-chain claim transaction is what Vestream indexes. <strong>Whether the claim is also the tax event depends on your jurisdiction</strong> (see the table further up). For US/Canada/Germany filers, the claim is the tax event. For UK/Australia filers, the unlock date can be earlier – your accountant maps Vestream's claim records back against the unlock schedule to assign income to the right tax year.",
      },

      { type: "h2", text: "The Five Pieces of Information You Need Per Claim" },
      {
        type: "p",
        html: "For any tax-software import or accountant handover, every claim event needs to carry these five fields:",
      },
      {
        type: "ol",
        items: [
          "<strong>Date and time</strong> (UTC, to the second – block timestamp).",
          "<strong>Token symbol and contract address</strong> (so software can match cost basis on later sales).",
          "<strong>Quantity claimed</strong>, in whole token units (not raw on-chain wei).",
          "<strong>USD value at claim</strong>, computed from the historical price on that exact date.",
          "<strong>Transaction hash</strong> (proof, and the unique key that prevents double-counting).",
        ],
      },
      {
        type: "callout",
        emoji: "📋",
        title: "Why all five matter",
        body:  "Tax software groups by token symbol + chain to track cost basis lots over time. If you skip the contract address, two tokens with the same symbol on different chains get merged. If you skip the tx hash, re-imports double-count. If you skip the historical price, the software guesses – usually wrong.",
      },

      { type: "h2", text: "How to Compute Historical Prices (And Why You Probably Shouldn't)" },
      {
        type: "p",
        html: "The historical-price lookup is where most people lose hours of tax-prep time. CoinGecko and CoinMarketCap both offer a free API that returns historical daily price data; Etherscan and BscScan offer historical price for the chain's native token but not arbitrary ERC-20s.",
      },
      {
        type: "p",
        html: "If you wanted to build the lookup yourself, the procedure is roughly:",
      },
      {
        type: "ol",
        items: [
          "For each claim event, take the block timestamp and convert to a UTC date.",
          "Hit CoinGecko's <code>/coins/{id}/history?date=DD-MM-YYYY</code> with the token's CoinGecko ID for that date.",
          "Read <code>market_data.current_price.usd</code>.",
          "Multiply by the token quantity to get USD-at-claim.",
          "Cache the result so you don't re-query for the same (token, date) twice.",
          "Handle missing prices (illiquid tokens, pre-listing dates) with a manual cost basis or by accepting nearest-day.",
        ],
      },
      {
        type: "p",
        html: "It's about 200 lines of code per dimension – token resolution, rate-limit-aware fetching, caching, fallback ladder. Vestream does this once, server-side, with a 7-day fallback window and price-confidence flags so you know which numbers are exact-day vs nearest-day vs missing.",
      },

      { type: "h2", text: "What Koinly, CoinTracker, and TurboTax Each Want" },
      {
        type: "p",
        html: "Each tax-software platform accepts a slightly different CSV shape. Vestream generates all three formats from the same underlying claim_events table:",
      },
      {
        type: "table",
        headers: ["Platform",   "Import path",                            "Required columns"],
        rows: [
          ["Koinly",             "Settings → Wallets → Add → Custom CSV", "Date, Sent Amount + Currency, Received Amount + Currency, Label, TxHash, Description"],
          ["CoinTracker",        "Add Wallet → Generic CSV upload",       "Date, Received Quantity + Currency, Sent Quantity + Currency, Fee, Tag, Tx Hash"],
          ["TurboTax",           "Investments → Crypto → Upload CSV",     "Symbol, Quantity, Date Acquired, Date Sold, Cost Basis, Proceeds (vesting income goes in via 'other income' – Vestream's TurboTax format flags each row appropriately)"],
        ],
      },
      {
        type: "p",
        html: "All three CSVs need the same five fields per claim – date, token, quantity, USD value, tx hash – they just label and order them differently. Vestream's Exports tab generates each format exactly to spec.",
      },

      { type: "h2", text: "The 60-Second Workflow on Vestream" },
      {
        type: "ol",
        items: [
          "Sign in at <a href=\"/login\">vestream.io</a> and add the wallets that received your vesting tokens.",
          "Open the <a href=\"/dashboard/exports\">Exports tab</a> and hit Refresh claims. Vestream queries every supported protocol on every supported chain, indexes every withdrawal event since the wallet's first transaction, and computes USD-value-at-claim for each one.",
          "Pick a tax year from the dropdown (e.g. 2025).",
          "Click the format your accountant uses (Vestream generic / Koinly / CoinTracker / TurboTax). The CSV downloads instantly.",
          "Optional: open the <a href=\"/dashboard/income-statement\">Income Statement</a> for a P&amp;L-style summary, then click Year-end PDF to generate a printable report you can email to your accountant directly.",
        ],
      },
      {
        type: "callout",
        emoji: "⚡",
        title: "What the workflow replaces",
        body:  "Without Vestream, the equivalent is: open every protocol's UI, scroll back through your claim history, copy each claim into a spreadsheet, look up the historical USD price for each row by hand, paste into the right tax-software CSV format, hope you didn't miss any. We've timed it – about 6 hours for a 50-claim year, with material risk of getting the historical prices wrong.",
      },

      { type: "h2", text: "Edge Cases Worth Knowing" },
      {
        type: "ul",
        items: [
          "<strong>Continuous streams (Sablier, Superfluid):</strong> when you call <code>withdraw</code>, you receive everything that has accrued since the last withdrawal. That single transaction is one tax event – you don't pro-rate it across the days the tokens were accruing. The block timestamp of the withdraw is the canonical receipt date.",
          "<strong>Cliff unlocks:</strong> if a 6-month cliff unlocks 25% on day 180, the tax event timing depends on jurisdiction. In the US, the tax event happens when you <em>claim</em> those tokens, valued at the claim-date price. In the UK / Australia, the tax event can be the unlock date itself (day 180) regardless of when you claim. The price you use therefore differs: claim-date price for US, unlock-date price for UK/AU. Vestream surfaces the claim record; your accountant applies the right rule.",
          "<strong>Cancelled vests:</strong> if a stream is cancelled by the sender (cancellable vests), tokens already claimed are still income for the year they were claimed – the cancellation doesn't reverse it.",
          "<strong>Re-vesting / topped-up vests:</strong> some protocols allow the sender to add tokens to an existing vest. New tokens have their own clock; new claims against them are new tax events, valued at the new claim date.",
          "<strong>Non-EVM chains (Solana):</strong> Streamflow and Jupiter Lock store cumulative claimed amounts on-chain rather than per-event logs. Vestream uses a snapshot-diff model – the first refresh after you sign up captures pre-existing history as one baseline event; subsequent refreshes track new claims individually.",
        ],
      },

      { type: "h2", text: "Timing, Forms, and When Returns Are Due" },
      {
        type: "p",
        html: "Some quick reference on key jurisdictions (verify with a local accountant):",
      },
      {
        type: "table",
        headers: ["Jurisdiction", "Treatment of vesting income",     "Filing deadline",       "Reporting form"],
        rows: [
          ["United States",    "Ordinary income at marginal rate",  "April 15 (year +1)",     "Schedule 1 / Schedule D for sales"],
          ["United Kingdom",   "Income tax + NICs at receipt",      "January 31 (year +1)",   "SA100 / SA108"],
          ["Canada",           "Ordinary income at receipt",        "April 30 (year +1)",     "T1 General"],
          ["Australia",        "Ordinary income at receipt",        "October 31 (year +1)",   "Tax return (TR) / Crypto schedule"],
          ["Germany",          "Other income at receipt; CGT-free after 1y hold",  "July 31 (year +1)", "Anlage SO"],
        ],
      },
      {
        type: "p",
        html: "Vestream does not provide tax advice. Use the data we surface to populate forms with your accountant. The CSV exports map cleanly to the import flows of Koinly, CoinTracker, and TurboTax – which themselves map to the right line items on the relevant local return.",
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Are vested-but-unclaimed tokens taxable?",
            a: "Depends on your country. In the US (and most of the EU + Canada + Germany), the answer is no – taxation triggers on the claim transaction, when tokens move into your wallet. In the UK (HMRC) and Australia (ATO), tokens that have unlocked but not yet been claimed CAN already be taxable – the test is beneficial ownership, not physical receipt. If you're a UK/AU filer with unlocked-but-unclaimed tokens at year-end, talk to a local accountant before assuming there's no liability."
          },
          { q: "What if the token had no liquid market on the claim date?",
            a: "You'll need a manual cost basis. Vestream flags these as 'missing' price confidence. Common practice is to use the most recent OTC sale price, the project's most recent funding-round valuation, or zero – talk to your accountant before settling on a method."
          },
          { q: "Can I just enter total annual income at year-end and skip the per-claim detail?",
            a: "Tax software needs per-event detail to track cost basis lots for capital-gains calculations on later sales. Lumping everything into one annual receipt loses the per-token cost-basis lots you'll need when you eventually sell. Per-claim is the right granularity."
          },
          { q: "Does Vestream submit my taxes for me?",
            a: "No. Vestream produces the data your accountant or tax software needs. The actual filing is done in Koinly / CoinTracker / TurboTax / your accountant's tool of choice – Vestream's CSV imports cleanly into all of them."
          },
          { q: "What if I claimed across multiple wallets in the same year?",
            a: "Add every receiving wallet to your Vestream dashboard. The Exports tab aggregates across all your tracked wallets, so the year-end report covers your entire vesting income regardless of which wallet received which claim."
          },
          { q: "Is the price I receive at claim the same as the cost basis for capital-gains later?",
            a: "Yes – that's the whole point of the income-at-receipt rule. The USD value you report as income at the claim becomes your cost basis for that lot. When you sell, your gain/loss is (sale price − cost basis) per token."
          },
          { q: "What about staking / yield rewards on vested tokens?",
            a: "Treated separately. If you stake tokens you've already received, the staking rewards are their own income events with their own dates and cost bases. Vestream tracks vesting receipts; staking rewards need a separate tool or accountant entry."
          },
        ],
      },

      { type: "h2", text: "Get the Spreadsheet" },
      {
        type: "callout",
        emoji: "📊",
        title: "Skip the 6-hour January reconciliation",
        body:  "Sign in to <a href=\"/login\">Vestream</a>, add your vesting wallets, and click Refresh in the Tax Reports tab. Every claim across all 10 supported protocols, valued in USD at receipt, ready for Koinly / CoinTracker / TurboTax – in about 60 seconds.",
      },
    ],
  },

  // ── Article 22 – Worker-pivot SEO surface ────────────────────────────────────
  // Targets the "I get paid in crypto" search audience (DAO contributors,
  // remote contractors, grant recipients). Distinct enough from the
  // existing investor-flavoured tax guide that both can rank without
  // cannibalising each other.
  {
    slug:        "crypto-payroll-and-contributor-income-guide",
    title:       "Crypto Payroll & Contributor Income: A Practical 2026 Guide",
    excerpt:     "Getting paid in tokens is now mainstream – DAO contributors, crypto-native contractors, and grant recipients all need to track receipts, runway, and tax. Here is how it works, what your tax authority expects, and how to never miss a payslip.",
    publishedAt: "2026-05-03",
    updatedAt:   "2026-05-03",
    readingTime: "10 min read",
    category:    "Guides",
    tags:        ["crypto payroll", "stablecoin salary", "DAO contributor pay", "1099-NEC", "SA103", "ordinary income", "crypto streaming", "LlamaPay", "Sablier Flow"],
    content: [
      {
        type: "p",
        html: "If you are paid in tokens – by a DAO, a remote-first crypto company, a grant programme, or as a contractor billing in stablecoins – you are already part of the fastest-growing slice of crypto's recipient-side economy. <strong>This is not investor vesting</strong>. It is payroll, and it is taxed completely differently.",
      },
      {
        type: "p",
        html: "This guide is for the worker side: the contributor showing up Monday morning to ship code in exchange for USDC, the marketing lead taking 60% of comp in a project's native token, the freelance designer billing five DAOs at once. We cover the rails (LlamaPay, Sablier Flow, Superfluid), the tax framework (US 1099-NEC, UK SA103, broad guidance for other jurisdictions), and the operational practices that turn token income from chaotic to clean.",
      },
      {
        type: "callout",
        emoji: "📌",
        title: "The big distinction",
        body:  "Investor vesting tokens are <em>capital assets</em> that vest into your control. Worker payment tokens are <em>ordinary income</em> at the moment they hit your wallet. That single distinction changes the tax rate, the form you file on, and the cost basis math.",
      },

      { type: "h2", text: "How Crypto Payroll Actually Works" },
      {
        type: "p",
        html: "Three patterns dominate the recipient side of token payroll right now. Each has a different feel; understanding which one your payer uses helps you reason about cashflow.",
      },
      { type: "h3", text: "Pattern 1 – Continuous per-second streaming" },
      {
        type: "p",
        html: "<strong>LlamaPay</strong> and <strong>Sablier Flow</strong> are the dominant rails. Your employer creates a stream from their treasury to your wallet at a set rate – say <code>$5,000/month / 30 / 24 / 60 / 60 ≈ $0.00193 per second</code>. The contract literally accrues your balance one second at a time. You can withdraw any time; whatever you do not withdraw stays earning in the contract.",
      },
      {
        type: "p",
        html: "This is how crypto-native companies pay because it cancels two things working in real-world payroll: (a) the awkward two-week lag between work done and money received, and (b) the operational overhead of running a payroll cycle. The treasury just deposits a quarter's runway and the math handles itself.",
      },
      { type: "h3", text: "Pattern 2 – Cliff + linear vesting" },
      {
        type: "p",
        html: "Common for team token grants and longer-tenure contributor agreements. <strong>Sablier Lockup</strong> and <strong>Hedgey</strong> are the typical rails. You receive a non-transferable claim against a pool of tokens that unlocks linearly (often after a 6-12 month cliff) over 2-4 years. Each unlock is taxable income at FMV-on-receipt.",
      },
      {
        type: "p",
        html: "If you have BOTH a streaming salary AND a longer vesting grant from the same employer, you have two simultaneous tax events on different cadences. The streaming side is usually higher-frequency-lower-volume; the vesting side is lower-frequency-higher-volume. They go on the same return but you'll want to track them separately.",
      },
      { type: "h3", text: "Pattern 3 – Milestone or one-shot grants" },
      {
        type: "p",
        html: "Grant programmes (Optimism RetroPGF, Arbitrum STIP, Gitcoin rounds) and bounty platforms drop tokens to recipients on milestone completion. No vesting, no stream – just a transfer. Tax treatment is identical to streaming: ordinary income at FMV on the date of receipt.",
      },

      { type: "h2", text: "What Your Tax Authority Expects" },
      {
        type: "p",
        html: "Three jurisdictions cover the bulk of crypto-native workers. The framework in each is similar enough that one operational practice (track FMV at receipt, sum totals annually, file in the ordinary-income section) covers everyone.",
      },
      { type: "h3", text: "United States" },
      {
        type: "p",
        html: "If you are a contractor (1099-NEC), you owe tax on <strong>gross income at FMV-on-receipt</strong> – no deduction for the fact you held the token instead of selling immediately. Goes on Schedule C (self-employment) or as Other Income on Schedule 1, depending on whether crypto-paid contracting is a trade-or-business for you.",
      },
      {
        type: "p",
        html: "Each receipt also establishes a <strong>cost basis</strong> equal to the FMV used as income. When you later sell or convert that token, your capital gain or loss is calculated against that basis. Lose track of basis and you double-pay tax – once at receipt, again on the entire sale price as if it were pure profit.",
      },
      { type: "h3", text: "United Kingdom" },
      {
        type: "p",
        html: "HMRC treats crypto received for services as miscellaneous income or self-employment turnover, depending on whether the work is a trade. Most regular contributors fall under self-employment and report on <strong>SA103S box 9</strong> (turnover) or <strong>SA103F box 15</strong> (full self-employment).",
      },
      {
        type: "p",
        html: "Convert each receipt to GBP using HMRC's published exchange rates – they publish monthly averages and yearly averages on gov.uk. The choice of rate (transaction-time vs year-end average) is a documentable methodology; pick one and apply it consistently across the year.",
      },
      { type: "h3", text: "Other jurisdictions" },
      {
        type: "p",
        html: "Most OECD jurisdictions follow the same pattern: ordinary income at FMV-on-receipt, in your local fiat. Notable exceptions: Germany has a one-year holding rule that can convert later sales into tax-free disposals (income side is still taxable normally). Portugal historically had favourable treatment but updated its laws in 2023 to bring crypto-paid income into the standard income brackets. Always check local guidance.",
      },

      { type: "h2", text: "The Operational Practice That Saves You at Year-End" },
      {
        type: "p",
        html: "Workers paid in tokens often arrive at March or April having done none of the bookkeeping. The result is a frantic week of trying to reconstruct receipts from on-chain history while the tax deadline closes. Three habits make this almost-trivial instead.",
      },
      {
        type: "ol",
        items: [
          "<strong>Track every payer.</strong> Add the streaming contract addresses (or grant programme contract addresses) to Vestream so every receipt lands in your dashboard automatically. No re-keying at year-end.",
          "<strong>Capture FMV at the moment of each receipt.</strong> Tax software needs per-receipt USD value, not a single annual total. Vestream pre-prices every claim using DexScreener / CoinGecko, with a confidence flag so you know which figures need a manual sanity check.",
          "<strong>Run the year-end CSV the day after Dec 31.</strong> Drop it into Koinly / CoinTracker / your accountant's tool. The income totals slot into 1099-NEC summary boxes (US) or SA103 (UK) directly.",
        ],
      },

      { type: "h2", text: "Streaming Salary Specifics" },
      {
        type: "p",
        html: "Streams have one operational quirk that vesting grants don't: <strong>you can leave money in the contract</strong>. The temptation is to claim infrequently to save gas; the catch is that some jurisdictions (UK / Australia) test taxation on <em>unlocked</em> rather than <em>received</em>. Continuously-streaming income is, technically, continuously unlocked.",
      },
      {
        type: "p",
        html: "Operationally, claim quarterly. Gas costs are a rounding error compared to the bookkeeping clarity of having physical receipts every 3 months. If you absolutely never claim until year-end, talk to your accountant about whether your jurisdiction wants you to recognise unrealised stream balance as income during the year – most don't, but the answer is jurisdiction-specific.",
      },

      { type: "h2", text: "Where Vesting and Streaming Coexist" },
      {
        type: "p",
        html: "Many contributors have both – a streaming salary AND a longer-term token grant. Both are income, both go on the same return, but the receipts behave differently in tax software:",
      },
      {
        type: "table",
        headers: ["", "Streaming salary", "Cliff/linear vesting"],
        rows: [
          ["Tax category",         "Ordinary income",   "Ordinary income"],
          ["Frequency",             "Per claim (often quarterly in practice)", "Per unlock event (monthly / quarterly / annually)"],
          ["FMV basis",             "Date of withdrawal",                       "Date of unlock (tx hash)"],
          ["Cost basis carry-over", "Yes – at the FMV used as income",          "Yes – at the FMV used as income"],
          ["US form",               "Schedule C / 1099-NEC summary",            "Schedule C / 1099-NEC summary (or Schedule 1 Other Income)"],
          ["UK form",               "SA103 turnover (box 9 / 15)",              "SA103 turnover (box 9 / 15)"],
        ],
      },

      { type: "h2", text: "FAQ" },
      {
        type: "faq",
        items: [
          { q: "Is my crypto salary capital gains or ordinary income?",
            a: "Ordinary income, almost everywhere. Capital gains apply to ASSETS YOU OWN that change in value – but tokens you receive as compensation aren't yours until you receive them, so the receipt itself is the income event. Later sales of those received tokens DO trigger capital gains, calculated against the cost basis you established at receipt."
          },
          { q: "Do I owe tax on a stream balance I haven't withdrawn?",
            a: "Jurisdiction-specific. US, Canada, Germany, most of the EU: no – taxation is on withdrawal. UK and Australia: maybe – both use a beneficial-ownership test that can apply to streamed-but-unwithdrawn balance. When in doubt, withdraw at least quarterly and ask a local accountant before year-end."
          },
          { q: "What if my employer pays me in their illiquid token instead of stablecoin?",
            a: "You owe tax at FMV on the receipt date – same rule. The challenge is establishing FMV when there's no market. Common practice: use the most recent OTC sale, the most recent funding-round valuation, or zero. Whatever you choose, document it as your methodology and apply it consistently."
          },
          { q: "Can I deduct gas fees from my streaming salary?",
            a: "If you're filing as self-employed (Schedule C / SA103F), gas paid to claim is a business expense – deductible. If you're treating crypto income as miscellaneous Other Income (Schedule 1) the answer is murkier; talk to your accountant. Vestream's exports include gas USD value per claim so the totals are easy to grab."
          },
          { q: "How does this compare to an investor vesting allocation?",
            a: "Same tax category (ordinary income) but the relationship to capital-gains is different. Worker income at receipt establishes a cost basis; investors who SAFT-purchased tokens have a cost basis from purchase, not from unlock – the unlock just removes the time-lock. Vestream branches the income statement by audience so the framing matches: 'Vesting income' for investors, 'Crypto income' for workers, 'Token income' for those who are both."
          },
          { q: "Does Vestream handle workers paid in tokens?",
            a: "Yes – that's the worker side of the product. Add the streaming or grant contract address to your dashboard, set notifications, run the year-end Payroll Income CSV. The whole flow is symmetrical with the investor side; the difference is the tax export shape and the framing copy."
          },
        ],
      },

      { type: "h2", text: "Track Your Token Payslip" },
      {
        type: "callout",
        emoji: "💸",
        title: "Set up the dashboard once, never lose track of a receipt",
        body:  "Sign in to <a href=\"/login\">Vestream</a>, add your wallet, and select the streaming contracts paying you. Every accrual hits your dashboard with FMV-on-receipt automatically; year-end CSV maps directly to 1099-NEC / SA103 / your local form.",
      },
    ],
  },

  // ── How-to: track Sablier unlocks ────────────────────────────────────────────
  {
    slug:        "how-to-track-sablier-unlocks",
    title:       "How to Track Your Sablier Stream Unlocks (2026)",
    excerpt:     "A step-by-step guide to finding your Sablier vesting streams, reading their unlock schedule, and getting alerted before every tranche unlocks — manual methods vs automated tracking, compared.",
    publishedAt: "2026-07-04",
    updatedAt:   "2026-07-04",
    readingTime: "7 min read",
    category:    "Guides",
    tags:        ["sablier", "token unlock", "vesting tracker", "how to track vesting", "unlock alerts"],
    content: [
      {
        type: "p",
        html: "If you received tokens through <strong>Sablier</strong> — the most widely used on-chain token streaming protocol — your allocation is released continuously or in tranches according to a schedule enforced by a smart contract. The hard part isn't the vesting; it's <em>keeping track of it</em>: knowing exactly how much has unlocked, what's claimable right now, and when the next unlock lands so you don't miss it. This guide covers every way to do that, from manual lookups to automated alerts.",
      },
      { type: "h2", text: "How Sablier vesting works (in one paragraph)" },
      {
        type: "p",
        html: "Sablier's Lockup contracts stream tokens from a sender to a recipient over time. A <strong>linear</strong> stream releases a constant amount every second; a <strong>tranched</strong> stream unlocks in discrete steps (e.g. monthly), often after an initial <a href=\"/resources/vesting-cliff-explained\">cliff</a>. Vested tokens are claimable by the recipient at any time via <code>withdraw</code>; unvested tokens stay locked. Because it's fully on-chain, anyone can read the exact schedule — the challenge is surfacing it in a readable way and being reminded before each unlock.",
      },
      { type: "h2", text: "Method 1: The Sablier app (manual)" },
      {
        type: "ol",
        items: [
          "Go to <a href=\"https://app.sablier.com\" rel=\"nofollow\">app.sablier.com</a> and search the recipient wallet address (or connect the wallet).",
          "Open each stream to see its start, end, cliff, amount, and how much is currently withdrawable.",
          "Claim withdrawable tokens with the <code>withdraw</code> action when you want them.",
        ],
      },
      {
        type: "p",
        html: "This works, but it has real limits: it only shows <strong>Sablier</strong> streams (not any other protocol you're vesting on), there are <strong>no alerts</strong> — you have to remember to check — and if your tokens are split across multiple wallets or chains you'll be flipping between views. It's fine for a single stream you check often; it doesn't scale to a real portfolio.",
      },
      { type: "h2", text: "Method 2: Block explorer (advanced, tedious)" },
      {
        type: "p",
        html: "You can read the Sablier Lockup contract directly on Etherscan (or the relevant chain's explorer) and call the view functions for your stream ID. This gives you ground truth but requires knowing your stream ID, the contract address for your chain, and how to interpret raw amounts and timestamps. Almost nobody does this for ongoing tracking — it's a spot-check tool, not a monitoring one.",
      },
      { type: "h2", text: "Method 3: Automated tracking with alerts (recommended)" },
      {
        type: "p",
        html: "The fastest way to stay on top of Sablier unlocks is to let a tracker watch the wallet for you. With <a href=\"/find-vestings\">Vestream</a> you paste the recipient address — no wallet connection, no signing, read-only — and it finds every Sablier stream on that wallet across Ethereum, Base, BNB Chain, Polygon, Arbitrum, and Optimism, shows the full unlock calendar, and sends an <strong>email or push alert before each unlock</strong>. It also picks up vesting from 10 other protocols on the same wallet, so a treasury or team member sees everything in one place.",
      },
      {
        type: "table",
        headers: ["", "Sablier app", "Block explorer", "Vestream"],
        rows: [
          ["Shows your Sablier streams", "Yes", "Yes (manual)", "Yes"],
          ["Other protocols on the same wallet", "No", "No", "Yes (11 protocols)"],
          ["Multi-wallet / multi-chain in one view", "No", "No", "Yes"],
          ["Alerts before an unlock", "No", "No", "Email + push"],
          ["Wallet connection required", "To claim", "No", "No — read-only"],
          ["Tax-ready CSV export", "No", "No", "Yes (Pro)"],
        ],
      },
      {
        type: "callout",
        emoji: "⏱️",
        title: "The 30-second setup",
        body:  "Paste your wallet at Vestream's free scanner, turn on alerts, and you'll never manually check a Sablier stream again — you'll get a heads-up before every unlock instead.",
      },
      {
        type: "faq",
        items: [
          { q: "How do I see when my Sablier tokens unlock?", a: "Either open your stream on app.sablier.com to read its schedule, or paste your wallet address into a tracker like Vestream to see the full unlock calendar and get alerted before each tranche unlocks." },
          { q: "Can I get notified before a Sablier unlock?", a: "The Sablier app itself does not send unlock reminders. A tracker such as Vestream sends email and push notifications before each Sablier unlock at a lead time you choose." },
          { q: "Do I need to connect my wallet to track Sablier vesting?", a: "No. Sablier vesting data is public and on-chain. Vestream tracks it read-only from just the wallet address — no wallet connection or signing. You only connect a wallet when you want to claim on Sablier itself." },
          { q: "Does tracking work across chains?", a: "Yes. Sablier is deployed on Ethereum, Base, BNB Chain, Polygon, Arbitrum, and Optimism, and Vestream scans a wallet across all of them at once." },
        ],
      },
      {
        type: "p",
        html: "Want the deeper mechanics? See <a href=\"/resources/sablier-token-streaming-vesting-explained\">Sablier token streaming explained</a>, or compare protocols in <a href=\"/resources/sablier-vs-hedgey-vs-uncx-comparison\">Sablier vs Hedgey vs UNCX</a>.",
      },
    ],
  },

  // ── How-to: track Hedgey unlocks ─────────────────────────────────────────────
  {
    slug:        "how-to-track-hedgey-unlocks",
    title:       "How to Track Your Hedgey Vesting Plan Unlocks (2026)",
    excerpt:     "Hedgey issues vesting as NFTs, which makes unlock schedules easy to hold but easy to lose track of. Here's how to find your Hedgey plans, read their unlock dates, and get alerted before each one.",
    publishedAt: "2026-07-04",
    updatedAt:   "2026-07-04",
    readingTime: "6 min read",
    category:    "Guides",
    tags:        ["hedgey", "token unlock", "vesting tracker", "how to track vesting", "nft vesting"],
    content: [
      {
        type: "p",
        html: "<strong>Hedgey</strong> is one of the largest token vesting platforms in crypto, and it does vesting differently: each vesting or lockup plan is represented as an <strong>ERC-721 NFT</strong> held by the recipient. That design is elegant — your claim is a transferable token — but it also means your unlock schedule lives inside an NFT you might rarely look at. This guide shows how to find your Hedgey plans and never miss an unlock.",
      },
      { type: "h2", text: "How Hedgey vesting works" },
      {
        type: "p",
        html: "When a project grants you tokens through Hedgey, it mints you a vesting-plan NFT. The NFT encodes the schedule — start, cliff, rate, and end — and gates how much of the underlying token you can <code>redeem</code> at any point. As time passes, more of the plan becomes redeemable. Read more in <a href=\"/resources/hedgey-nft-vesting-plans-explained\">Hedgey NFT vesting plans explained</a>.",
      },
      { type: "h2", text: "Method 1: The Hedgey app (manual)" },
      {
        type: "ol",
        items: [
          "Go to <a href=\"https://app.hedgey.finance\" rel=\"nofollow\">app.hedgey.finance</a> and connect the wallet that holds your plan NFTs.",
          "Open each plan to see its schedule and how much is currently redeemable.",
          "Redeem unlocked tokens when you want them.",
        ],
      },
      {
        type: "p",
        html: "As with any single-protocol dapp, this shows only your Hedgey plans, gives you <strong>no reminders</strong> before an unlock, and requires connecting your wallet. If you hold plans across several wallets, or vest on other protocols too, you're stitching the picture together by hand.",
      },
      { type: "h2", text: "Method 2: Automated tracking with alerts (recommended)" },
      {
        type: "p",
        html: "To track Hedgey unlocks without babysitting the dapp, use a read-only tracker. Paste your address into <a href=\"/find-vestings\">Vestream</a> and it finds your Hedgey plans (and any other vesting on that wallet), lays out the unlock calendar, and sends an alert before each unlock. No wallet connection — it reads the public on-chain plan data from the address alone.",
      },
      {
        type: "table",
        headers: ["", "Hedgey app", "Vestream"],
        rows: [
          ["Shows your Hedgey plans", "Yes", "Yes"],
          ["Other protocols on the same wallet", "No", "Yes (11 protocols)"],
          ["Alerts before an unlock", "No", "Email + push"],
          ["Wallet connection required", "Yes (to view + redeem)", "No — read-only to view"],
          ["Multi-wallet in one view", "No", "Yes"],
        ],
      },
      {
        type: "callout",
        emoji: "🔔",
        title: "Don't rely on remembering",
        body:  "NFT-based plans are the easiest to forget about — the schedule is buried in a token you don't check. Set an alert once and Vestream reminds you before every Hedgey unlock.",
      },
      {
        type: "faq",
        items: [
          { q: "Where do I see my Hedgey vesting schedule?", a: "Connect your wallet at app.hedgey.finance to view each plan, or paste your wallet address into Vestream to see all Hedgey plans plus their unlock calendar and alerts — without connecting a wallet." },
          { q: "Can I track Hedgey unlocks without connecting my wallet?", a: "Yes. Hedgey plan data is on-chain and public. Vestream reads it from the wallet address in read-only mode, so no connection or signing is needed to track it." },
          { q: "I hold plans in more than one wallet — can I see them together?", a: "Yes. Add each address to Vestream and every Hedgey plan (and other vesting) appears in a single unified calendar." },
        ],
      },
    ],
  },

  // ── How-to: track Team Finance unlocks ───────────────────────────────────────
  {
    slug:        "how-to-track-team-finance-unlocks",
    title:       "How to Track Team Finance Token Unlocks (2026)",
    excerpt:     "Team Finance vesting is often merkle-distributed, which makes your unlock schedule genuinely hard to find. Here's how to see your Team Finance unlocks and get alerted before each one.",
    publishedAt: "2026-07-04",
    updatedAt:   "2026-07-04",
    readingTime: "6 min read",
    category:    "Guides",
    tags:        ["team finance", "token unlock", "vesting tracker", "how to track vesting", "merkle vesting"],
    content: [
      {
        type: "p",
        html: "<strong>Team Finance</strong> is a long-standing tool for locking and vesting team and treasury tokens with transparent on-chain proof — the standard many launchpad-era projects rely on. But tracking <em>your own</em> Team Finance unlocks is harder than with most protocols, for one specific reason: many Team Finance vestings are <strong>merkle-distributed</strong>. This guide explains why that matters and how to see your unlocks anyway.",
      },
      { type: "h2", text: "Why Team Finance unlocks are hard to track" },
      {
        type: "p",
        html: "In a merkle distribution, the full list of recipients and amounts is committed on-chain as a single <em>merkle root</em> — a cryptographic fingerprint — rather than as an individual on-chain record per person. Your allocation is a <em>leaf</em> in that tree. The upside is efficiency; the downside is that until you claim, there's often no obvious per-wallet on-chain entry to read, so a normal block-explorer lookup won't surface your schedule. That's why holders frequently don't know when their next Team Finance unlock is.",
      },
      { type: "h2", text: "Method 1: The Team Finance app (manual)" },
      {
        type: "ol",
        items: [
          "Go to <a href=\"https://team.finance\" rel=\"nofollow\">team.finance</a> and connect the wallet that received the vesting.",
          "Find the vesting associated with your wallet and its claim schedule.",
          "Claim unlocked tokens when they're available.",
        ],
      },
      {
        type: "p",
        html: "This is the canonical source, but it only covers Team Finance, offers <strong>no advance alerts</strong>, and requires you to remember to check a dapp that you might visit only a few times a year — exactly the pattern that leads to missed unlocks.",
      },
      { type: "h2", text: "Method 2: Automated tracking with alerts (recommended)" },
      {
        type: "p",
        html: "<a href=\"/find-vestings\">Vestream</a> indexes Team Finance vesting directly from its on-chain data across Ethereum, BNB Chain, and Polygon, and resolves per-wallet schedules so you can see your own unlocks without hunting through a claim portal. Paste your address, see the unlock calendar alongside any other vesting on that wallet, and get an email or push alert before each unlock. It's read-only — no wallet connection required to track.",
      },
      {
        type: "table",
        headers: ["", "Team Finance app", "Block explorer", "Vestream"],
        rows: [
          ["Surfaces your unlock schedule", "Yes (connect wallet)", "Often no (merkle)", "Yes"],
          ["Alerts before an unlock", "No", "No", "Email + push"],
          ["Other protocols on the same wallet", "No", "No", "Yes (11 protocols)"],
          ["Wallet connection required", "Yes", "No", "No — read-only"],
        ],
      },
      {
        type: "callout",
        emoji: "🧩",
        title: "Merkle vesting, made visible",
        body:  "Because merkle-distributed vesting hides your schedule from ordinary lookups, an indexer that resolves per-wallet data is the practical way to see Team Finance unlocks — and to be reminded before they happen.",
      },
      {
        type: "faq",
        items: [
          { q: "Why can't I see my Team Finance vesting on Etherscan?", a: "Many Team Finance vestings are merkle-distributed: recipients are committed as a single merkle root rather than one on-chain record each, so there's often no per-wallet entry to read until you claim. A tracker that indexes and resolves the data per wallet (like Vestream) surfaces it for you." },
          { q: "How do I get alerted before a Team Finance unlock?", a: "The Team Finance app doesn't send reminders. Paste your wallet into Vestream, turn on alerts, and you'll get an email or push notification before each Team Finance unlock." },
          { q: "Which chains does Team Finance tracking cover?", a: "Vestream indexes Team Finance vesting on Ethereum, BNB Chain, and Polygon." },
          { q: "Do I need to connect my wallet?", a: "No — tracking is read-only from the wallet address. You only connect a wallet at team.finance when you actually claim." },
        ],
      },
      {
        type: "p",
        html: "See live Team Finance coverage and stats on the <a href=\"/protocols/team-finance\">Team Finance protocol page</a>, or learn the fundamentals in <a href=\"/resources/what-is-token-vesting\">What is token vesting?</a>",
      },
    ],
  },

];

export function getArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): Article[] {
  return articles;
}
