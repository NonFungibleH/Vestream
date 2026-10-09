# Unclaimed finished vesting: Sablier (EVM)

**Vestream original research — Sablier half.**
Measurement date: **2026-10-06**. "Finished" throughout means `endTime < 2026-09-06` (ended 30+ days ago).

---

## 0. How this was measured, and why it differs from the 2026-09-24 baseline

The 2026-09-24 baseline was taken from Vestream's own `vesting_streams_cache`. Reproducing it worked, but auditing it revealed two problems that make it unsafe as a published source:

1. **It is a ~8% sample, not the universe.** The cache is populated per-recipient as wallets get looked up, so it only contains streams belonging to wallets Vestream has already seen. On the 11 chains the cache covers, the live Sablier indexer holds **440,284** non-cancelled finished streams; the cache holds **36,051** — **8.2%**.
2. **Most of it is months stale.** 33,908 of 52,795 Sablier cache rows (**64%**) were last refreshed in **May 2026**. Every single one of the top-value positions found in the cache was last refreshed in May, June or July. Publishing a dollar figure from them would have been indefensible.

So the figures below are measured against the **live Sablier Envio HyperIndex** (`https://indexer.hyperindex.xyz/53b7e25/v1/graphql`), the same endpoint `src/lib/vesting/adapters/sablier.ts` and `src/lib/vesting/tvl-walker/sablier.ts` already use. The cache baseline is retained in §7 only as a methodology note.

### Reproduction

```
# full walk of every finished stream on every mainnet chain (536,685 rows)
node scratchpad/walk.js      # paginates LockupStream by id cursor, endTime < ASOF
node scratchpad/resume.js    # re-runs any chain the indexer errored on mid-page
# live prices
node scratchpad/price3.js    # one DexScreener request per token address
# analysis
node scratchpad/live1.js live3.js live4.js live5.js live6.js top15.js
# on-chain balance verification
node --env-file=.env.local scratchpad/verify.js
```

Core query shape:

```graphql
{ LockupStream(
    where: { chainId: {_eq: $c}, endTime: {_lt: "$ASOF"}, id: {_gt: "$cursor"} }
    order_by: { id: asc } limit: 1000
  ) { id subgraphId chainId recipient sender depositAmount withdrawnAmount
      intactAmount canceled canceledTime depleted endTime startTime shape
      category cancelable asset { address symbol decimals } } }
```

### Definitions used

| Term | Definition |
|---|---|
| **finished** | `endTime < 2026-09-06` (ended 30+ days ago) |
| **unclaimed** | `intactAmount > 1% of depositAmount` — tokens still sitting in the Lockup contract |
| **never withdrawn** | `withdrawnAmount = 0` and `intactAmount > 0` |
| **partial** | `withdrawnAmount > 0` and still >1% left |
| **self-stream** | `sender == recipient` (a treasury streaming to itself, not a third-party grant) |
| **third-party** | `sender != recipient` — the population that actually represents someone's unclaimed grant |

Three measurement choices worth stating, because they are the difference between an honest number and a scary one:

- **`intactAmount`, not `deposit - withdrawn`.** `intactAmount` is what the contract still holds for that stream. For cancelled streams the unvested remainder has already gone back to the sender, so `deposit - withdrawn` would wrongly count it as owed to the recipient. I verified `intactAmount == depositAmount - withdrawnAmount` for **all 447,661** non-cancelled finished streams (zero mismatches), and that `depleted` is an exact complement of `intactAmount > 0` (zero exceptions both ways). The two fields agree perfectly, so the choice only matters for cancelled streams — where it matters a lot (see §6).
- **Cancelled streams are excluded** from the denominator and numerator. There are 89,024 of them. Using `deposit - withdrawn` would have added all 89,024 to the "unclaimed" count.
- **Self-streams are reported separately** and excluded from the headline value. They are 3.5% of unclaimed streams but **37% of unclaimed priced value**.

---

## 1. Rates

### Headline (all 25 mainnet chains, testnets excluded)

| Measure | Count | Rate |
|---|---|---|
| Finished streams (incl. cancelled) | 536,685 | — |
| Cancelled | 89,024 | 16.6% |
| **Non-cancelled finished — denominator** | **447,661** | 100% |
| Unclaimed (>1% left) | **228,198** | **50.98%** |
| Any tokens left at all (`intact > 0`) | 231,188 | 51.64% |
| Never withdrawn a single token | **206,625** | **46.16%** |
| Partial — withdrew some, then stopped | 21,573 | 4.82% |
| Fully claimed (`intact = 0`) | 216,473 | 48.36% |

**Do not publish 51% without the next paragraph.**

### The concentration problem — one token is 61% of the finding

| Scope | Finished | Unclaimed | Rate |
|---|---|---|---|
| Everything | 447,661 | 228,198 | **50.98%** |
| Excluding GX on Polygon | 296,100 | 89,780 | **30.32%** |
| Excluding the top 5 token/chain pairs | 263,980 | 64,994 | **24.62%** |

One token — **GX on Polygon** (`0x8730762cad4a27816a467fac54e3dd1e2e9617a1`) — accounts for **138,403 of 228,198** unclaimed streams (**60.7%**), spread over 72,058 wallets from just **2 sender addresses**, and 135,547 of them were never touched. It is a single mass airdrop-style distribution, it is **93.7% of all unclaimed Polygon streams**, and the token has **no DEX pair on any chain** — it is worth nothing. Top-5 token/chain pairs are 71.5% of the finding; top 20 are 83.7%.

