# Tweet Backlog

Threads drafted and ready to post. Copy each block into X as a separate post in the thread.

Created 2026-09-15. Character counts use X's weighting: a link counts as 23, an emoji as 2. Every post is under 280.

## House rules (from what worked)

- Open by correcting a common belief, then explain the mechanism.
- Every figure must be verified against a named source or our own index before posting.
- No trading instructions or individual tax advice.
- Close on what only Vestream does, with a link.
- Offer a one-line graphic brief with each thread.

## Queue

| # | Thread | Status | When |
|---|---|---|---|
| 1 | Arc launch: ready for vesting protocols | Ready | **Post on 16 Sep 2026** (Arc mainnet day) |
| 2 | UK tax: vest or claim | Ready | Any time; strongest Nov–Jan ahead of the 31 Jan deadline |
| 3 | Why token prices fall before unlocks (long-form) | Ready | Any time after the original unlock-timing thread |
| 4 | Why unlock alerts matter | Ready | Promotes the same article as #3 from the alerts angle. Post one or the other first, not both in the same week |

---

## 1. Arc launch — ready for vesting protocols

**Post on:** 16 September 2026, the day Arc mainnet opens. The first line says "Arc is live", so don't post it earlier.

**Graphic:** Your chain grid with the Arc tile lit up in teal and its "SOON" badge replaced by "READY", captioned "Arc is live."

**1/5** · 240
```
Arc is live.

Circle's Layer-1 for stablecoin finance: EVM-compatible, USDC as gas, sub-second finality. BlackRock, Visa, Mastercard, ICE and DTCC among the founding validators.

Why vesting is about to matter on it, and what we've built 🧵
```

**2/5** · 276
```
Every chain that attracts serious token launches gets the same problem.

Team, investor and ecosystem allocations vesting on schedules nobody is watching. Unlock dates buried in contracts. Recipients who forget to claim.

A chain built for institutions won't be the exception.
```

**3/5** · 272
```
So Arc is already wired into Vestream.

Chain and explorer configured, Arc page live. The moment a vesting or locking protocol deploys, we can start indexing it: schedules, unlock dates, and the wallets they belong to.

Same way we already cover Ethereum, Base and Solana.
```

**4/5** · 235
```
Building vesting on @arc? Here's what your recipients get from day one:

• Unlock alerts on iOS and Android
• A wallet scan that finds their schedules
• Tax exports with unlock-date values

You keep the contract. We never touch tokens.
```

**5/5** · 266
```
13 vesting protocols indexed so far. We'd like Arc's first ones on the list.

All we need is your contract address, or the factory if you deploy one per project. We handle the rest.

Building a vesting protocol or locker on Arc? Hit us up 🤝

vestream.io/chains/arc
```

**Notes**
- Says Vestream is *ready* for Arc, not that it already indexes Arc vesting. True as of 15 Sep: chain ID, RPC and explorer are configured and `/chains/arc` is live, but no protocol has deployed vesting on Arc yet.
- Smithii is deliberately not named. They've said they're building vesting on Arc, but the conversation with Jorge (Telegram) is still open. Once they launch, quote-post their announcement instead.
- Superfluid has an Arc vesting endpoint stubbed in our code, but it isn't live. Don't mention it.

