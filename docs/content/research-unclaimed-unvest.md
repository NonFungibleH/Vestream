# Unclaimed finished vesting: Unvest (EVM)

**Vestream original research, Unvest half.**
Measured on **2026-10-06**, with subgraph heads at 20:22–20:53 UTC. "Finished" means the vesting token's last milestone is before **2026-09-06 00:00 UTC**, so it fully unlocked 30 or more days ago.
Chains: Ethereum, BNB Chain, Polygon, Base and Arbitrum. Testnets are excluded.

---

## 0. Graphic block (publishable numbers)

Every figure below is measured on the **full universe**: every Unvest holder balance on all five chains. None of it comes from `vesting_streams_cache`. "Third-party" means the test tokens and the project-holds-to-itself positions have been removed (§5).

### 1. Finished positions and unclaimed rate

| Scope | Finished holder positions | Unclaimed (>1% of the holder's total still held) | Rate |
|---|---|---|---|
| **All tokens** | **35,278** | **30,709** | **87.0%** |
| **Tokens that still trade** (pool ≥ $10k) | **7,320** | **5,462** | **74.6%** |
| Tokens that still trade, *excluding the two SuperVerse airdrops (CAH, CHAMP)* | 447 | 102 | 22.8% |

The 74.6% is not safe to publish without the third row. Two airdrop distributions make up 98% of it (see §1).

### 2. Never-touched share of unclaimed

| Scope | Never claimed a single token | Share of unclaimed |
|---|---|---|
| **All tokens** | **23,931** | **77.9%** |
| Tokens that still trade | 5,135 | 94.0% (airdrop-driven, same caveat) |
| Tokens that still trade, ex CAH/CHAMP | 82 | 80.4% |

A stricter definition, "no claim *and* never transferred the wrapper out", gives 23,893 (77.8%). The two are almost identical. The rest of the unclaimed positions (**6,778, 22.1%**) claimed some of their tokens and then stopped.

### 3. Value of unclaimed tokens that still trade (pool ≥ $10k)

| Basis | Value |
|---|---|
| Mark-to-market | **$52,691** |
| Capped at each token's deepest same-chain pool | **$52,691** (no single token's total is larger than its pool) |

**Headline: "about $50,000", and only with the caveat that 63% of it is one illiquid token.** The capped and uncapped figures are identical, so the cap does not help here. It hides how illiquid the money is. ASX alone is $33,391 against a $37,630 pool that trades about $62 a day. If you apply the stricter "real market" test used on Sablier (pool ≥ $100k **and** 24h volume ≥ $10k), the only tokens that pass are USDC/USDT dust, worth about **$6**. **For Unvest, lead with the rate and do not lead with a dollar figure.**

### 4. Value ladder: tokens that still trade, third-party only (n = 5,462)

| Unclaimed value | Positions | Total |
|---|---|---|
| **over $100,000** | **0** | $0 |
| **over $10,000** | **1** | $18,272 |
| **over $1,000** (includes the one above) | **7** | $43,039 |
| **under $1,000** | **5,455** | $9,652 |
| of which **under $1** | **4,056** | $1,633 |

The 5,462 positions belong to 3,254 wallets. Banded, the middle two rows are 1 position at $10k–$100k and 6 at $1k–$10k. **74% of the positions in tokens that still trade are worth under $1.** Seven positions hold 82% of the value.

### 5. Oldest and largest

**Oldest unclaimed position in a token that still trades:** **RNS on Ethereum. It fully unlocked 2023-08-09, 37.9 months ago.** Three recipients of the `"RNS-VEST"` vesting token each still hold 5.55B RNS (about $149 each) and have never claimed. Caveat: the RNS pool is $28,140, but the token traded $10 in the last 24h and its market cap is about $20,700.
*Oldest position that is material (≥ $1,000):* a GEMPAD-GNUS investor allocation on Ethereum. It unlocked 2024-09-01, **25.1 months ago**, holds 2,790 GNUS (**$4,492**) and has never been claimed.

**Largest single position:**

