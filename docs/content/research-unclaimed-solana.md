# Unclaimed token vesting on Solana — Smithii, Streamflow, Jupiter Lock

Research note. Measured **2026-10-06**. Covers the three Solana vesting protocols Vestream
indexes: Smithii, Streamflow and Jupiter Lock.

**Definitions used throughout.** A schedule is *finished* when its on-chain end time is more
than 30 days in the past. A finished schedule is *unclaimed* when the amount withdrawn is
less than 99% of the amount locked. The 1% tolerance means a schedule left with a dust
remainder counts as claimed, not unclaimed — that is deliberate and it makes every number
below a floor, not a ceiling.

**Method.** Nothing in the publishable section comes from the Vestream cache alone. Every
figure was re-read from Solana mainnet on 2026-10-06, either as a complete census of a
program's accounts or as a seeded random sample of them. The cache was used only to pick
what to look at, and the gap between what it said and what the chain said is itself one of
the findings (see "Numbers that are not safe to publish").

RPC: Alchemy (`SOLANA_RPC_URL`) for `getMultipleAccounts`; `api.mainnet-beta.solana.com` for
the two large `getProgramAccounts` enumerations, which Alchemy's free tier refuses with a
429 compute-units-per-second error.

---

## Headline

> Of 1,695 Smithii token-vesting schedules on Solana that finished more than 30 days ago,
> **1,029 (60.7%) have never been fully claimed, and 995 (58.7%) have not had a single token
> withdrawn.** Every one of those 1,029 vaults was read on-chain on 2026-10-06 and still
> holds the tokens.

The same measurement across the other two Solana protocols, taken from random samples of
their complete on-chain account sets:

| Protocol | Finished schedules measured | Unclaimed | Rate | 95% CI | Basis |
|---|---|---|---|---|---|
| **Smithii** | 1,695 | 1,029 | **60.7%** | — (census) | Every schedule on the program |
| **Streamflow** | 3,469 | 904 | **26.1%** | 24.6–27.5% | 6,000 of 72,215 accounts |
| **Jupiter Lock** | 5,751 | 165 | **2.9%** | 2.4–3.3% | 6,000 of 418,098 accounts |

Smithii has no sampling error because the measurement is a census. Streamflow and Jupiter
Lock are random samples of their full on-chain universes, so the confidence intervals are the
only uncertainty on the rate.

The spread across protocols is the most interesting thing in the data: the same
question — "did the recipient collect?" — answers differently by a factor of 21 depending on
which rail the tokens were locked in.

---

## Publishable, with evidence

### 1. Smithii: a census, not a sample

Program `vesFcnNXtfS9JMtspbe9SkMJiRiSPwsywuWMjYwxQ2K`.

A `getProgramAccounts` enumeration on 2026-10-06 (324-byte accounts carrying the schedule
discriminator) returned **2,090 schedule accounts**. Vestream holds 2,071 of them (99.1%).
The 19 absent accounts are all rejected by the adapter's timestamp-plausibility window, and
inspecting them on-chain confirms why: their end times are years 2099, 2125, 4000, 20100 and
similar. None could qualify as "finished", so their absence cannot move the rate.

Of the 2,071, **1,695** finished more than 30 days ago with a non-zero locked total.

Smithii publishes no Anchor IDL and the schedule account carries no claimed-amount field, so
"withdrawn" is derived as `total_amount − live vault balance`, where the vault is the
associated token account of `(mint, schedulePda)` with `allowOwnerOffCurve = true`
(`src/lib/vesting/adapters/smithii.ts`). That makes it a direct balance measurement rather
than a reading of an undocumented field.

**All 1,695 schedules and all 1,695 vaults were re-read on-chain on 2026-10-06:**

| Check | Result |
|---|---|
| Schedule accounts still present | 1,695 / 1,695 |
| On-chain `total_amount` matches the indexed value | 1,695 / 1,695 |
| On-chain end time matches the indexed value | 1,695 / 1,695 |
| On-chain mint decimals match the indexed value | 1,695 / 1,695 |
| Vault token account still present (not closed) | 1,695 / 1,695 |