**The publishable headline is the ex-GX figure: roughly 1 in 3 (30.3%) of finished Sablier streams still hold tokens, and about 1 in 4 (24.0%) were never touched at all.** That this independently lands on top of the cache sample's 31.7% is reassuring, but it is a coincidence of two different biases, not a confirmation.

### By chain (non-cancelled finished)

| Chain | ID | Finished | Unclaimed | Rate | Never withdrawn |
|---|---|---|---|---|---|
| Polygon | 137 | 183,079 | 147,664 | 80.7% | 144,320 |
| Base | 8453 | 122,095 | 28,812 | 23.6% | 23,431 |
| Arbitrum | 42161 | 57,679 | 23,140 | 40.1% | 18,113 |
| Ethereum | 1 | 44,005 | 14,800 | 33.6% | 9,918 |
| Optimism | 10 | 14,418 | 3,467 | 24.0% | 2,767 |
| BNB Chain | 56 | 12,164 | 2,080 | 17.1% | 1,465 |
| zkSync Era | 324 | 4,073 | 2,611 | 64.1% | 2,470 |
| Avalanche | 43114 | 2,537 | 1,799 | 70.9% | 1,463 |
| Blast | 81457 | 2,291 | 1,199 | 52.3% | 467 |
| Chiliz | 88888 | 1,780 | 903 | 50.7% | 701 |
| Scroll | 534352 | 1,553 | 1,148 | 73.9% | 1,139 |
| Linea | 59144 | 1,138 | 48 | 4.2% | 46 |
| Berachain | 80094 | 392 | 303 | 77.3% | 130 |
| Superseed | 5330 | 93 | 16 | 17.2% | 16 |
| XDC | 50 | 87 | 55 | 63.2% | 52 |
| Robinhood | 4663 | 54 | 35 | 64.8% | 28 |
| Mode | 34443 | 38 | 8 | 21.1% | 8 |
| Monad | 143 | 34 | 15 | 44.1% | 13 |
| HyperEVM | 999 | 34 | 27 | 79.4% | 21 |
| Abstract | 2741 | 27 | 25 | 92.6% | 20 |
| Morph | 2818 | 27 | 8 | 29.6% | 8 |
| Gnosis | 100 | 26 | 10 | 38.5% | 9 |
| Sonic | 146 | 17 | 11 | 64.7% | 9 |
| Unichain | 130 | 10 | 6 | 60.0% | 3 |
| Sei | 1329 | 10 | 8 | 80.0% | 8 |

Polygon's 80.7% is the GX airdrop. Scroll's 73.9% is almost entirely the SCR distribution. Chains under ~100 finished streams are too small to quote as rates.

### By how long ago the schedule ended

| Ended | Finished | Unclaimed | Rate | Never withdrawn |
|---|---|---|---|---|
| 30–90 days ago | 3,581 | 2,707 | 75.6% | 1,969 |
| 90–365 days ago | 133,093 | 116,655 | 87.6% | 103,239 |
| 1–2 years ago | 181,485 | 93,010 | 51.2% | 86,965 |
| 2–3 years ago | 129,264 | 15,779 | 12.2% | 14,411 |
| 3+ years ago | 238 | 47 | 19.7% | 41 |

**The rate falls sharply with age, which is the opposite of the intuitive story.** Two honest readings, and I cannot separate them with this data: recipients do eventually claim (the stock drains over years), and/or the recent cohorts are dominated by the 2024–25 airdrop wave (GX, SCR, EARNM) whose recipients were never going to claim. The 90–365 day band's 87.6% is heavily GX-contaminated; ex-GX the band is far lower. **Do not publish the age gradient as evidence that "people claim eventually" without this caveat.** The 3y+ band (n=238) is too small to quote.

### By size of the unclaimed amount

Raw token amounts, all unclaimed streams (n=228,198):

| Whole tokens left | Streams | Token/chain pairs | Wallets |
|---|---|---|---|
| under 1 | 31,931 | 228 | 29,936 |
| 1 – 100 | 105,426 | 500 | 79,297 |
| 100 – 10k | 61,406 | 501 | 51,499 |
| 10k – 1M | 19,434 | 474 | 12,401 |
| 1M – 1B | 5,543 | 650 | 3,718 |
| 1B – 1T | 4,451 | 1,549 | 1,709 |
| over 1T | 7 | 4 | 7 |

In USD, for the only population where USD is meaningful (third-party, token pool ≥ $10k, non-test; n=20,245):

| Unclaimed value | Streams | Wallets | Total |
|---|---|---|---|
| under $1 | 9,931 | 9,216 | $1,433 |
| $1 – $10 | 5,326 | 4,484 | $20,367 |
| $10 – $100 | 3,769 | 2,326 | $121,501 |
| $100 – $1,000 | 786 | 537 | $272,527 |
| $1,000 – $10,000 | 344 | 185 | $1,101,022 |
| $10,000 – $100,000 | 81 | 54 | $2,728,848 |
| over $100,000 | 8 | 7 | $1,915,413 |

**49% of the priceable positions are worth under $1, and they total $1,433 between them.** Eight positions hold 31% of the value. This is the shape of the whole finding.