| | |
|---|---|
| Value | **$18,272** |
| Token / chain | **ASX on BNB Chain** (`0xebd3619642d78f0c98c84f6fa9a678653fb5a99b`), "Private Round" vesting token `0x894f99aec0c6b6584a92110c28bacdc4140b9309` |
| Tokens left | 237,263 ASX @ $0.07701 |
| Months since full unlock | **8.6** (unlocked 2026-01-19, after a 2-year linear schedule) |
| State | Partial. The holder claimed 88.1% (1.76M of 2.0M) and last claimed on 2025-10-24, three months before the schedule ended |
| Pool liquidity | **$37,630** (PancakeSwap ASX/BTCB), 24h volume $62, market cap ~$631k |
| Recipient | `0xf672883f67c7057b26b57961bfc18a6f9b905882` (an EOA) |

**Pool-depth caveat (required):** this position is **48.6% of the token's deepest pool**, well above the 10% threshold. All five unclaimed ASX positions together are 88.7% of the pool. Selling it would move the price a lot, so the $18,272 is a screen price only.

### 6. On-chain verification of the top 10

For each position I checked four things with `eth_call` at `latest`:

- **(a)** `VestedERC20.balanceOf(holder)` equals the subgraph `balance`.
- **(b)** `underlying.balanceOf(vestingToken)` is at least the sum of *all* holder balances of that vesting token, so the claimable underlying is really there.
- **(c)** A simulated `claim()` from the holder succeeds. The simulation sends the vesting token's on-chain `claimFeeData()` fee where it exists and overrides the holder's native balance.
- **(d)** Whether the holder is a contract.

| # | Token | Chain | Value | Holder | (a) wrapper balance | (b) collateral | (c) claim() sim | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | ASX | BNB | $18,272 | `0xf672…5882` EOA | exact | 433,593 held = 433,593 owed | ok | **PASS** |
| 2 | ASX | BNB | $8,453 | `0xda32…302a` EOA | exact | same token, exact | ok | **PASS** |
| 3 | GNUS | ETH | $4,492 | `0x244c…d836` EOA | exact | 6,194.47 held = 6,194.47 owed | ok | **PASS** |
| 4 | ASX | BNB | $4,275 | `0x7c7d…629f` EOA | exact | exact | ok | **PASS** |
| 5 | GNUS | ETH | $3,735 | `0x3fda…b3b3` EOA | exact | exact | ok | **PASS** |
| 6 | ASX | BNB | $2,121 | `0x9388…be22` EOA | exact | exact | ok | **PASS** |
| 7 | GNUS | ETH | $1,691 | `0x66e7…51bd` EOA | exact | 1,050 held = 1,050 owed | ok (with 0.0004 ETH fee) | **PASS** |
| 8 | GNUS | ETH | $934 | `0x8260…7dffe` EOA | exact | exact | ok | **PASS** |
| 9 | GNUS | ETH | $374 | `0xf51f…66e2` EOA | exact | exact | ok | **PASS** |
| 10 | GNUS | ETH | $367 | `0xf0b4…98de` EOA | exact | exact | ok | **PASS** |

**10 of 10 pass.** Every wrapper balance matches to the wei, every vesting token holds exactly what it owes, and every holder could claim today. Full addresses are in the appendix.

---

## 1. Concentration: read this before publishing anything

Concentration on Unvest affects different numbers than it did on Sablier.

**The all-token rate is robust.** One token dominates the count, but removing it barely changes the rate:

| Scope | Finished | Unclaimed | Rate |
|---|---|---|---|
| Everything | 35,278 | 30,709 | 87.0% |
| Excluding PYME (largest token) | 24,822 | 20,547 | 82.8% |
| Excluding the top 3 tokens | 17,885 | 14,693 | 82.2% |
| Excluding the top 5 tokens | 11,012 | 9,333 | 84.8% |

- **PYME on Ethereum** (PymeDAO "Community Growth", `vPYME`) accounts for **10,162 of 30,709 unclaimed positions (33.1%)**. It went to 9,297 recipients and has a 97.2% unclaimed rate. **It has no DEX pair anywhere and is worth $0.** The top 5 tokens (PYME, LEGION, NOBL, CAH, CHAMP) are 69.6% of the unclaimed count, and the top 10 are 94.3%. Even so, the rate stays at 82–85% however many top tokens you remove, so **"more than 4 in 5" is a defensible Unvest headline.**

**The "tokens that still trade" rate is NOT robust.** It is two airdrops:

- **CAH on Ethereum** (`SUPER x CAH vesting`): 3,613 recipients, 2,784 unclaimed. There are only 4 distinct allocation sizes and the median is 0.87 CAH (**about $0.35**).
- **CHAMP on Base** (`SUPER x CHAMP vesting`): 3,260 recipients, 2,576 unclaimed. Median 505 CHAMP (**about $0.26**).
- Together they are **5,360 of the 5,462** trading-token unclaimed positions (**98%**). Without them, the trading-token universe is 447 finished positions, of which 102 are unclaimed (**22.8%**).
- **Mechanism worth publishing:** Unvest charges a flat native-token claim fee. It is 0.0012 ETH (~$3.24) on SUPER_CAH and 0.0004 ETH (~$1.08) on SUPER_CHAMP, read on-chain from `claimFeeData()`, with ETH at $2,696. **4,736 of the 5,360 airdrop positions (88%) are worth less than today's claim fee, before gas.** Leaving them unclaimed is the rational choice. Supporting evidence: the 829 SUPER_CAH recipients who emptied their position (claimed or moved it) had a median allocation of 3.49 CAH, four times the overall median of 0.87. Caveat: this compares *today's* token price with *today's* fee. At unlock (Dec 2024 / Jan 2025) prices may have been different.

**The value is two tokens:**

- **ASX on BNB Chain: $33,391 (63.4% of the $52,691).** It is 5 positions from a single 5-recipient "Private Round" vesting token. All five recipients claimed between 44% and 96% and then stopped. The pool is $37,630 with $62 of daily volume.
- **GNUS on Ethereum: $11,715 (22.2%).** 8 positions across three vesting tokens, mostly a Gempad launchpad investor allocation.
- ASX and GNUS together are **85.6%** of the value. Everything else that still trades is $7,585, and $6,702 of that is the CAH/CHAMP airdrop dust.

**The treasury trap (the Sablier SERV case again), excluded:**

- **GNUS-FOUNDER on Ethereum, $32,200** (20,000 GNUS, never claimed, unlocked 2025-05-18). It would have been the **#1 position and 38% of the headline**. The holder `0x1d2c163fbda9486c3a384b6fa5e34c96fe948e9a` is a **2-of-2 Safe whose owners include `0xe8dfa9c13cab87e38991961d51fa391aabb8ca9c`, the address that deployed this vesting token.** The project is holding its founder allocation in its own multisig. It is excluded, and §5 shows how it was caught.
- **AICZ-DEVFUND on BNB Chain, $2,929**, held by the vesting token's own deployer. Also excluded.
- If both were included, the total would be $87.8k instead of $52.7k. **Do not use the larger number.**

---

## 2. Rates in detail

### Outcome of every finished third-party position

| Outcome | Positions | Share |
|---|---|---|
| Never claimed, >1% still held | 23,931 | 67.8% |
| Claimed some, then stopped with >1% left | 6,778 | 19.2% |
| Claimed down to ≤1% | 4,177 | 11.8% |
| Moved the wrapper out without claiming, ≤1% left (sold or transferred) | 392 | 1.1% |
| **Total** | **35,278** | |

There are 26,553 distinct recipient wallets, and 24,551 of them hold at least one unclaimed finished position.

### By market status of the underlying token

| Underlying market | Unclaimed positions | Share of unclaimed |
|---|---|---|
| No DEX pair on any chain we could find | 19,393 | 63.2% |
| Has a pair, but the pool is < $10k | 5,854 | 19.1% |
| Still trades (pool ≥ $10k) | 5,462 | 17.8% |

105 distinct underlying tokens hold unclaimed finished positions. **Only 14 have any DEX pair on their own chain, and only 12 have a pool ≥ $10k.** About **4 in 5 unclaimed Unvest positions are in tokens that no longer have a usable market.** This matches the Sablier finding.

### By chain

| Chain | Finished | Unclaimed | Rate | Never claimed | Trading finished / unclaimed |
|---|---|---|---|---|---|
| Ethereum | 22,143 | 19,681 | 88.9% | 14,951 | 3,659 / 2,801 |
| Arbitrum | 5,269 | 4,488 | 85.2% | 2,967 | 1 / 1 |
| Base | 4,999 | 4,247 | 85.0% | 3,867 | 3,266 / 2,576 |
| BNB Chain | 2,419 | 1,984 | 82.0% | 1,917 | 393 / 83 |
| Polygon | 448 | 309 | 69.0% | 229 | 1 / 1 |