That last row matters more than it looks. The derivation treats a missing vault as a zero
balance, i.e. fully withdrawn — so a closed vault would *understate* the unclaimed count.
None were closed, so the derivation never had to make that assumption on this dataset.

**Result:** 1,029 of 1,695 unclaimed (60.7%). 995 never touched, 34 partially claimed then
stopped, 666 fully claimed. Spread across **972 distinct recipient wallets** and **854
distinct mints**, so this is not one project's bookkeeping.

Eight of the 1,029 were verified individually end to end — schedule PDA, derived vault
address, live vault balance, beneficiary and mint all read from chain. Four examples:

| Schedule | Mint | Locked | Vault holds today | Days since end |
|---|---|---|---|---|
| `BoqvSdRBUMnGtpANo45q89snnh2qqMTdoNBxJCJL9K6D` | `7QkpSKZWwVkUg21WZ3gGiDMrgMT1msFSrvcDcsa4goWL` | 4,000,000,000 | 4,000,000,000 (100%) | 306 |
| `3L7WZucbE2cBA5STdcEQjpJLAJcS1yLD3aSazNTbrPtT` | `4qDPEweCECUH3vw3KEAsXpKY5JiqBBecKwtof3QYZd7z` | 1,653,319,275,000,000 | same (100%) | 615 |
| `14qo9VsDfQ9L8ESzS1g2EW9vbQ7xKn571r2EVRCS9RNT` | `FVqBRXuG2yWkSaYERLsE4tXJEJLhHqPSokfxxFoQSGPR` | 1,600,000,000 | same (100%) | 411 |
| `FYfWovfnN4wpAqatJdLe8rfWWAkkjMBbPmyCHxnNwcvs` | `9cRHiEwBMBGdP7Qvm3bhXzo7vu32Zz7bbRwm9TrPy4v` | 2,490 | same (100%) | 448 |

### 2. Smithii unclaimed by how long ago the schedule ended

| Time since the schedule ended | Finished schedules | Unclaimed | Rate | Never claimed anything |
|---|---|---|---|---|
| 30–90 days | 40 | 32 | **80.0%** | 30 |
| 90–365 days | 518 | 390 | **75.3%** | 369 |
| Over a year | 1,137 | 607 | **53.4%** | 596 |

The rate *falls* with age. That is the opposite of the intuitive reading and it is the honest
story: some recipients do eventually show up, just very late. It also means the headline 60.7%
is not an artefact of including recent schedules — the oldest cohort, where there has been a
full year or more to act, is still over half unclaimed.

### 3. Smithii unclaimed by size

By locked token quantity (decimals read from each mint account on-chain):

| Locked amount (token units) | Finished | Unclaimed | Rate |
|---|---|---|---|
| Under 1,000 | 144 | 101 | 70.1% |
| 1,000 – 1M | 287 | 171 | 59.6% |
| 1M – 1B | 1,184 | 704 | 59.5% |
| Over 1B | 80 | 53 | 66.3% |

Essentially flat. Size does not predict whether someone claims. A reader expecting "people
ignore dust and collect the big ones" does not get that from this data.

### 4. Streamflow: 26.1% protocol-wide

Program `strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m`, 1,104-byte `Contract` accounts.

On-chain enumeration on 2026-10-06: **72,215 contracts**, of which 33,685 (46.6%) carry
`closed = 1`.

Field offsets were taken from the SDK's own `BufferLayout` struct
(`@streamflow/stream/dist/esm/solana/index.js`) and cross-checked against the three offset
constants the SDK exports — `STREAM_STRUCT_OFFSET_RECIPIENT = 113`,
`STREAM_STRUCT_OFFSET_MINT = 177`, `STREAM_STRUCT_OFFSET_CLOSED = 671` — all three of which
the arithmetic reproduces exactly. The two fields that carry the finding are
`withdrawn_amount` at byte 17 and `net_amount_deposited` at byte 417.

