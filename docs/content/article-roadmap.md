# Article Roadmap

Long-form articles for SEO and GEO (being cited by AI answer engines).
Created 2026-09-15.

## Why this list

The technical side is not the bottleneck. Verified 2026-09-15:

- AI crawlers (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended, CCBot) all receive the full article with no Cloudflare challenge, and robots.txt allows them.
- Articles already ship `Article`, `FAQPage` and `BreadcrumbList` JSON-LD.

So the gap is **coverage**. We have 35 articles, strong on fundamentals (what vesting is, cliffs, schedules, a US-weighted tax guide, price impact, zombie supply, red flags) plus seven protocol explainers. Each item below is a topic the existing article text barely or never covers, measured by searching `src/lib/articles.ts`.

Ranking is by search intent and by where our data is an advantage. We do not have keyword volume data, so this is judgement, not measured demand.

## Rules for every article

- Verify every factual and legal claim against a primary source before writing. Tax and legal content especially: cite HMRC / IRS pages, never write from memory.
- Use our own data where it is verified. Never publish a figure that has only been checked for one protocol as if it applies to all.
- No trading instructions and no individual tax advice. Explain, then point to a professional.
- Only write token-level pages for tokens we genuinely index with real recipients and liquidity.

## Roadmap

| # | Article | Status | Evidence of gap | Why |
|---|---|---|---|---|
| 1 | **UK tax on vested tokens: taxed at vest or at claim?** | Published 2026-09-15 → `/resources/uk-tax-vesting-tokens-vest-or-claim` | HMRC mentioned 6 times across all articles vs IRS 38; "accrual" 4 | Highest intent; feeds the paid tax product; people search Nov–Jan ahead of the 31 Jan self-assessment deadline. We just shipped unlock-basis tax for UK/EU users |
| 2 | **State of Token Vesting (data report)** | Blocked | No original data report exists | Best GEO asset: answer engines cite original data. We have cross-protocol counts, unlock cadences and unclaimed rates nobody else can produce. **Blocked** until the unclaimed-token rate is verified on-chain per protocol (done so far: Smithii, Hedgey only) |
| 3 | **Protocol explainers: Jupiter Lock, Magna, Smithii, HoodLock, Unvest** | Not started | Magna, Smithii, HoodLock: 0 mentions. Jupiter Lock: passing mentions only despite being our largest protocol by schedules (60k). No dedicated Unvest article | Cheapest wins. "What is X" and "how to track X unlocks" queries, with live numbers embedded from our index |
| 4 | **Why token prices fall before unlocks** (long-form of the Sept 2026 thread) | Not started | Keyrock / pre-unlock timing: 0 mentions. Team vs investor unlocks: 2 mentions each | The thread proved the topic resonates. Keyrock's 16,000-unlock study: ~90% negative, decline begins ~30 days before; team unlocks hit hardest |
| 5 | **Token unlock pages** for well-indexed tokens | Not started | Only ARB and KAITO exist | Candidates with real recipients and liquidity (2026-09-15): TURTLE (113 wallets), ATH (76, Magna + Sablier), EDEN (65), vAPI (108), BID (90), EDEL. Filter by wallet count and liquidity; raw "most locked" rankings include junk (e.g. a token showing $5.3B locked across 4 wallets) |
| 6 | **Token vesting on Arc** | Not started | Arc: 0 mentions | Mainnet 16 Sep 2026, no competing content. Thin until a vesting protocol deploys there, so write short and expand once Smithii or others launch |

## Done

- **2026-09-15 — UK tax: vest or claim.** Every legal point cited to an HMRC manual page (CRYPTO21100, 42250, 42300, 21250, 21200, 22200; EIM42210; ERSM20194; CG56321A) plus GOV.UK deadline and allowance pages. Key finding written into the piece: HMRC has **no** guidance specific to tokens in vesting contracts. The conclusion (tax point usually the unlock date) is derived from s19(4) ITEPA — money's worth is taxed in the year it is provided — with RSU treatment as an explicitly labelled analogy, not presented as HMRC's rule for tokens.
  - **Product implication:** Vestream's tax tool defaults to *Claim basis*. For UK employment tokens the article concludes *Unlock basis* is usually right. Consider prompting UK users toward Unlock basis.
  - **Not claimed:** GBP valuation at the tax point. HMRC requires sterling at the time of receipt; the income statement converts at today's rate, so the article tells readers to convert at the historical rate rather than implying Vestream does it.