BNB Chain includes 15 finished third-party positions that were recovered on-chain from the unindexed v3.1 factory (§4). 8 of them are unclaimed.

### By time since full unlock

| Since full unlock | Finished | Unclaimed | Rate | Never claimed |
|---|---|---|---|---|
| 1–3 months | 1,023 | 1,014 | 99.1% | 1,012 |
| 3–12 months | 6,016 | 5,896 | 98.0% | 5,241 |
| 1–2 years | 10,791 | 9,070 | 84.1% | 7,834 |
| 2–3 years | 14,562 | 12,555 | 86.2% | 7,850 |
| 3+ years | 2,886 | 2,174 | 75.3% | 1,994 |

**Do not publish this as "people claim eventually".** The cohorts are dominated by single distributions: PYME, NOBL and BUSSY sit in specific bands. The rate is above 75% in every band.

---

## 3. Numbers NOT safe to publish, and why

| Number | Why not |
|---|---|
| **74.6% unclaimed among tokens that still trade** | 98% of it is the CAH and CHAMP SuperVerse airdrops, where the median position is worth less than the claim fee. Without them the rate is **22.8%** (102/447). Publish both or neither. |
| **94% never-touched among tokens that still trade** | Same two airdrops. |
| **$93,278 "all priced"** | Includes LEGION marked at $29,664 against a **$30** pool and NOBL marked at $10,923 against a **$39** pool. Those are screen prices on dead tokens. |
| **$87.8k** (value including excluded holders) | Includes a $32,200 founder allocation held in a Safe co-owned by the vesting token's own deployer, plus a $2,929 dev fund held by its deployer. |
| **$52,691 as "money people left behind"** | 63% of it is one 5-wallet private round in ASX, which trades $62 a day against a $37.6k pool. Under a real-market filter (pool ≥ $100k and 24h volume ≥ $10k) the value is about **$6**. |
| **Largest position ($18,272) as a realisable amount** | It is 48.6% of the deepest pool. This is a screen price only. |
| **"Oldest" ($149 RNS, 37.9 months) as a meaningful sum** | RNS market cap is ~$20.7k and 24h volume is $10. Use it for the duration, not the dollars. |
| **Age gradient** | It is a cohort effect of a few large distributions, not behaviour over time. |
| **Any "all of Unvest" claim** | Avalanche has a live Unvest subgraph with 3,176 recipient rows (425 with a balance) that is outside this scope and outside the app's adapter. Say "on Ethereum, BNB Chain, Polygon, Base and Arbitrum". |
| **Anything from `vesting_streams_cache`** | The cache only covers wallets we have looked up and is stale. Its Unvest rate was ~83% (15,816/19,009 in the protocol-trust audit), against 87.0% here. They are close, but the cache is not a population. |
| **Non-recipient holders** | 1,643 finished rows hold the transferable wrapper without having been distribution recipients (DEX pairs, buyers, burn addresses). They are excluded from the headline. Including them adds 993 unclaimed rows but only $12 of trading value, so it does not change the story. |

---

## 4. Method and completeness

### Source

The source is Unvest's own subgraphs on The Graph gateway. They are the same subgraph IDs that `src/lib/vesting/adapters/unvest.ts` and `src/lib/vesting/tvl-walker/unvest.ts` use, and the same IDs hard-coded in **Unvest's own app bundle** (app.unvest.io):

| Chain | Subgraph ID | Head at measurement | Indexing errors |
|---|---|---|---|
| Ethereum | `HR7owbk45vXNgf8XXyDd7fRLuVo6QGYY6XbGjRCPgUuD` | 2026-10-06 20:52 UTC | none |
| BNB Chain | `5RiFDxL1mDFdSojrC7tRkVXqiiQgysf77iC7c1KK5CAp` | 20:53 UTC | none |
| Polygon | `7EwmQS7MyeY9BZC5xeAr25WgjcgbRNpAY95dZNBvqgja` | 20:53 UTC | none |
| Base | `8DdThKxMS2LxEtyDCdwqtecwRu4qD8GbE77n3ANvkN2M` | 20:52 UTC | none |
| Arbitrum | `9soNvLk5RWaJ3HtgJSsr9m5Nafo985kNyrArPM7iopUV` | 20:22 UTC (30 min behind) | none |