A seeded random sample of **6,000 of the 72,215** contracts was read in full. All 6,000
decoded; 3,469 had finished more than 30 days ago with a non-zero deposit.

| | Count | Share of finished |
|---|---|---|
| Never claimed a token | 754 | 21.7% |
| Partially claimed, then stopped | 150 | 4.3% |
| Fully claimed | 2,565 | 73.9% |
| **Unclaimed (never + partial)** | **904** | **26.1%** (95% CI 24.6–27.5%) |

Scaled to the full account set: roughly **41,800 finished Streamflow contracts, about 10,900
of them unclaimed**. Count-based extrapolation is safe here because the sample is random and
the quantity is a proportion.

### 5. Jupiter Lock: 2.9% protocol-wide

Program `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`.

On-chain enumeration on 2026-10-06: **418,098 `VestingEscrow` accounts** — by count, by far
the largest vesting rail on Solana, and roughly 5.8x Streamflow.

A seeded random sample of **6,000 of the 418,098** was read in full. 5,751 had finished more
than 30 days ago with a non-zero total.

| | Count | Share of finished |
|---|---|---|
| Never claimed a token | 153 | 2.7% |
| Partially claimed, then stopped | 12 | 0.2% |
| Fully claimed | 5,586 | 97.1% |
| **Unclaimed** | **165** | **2.9%** (95% CI 2.4–3.3%) |

Scaled: about **11,500 unclaimed positions** across roughly 400,700 finished escrows. Note
that Jupiter Lock has more unclaimed positions than Streamflow in absolute terms while having
a ninth of the rate.

### 6. Do recipients claim some then stop, or never claim at all?

**Overwhelmingly, they never start.**

| Protocol | Unclaimed positions | Never claimed a single token | Partially claimed then stopped |
|---|---|---|---|
| Smithii | 1,029 | 995 (**96.7%**) | 34 (3.3%) |
| Streamflow | 904 | 754 (**83.4%**) | 150 (16.6%) |
| Jupiter Lock | 165 | 153 (**92.7%**) | 12 (7.3%) |

So this is not an attrition story — it is an absence story. The modal unclaimed position is a
vault that has never been touched at all.

The minority who *do* stop mid-way stop early, and they stop before the schedule ends rather
than after. Streamflow records `last_withdrawn_at` on the contract, which lets this be
measured directly: of the 150 partial claimers in the sample, **148 made their final
withdrawal before the schedule's end date**, a median of **59 days** before it (p25 24 days,
p75 149 days). They had reached a median of **48%** of their total when they stopped (p25 17%,
p75 67%).

Nor is it the same few wallets. Smithii's 1,029 unclaimed positions belong to 972 distinct
recipients; only 43 wallets hold more than one and the maximum is 7. And of the 1,029, only
**21** belong to a wallet that fully claimed a *different* Smithii schedule — so these are
not sophisticated holders selectively ignoring the dust.

### 7. What is it worth?

Prices from DexScreener (`api.dexscreener.com/tokens/v1/solana/...`) on 2026-10-06, taking
each mint's deepest pair; Jupiter's price API (`lite-api.jup.ag/price/v3`) as a fallback for
mints DexScreener has no pair for. Quantities are on-chain; decimals come from byte 44 of each
mint account, not from a token list.

**The gap is the story. Most of these tokens cannot be sold at any price.**

Smithii's 1,029 unclaimed positions span 854 distinct mints:

| | Mints | Positions |
|---|---|---|
| No price from DexScreener or Jupiter — no market at all | **706 (82.7%)** | 799 (77.6%) |
| Jupiter price only, no DexScreener pair | 111 | 173 |
| DexScreener pair exists | 37 | 57 |
| DexScreener pair with over $10k liquidity | 23 | 37 |