---

## 2. What is it worth?

### Method

Bottom-up, per token: `unclaimed USD = Σ(intactAmount / 10^decimals) × live price`. Price comes from DexScreener (`api.dexscreener.com/latest/dex/tokens/{address}`), taking **the deepest-liquidity pair on the stream's own chain**. A token with no pair on its own chain is treated as **unpriceable and contributes $0** — not estimated, not carried over from another chain.

I checked coverage rather than assuming it: of the 25 largest unpriced tokens by stream count, a serial re-query confirmed **24 genuinely have no DEX pair anywhere**. The one exception (NAI on Avalanche) trades only on Ethereum, so excluding it is the conservative choice. The earlier batch-endpoint approach was discarded — DexScreener's multi-address endpoint caps the response at 30 pairs *in total*, so tokens with many pools crowd out everything else, and it silently under-reported coverage by ~55%.

### The dust/liquidity split — this is the story

| Token pool liquidity | Token/chain pairs | Unclaimed streams | Wallets | Unclaimed value |
|---|---|---|---|---|
| ≥ $1M | 46 | 1,531 | 1,230 | $3,723,368 |
| $100k – $1M | 78 | 8,839 | 6,837 | $3,635,635 |
| $10k – $100k | 90 | 16,976 | 8,824 | $2,370,856 |
| $1k – $10k | 34 | 1,312 | 1,006 | $28,772 |
| under $1k | 17 | 560 | 481 | $251,500 |
| **no DEX pair at all** | **2,955** | **198,980** | **119,159** | **$0** |

- **3,220** distinct token/chain pairs hold unclaimed finished streams. Only **265 (8.2%)** still have a live DEX pair. **2,955 (91.8%) do not trade anywhere.**
- **198,980 of 228,198 unclaimed streams (87.2%)** are denominated in a token with no market at all.

**The honest sentence is: roughly 9 in 10 unclaimed finished Sablier streams are unclaimed tokens that no longer have a price.** Not "nobody claimed $X million" — the overwhelming majority of the unclaimed population is worthless by the time anyone would notice.

### The range

All figures exclude cancelled streams and test-symbol tokens.

| Basis | Value |
|---|---|
| Every priceable token, mark-to-market (incl. self-streams) | **$10.0M** |
| Tokens with ≥ $10k pool liquidity | $9.73M |
| — of which **self-streams** (treasury to itself) | $3.57M (37%) |
| **Third-party only, ≥ $10k pool** | **$6.16M** |
| Third-party, ≥ $10k pool, each token capped at its pool depth | $4.19M |
| **Third-party, ≥ $100k pool AND ≥ $10k 24h volume** | **$2.88M** (3,871 streams, 59 tokens) |
| — same, capped at each token's pool depth | **$2.61M** |

**The number to publish: $2.6M – $6.2M, central estimate about $3M.**

The low end counts only tokens with a real market (≥$100k pool, ≥$10k daily volume) and caps each token at what its pool could actually absorb. The high end is mark-to-market on anything with a ≥$10k pool. The $10.0M figure is not publishable: it includes treasury self-streams, and tokens whose entire pool is under $1k being marked at screen price.

The pool-depth cap is not cosmetic. Several of the largest positions are **larger than the entire pool for their token** — ALT's $1.39M of unclaimed tokens sit against a $67k BSC pool. Marked at screen price they are worth seven figures; sold, they would be worth a fraction of that.

---

## 3. The top 15 priceable positions

Third-party only (`sender != recipient`), token pool ≥ $10k, test tokens excluded. Every token in this table was **verified on-chain** (§6).