I enumerated **every** `holderBalances` and `vestingTokens` row on each chain with an `id_gt` cursor (1,000 per page) and no filters. That gave 38,237 holder rows and 865 vesting tokens. The query is not filtered on `isRecipient`, so I could see who is a recipient and who is not.

### Completeness check: factory nonce reconciliation

Unvest deploys every vesting token from one of three factories, using CREATE2 minimal proxies. A contract's nonce is 1 plus the number of contracts it has created, so `eth_getTransactionCount(factory) - 1` is an exact on-chain count of vesting tokens:

| Chain | v2 factory `0x1b76…93c3` | v3 factory `0xee89…3c6f` | v3.1 factory `0x934f…e4` |
|---|---|---|---|
| Ethereum | 108 / 108 | 50 / 50 | 137 / 137 |
| BNB Chain | 72 / 72 | 18 / 18 | **0 / 145** |
| Polygon | 137 / 137 | 28 / 28 | 95 / 95 |
| Base | (not deployed) | 20 / 20 | 141 / 141 |
| Arbitrum | 39 / 39 | 2 / 2 | 18 / 18 |

(subgraph count / on-chain count)

Every factory reconciles exactly except one. **The BNB Chain subgraph does not index the v3.1 factory at all**, so 145 vesting tokens deployed since July 2024 are missing. The older BSC subgraph (`8KmWBx…`) is gone ("no allocations"). This gap is not ours alone: the Vestream adapter and Unvest's own app both use this subgraph.

**I recovered all of them from the chain:**

- **Vesting token addresses.** `eth_getLogs` for the factory's creation event (topic `0x9020e4ab…`, underlying in topic1, vesting token in data) over blocks 40,000,000 to 126,129,194, in 10k-block windows on `rpc.sentio.xyz/bsc`. bsc-dataseed and publicnode refuse historical `getLogs`. **145 events, equal to nonce − 1.**
- **Metadata.** `name`, `symbol`, `decimals`, `underlyingToken()` and `milestones()` read from each token. The underlying matches the event for 145/145.
- **Holders.** Every `Transfer` log emitted by the 145 tokens over the same range. The log is complete: **mints − burns = on-chain `totalSupply` for 145/145 tokens.**
- **Positions.** For each of the 154 (token, holder) pairs I read `balanceOf`, `claimedBalanceOf` and `claimableBalanceOf` on-chain. Log-derived balance equals on-chain balance for 154/154, and `claimedBalanceOf` equals burned for 154/154.
- **Contribution.** 147 recipient rows, 61 finished, but only **15 finished third-party positions** (most are test tokens or held by the deployer). 8 are unclaimed. The headline does not change, but the enumeration is now provably complete.

### Data integrity

- **Accounting identity.** `allocation + transferredIn − transferredOut − claimed = balance` holds for **38,391 / 38,391** rows.
- **Random spot check.** I took 40 random finished third-party positions per chain (200 total) and compared `VestedERC20.balanceOf(holder)` on-chain with the subgraph `balance`. **200/200 match exactly.** The earlier 39/40 audit result therefore holds on the full universe.
- **Collateral.** For **all 238** vesting tokens that have an unclaimed finished position, `underlying.balanceOf(vestingToken)` is at least the sum of every holder's balance. **238/238 are fully backed.** No unclaimed position counted here is an IOU on an empty contract.
- **Schedules.** Every vesting token has milestones, every final milestone is 100%, and vesting-token decimals equal underlying decimals for every token. The wrapper is redeemed 1:1 by `claim()`, which burns the wrapper and transfers the underlying (confirmed from claim receipts).

### Wrapper vs underlying (no double count)

- The value of a position is `holder's VestedERC20 balance × underlying price`.
- The underlying held *by* the vesting token contract is never counted separately, so the wrapper and the backing are never counted twice.
- The vesting token's own DEX pairs (some wrappers trade) are not used for pricing.
- Three wrappers wrap *another* Unvest vesting token: "Champ" and "SUPER Champ" on Base, and "a55" on BSC v3.1. Their "underlying" has no DEX pair, so they are priced at $0. A vesting token that holds another vesting token is also excluded as a holder, so the chain of wrappers cannot be double counted.

### Definitions

These match the Sablier research.