| Smithii unclaimed, valued | USD |
|---|---|
| Total across everything that returns any price | **$396,104** |
| …of which from mints with no DexScreener pair at all (Jupiter price only) | $297,192 |
| Total across mints with over $10k DexScreener liquidity | **$93,763** |
| …after removing 3 positions each worth more than 10% of their own pool | **$5,181** (34 positions) |

Three separate honest numbers, each an order of magnitude apart. The one worth quoting is the
middle one — **about $94,000** — with the note that $88,582 of it sits in three positions that
could not actually be sold at the quoted price. The largest is a BEEM position worth $76,384
against a pool holding $53,844 with $517 of daily volume: a mark, not a value.

Streamflow, for the 1,957 Vestream-indexed finished contracts re-read on-chain: **$30,704**
across anything priceable, **$16,830** across mints with over $10k liquidity. The largest is a
BONK position at $9,968 — and BONK has $421k of liquidity and $288k of daily volume, so that
one is genuinely realisable.

Jupiter Lock is where the money actually is, and it is concentrated: the 165 unclaimed
positions in the random sample carry **$76,110** in mints with over $10k liquidity, of which
**$55,720 is a single READY position** 21 months past its end date.

### 8. The ten largest unclaimed positions that can be priced with confidence

Criteria: a DexScreener pair with over $10k liquidity and non-trivial 24-hour volume. The
`pos/liq` column is the position's value as a percentage of the pool backing it — the honest
read on whether the number is realisable. Everything here was read from chain on 2026-10-06.