| # | Token | Chain | Unclaimed USD | Tokens left | State | Days since end | Shape | Wallets with unclaimed, same token | Streams, same token | Pool liq | 24h vol | Token mcap | Recipient |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | VELVET | BNB Chain | $722,900 | 10,000,000 | partial — 90% taken | 118 | tranchedStepper | 6 | 6 | $579,099 | $15,683 | $17.9M | `0x75e7488ac067f07948739bfb550213b47db094bb` |
| 2 | NKP | Ethereum | $299,800 | 100,000,000 | never withdrawn | 129 | linear | 5 | 6 | $445,496 | $4,371 | $1.89M | `0xa492d6adb1b2e7395b0731567ca29fcf9252232e` |
| 3 | AAA | Base | $213,123 | 7,111,227 | never withdrawn | 179 | linear | 20 | 21 | $77,230 | $3,788 | $782k | `0x890af1fd6c8f924d096ea7029dd225bad6029ab8` |
| 4 | NKP | Ethereum | $149,900 | 50,000,000 | never withdrawn | 129 | linear | 5 | 6 | $445,496 | $4,371 | $1.89M | `0xa492d6adb1b2e7395b0731567ca29fcf9252232e` |
| 5 | TIG | Base | $139,338 | 152,000 | partial — 8% taken | 171 | linear | 358 | 562 | $857,678 | $44,294 | $19.7M | `0x660b972ecd5bd783016355bf4a21fef21717bef1` |
| 6 | VERTAI | Ethereum | $138,254 | 7,668,000 | partial — 23% taken | 511 | linear | 11 | 11 | $189,606 | $12,789 | $1.77M | `0x2bf7aa5386a670f7030a9632ec8277b4a8619e3c` |
| 7 | TREE | Ethereum | $128,925 | 750,000 | never withdrawn | 558 | dynamicMonthly | 1 | 1 | $1,409,232 | $839 | $15.9M | `0x57d72ddc00443a6173c118a94b084460345dc6fc` |
| 8 | VIRTUAL | Ethereum | $123,173 | 150,009 | partial — 69% taken | 47 | linear | 1 | 1 | $304,701 | $7,623 | $821M | `0x2cf69e90b9ffba9220f703b36d2127f6ea55bebd` |
| 9 | VERTAI | Ethereum | $90,150 | 5,000,000 | never withdrawn | 235 | linear | 11 | 11 | $189,606 | $12,789 | $1.77M | `0x344779968a4a03fcf4bf4dad18971098c4f18939` |
| 10 | REI | Base | $75,150 | 5,000,000 | never withdrawn | 407 | linear | 5 | 5 | $1,780,862 | $140,705 | $15.0M | `0xdba0b667dfe2775765c3112bb50fa364e53ba5bf` |
| 11 | FLUID | Ethereum | $72,750 | 37,500 | never withdrawn | 278 | cliff | 5 | 5 | $4,431,319 | $361,785 | $163M | `0xf957fa14ea72a9ecd7bdc06c5be89a5a34c7aa89` |
| 12 | ALT | BNB Chain | $69,885 | 8,791,689 | never withdrawn | 73 | tranchedMonthly | 34 | 306 | $67,024 | $7,318 | $58.6M | `0x19404af99669947faf549c1f81ecec0d0ac3ee16` |
| 13 | ALT | BNB Chain | $69,885 | 8,791,689 | never withdrawn | 42 | tranchedMonthly | 34 | 306 | $67,024 | $7,318 | $58.6M | `0x19404af99669947faf549c1f81ecec0d0ac3ee16` |
| 14 | ALT | BNB Chain | $69,885 | 8,791,689 | never withdrawn | 104 | tranchedMonthly | 34 | 306 | $67,024 | $7,318 | $58.6M | `0x19404af99669947faf549c1f81ecec0d0ac3ee16` |
| 15 | TIG | Base | $69,303 | 75,600 | never withdrawn | 585 | linear | 358 | 562 | $857,678 | $44,294 | $19.7M | `0xd82e010eaaa8e294ee3872d052279692e0ef5d37` |

**Sum of top 15: $2,432,421.** Stream IDs for all 15 are in the appendix.

Per-position caveats, every one of which a reader will find:

- **#1 VELVET** — the recipient took 90% and left 10,000,000 tokens. This is the clearest "walked away from the last slice" case in the dataset. The position is larger than the BSC pool ($579k).
- **#2 and #4 NKP** — the same wallet, two streams, 150M tokens, never touched. Combined $449,700 against a **$1.89M market cap — 24% of the token's entire market cap** and 4.2x the pool. Mark-to-market only.
- **#3 AAA** — $213,123 against a **$782k market cap**. 27% of the token. Not realisable.
- **#12–14 ALT** — three identical streams to one wallet. ALT has a $58.6M market cap but only a **$67k BSC pool** (the Ethereum pool is $98k). Real token, no exit.
- **#8 VIRTUAL** and **#11 FLUID** are the two positions here that are both large and genuinely liquid ($821M and $163M market cap, $4.4M FLUID pool). These are the strongest single examples for the series.
- **Excluded from this table deliberately: SERV on Ethereum, $2,824,900** — the single largest unclaimed position in the whole dataset, 130,000,000 tokens, 667 days finished. Its **sender and recipient are the same address** (`0x42cab3696a60c6fc51381bb533797e4121e1f168`): a project streaming to its own treasury. It is 17% of SERV's market cap and 2x its pool. Including it would have nearly doubled the headline off one treasury lockup. **Do not publish it as an unclaimed grant.**

---

## 4. Partial vs never-touched

| | Count | Share of unclaimed |
|---|---|---|
| Never withdrew anything | 206,625 | 90.5% |
| Withdrew some, then stopped | 21,573 | 9.5% |

**Over 90% of unclaimed finished streams were never touched once.** "Forgot it existed" dominates "got bored halfway" by roughly 10 to 1.

For the 21,573 partials, how much they had already taken before stopping:

| p10 | p25 | median | p75 | p90 |
|---|---|---|---|---|
| 5.4% | 20.0% | **48.8%** | 81.1% | 94.9% |

The median partial claimant took just under half and stopped. The distribution is close to uniform — there is no cliff at a particular fraction, which argues against a systematic UI or gas trigger and for ordinary attrition.

### By schedule shape

Grouped into families (Sablier reports 30 distinct `shape` values):

| Shape family | Finished | Unclaimed | Rate | Never | Partial | Partial as share of unclaimed |
|---|---|---|---|---|---|---|
| **cliff / timelock (one-shot unlock)** | 176,989 | 154,699 | **87.4%** | 149,434 | 5,265 | **3.4%** |
| **linear (continuous)** | 241,932 | 61,083 | **25.2%** | 49,644 | 11,439 | **18.7%** |
| stepped / tranched | 9,268 | 4,161 | 44.9% | 3,538 | 623 | 15.0% |
| other / composite | 19,472 | 8,255 | 42.4% | 4,009 | 4,246 | 51.4% |