**Sources:** [Circle: Introducing Arc](https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance) (EVM-compatible, USDC gas, sub-second finality) · [Arc mainnet date](https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026) · [Circle validator cohort](https://www.circle.com/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch)

---

## 2. UK tax — taxed at vest or at claim?

**Links to:** https://www.vestream.io/resources/uk-tax-vesting-tokens-vest-or-claim

**Graphic:** Two price tags on one tranche of tokens, "Unlock date £12,000" and "Claim date £5,000", joined by a question mark, on Vestream's dark background.

**1/5** · 272
```
UK crypto tax question most vesting recipients get wrong:

Are you taxed when your tokens vest, or when you claim them?

For most people paid in tokens for work, it's likely the unlock date. Not the day you click claim.

What HMRC's guidance says, and where it runs out 🧵
```

**2/5** · 268
```
HMRC has no guidance written for tokens sitting in vesting contracts.

So the answer comes from employment income rules. Tokens paid for work are "money's worth", taxed in the year they're provided (s19(4) ITEPA 2003).

For on-chain vesting, that's usually the unlock.
```

**3/5** · 278
```
HMRC's closest official example points the same way.

Restricted stock units are taxed "on the market value of the shares received at vesting". Not at grant, not when you sell.

Tokens aren't shares, so it's an analogy rather than a rule. But it's the nearest guidance there is.
```

**4/5** · 261
```
Why the date matters. 10,000 tokens, later sold for £8,000.

Unlock date, priced at £1.20: £12,000 income, then a £4,000 capital loss.
Claim date, priced at £0.50: £5,000 income, then a £3,000 gain.

Same tokens, same sale. Different tax years, different bills.
```

**5/5** · 262
```
The full breakdown: employment vs presale vs airdropped tokens, PAYE, sterling values, pooling, and the 31 January 2027 deadline.

Vestream's tax tool shows unlock and claim basis side by side.

Every point cited to HMRC. Not tax advice.

vestream.io/resources/uk-tax-vesting-tokens-vest-or-claim
```

**Notes**
- Keep the "not tax advice" line. The conclusion is derived from general employment income rules because HMRC has no token-specific vesting guidance.
- The deadline in post 5 is for the 2025–26 tax year. Update it before reusing after January 2027.

**Sources:** [EIM42210](https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim42210) (money's worth taxed in the year provided) · [ERSM20194](https://www.gov.uk/hmrc-internal-manuals/employment-related-securities/ersm20194) (RSUs taxed at vesting) · [Self Assessment deadlines](https://www.gov.uk/self-assessment-tax-returns/deadlines)

---

## 3. Why token prices fall before unlocks (long-form)

**Links to:** https://www.vestream.io/resources/why-token-prices-fall-before-unlocks

**Graphic:** A gauge reading "600×" with a small caption underneath, "$14,800 unlock ÷ $25 of volume", showing a scary number built on a tiny denominator.

**1/5** · 234
```
Our last thread: token prices usually start falling ~30 days before an unlock, not on the day.

We've now written the full version. Why it happens, which unlocks hit hardest, and the mistake that makes a tiny unlock look terrifying 🧵
```

**2/5** · 245
```
The research (Keyrock, 16,000+ unlocks) splits by who receives the tokens.

Team unlocks hit hardest: lots of individuals, no coordination.
Investors tend to hedge or sell OTC, so less lands on the order book.
Ecosystem unlocks are the gentlest.
```

**3/5** · 248
```
Size alone tells you little. Compare the unlock with what actually trades.

We call it the absorption ratio: unlock value ÷ 24h trading volume. Above 1 means the unlock is worth more than a full day of trading.

Useful. Also very easy to get wrong.
```

**4/5** · 257
```
Example: a ~$14,800 MOVE unlock showed an absorption ratio near 600×.

Not because it was big. Its DEX pairs were doing tens of dollars a day, so almost none of its trading happened where the ratio was measuring.

Always check where a token actually trades.
```

**5/5** · 259
```
Plus a real FF unlock and why it's correlation, not proof, and a 6-point checklist for reading any unlock before it lands.

And if you're receiving tokens: about 6 in 10 finished Smithii schedules still hold tokens nobody has claimed.

vestream.io/resources/why-token-prices-fall-before-unlocks
```

**Notes**
- Post 4 is candid: the 600× reading appeared on Vestream's own MOVE token page. Admitting where a metric misleads is what makes the rest credible. Drop post 4 if you'd rather not.
- The 6-in-10 figure is Smithii only, measured from on-chain vault balances. Don't generalise it to all protocols until the others are verified.
- Post 1 refers back to the original unlock-timing thread, so post this one after it.

**Sources:** Keyrock study via [crypto.news](https://crypto.news/token-unlocks-almost-always-negative-for-price-keyrocks-study-reveals/) and [ChainCatcher](https://www.chaincatcher.com/en/article/2155623) · Vestream on-chain index (MOVE, FF, Smithii), September 2026

---

## 4. Why unlock alerts matter

**Links to:** https://www.vestream.io/resources/why-token-prices-fall-before-unlocks

**Graphic:** A single timeline with three marks: "~30 days before: price pressure typically starts", "Unlock day", and "1 year later: still unclaimed", with a teal Vestream bell on the first stretch and on unlock day.

**1/5** · 235
```
Most people treat a token unlock like a date in the diary. Check it on the day, claim, move on.

That misses two things. The market often moves weeks before the unlock. And a lot of people who are owed tokens never claim them at all 🧵
```

**2/5** · 258
```
Keyrock studied 16,000+ token unlocks.

About 90% were followed by falling prices, and the decline typically started around 30 days before the unlock, not on the day.

Unlock dates are public. Holders who plan to sell go early, and funds hedge ahead of time.
```

**3/5** · 257
```
So if the first you hear of an unlock is the day it happens, much of the move may already be in the price.

The month before is where the useful information is: how big the unlock is against circulating supply, who receives it, and how much actually trades.
```

**4/5** · 260
```
If the tokens are yours, the bigger risk is simply forgetting.

On Smithii, about 6 in 10 vesting schedules that have finished still hold tokens nobody has claimed. Some ended more than a year ago.

In the UK, the unlock date can also decide when you're taxed.
```

**5/5** · 243
```
Vestream covers both sides.

Every upcoming unlock across 13 protocols on a public calendar, weeks ahead. Plus alerts for your own vestings, up to 48 hours before they unlock.

The full breakdown, with a real example 👇
vestream.io/resources/why-token-prices-fall-before-unlocks
```

**Notes**
- Alerts fire 1 to 48 hours before an unlock (the lead times the app offers). Don't claim alerts arrive 30 days ahead: the 30-day view is the public calendar.
- Alerts cover the user's own vestings only, not other wallets or watchlisted tokens.
- The 6-in-10 figure is Smithii only. Don't generalise it to all protocols.
- "13 protocols" matches the site header on 16 Sep 2026. Update it if a protocol is added before posting.

**Sources:** Keyrock study via [crypto.news](https://crypto.news/token-unlocks-almost-always-negative-for-price-keyrocks-study-reveals/) and [ChainCatcher](https://www.chaincatcher.com/en/article/2155623) · Vestream on-chain index (Smithii), September 2026 · Alert lead times from the Vestream app settings