| Term | Definition |
|---|---|
| **position** | one `HolderBalance` row (holder × vesting token) where `isRecipient = true`, i.e. the holder received a distribution (mint) |
| **finished** | the vesting token's last milestone timestamp < 2026-09-06 00:00 UTC, so 100% of the position was claimable 30+ days ago |
| **holder's total** | `allocation + transferredIn` |
| **unclaimed** | `balance > 1%` of the holder's total. For a finished token the whole wrapper balance is claimable underlying |
| **never touched** | `claimed = 0` (strict variant: also `transferredOut = 0`) |
| **partial** | `claimed > 0` and still >1% held |
| **months** | days ÷ 30.4375 |

### Exclusions (removed from the numerator and the denominator)

| Exclusion | Finished recipient rows |
|---|---|
| Test-named tokens: `test` (but not `testnet`), `tst`, `fake`, `demo`, `mock`, `dummy`, `ignore` in the vesting token or underlying name/symbol | 356 |
| Holder is the vesting token's deployer | 218 |
| Holder deployed a sibling vesting token for the same underlying | 24 |
| Holder is the underlying token contract itself | 18 |
| Holder is a Safe co-owned by a deployer of a vesting token for that underlying (GNUS-FOUNDER) | 1 |
| Burn/zero address, the vesting token itself, another Unvest vesting token, an Unvest factory | 0 among recipients (applied to non-recipients) |

"PEG Alpha testnet feedback" rewards are a real PEG distribution to testnet testers, so they are **kept**.

How the Safe check was run: I fetched `eth_getCode` for every holder in a still-trading token (5,495 addresses). 556 had code. 555 of those are EIP-7702 delegated EOAs (23-byte `0xef0100…` designator), which are ordinary users. One is a Safe proxy, and its `getOwners()` includes the vesting token's deployer.

### Pricing

- DexScreener `https://api.dexscreener.com/latest/dex/tokens/{address}`, **one address per request**, for all 235 underlying tokens that hold a finished balance.
- I took the **deepest-liquidity pair on the position's own chain**. When our token is the *quote* side of that pair, its price is `priceUsd / priceNative`.
- No pair on the chain means $0, not estimated. Only 2 underlying tokens trade solely on *other* chains, and both are treated as $0.
- "Still trades" means pool liquidity ≥ $10,000. The cap is the deepest same-chain pool's `liquidity.usd`.
- Prices for ASX, GNUS, CAH, CHAMP and RNS were re-fetched at write time and had not changed.

### Claim mechanics worth knowing

- `claim()` takes no arguments and requires an exact native-token fee from `claimFeeData()`. Sending the wrong fee reverts with `IncorrectClaimFee()` (`0x9ed72d27`).
- Fees observed on-chain: 0.0004 ETH and 0.0012 ETH (Ethereum v3.1), 0.0004 ETH (Base SUPER_CHAMP), 0.0008 BNB (BSC v3.1). The v2/v3 tokens checked charge none.
- The fee is small against any material position, but larger than most airdrop dust positions (§1).

### Scope notes (not changed, flagged)

- **Avalanche.** Unvest has a live Avalanche subgraph, `5t5eG3Mc5ZEYUUjw5R2TWvYtVYxSZnsKFuNhpjAwUepb`, with 3,176 recipient rows and all three factories indexed. The adapter comment `// Unvest has no Avalanche subgraph` is wrong. It is out of scope here, but it is real coverage the app is missing.
- **Optimism and Blast** subgraphs are gone ("no allocations").
- **Arbitrum in the app.** `unvestAdapter.supportedChainIds` does not include Arbitrum, and `src/lib/vesting/aggregate.ts:32` skips chains that are not listed. Wallet lookups therefore appear never to return Arbitrum Unvest positions, even though the subgraph map and the TVL walker include Arbitrum.
- **BSC v3.1.** The adapter can never show BSC v3.1 positions, because the subgraph does not index that factory (above).
- **RPCs.** `eth.llamarpc.com` was returning an HTML error page during the run, so Ethereum reads used `ethereum-rpc.publicnode.com`. BSC historical logs came from `rpc.sentio.xyz/bsc`.

---

## Appendix: top 10 positions (full identifiers)