**This is the strongest structural finding in the dataset.** A one-shot unlock — everything becomes claimable on a single date — goes unclaimed **87.4%** of the time. A continuous linear stream goes unclaimed **25.2%** of the time: 3.5x better.

The mechanism is visible in the partial column. A linear stream gives the recipient many small reasons to visit the contract, and once they have visited once they usually finish: only 18.7% of unclaimed linear streams are partials, but linear streams are claimed at all four times as often. A one-shot unlock gives exactly one reason to show up on exactly one day, and if the recipient misses it there is no second prompt — hence partials are almost nonexistent (3.4%) and the unclaimed rate is enormous.

**Caveat that must travel with this finding:** the `cliff` bucket is heavily GX (75,049 of 88,426 unclaimed cliff streams) and `dynamicTimelock` is too (62,273 of 62,962). Both are airdrop distributions that chose a one-shot shape. So shape and "was this an airdrop" are confounded in this data and I cannot cleanly separate them. The direction is robust across the non-GX tokens too (EARNM, BUILD, OogaBooga, KABOSUCHAN all one-shot and all barely claimed), but **publish this as a strong association, not a causal claim about shape**.

### By how many streams the wallet holds

| Finished streams held | Wallets | Streams | Unclaimed | Rate |
|---|---|---|---|---|
| 1 | 170,277 | 170,277 | 46,761 | 27.5% |
| 2 | 87,552 | 175,104 | 142,020 | **81.1%** |
| 3–5 | 17,082 | 59,746 | 20,534 | 34.4% |
| 6–10 | 1,890 | 13,636 | 4,679 | 34.3% |
| 11–50 | 782 | 13,291 | 4,278 | 32.2% |
| 51–200 | 57 | 5,407 | 1,056 | 19.5% |
| 201+ | 6 | 10,200 | 8,870 | 87.0% |

The 81.1% at "exactly 2 streams" is **entirely a GX artifact** — that airdrop issued exactly two streams per wallet to 72,058 wallets. Excluding GX:

| Finished streams held | Wallets | Streams | Unclaimed | Rate |
|---|---|---|---|---|
| 1 | 170,308 | 170,308 | 46,779 | 27.5% |
| 2 | 18,704 | 37,408 | 14,508 | 38.8% |
| 3–5 | 14,171 | 48,129 | 11,370 | 23.6% |
| 6–10 | 1,552 | 11,462 | 3,003 | 26.2% |
| 11–50 | 774 | 13,186 | 4,194 | 31.8% |
| 51–200 | 57 | 5,407 | 1,056 | 19.5% |
| 201+ | 6 | 10,200 | 8,870 | 87.0% |

**Ex-GX there is no meaningful relationship between how many streams a wallet holds and whether it claims them** — every band from 1 to 200 sits between 20% and 39%. The 201+ band is six wallets and is not a pattern; it is five distribution/test contracts plus one EARNM recipient (see §5). **Do not publish "wallets with more positions forget more" — the data does not support it.**

---

## 5. Multi-stream wallets

- **277,646** distinct recipients hold at least one finished Sablier stream.
- **135,874** of them hold at least one unclaimed finished stream (**48.9%**).
- Excluding GX: **63,848** distinct recipients.

Distribution of unclaimed finished streams per wallet:

| Unclaimed streams | Wallets (all) | Wallets (ex-GX) |
|---|---|---|
| 1 | 65,063 | 54,986 |
| 2 | 66,233 | 6,399 |
| 3–5 | 3,841 | 1,914 |
| 6–10 | 500 | 317 |
| 11–50 | 222 | 217 |
| 51–200 | 10 | 10 |
| 201+ | 5 | 5 |

Ex-GX, **86% of affected wallets have exactly one** unclaimed finished stream. This is a long thin tail, not a population of serial forgetters.

### Largest wallets by unclaimed stream count

| Recipient | Streams | Chains | Tokens | Never touched |
|---|---|---|---|---|
| `0x812271d684328443287312793757c4f32848a70a` | 6,597 | Base | EARNM | 5,761 |
| `0xace1627207ac26030fb0f8a3eb98f36e5e0d1513` | 895 | Base | QOIN | 895 |
| `0x420ae9b2f9a63fcb809c5fd0f9bf01b137792169` | 671 | Base | Lion/Quay/Dune/ridge/Crown/nook | 671 |
| `0x00bc973d4a29314eddba56b2d9f9cf777c442700` | 465 | Base | CC/DD/TEST/POC | 465 |
| `0xda40098c6923f77fd47d87b97f12d4bb11068d3a` | 242 | Base | QOIN | 242 |
| `0xaaadae011a6bd963e38d9b511270a4674eb1b874` | 140 | Ethereum | FJO | 123 |
| `0xd4bd48870b2204c16bf3ac1586eae6d168a4f0fd` | 133 | Arbitrum | OogaBooga/KABOSUCHAN/LUEYGI/PORIGON | 133 |
| `0x7162476f38a1ea00aacffafd89a4b0d03917e531` | 132 | Arbitrum | KABOSUCHAN/OogaBooga | 131 |
| `0x012fec35b3e25c47f8d4d2ba33f2e716c1b5b1c6` | 107 | Base | TESTI/TEST/MWAH/3TEST | 106 |
| `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` | 102 | 15 chains | FAU-ERC20 | 100 |

**None of these is a person who forgot their vesting.** Read them carefully before using any of them:

- `0x8122…70a` with 6,597 EARNM streams is **one address receiving 6,597 separate streams** — a distribution contract or a single project wallet, not 6,597 grants.
- `0x7099…79c8` is the **well-known Hardhat/Anvil default account #1**, holding a faucet test token (`FAU-ERC20`) across 15 mainnet chains. Developer test traffic deployed to mainnets.
- `0x00bc…2700` and `0x012f…b1c6` hold tokens symboled `TEST`, `POC`, `3TEST`.
- 1,046 addresses that appear as recipients also appear as senders elsewhere, holding 8,981 unclaimed streams between them — these are contracts and distributors, not end users.

### Largest wallets by unclaimed value (third-party, pool ≥ $10k, non-test)

| Recipient | Value | Streams | Never touched | Tokens | Chains |
|---|---|---|---|---|---|
| `0x75e7488ac067f07948739bfb550213b47db094bb` | $722,900 | 1 | 0 | VELVET | BNB Chain |
| `0xd82e010eaaa8e294ee3872d052279692e0ef5d37` | $469,300 | 10 | 10 | TIG | Base |
| `0xa492d6adb1b2e7395b0731567ca29fcf9252232e` | $449,700 | 2 | 2 | NKP | Ethereum |
| `0x890af1fd6c8f924d096ea7029dd225bad6029ab8` | $213,123 | 1 | 1 | AAA | Base |
| `0x19404af99669947faf549c1f81ecec0d0ac3ee16` | $209,655 | 3 | 3 | ALT | BNB Chain |
| `0x00164b4783446fde32eddbf7d5a347b85322f201` | $165,604 | 6 | 6 | ALT | BNB Chain |
| `0x660b972ecd5bd783016355bf4a21fef21717bef1` | $139,338 | 1 | 0 | TIG | Base |
| `0x2bf7aa5386a670f7030a9632ec8277b4a8619e3c` | $138,254 | 1 | 0 | VERTAI | Ethereum |
| `0x99131ddbae0e753c7db3d5828c02d96e3a0dfa2c` | $130,479 | 3 | 0 | TIG | Base |
| `0x57d72ddc00443a6173c118a94b084460345dc6fc` | $128,925 | 1 | 1 | TREE | Ethereum |
| `0x2cf69e90b9ffba9220f703b36d2127f6ea55bebd` | $123,173 | 1 | 0 | VIRTUAL | Ethereum |
| `0x23dd5750c67077cf94d62849bc3a28b366b93b39` | $122,069 | 32 | 32 | ALT | BNB Chain |
| `0x2f0b200aceaf0c307d8db05964ed63ac1366ca9c` | $119,716 | 6 | 6 | ALT | BNB Chain |
| `0xae4e479e58c742f9546b3e58aa70caf6e629901e` | $112,353 | 3 | 3 | ALT | BNB Chain |
| `0x4f20cb7a1d567a54350a18dacb0cc803aebb4483` | $111,243 | 5 | 4 | ALT/TALENT | BNB Chain, Base |

`0xd82e…5d37` (10 TIG streams on Base, all never touched, $469,300) is the single most compelling "one person, many finished grants, never claimed any of them" example in the dataset. Six of the top 15 are ALT recipients, so the ALT pool-depth caveat applies to most of this table.

---

## 6. Data quality — everything a reader could use against us

### Verified clean

**On-chain balance verification.** For each of the 16 tokens behind the headline figures, I summed the unclaimed `intactAmount` we attribute to each Sablier Lockup contract and compared it to that contract's actual ERC-20 `balanceOf` via `eth_call`. **All 16 are fully covered** — the contract really holds at least what we say is owed, in most cases to the exact wei:

| Token | Chain | Attributed unclaimed | On-chain balance | Covered |
|---|---|---|---|---|
| SERV | Ethereum | 130,000,000 | 130,000,000 | exact |
| VELVET | BNB Chain | 10,052,500 | 159,283,573 | yes |
| ALT | BNB Chain | 175,088,927 | 218,785,879 | yes |
| TIG | Base | 1,250,672 | 19,010,870 | yes |
| NKP | Ethereum | 170,000,000 | 370,005,918 | yes |
| VERTAI | Ethereum | 17,085,732 | 17,085,732 | exact |
| AAA | Base | 9,311,637 | 29,003,569 | yes |
| REI | Base | 17,000,000 | 17,000,000 | exact |
| TREE | Ethereum | 750,000 | 750,000 | exact |
| VIRTUAL | Ethereum | 150,009 | 295,279 | yes |
| GX | Polygon | 41,688,150 | 152,498,150 | yes |
| FLUID | Ethereum | 52,743 | 802,743 | yes |
| likes | Base | 22,555,837,760 | 22,555,837,760 | exact |
| MERL | BNB Chain | 3,619,630 | 3,619,630 | exact |
| ENX | Ethereum | 10,947,319 | 10,947,715 | yes |
| GAIN | BNB Chain | 78,518,520 | 78,518,520 | exact |

This closes the strongest available attack — "the tokens aren't actually there" — for every token we headline. It also rules out fee-on-transfer and rebasing distortion **for these 16 tokens specifically**, since a rebasing or FOT token would not reconcile.

