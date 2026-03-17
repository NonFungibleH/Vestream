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
];

export default articles;

export function getArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): Article[] {
  return articles;
}