| # | Chain | Token | Vesting token | Holder | Tokens left | Value | Unlocked | Months | State |
|---|---|---|---|---|---|---|---|---|---|
| 1 | BNB | ASX | `0x894f99aec0c6b6584a92110c28bacdc4140b9309` | `0xf672883f67c7057b26b57961bfc18a6f9b905882` | 237,262.72 | $18,272 | 2026-01-19 | 8.6 | partial, 88.1% taken |
| 2 | BNB | ASX | `0x894f99aec0c6b6584a92110c28bacdc4140b9309` | `0xda32721c5e54805e7605ae77030f7f9df43e302a` | 109,766.46 | $8,453 | 2026-01-19 | 8.6 | partial, 56.1% taken |
| 3 | ETH | GNUS | `0x912accc3534a03197015f446334e3cfa7783ecf0` (GEMPAD-GNUS) | `0x244c39be7313d354021131a02a9883396663d836` | 2,790.16 | $4,492 | 2024-09-01 | 25.1 | never claimed |
| 4 | BNB | ASX | `0x894f99aec0c6b6584a92110c28bacdc4140b9309` | `0x7c7d4cf02af7865067405849d997cd61f635629f` | 55,512.74 | $4,275 | 2026-01-19 | 8.6 | partial, 44.5% taken |
| 5 | ETH | GNUS | `0x912accc3534a03197015f446334e3cfa7783ecf0` | `0x3fdaed800de6b425c95a05fbb8bdf3dd1f0ee3b3` | 2,320.00 | $3,735 | 2024-09-01 | 25.1 | never claimed |
| 6 | BNB | ASX | `0x894f99aec0c6b6584a92110c28bacdc4140b9309` | `0x93880fc54fec2b49ecb40803250e847d428dbe22` | 27,545.02 | $2,121 | 2026-01-19 | 8.6 | partial, 44.9% taken |
| 7 | ETH | GNUS | `0xeb2067be50bee2d865c5d700fef57079f78559d6` (GNUS-KOLM) | `0x66e703970d5b62ebd62f05a896136159830551bd` | 1,050.00 | $1,691 | 2024-10-15 | 23.7 | never claimed |
| 8 | ETH | GNUS | `0x912accc3534a03197015f446334e3cfa7783ecf0` | `0x826055046f6abd7ae0d45de76b364e51c4e7dffe` | 580.00 | $934 | 2024-09-01 | 25.1 | never claimed |
| 9 | ETH | GNUS | `0x912accc3534a03197015f446334e3cfa7783ecf0` | `0xf51f13bbfd3de9ddd79f6f3288bc9e195e1866e2` | 232.00 | $374 | 2024-09-01 | 25.1 | never claimed |
| 10 | ETH | GNUS | `0x912accc3534a03197015f446334e3cfa7783ecf0` | `0xf0b483783dbbbe4952d8907c3bf76ce5a92698de` | 228.04 | $367 | 2024-09-01 | 25.1 | never claimed |

Prices: ASX $0.07701 (pool $37,630); GNUS $1.61 (Uniswap GNUS/WETH, pool $171,265, 24h volume $2,212, market cap $1.56M).

Excluded positions that would otherwise rank: GNUS-FOUNDER `0x9679519e246cfdc8d6681bd7abf0d6467375f5ce` held by Safe `0x1d2c163fbda9486c3a384b6fa5e34c96fe948e9a` ($32,200, deployer-controlled), and AICZ-DEVFUND on BSC v3.1 held by its deployer `0xd59d490d901d84818da2ec5c09f09306fe059bf4` ($2,929).

## Reproduction

The scripts are in the session scratchpad (`…/scratchpad/unvest/`) and are not committed. The steps:

1. `walk.js`: full `vestingTokens` + `holderBalances` walk per chain, `id_gt` cursor.
2. `nonce.js`: factory nonce reconciliation.
3. `bsclogs2.js`, `bscmeta.js`, `bsctransfers.js`, `bscbuild.js`: BSC v3.1 recovery from chain.
4. `owners.js`: contract/Safe detection for still-trading holders.
5. `build.js`, `price.js`, `analyze.js`: definitions, DexScreener pricing and every table above.
6. `spot.js`, `collat.js`, `verify.js`: the 200-sample spot check, the 238-token collateral check and the top-10 verification.

Run with `cd /Users/howardpearce/vestr && node --env-file=.env.local …` (needs `GRAPH_API_KEY`).