**Indexer freshness.** Every one of the 27 chains the Sablier Envio indexer serves reported `latest_processed_block == block_height` — **lag of zero blocks on all chains** — at measurement time, with the newest indexed stream 0.2 hours old. The dataset is not a stale snapshot.

**No duplicate rows.** 447,661 rows, 447,661 distinct stream IDs. Zero duplicates.

**Internal consistency.** `intactAmount == depositAmount - withdrawnAmount` on all 447,661 non-cancelled finished streams; `depleted` is an exact complement of `intactAmount > 0`. No zero-deposit streams.

### Real problems, stated plainly

1. **Cancelled streams would inflate this by 89,024 if measured naively.** 16.6% of finished Sablier streams were cancelled. On cancellation the unvested remainder returns to the sender, so `depositAmount - withdrawnAmount` overstates what the recipient is owed. Using `intactAmount` and excluding cancelled streams is correct; **anyone reproducing this with `deposit - withdrawn` will get a number ~89,000 streams too high.** For the record, only 8,216 of the 89,024 cancelled streams have any residue still owed to the recipient.

2. **Self-streams are 37% of the priced value.** 7,920 unclaimed streams (3.5% by count) have `sender == recipient`, but they carry $3.57M of the $9.73M priced total — including the single largest position in the dataset ($2.82M of SERV). A treasury that locks its own tokens and has not pulled them out is not an unclaimed grant. If we publish a value figure that includes these, we deserve to be corrected.

3. **One token is 61% of the count.** Covered in §1. GX on Polygon, two senders, no market. Any rate quoted without this is misleading.

4. **91.8% of the tokens involved no longer trade.** 2,955 of 3,220 token/chain pairs have no DEX pair, covering 87.2% of unclaimed streams. We are mostly describing dead tokens. Our USD figure necessarily covers the 8.2% minority that still has a price, which is a **selection toward the tokens that survived** — it is not a lower bound on "true" value, it is a different quantity.

5. **"Notional" is doing a lot of work.** Several headline positions exceed their token's entire pool depth (ALT: $1.39M against $67k; NKP: $509k against $445k and 27% of market cap; AAA: 36% of market cap; ZFI: $89k against an $11k pool and 81% of its $110k market cap). Mark-to-market and realisable differ by 2–50x here. The pool-capped figures in §2 exist for this reason.

6. **Test and developer traffic is in the mainnet data.** 446 unclaimed streams across 173 token/chain pairs have test-looking symbols (`FAU-ERC20` 148, `TEST` 143, `5TEST`, `3TEST`, `MOCK`…). 102 unclaimed streams are addressed to Hardhat/Anvil default accounts. 254 streams hold less than 1e-6 of a token. All are excluded from value figures but **are inside the rate denominators** — their effect on a 30% rate is negligible, but a reader who finds `TEST` tokens in our data and does not know we excluded them will assume we did not look.

7. **Dust dominates the count.** 31,931 unclaimed streams hold under one whole token; 9,931 of the 20,245 priceable third-party positions are worth under $1, totalling $1,433. Any "N thousand people left money behind" framing must say how much.

8. **The 2,050 near-identical clusters are genuine, not duplicates.** 2,050 (chain, token, recipient, deposit, endTime) tuples contain more than one stream (largest cluster: 63). These are distinct on-chain stream NFTs — projects issuing the same grant as multiple streams — not database artifacts. Worth pre-empting, since it looks like double counting.

9. **Prices are single-source.** Every price and liquidity figure is DexScreener only, taken at one moment on 2026-10-06. No second oracle, no time-averaging. A thin-pool price can move 50% in a day, and several headline tokens sit in thin pools. Volume figures expose the worst cases: TREE has a $1.4M pool but **$839 of 24h volume**; `likes` has a $184k pool and **$6**; EARNM has a $10.5k pool and **$0**.

10. **The age gradient is confounded.** Covered in §1 — it may be genuine drainage or a cohort effect from the 2024–25 airdrop wave. We cannot distinguish them here.

11. **Shape and airdrop-ness are confounded.** Covered in §4. The one-shot/linear gap is large and directionally consistent, but one-shot shapes were disproportionately chosen *by* airdrops.

12. **Small-chain DexScreener slugs are unverified.** The chain-ID-to-slug map was spot-checked for the large chains but not for XDC, Gnosis, Sei, Abstract, Morph, Superseed, Mode, HyperEVM or Sonic. If a slug is wrong, those tokens were silently treated as unpriceable. Combined, those nine chains hold 342 finished streams — immaterial to the totals, but it is a real gap.

13. **`sablier-flow` is out of scope.** Sablier Flow is a separate protocol with open-ended streams and no `endTime`, so "finished" is undefined for it. 373 rows exist in our cache. This report covers Sablier **Lockup** only, and should say so.

14. **The cache is unusable for this question.** 8.2% coverage, 64% of rows last refreshed in May 2026. Noted here because the 2026-09-24 baseline came from it and anyone re-running that query will get different numbers than this report.

---

## 7. NOT SAFE TO PUBLISH

Each of these is a number this analysis produced that should **not** appear in public, with the reason.