| # | Symbol | Mint | USD | Pool liquidity | 24h volume | pos/liq | Months since end | Recipient | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | BEEM | `BeemGmKYvz52af2myrx7xE82rE8ZvW9MgpvX8ikJQZNe` | $76,384 | $53,844 | $517 | 142% | 8.4 | `EgRdmEZC62qR1d9XvhQXqgv7e2HdQE5346ut2M2jbSnS` | Smithii (census) |
| 2 | READY | `HKJHsYJHMVK5VRyHHk5GhvzY9tBAAtPvDkZfDH6RLDTd` | $55,720 | $257,600 | $54,210 | 22% | 21.2 | `6fBxCMuFgg3pLN9RT47VhAF7b7j7trtD54Da5JUJikXX` | Jupiter Lock (sample) |
| 3 | JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` | $14,768 | $846,766 | $3,098,014 | 1.7% | 7.2 | `HyWzRnaWEwWHW5Rx5jERTNb59oPRHcGAukErexPHe54n` | Jupiter Lock (sample) |
| 4 | FYM | `GY15RsMaKYaoD2PJrTCsJ5CV4yJNnN79czKgYK3zpump` | $10,700 | $24,366 | $162 | 44% | 4.2 | `3Fc7kQ6dEvyNUfrfabWM3RaU8a6wXZ29AtpPQXrfZQot` | Smithii (census) |
| 5 | BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | $9,976 | $421,563 | $288,254 | 2.4% | 28.4 | `4e5vGbNFYrjMCUcjtiAu8GJpyDr2FMGwV3EG3Q6poDHG` | Streamflow (sample) |
| 6 | BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | $9,968 | $421,386 | $288,430 | 2.4% | 28.6 | `GhsDcyTokpvbrZGidLCXwCKf89ADpwA1mcW4SopZjS9d` | Streamflow (indexed) |
| 7 | SPSC | `4nswj3o1Lo9iWYvvRJxUD8vbCy9ay7QQoXYcncHNbonk` | $7,159 | $112,623 | $10,437 | 6.4% | 1.2 | `CTCXWoGtFUAjLqhH2rzvV8Zk7QjGNbiwkLjxQhr9KDRR` | Streamflow (sample) |
| 8 | BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | $4,997 | $421,386 | $288,430 | 1.2% | 28.4 | `C2awme8teGPax9Ux2L8ge3tgjfY7LgDFEXydn6W8rjTJ` | Streamflow (indexed) |
| 9 | WEN | `WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk` | $3,844 | $72,061 | $10,324 | 5.3% | 1.2 | `GNeiiy4PChWKxPt9nQLP6jxv2gjQTFGRjioQUBFeKeAY` | Streamflow (sample) |
| 10 | WAGMI | `GnM6XZ7DN9KSPW2ZVMNqCggsxjnxHMGb2t4kiWrUpump` | $1,917 | $88,506 | $5,401 | 2.2% | 6.8 | `42LtWASDHcvTV9hgzzC5KVr3KEsWeoVizXnWkubwVXNP` | Smithii (census) |

Rows 1 and 4 should carry the pool caveat whenever they are quoted. Rows 3, 5, 6, 8, 9 are in
tokens deep enough that the mark is close to a real exit.

### 9. Smithii unclaimed value by age

| Time since end | Unclaimed positions | Priced at all | Mints over $10k liquidity |
|---|---|---|---|
| 30–90 days | 32 | $2,990 | $807 |
| 90–365 days | 390 | $231,700 | $90,804 |
| Over a year | 607 | $161,413 | $2,152 |

Almost all of the liquid value is in the 90–365 day band. Tokens abandoned for more than a
year are, with one or two exceptions, in markets that no longer exist.

---

## Numbers that are NOT safe to publish, and why

### A. "Streamflow is 96–98% unclaimed" — wrong, by a factor of nearly four

The Vestream cache, read as-is, says 5,219 of 5,325 finished Streamflow contracts (98.0%) are
unclaimed. Re-reading every one of those same contracts on-chain on 2026-10-06 gives
**1,957 (36.8%)**. **3,259 rows — 62% of the cache's "unclaimed" set — are stale: the chain
says they are fully claimed.**

Two mechanisms, and they compound:

1. **The adapter never re-reads a closed stream.** `src/lib/vesting/adapters/streamflow.ts`
   contains `if (stream.closed) continue;`. Of the 5,325 finished contracts in the cache,
   3,313 now carry `closed = 1` on-chain, and **3,272 of those (98.8%) are fully claimed**.
   Streamflow closes a contract when it is drained, so the filter removes precisely the
   claimed population — and because the row was already written, it does not get deleted, it
   gets *frozen* at whatever its last pre-claim snapshot said. The row becomes permanently
   unfixable by the normal refresh path.
2. **Snapshots that predate the schedule's own end.** 2,933 of the 5,227 cached "unclaimed"
   rows (56%) have a `last_refreshed_at` earlier than their own `end_time`. They are
   mathematically incapable of reflecting a claim made after the schedule finished.

Both were caught by sampling five finished contracts and reading them on-chain. Two of the five
were wrong, and in the same way:

| Contract | Cache says withdrawn | Chain says withdrawn | Locked | `closed` | Cache refreshed | Schedule ended |
|---|---|---|---|---|---|---|
| `HN6msN4dhQ69z95JzCvipLAx5adeCWEhCmcsZhZYheW3` | 0 | 10,054,849,652,878 (100%) | 10,054,849,652,878 | 1 | 2026-06-28 | 2026-06-29 |
| `2FMthodLRqouuoe5SEcW36GpyXtoMTtoeBdnR2fkJsFw` | 0 | 87,802,159,705,214 (100%) | 87,802,159,705,214 | 1 | 2026-06-26 | 2026-06-30 |

In both cases the recipient claimed everything within hours of the schedule ending, the
contract closed, and the cache row froze a day or two before that happened.

Across all 10,722 cached Streamflow rows re-read on-chain: mint matched 10,722/10,722, end time
10,513/10,722, deposited amount 10,676/10,722 — but **withdrawn amount matched only
6,556/10,722 (61%)**. The decoding is right; the freshness is not.

**Verdict: UNRELIABLE as cached, FIXABLE by re-reading.** The fix is to drop the `closed`
filter for cache-refresh purposes (keep it for the user-facing active-positions view) so a
drained stream gets its final state written once, and to re-read any row whose `end_time` is
later than its `last_refreshed_at`. Both are cheap. The re-read performed for this note took
108 `getMultipleAccounts` calls, a few minutes of wall-clock.

The 36.8% figure is correct for the 5,325 contracts Vestream indexes, but **that population is
only 14.8% of the 72,215 Streamflow contracts on-chain and was not randomly selected** — the
seeder discovers recipients in `getProgramAccounts` return order, capped at 200–500 per run. So
the protocol-wide figure to publish is the **26.1%** from the random sample in section 4, not
36.8%, and certainly not 98%.

### B. "Jupiter Lock is 1.3% unclaimed" — accurate for what it measures, but not protocol-wide

Two separate questions, two separate answers.

**Is the June data still true?** Yes, remarkably so. 4,000 randomly chosen cached Jupiter Lock
rows were re-read on-chain: 3,999 decoded, and of those, mint matched 3,999/3,999, locked total
3,999/3,999, claimed amount 3,998/3,999, end time 3,991/3,999. The cached unclaimed rate for
that sample is 1.65%; the on-chain rate today is 1.63%. **Exactly one row drifted in four
months.**

There is a structural reason, and it is the mirror image of Streamflow's problem. Jupiter Lock
does not close the escrow account on a full claim — `total_claimed_amount` stays readable
forever. Once a schedule has ended and been drained, its state is terminal, so a June snapshot
of a schedule that ended before June is still correct in October. Against the 2,071-row
Smithii dataset and the 10,722-row Streamflow dataset, this is the one protocol where staleness
genuinely does not bite.

**Can it support a claim about Jupiter Lock as a protocol?** No. The cache holds 60,079 of
**418,098** escrow accounts — **14.4% coverage**, and non-random for the same seeder-ordering
reason as Streamflow. The random sample of the full universe gives **2.87%** against the
cache's 1.63%: the indexed population is roughly 1.8x more claimed than the protocol as a
whole, which is what you would expect if discovery favoured large, well-administered
distributions.

So: 1.63% is publishable only as "of the 60,079 Jupiter Lock escrows Vestream indexes".
**2.87% (95% CI 2.44–3.30%)** is the protocol-wide figure.

**Cost of a full refresh.** Enumerating all 418,098 escrow pubkeys took one
`getProgramAccounts` call and 24 seconds against `api.mainnet-beta.solana.com`; Alchemy's free
tier refuses that call with a 429. Reading the bodies is 4,181 `getMultipleAccounts` calls at
100 accounts each. Measured throughput with free-tier backoff was roughly 60 calls per minute,
so **about 70 minutes of wall-clock for the full 418k**, or **about 10 minutes for the 60,079
already cached** (601 calls). Both are inside a cron budget if chunked; neither fits in a
single 300-second serverless invocation, so this needs a resumable walker, not a one-shot
route.

### C. Extrapolated dollar totals

The count-based extrapolations in sections 4 and 5 are sound. The **dollar** extrapolations are
not, and should not be published:

- Streamflow: $22,322 of liquid value in the 6,000-account sample × 12.04 ≈ **$269k**
  protocol-wide.
- Jupiter Lock: $76,110 × 69.68 ≈ **$5.3M** protocol-wide.

Both are near-worthless as estimates because the distribution is extremely heavy-tailed. A
single READY position is 73% of Jupiter Lock's entire sampled value; scaling it by 69.68
implies $3.9M from one observation. Publish the sampled values as "observed in a random sample
of N" or not at all.

### D. Other things a reader could legitimately attack

**Price sources disagree, and the gap is enormous.** 111 Smithii mints have a Jupiter price but
no DexScreener pair whatsoever, and they account for $297,192 of the $396,104 "total". Jupiter
quotes a routable price without evidence of depth. Any single headline figure that includes
them is indefensible — hence reporting the three tiers separately.

**Dead mints.** 706 of 854 Smithii mints behind unclaimed positions (82.7%) return no price
from either source. None has a zero on-chain supply, so they are not burned — they simply have
no market. This is the dominant fact about Smithii's unclaimed tail and it should be stated up
front rather than buried, because the alternative is a reader discovering it and discarding the
whole piece.

**Decimals.** Read from byte 44 of each mint account on-chain, never from a token list, which
matters because most mints here are unlisted. Distribution across the 854 unclaimed Smithii
mints: 505 at 6 dp, 322 at 9 dp, 27 at other values (1–8). All 1,695 agreed with the indexed
value. If this had been wrong, every USD figure would be wrong by a power of ten.

**Closed token accounts.** Addressed for Smithii — all 1,695 vaults still exist, so the
`total − balance` derivation never had to guess. For Streamflow, 46.6% of all contracts on-chain
carry `closed = 1`; treating `closed` as "historical, ignore" is exactly what produced finding
A, so any future analysis must read closed contracts rather than skip them.

**Topups move the denominator.** Streamflow allows a sender to top up a live stream, which
changes both `net_amount_deposited` and `end_time`. 46 of 10,722 cached rows now have a
different deposited amount on-chain and 209 a different end time. Small, but it means
"total locked" is not immutable for this protocol and a historical snapshot can legitimately
disagree with the chain without anything being broken.

**Seven Smithii vaults hold more than the schedule's stated total**, and three positions have a
locked total exceeding the mint's current circulating supply. Anyone can send tokens to a vault
ATA, and supply can be burned after the fact. These do not affect the unclaimed classification
(all seven have withdrawn = 0 either way) but they should not be presented as clean
accounting.

**Smithii's Merkle mode blurs what "a position" means.** 319 of the 1,695 finished schedules
have a non-zero Merkle root, meaning one schedule PDA can fund many claimants, so the
beneficiary field at offset 8 is not necessarily the only person entitled. The headline survives
the split cleanly — direct schedules are 60.1% unclaimed (827 of 1,376), Merkle schedules 63.3%
(202 of 319) — so the caveat is worth stating but does not threaten the number. Phrase Smithii
counts as "schedules", not "wallets".

**The `recipient` column is lowercased for Solana rows.** `vesting_streams_cache.recipient`
holds `7pne2sqsh3hwqoq3p2acwwxvwqfqkahbotv1gpwkhh7d` where `stream_data->>'recipient'` holds the
correct `7pnE2Sqsh3hwqoQ3P2acWwxvWqFqKahbotV1GpwKhH7D`. Base58 is case-sensitive, so the column
value is not a valid Solana address. Amounts are unaffected — but any per-wallet join or lookup
on that column silently returns nothing, and every recipient quoted in this note was taken from
the JSON field, not the column. This is worth fixing in the schema independently of this
research.

**Sampling seed.** The Streamflow and Jupiter Lock samples use a fixed linear-congruential
shuffle seeded with `20261006`, so both are reproducible. They are not cryptographically random;
for a proportion estimate over an arbitrarily ordered account list that is adequate, but it is a
stated limitation rather than a hidden one.

**The 30-day buffer and the 99% threshold** are both choices. A 7-day buffer would raise every
rate (recent schedules are the least claimed — see section 2); a 95% threshold would lower them.
Neither is wrong, but the numbers are not threshold-free and the definitions must travel with
them.

---

## Reproducing this

- Smithii adapter and vault derivation: `src/lib/vesting/adapters/smithii.ts`
- Streamflow adapter (and the `closed` filter behind finding A):
  `src/lib/vesting/adapters/streamflow.ts`
- Jupiter Lock adapter and bulk walker: `src/lib/vesting/adapters/jupiter-lock.ts`
- Streamflow struct offsets: `@streamflow/stream/dist/esm/solana/index.js`, the
  `streamLayout` `BufferLayout.struct`, and the exported `STREAM_STRUCT_OFFSET_*` constants
- Indexed rows: `vesting_streams_cache` where `chain_id = 101`

All on-chain reads for this note were plain `getProgramAccounts` and `getMultipleAccounts`
against Solana mainnet. No application code was changed.