| Number | Why not |
|---|---|
| **"51% of finished Sablier streams go unclaimed"** | True as computed, but 61% of the numerator is one dead airdrop (GX). Publish 30.3% ex-GX instead. |
| **"$10.0M of unclaimed value"** | Includes $3.57M of treasury self-streams and marks sub-$1k-liquidity tokens at screen price. Use $2.6M–$6.2M. |
| **SERV, $2,824,900, largest unclaimed position** | `sender == recipient` — a project's own treasury lockup. Also 17% of SERV's market cap and 2x its pool. Not an unclaimed grant. |
| **"$9.73M across tokens with real liquidity"** | "Real liquidity" here means ≥$10k pool, which is not real liquidity. Still includes self-streams. |
| **ZFI, $89,257 across 1,254 streams** | Pool is $11,177, 24h volume $249, token market cap $109,801. The claim is 81% of the token's market cap. Unrealisable by any definition. |
| **`likes`, $68,480 (single Base stream)** | $184k pool but **$6 of 24h volume**. Priced but untradeable. |
| **EARNM, $68,975 across 6,597 streams** | $10.5k pool, **$0 24h volume**, and all 6,597 streams go to **one** address. Not 6,597 forgotten users. |
| **TREE, $128,925** | Usable in the top-15 table with its volume shown, but never as a standalone "someone left $129k behind" — the token trades $839/day, so the position cannot be exited. |
| **"Wallets holding more streams forget more"** | Ex-GX, every band from 1 to 200 streams sits at 20–39%. No relationship. The 201+ band is six distribution/test contracts. |
| **"81% of wallets with 2 streams leave them unclaimed"** | Pure GX artifact — that airdrop issued exactly 2 streams to 72,058 wallets. |
| **"The unclaimed rate falls with age, so people eventually claim"** | Confounded with the 2024–25 airdrop cohort. Publish the gradient as an observation, not an explanation. |
| **"One-shot unlocks cause 3.5x more abandonment"** | Association, not causation — one-shot shapes were disproportionately chosen by airdrops. Say "one-shot schedules are associated with…". |
| **3+ years band: 19.7% unclaimed** | n=238. Too small. |
| Rates for XDC, Gnosis, Sei, Abstract, Morph, Superseed, Mode, HyperEVM, Sonic, Unichain, Monad, Robinhood | Each under 100 finished streams. Report counts if needed, never percentages. |
| **Sum of top 15 = $2,432,421 described as recoverable** | Mark-to-market. Several positions exceed their token's pool depth; ALT's six entries share a $67k pool. |
| **Anything from `token_vesting_rollups`** | Last computed 2026-09-23 and contains known-bad prices (RAIN marked at $4.67B locked). Not used anywhere in this report; must not be used to patch a gap. |
| **The 2026-09-24 cache baseline (35,906 / 11,390 / 9,569 / 565 of 7,784)** | 8.2% non-random sample, 64% of rows ~4 months stale. Reproducible but not representative. |
| **"565 of 7,784 tokens with >$1M market cap are unclaimed"** | Derived from `token_vesting_rollups` market caps, which are known wrong. Not reproduced here; do not carry it forward. |
| **Any count of "people" or "users"** | Recipients are addresses. 1,046 of them are also senders (contracts/distributors), one is a Hardhat default account across 15 chains, and single addresses receive thousands of streams. Say "recipient addresses". |
| **"$X is sitting idle waiting to be claimed"** | For 87.2% of unclaimed streams the token has no market. "Idle value" implies recoverable value. It mostly is not. |

---

## Appendix — stream IDs for the top 15

Format is `{lockupContract}-{chainId}-{tokenId}`, resolvable at `app.sablier.com` and via the Envio endpoint.

| # | Token | Stream ID |
|---|---|---|
| 1 | VELVET | `0x6e0bad2c077d699841f1929b45bfb93fafbed395-56-441` |
| 2 | NKP | `0x7c01aa3783577e15fd7e272443d44b92d5b21056-1-4566` |
| 3 | AAA | `0xb5d78dd3276325f5faf3106cc4acc56e28e0fe3b-8453-2437` |
| 4 | NKP | `0x7c01aa3783577e15fd7e272443d44b92d5b21056-1-4567` |
| 5 | TIG | `0xb5d78dd3276325f5faf3106cc4acc56e28e0fe3b-8453-15205` |
| 6 | VERTAI | `0x3962f6585946823440d274ad7c719b02b49de51e-1-2658` |
| 7 | TREE | `0x7cc7e125d83a581ff438608490cc0f7bdff79127-1-582` |
| 8 | VIRTUAL | `0xafb979d9afad1ad27c5eff4e27226e3ab9e5dcc9-1-19663` |
| 9 | VERTAI | `0x3962f6585946823440d274ad7c719b02b49de51e-1-2659` |
| 10 | REI | `0xb5d78dd3276325f5faf3106cc4acc56e28e0fe3b-8453-5996` |
| 11 | FLUID | `0x3962f6585946823440d274ad7c719b02b49de51e-1-5525` |
| 12 | ALT | `0x6cd06aaf06506bc3ff382d83023354e2b80eed22-56-1059` |
| 13 | ALT | `0x6cd06aaf06506bc3ff382d83023354e2b80eed22-56-1196` |
| 14 | ALT | `0x6cd06aaf06506bc3ff382d83023354e2b80eed22-56-305` |
| 15 | TIG | `0x4cb16d4153123a74bc724d161050959754f378d8-8453-93847` |

Excluded by design, recorded for completeness: `0xf86b359035208e4529686a1825f2d5bee38c28a8-1-479` (SERV, $2,824,900, self-stream).
