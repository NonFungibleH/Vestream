# Unclaimed finished vesting: UNCX (TokenVesting V3 + VestingManager)

**Vestream original research, UNCX part.**
Measurement date: **2026-10-06**. "Finished" means the schedule's end time is before **2026-09-06** (ended 30+ days ago), the same definition the Sablier part uses.
Scope: `uncx` = UNCX TokenVesting V3 on Ethereum, BNB Chain and Base (the three chains the app indexes). `uncx-vm` = UNCX VestingManager on Ethereum.

---

## For the graphic

All figures below are **third-party only**. That means the lock's current owner is not the address that funded it. They also exclude test-named tokens, UNCX's own VestingManager test traffic, and locks whose owner is a burn address or the token contract. The exclusions are listed in §0.

### 1. Finished locks and how many are unclaimed

| Population | Finished locks | Unclaimed (>1% still held) | Rate |
|---|---|---|---|
| **All tokens** | **58,550** | **35,050** | **59.9%** |
| All tokens, excluding the 2 largest single-sender distributions (HUH, CHEESUS) | 36,358 | 17,474 | **48.1%** |
| **Tokens that still trade** (pool ≥ $10k) | **8,222** | **2,933** | **35.7%** |
| Tokens that still trade, excluding CREO | 457 | 141 | **30.9%** |

**Headline: about half of finished third-party UNCX locks still hold tokens (48% once the two largest mass distributions are removed, 60% with them). In tokens that still trade, about 1 in 3 is unclaimed.**

Read §1 before using the "still trade" row. **One token, CREO on BNB Chain, accounts for 7,765 of the 8,222 tradeable finished locks (94%) and 2,792 of the 2,933 tradeable unclaimed locks (95%).** The 35.7% figure is in practice the CREO figure. The ex-CREO 30.9% rests on only 457 locks.

### 2. Never touched

| Population | Never withdrew anything, as a share of unclaimed |
|---|---|
| All tokens | **79.4%** (27,820 of 35,050) |
| Tokens that still trade | **90.0%** (2,639 of 2,933) |
| Tokens that still trade, ex-CREO | 84.4% (119 of 141) |

**About 4 in 5 unclaimed finished UNCX locks were never touched once.**

### 3. Value in tokens that still trade

| Basis | Value |
|---|---|
| Mark-to-market (third-party, pool ≥ $10k) | **$423,962** (2,933 positions, 39 tokens) |
| **Same, each token capped at its pool depth** | **$398,786** |
| Strict: pool ≥ $100k **and** ≥ $10k 24h volume (mark-to-market = capped) | $91,134 (22 positions, 12 tokens) |

**Headline the pool-capped figure: "about $400,000".** Mark-to-market and capped barely differ here, because only one token (FUELX) holds more unclaimed value than its whole pool. Give $91k as the conservative floor if a range is wanted.

**Do not publish $8.0M.** That figure appears if one BabyDoge lock ($7.51M, 94% of the uncapped total) is counted as a third-party grant. It is a team treasury (§2.3).

### 4. Value ladder (third-party, tokens that still trade)

| Unclaimed value per position | Positions | Of which never touched | Total |
|---|---|---|---|
| **Over $100,000** | **0** | — | — |
| **Over $10,000** | **14** | 10 | $243,147 |
| **Over $1,000** (incl. the 14 above) | **36** | 27 | $359,822 |
| $1,000 – $10,000 | 22 | 17 | $116,675 |
| **Under $1,000** | **2,897** | 2,612 | $64,140 |
| — of which **under $1** | **652** | 620 | **$278** |

2,789 of the 2,897 sub-$1,000 positions are CREO (median CREO position: **$4.44**).

### 5. Oldest and largest

**Oldest unclaimed position in a token that still trades:** Binance-Peg DAI on BNB Chain, lock #392. It ended 2021-06-01, **64.1 months ago**, was never touched, and is worth **$5**.
Oldest with real money in it: **UNCX lock #6 on Ethereum**, 250 UNCX worth **$7,158**. It ended 2021-12-31, **57.2 months ago**, and was never touched. The owner wallet has never sent a transaction (nonce 0). The token is UNCX's own; see §5 before using it.

**Largest single position: FUELX on Ethereum, $32,807 mark-to-market.**
- Lock #8187, ended 2026-08-20, **1.5 months ago**. The recipient took 54.5% and then stopped.
- 288,285,067 FUELX. Pool liquidity **$20,514**, 24h volume **$158**, market cap $441,634.
- **Pool-depth caveat: the position is 160% of the token's entire pool.** FUELX's two unclaimed positions total $45,690 against that $20,514 pool, so the realisable value is at most about $20k.
- The owner is a smart-contract wallet (a 171-byte proxy, consistent with a Safe multisig).

The largest position that sits **under 10% of its pool** is **IMO on Base, $27,805**: lock #893, 50,000 IMO, never touched, ended 9.2 months ago. It is 7.2% of a $383,861 pool, though 24h volume is only $1,583, and the owner wallet has never sent a transaction.
The most defensible single example is **DSync on Ethereum, $24,571**: lock #7505, never touched, ended **28.7 months** ago, 1.9% of a $1.28M pool, with **$35,922 of 24h volume**.

### 6. On-chain verification of the top 10 (live `eth_call`, 2026-10-06)

For each position I read three things live from the locker. `getLock(id)` gives the owner and the contract's own token conversion. `getWithdrawableTokens(id)` gives what is claimable right now. `balanceOf(locker)` is the token balance the locker actually holds. I also checked that the contract's `SHARES[token]` equals the sum of outstanding shares across every lock we enumerated for that token. When it does, the locker's whole balance is spoken for by known locks.

| # | Token | Chain | Lock | Attributed | Live `getLock` | Withdrawable now | Locker `balanceOf` | `SHARES` = Σ locks | Result |
|---|---|---|---|---|---|---|---|---|---|
| 1 | FUELX | Ethereum | 8187 | 288,285,067.51 | 288,285,067.51 | 288,285,067.51 | 860,157,624 | yes | **PASS** |
| 2 | IMO | Base | 893 | 50,000 | 50,000 | 50,000 | 2,413,887 | yes | **PASS** |
| 3 | DSync | Ethereum | 7505 | 2,454,632 | 2,454,632 | 2,454,632 | 2,454,632 (exact) | yes | **PASS** |
| 4 | $0xGas | Ethereum | 9160 | 796,263.80 | 796,263.80 | 796,263.80 | 796,263.80 (exact) | yes | **PASS** |
| 5 | ZIGGY | Base | 1014 | 34,877,900 | 34,877,900 | 34,877,900 | 34,877,910 | yes | **PASS** |
| 6 | CREO | BNB Chain | 48721 | 2,500,000 | 2,500,000 | 2,500,000 | 11,241,484 | yes | **PASS** |
| 7 | UNCX | Ethereum | 8 | 500 | 500 | 500 | 2,000 | yes | **PASS** |
| 8 | UNCX | Ethereum | 13 | 500 | 500 | 500 | 2,000 | yes | **PASS** |
| 9 | CULT | Ethereum | 1399 | 15,680,000,000 | 15,680,000,000 | 15,680,000,000 | 131,732,057,223 | yes | **PASS** |
| 10 | CULT | Ethereum | 1405 | 15,680,000,000 | 15,680,000,000 | 15,680,000,000 | 131,732,057,223 | yes | **PASS** |
| — | BabyDoge (excluded, treasury) | BNB Chain | 67276 | 1.8484e16 | 1.8484e16 | 1.8484e16 | 1.8484e16 | yes | PASS |

**10 of 10 pass with zero drift.** In every case the owner is unchanged, the full amount is withdrawable now, and the locker holds at least the attributed tokens. That rules out "the tokens aren't there" for every headline position.

---

## 0. Population, sources and method

### Why neither the cache nor the subgraph

- **`vesting_streams_cache` is not used.** It holds only wallets Vestream has looked up, and 69% of UNCX rows are 90+ days stale.
- **The UNCX subgraph is not used as the state source either.** I compared every subgraph `Lock` entity with on-chain `getLock()` and found three problems:

| Chain | Subgraph `lockID` field wrong | `sharesWithdrawn` disagrees with chain | **Phantom finished-unclaimed locks** (subgraph says unclaimed, chain says empty) |
|---|---|---|---|
| Ethereum | 641 | 708 | **620** |
| BNB Chain | 1,808 | 2,636 | **1,849** |
| Base | 164 | 202 | **159** |

The cause is `transferLockOwnership` and `splitLock`. On-chain, both create a **new lock ID** and empty the old one. The subgraph leaves the old entity frozen with its pre-transfer shares, and stamps the new entity with the *parent's* lock ID. **A subgraph-based count would have overstated unclaimed finished locks by 2,628.** Its `LockEvent.lockId` is also unreliable: duplicated on 54, 283 and 39 IDs on the three chains. See §6 for what this means for the app.

### What was measured instead

**TokenVesting V3**, enumerated directly from the contract:
- `NONCE()` gives the lock count: Ethereum 9,400, BNB Chain 69,508, Base 1,835.
- `getLock(i)` was read for every `i`, giving 80,743 locks in total.
- Lockers (same as `adapters/uncx.ts`):
  - Ethereum `0xdba68f07d1b7ca219f78ae8582c213d975c25caf`
  - BNB Chain `0xeaed594b5926a7d5fbbc61985390baaf936a6b8d`
  - Base `0xa82685520c463a752d5319e6616e4e5fd0215e33`
- Snapshot blocks: Ethereum 26,135,854; BNB Chain 126,127,502; Base 52,265,353.
- **Completeness check:** for **all 7,060 token/chain pairs**, the contract's `SHARES[token]` equals the sum of `sharesDeposited − sharesWithdrawn` over the locks we enumerated. No lock is missing and none is double-counted.

**Share-to-token conversion** uses the contract's own math. `getLock` and `convertSharesToTokens` both return `shares × balanceOf(locker) / SHARES[token]`. Unclaimed status is decided on shares (remaining > 1% of deposited). Value is decided on the converted token amount.
- **28** finished locks have >1% of their shares left but **zero underlying tokens**: the locker's balance of that token is gone. I treat them as **not unclaimed** and report them separately ("hollow"). 27 of the 28 are self-locks.
- The conversion also **inflates** positions in tokens that someone sent straight to the locker without locking them (USDC on Ethereum is 2.49M tokens per share; USDT and BUSD on BNB Chain are 400k and 270k). The contract would actually pay these out, but they are not vesting. **Every such third-party position is worth under $50, and the combined effect on the totals is under $300.** BabyDoge's 1.27 tokens per share is genuine reflection income.

**Creator / self-lock.** I fetched the receipt of every creation, transfer and split transaction: 25,596 receipts. In each, I decoded the locker's own `onLock` / `onTransferLock` / `onSplitLock` events and the ERC-20 `Transfer` into the locker. Each lock is traced through transfers and splits back to its root creation.
- **Creator** = the address whose tokens entered the locker (the `Transfer.from`), which falls back to `tx.from`.
- **Self-lock** = the current owner equals that depositor or `tx.from`.
- 3 of 80,743 locks (all BNB Chain) could not be traced and are excluded.

**VestingManager (`uncx-vm`, Ethereum)**, contract `0xa98f06312b7614523d0f5e725e15fd20fb1b99f5`:
- `nextVestingId()` = 5,057. Every `getVestingSchedule` was read with the adapter's corrected struct, plus `getReleasableAmount` and `ownerOf`.
- `total − released == getReleasableAmount` held on **every** finished schedule, which validates the decode.
- Unclaimed = `total − released` > 1% of total. Cancelled schedules are excluded.

**Prices** come from DexScreener `latest/dex/tokens/{address}`, **one address per request**, 5,053 requests. I took the deepest-liquidity pair on the lock's own chain and handled the token being either base or quote. If there is no pair, the value is $0. "Still trades" means pool ≥ $10k.

### Exclusions

| Excluded | Finished | Unclaimed | Why |
|---|---|---|---|
| Self-locks (owner = funder) | 20,270 | 10,827 | Project locking to itself. Reported separately in §2.3 |
| — incl. BabyDoge lock 67276, reclassified | 1 | 1 | Team lock moved to the team's own multisig (§2.3) |
| VestingManager: UNCX's own test traffic | 189 | 188 | 2 addresses sending 1–1,000 *wei* of USDC (0.15 USDC in total) |
| Owner is a burn address or the token contract itself | 57 | 56 | Nobody can claim these. Incl. CULT locks owned by `0xdead…` and by the CULT contract |
| Test-named tokens (`TEST`, `TST`, `mock`, `demo`…) | 112 | 95 | None has a DEX pair. One false positive ("DemonHellboy", 4 locks, unpriced) |
| Creator untraceable | 3 | 1 | — |
| Hollow (shares left, zero underlying) | 28 | (not counted as unclaimed) | Rebasing or drained token |

Cancelled/revoked: TokenVesting V3 has no lock-cancel path that I could find. Its only "revoke" event (`RevokeCondition`, 16 on BNB Chain) removes an unlock condition and returns nothing to the sender. I did not check the full ABI for an admin revoke. Even so, every token counted here is backed by the locker's live balance, and the top 10 are withdrawable by their owner today (graphic §6). Optional unlock "conditions" (2,564 finished locks, nearly all on BNB Chain) can only release early; they cannot claw back.

---

## 1. Rates

### By protocol and chain (third-party)

| Scope | Finished | Unclaimed | Rate | Never touched (share of unclaimed) |
|---|---|---|---|---|
| `uncx` Ethereum | 3,827 | 1,565 | 40.9% | 88.3% |
| `uncx` BNB Chain | 54,440 | 33,381 | 61.3% | 79.0% |
| `uncx` BNB Chain, ex top-10 tokens | 9,334 | 4,839 | 51.8% | 87.1% |
| `uncx` Base | 283 | 104 | 36.7% | 78.8% |
| `uncx-vm` Ethereum | 13 | 5 | (n too small) | — |
| **Total** | **58,550** | **35,050** | **59.9%** | **79.4%** |

**BNB Chain is 93% of the population**, and most of it is the 2021–22 presale wave.

### Concentration: two tokens are half the count

| Scope | Finished | Unclaimed | Rate |
|---|---|---|---|
| Everything | 58,550 | 35,050 | 59.9% |
| Ex HUH | 45,747 | 26,092 | 57.0% |
| **Ex HUH, CHEESUS** | **36,358** | **17,474** | **48.1%** |
| Ex top 5 (+ NINTI, CREO, KXA) | 19,550 | 10,102 | 51.7% |
| Ex top 10 (+ MDN, YNY, EVO, 4DMAPS, FHTN) | 13,456 | 6,516 | 48.4% |

- **HUH_Token** (BNB Chain): 8,960 unclaimed locks to 5,340 wallets, all from **one sender**, ended Feb–Jun 2022.
- **CHEESUS** (BNB Chain): 8,617 unclaimed locks to 8,285 wallets, from one sender.
- Together they are **50.1% of all unclaimed third-party locks**. Neither token has a DEX pair. The top 10 tokens are 81% of the count, and **every one of the top 10 is a single-sender mass distribution on BNB Chain**.

Unlike Sablier's GX, removing the big ones does not collapse the rate. Every cut lands between 48% and 57%. That is the strongest sign that "about half" is robust.

### Tokens that still trade: CREO dominates

| Scope | Finished | Unclaimed | Rate | Never (share) |
|---|---|---|---|---|
| All tradeable | 8,222 | 2,933 | 35.7% | 90.0% |
| CREO alone (BNB Chain) | 7,765 | 2,792 | 36.0% | 90.3% |
| **Ex CREO** | **457** | **141** | **30.9%** | 84.4% |
| Ethereum | 259 | 55 | 21.2% | 83.6% |
| BNB Chain | 7,916 | 2,866 | 36.2% | 90.2% |
| Base | 47 | 12 | 25.5% | 75.0% |

**CreoEngine (CREO)** is a presale vesting from one sender (`0x19dcc90b…`) to 3,462 wallets. Its pool is $93.7k and its market cap $4.67M. Its 2,792 unclaimed positions hold $66,499 between them, a **median of $4.44** each.

### By age (third-party)

| Ended | Finished | Unclaimed | Rate | Never (share) |
|---|---|---|---|---|
| 1–3 months ago | 24 | 20 | 83.3% | 65.0% |
| 3–12 months | 383 | 247 | 64.5% | 73.7% |
| 12–24 months | 2,105 | 1,350 | 64.1% | 72.4% |
| 24–36 months | 3,539 | 1,585 | 44.8% | 92.6% |
| 36–48 months | 9,332 | 5,177 | 55.5% | 83.4% |
| 48+ months | 43,167 | 26,671 | 61.8% | 78.2% |

**74% of finished third-party UNCX locks ended more than four years ago.** There is no clean age gradient, and the bands are dominated by whichever mass distribution happened to end in them. Do not read a trend into this. Bands under 100 locks should not be quoted as rates.

### Schedule shape: the Sablier one-shot finding does **not** carry over

| Shape | Finished | Unclaimed | Rate |
|---|---|---|---|
| Cliff (one-shot) | 16,259 | 5,847 | 36.0% |
| Linear | 42,291 | 29,203 | 69.1% |
| Cliff, ex top-10 tokens | 5,942 | 2,759 | 46.4% |
| Linear, ex top-10 tokens | 7,499 | 3,749 | 50.0% |
| Cliff, tradeable ex-CREO | 244 | 78 | 32.0% |
| Linear, tradeable ex-CREO | 213 | 63 | 29.6% |

On raw numbers, UNCX looks like the **reverse** of Sablier (linear worse than cliff). That is because the big presale distributions were linear. With them removed the two shapes are within 4 points of each other. **On UNCX there is no shape effect to report.** Do not extend the Sablier "one-shot unlocks go unclaimed 3.5x more" line to UNCX.

### Partial claimers

7,230 unclaimed third-party locks are partials, where the recipient withdrew some and then stopped. The share they had taken before stopping:

| p10 | p25 | median | p75 | p90 |
|---|---|---|---|---|
| 7.9% | 19.6% | **39.3%** | 67.3% | 84.5% |

### Wallets

- **35,187** distinct third-party owner addresses hold a finished UNCX lock. **25,600** hold at least one unclaimed one.
- In tokens that still trade: **1,710** owner addresses, and only **121 excluding CREO**.

---

## 2. Value

### 2.1 Where the value is (third-party unclaimed, by token pool depth)

| Pool liquidity | Token/chain pairs | Unclaimed positions | Value |
|---|---|---|---|
| ≥ $1M | 14 | 31 | $89,733 |
| $100k – $1M | 11 | 80 | $157,441 |
| $10k – $100k | 14 | 2,822 | $176,788 |
| $1k – $10k | 10 | 200 | $189,842 |
| under $1k | 9 | 117 | $2,916 |
| **no DEX pair** | **750** | **31,800** | **$0** |

- **808** token/chain pairs hold third-party unclaimed finished locks. **750 of them (92.8%) have no market at all**, and they cover **31,800 of 35,050 unclaimed locks (90.7%)**.
- **The honest sentence: 9 in 10 unclaimed finished UNCX locks are in tokens that no longer have a price.**
- The $189,842 in the $1k–$10k band is not counted in the headline. Almost all of it is two BNB Chain tokens: LIQ ($114k against an $8.7k pool and $4/day volume) and ZOON ($58k against a $1.1k pool and $3/day).

### 2.2 Top tokens by third-party value (tokens that still trade)

| Token | Chain | Value | Positions | Pool | 24h vol | Mkt cap | % of pool |
|---|---|---|---|---|---|---|---|
| CREO | BNB Chain | $66,499 | 2,792 | $93,671 | $122,987 | $4.67M | 71% |
| UNCX | Ethereum | $57,260 | 6 | $494,707 | $256 | $1.36M | 12% |
| CULT | Ethereum | $52,893 | 5 | $1,795,425 | $29,579 | $3.14M | 3% |
| FUELX | Ethereum | $45,690 | 2 | $20,514 | $158 | $441,634 | **223%** |
| IMO | Base | $37,341 | 3 | $383,861 | $1,583 | $7.62M | 10% |
| SeaChain | BNB Chain | $34,885 | 20 | $100,274 | **$8** | $152,322 | 35% |
| DSync | Ethereum | $24,571 | 1 | $1,279,988 | $35,922 | $9.40M | 2% |
| $0xGas | Ethereum | $20,615 | 1 | $94,985 | $114 | $284,853 | 22% |
| ONI | BNB Chain | $19,992 | 2 | $33,102 | $38 | $179,302 | 60% |
| ZIGGY | Base | $17,359 | 1 | $49,999 | **$1** | $493,375 | 35% |

- Top 10 tokens = 88.9% of the value. Top 10 positions = 45.4%. The single largest position is 7.7%.
- By chain: Ethereum $239,033 (55 positions), BNB Chain $126,314 (2,866), Base $58,615 (12).
- **VestingManager contributes $0.** None of its non-test unclaimed schedules is in a token with a ≥ $10k pool.

### 2.3 Self-locks and the BabyDoge treasury, kept out of the headline

**Self-locks** (a project locking its own tokens to itself) are a large, separate pool:
- 20,270 finished, 10,827 unclaimed (53.4%).
- In tokens that still trade: **$23.56M mark-to-market, $12.33M capped at pool depth**, across 191 positions and 122 owners.
- The biggest are **BANANA on Ethereum, $12.75M** in three locks owned by the depositor itself; BabyDoge $7.51M (below); and TAOBOT $1.42M.

These are team or treasury tokens the project has not pulled out. That is not someone forgetting a grant, and **none of it belongs in the "unclaimed vesting" figure.**

**BabyDoge, BNB Chain, lock 67276, $7,510,035.** By the strict rule (owner ≠ funder) this counts as third-party, and it would be **94% of the third-party total and the only position over $100k.** I reclassified it as a treasury:
- It was created by `0xa4a6db60…`, the BabyDoge team wallet, which also holds 9 BabyDoge locks to itself.
- It was then moved with `transferLockOwnership` to `0xb2e77e09…`, a Safe-style multisig. That multisig received three more BabyDoge team locks the same way.
- The multisig has already withdrawn 26.9%, so this is a team that knows the lock exists and is drawing on it as it chooses.
- 18.48 quadrillion BabyDoge is 79% of the $9.48M pool. Verified on-chain (§6).

**If anyone recomputes this with a mechanical owner ≠ funder rule they will get ~$8.0M, and it will be wrong.**

---

## 3. Top 15 positions (third-party, tokens that still trade)

| # | Token | Chain | Lock | Unclaimed USD | Tokens left | State | Months since end | Pool | 24h vol | % of pool | Owner | Owner tx count |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | FUELX | Ethereum | 8187 | $32,807 | 288,285,068 | partial (54.5% taken) | 1.5 | $20,514 | $158 | **160%** | `0x0993550338394e4a66ea0d22a751e0e058a3842c` | contract |
| 2 | IMO | Base | 893 | $27,805 | 50,000 | never | 9.2 | $383,861 | $1,583 | 7% | `0x71ae1723415a535e990d0d9d28d7a9d5025cee5b` | 0 |
| 3 | DSync | Ethereum | 7505 | $24,571 | 2,454,632 | never | 28.7 | $1,279,988 | $35,922 | 2% | `0x7ef47a121bd308cba02427e6ea4e41fe8adc06ad` | 13 |
| 4 | $0xGas | Ethereum | 9160 | $20,615 | 796,264 | partial (31.5%) | 30.2 | $94,985 | $114 | 22% | `0xd186b415e866daf8c1a92d8dc6ba32bb8fa96f52` | contract |
| 5 | ZIGGY | Base | 1014 | $17,359 | 34,877,900 | never | 7.6 | $49,999 | $1 | 35% | `0x04e6d9f926af1ff3d85ec26c939f5628595cbcb2` | 11 |
| 6 | CREO | BNB Chain | 48721 | $14,793 | 2,500,000 | never | 41.1 | $93,671 | $122,987 | 16% | `0x955abd1220b9bb5fb83aceb9330f9f3bf2902573` | 0 |
| 7 | UNCX | Ethereum | 8 | $14,315 | 500 | never | 45.2 | $494,707 | $256 | 3% | `0x4dc603be59ee6ee2d2902b9c17999689c8dd85e4` | 0 |
| 8 | UNCX | Ethereum | 13 | $14,315 | 500 | never | 45.2 | $494,707 | $256 | 3% | `0xfcc488c0a53aca110224f3e88ecd271d35b623c0` | 0 |
| 9 | CULT | Ethereum | 1399 | $12,977 | 15,680,000,000 | never | 44.1 | $1,795,425 | $29,579 | 0.7% | `0xeba89da53802b4e224565f3380931b6d12a11f46` | 2 |
| 10 | CULT | Ethereum | 1405 | $12,977 | 15,680,000,000 | never | 56.1 | $1,795,425 | $29,579 | 0.7% | `0xe55d60c4a48e46daea94ead27eb737bc7233c442` | 0 |
| 11 | CULT | Ethereum | 1431 | $12,977 | 15,680,000,000 | never | 56.1 | $1,795,425 | $29,579 | 0.7% | `0x258f3ee2d43293dfd07ae5fa811757a73255e77c` | 456 |
| 12 | CULT | Ethereum | 1437 | $12,977 | 15,680,000,000 | never | 56.1 | $1,795,425 | $29,579 | 0.7% | `0xfe895d85e1961a3a03d806b2df61d60d74775db5` | 8 |
| 13 | FUELX | Ethereum | 8180 | $12,883 | 113,205,734 | partial (54.6%) | 1.5 | $20,514 | $158 | 63% | `0x3b937a89cd65c0d10d712f7fc111f0f7243952e7` | contract |
| 14 | SeaChain | BNB Chain | 3627 | $11,778 | 41,973,338,407 | partial (58.0%) | 48.5 | $100,274 | $8 | 12% | `0x4279ec71033eba9812a49fe5dc7e9e6dab973a84` | 26 |
| 15 | ONI | BNB Chain | 23507 | $9,996 | 2,000,000 | never | 44.6 | $33,102 | $38 | 30% | `0xc93e4e5468196cfd687b9df4caf41f82e785eb18` | 0 |

**Sum of top 15: $246,622.** "Owner tx count" is the owner's on-chain nonce today. **56 tradeable unclaimed positions ($147,702) belong to wallets that have never sent a single transaction.** They could be cold wallets, or keys nobody holds any more. We cannot tell which.

---

## 4. Data quality: what a reader could use against us

### Verified clean
- **Enumeration is complete.** `SHARES[token] == Σ outstanding shares` for every one of 7,060 token/chain pairs (§0).
- **Top 10 positions verified live** with zero drift, and every one fully withdrawable now (graphic §6).
- **Creator tracing is complete** for 80,740 of 80,743 locks. The token in each creation event matched on-chain `getLock` for 100% of them.
- **VestingManager decode verified**: `total − released == getReleasableAmount` on every finished schedule.
- **Prices re-checked**: a second DexScreener pass on the top 10 tokens returned the same pair and price.

### Real problems, stated plainly
1. **The rate is 2021–22 BNB Chain presale history.** 93% of the population is BNB Chain, 74% of locks ended 4+ years ago, and the top 10 tokens are all single-sender mass distributions. "UNCX" here mostly means "BSC presales from 2021".
2. **The tradeable rate is one token.** CREO is 95% of the tradeable unclaimed count. The ex-CREO rate rests on 457 locks.
3. **"Third-party" is a heuristic.** A lock created by a launchpad or presale contract on a project's behalf counts as third-party, even when the owner is the project's own wallet. 2,498 of the 80,743 locks were created through a contract rather than directly. The reverse also happens: a team that moves its own lock to its own multisig looks third-party. BabyDoge was caught by hand. Others smaller than $10k may remain.
4. **Thin pools and stale prices.** DexScreener only re-prices on trades. ZIGGY ($1/day), SeaChain ($8/day), ONI ($38/day), FUELX ($158/day) and the UNCX token ($256/day) carry prices nobody has traded at recently. The strict $91k figure exists for this reason.
5. **Hollow and donation-inflated tokens.** 28 locks keep shares with zero underlying. A handful of tokens have direct donations sitting in the locker. Both are handled, and neither is material (§0).
6. **Single price source.** DexScreener only, one moment on 2026-10-06, no time-averaging.
7. **Coverage gap.** UNCX TokenVesting is also live on Arbitrum (`0x8cb0300a…`, **524 locks**, `NONCE` read on-chain) and on Polygon. The app has no working subgraph for either, so they are out of scope here. 524 locks is under 1% of the measured total.
8. **VestingManager is effectively empty for this question.**
   - Of 233 finished schedules, 189 are UNCX's own test transfers (0.15 USDC in total).
   - Of the remaining 44: 13 are third-party, of which 5 are unclaimed, none in a token that trades.
   - The Base (1,101) and BNB Chain (1,303) VestingManager deployments that the indexer config lists are **100% the same test traffic**.

---

## 5. NOT SAFE TO PUBLISH

| Number | Why not |
|---|---|
| **"$8.0M of unclaimed third-party UNCX vesting"** | 94% of it is one BabyDoge team lock held by the team's own multisig, which has already withdrawn 27%. Use ~$400k. |
| **"$24.7M unclaimed"** (all priced, incl. self-locks) | Mostly projects' own treasury locks: BANANA alone is $12.75M. These are not grants. |
| **"60% of UNCX vesting goes unclaimed"** without context | Half of the numerator is two dead mass distributions (HUH, CHEESUS). Publish 48% ex those, or "about half". |
| **"36% unclaimed in tokens that still trade"** as a general UNCX fact | 95% of it is CREO. Say "about 1 in 3" and note the small ex-CREO base (457), or drop the tradeable rate. |
| **FUELX $32,807 as "someone left $33k behind"** | 160% of the token's whole pool, $158/day volume, ended only 6 weeks ago, and the owner is a contract that already took 54.5%. Realisable value is ≤ $20k. Use DSync ($24.6k, 2% of a liquid pool, 28.7 months, never touched) as the example instead. |
| **UNCX-token positions (#7, #8 and four more, $57k)** | These are UNCX's own 2021 team/early locks, in UNCX's own token, which trades $256/day. Naming them in a post about UNCX reads as a dig at UNCX. Fine in aggregate. Do not single them out. |
| **The CULT locks owned by `0xdead…` and by the CULT contract** | Excluded as unclaimable. If anyone recomputes without that filter, CULT goes up by about $56k. Those tokens are burned in effect, not forgotten. |
| **LIQ $114k / ZOON $58k** | $8.7k and $1.1k pools, $4 and $3 daily volume. Not tradeable by any definition. Already outside the headline. |
| **"Cliff/one-shot locks go unclaimed more"** | Not true on UNCX once concentration is removed (46% vs 50%). Do not reuse the Sablier line. |
| **Any age trend** | Bands are dominated by whichever distribution ended in them. No relationship can be claimed. |
| **"N thousand people"** | Owners are addresses. HUH, CHEESUS, CREO and others are mass distributions, 2,498 locks were created via contracts, and some owners are multisigs. Say "wallets" or "recipient addresses". |
| **"56 wallets that never made a transaction hold $148k"** | True, but "never transacted" does not mean "lost". Cold storage looks identical. Use only with that caveat, or not at all. |
| **Any UNCX figure from the subgraph or `vesting_streams_cache`** | The subgraph produces 2,628 phantom unclaimed locks. The cache is a non-random, stale sample. |
| **Rates for the VestingManager, or for any band under ~100 locks** | n = 13 third-party finished schedules. |
| **"$X sitting idle waiting to be claimed"** | 90.7% of unclaimed locks are in tokens with no market. |

---

## 6. Side findings for the app (not fixed; no code changed)

1. **UNCX subgraph ghosts reach users.** `adapters/uncx.ts` reads `locks(where: owner_in)`.
   - After a `transferLockOwnership` or `splitLock`, the **old owner still gets the frozen parent entity**, showing a full balance for a lock that is empty on-chain: 2,628 such finished locks across the three chains.
   - The **new owner gets an entity whose `lockID` is the parent's**. Because `claimNativeId = raw.lockID`, an in-app claim would call `withdraw(parentId)` and revert with "OWNER".
   - This likely explains the 4 of 75 mismatches in the earlier `getWithdrawableShares` audit.
   - Fix direction: take the lock ID from the entity id suffix (`id` minus the locker address), and drop entities whose on-chain lock is empty.
2. **`tvl-walker/uncx-vm.ts` decodes `getVestingSchedule` with the pre-2026-06-10 struct.** It has `released` after the three bools and 2-field tranches, while the adapter and indexer were corrected to `released` at index 4 with 3-field tranches. Raw-word inspection of schedule #0 confirms the adapter/indexer layout is the right one. The walker's VestingManager TVL is therefore computed from misaligned fields.
3. VestingManager on Base and BNB Chain hold only UNCX test schedules, so indexing them adds nothing today.

---

## Appendix A: reproduction

Scripts live in the session scratchpad (`…/scratchpad/uncx/`). Run them from `/Users/howardpearce/vestr` with `node --env-file=.env.local`:

```
walk.js <chain>       # NONCE + getLock(i) for every lock id  -> locks_<chain>.json
tokens.js             # SHARES, balanceOf(locker), symbol/decimals per token
vmwalk.js             # VestingManager: nextVestingId, getVestingSchedule, getReleasableAmount, ownerOf
events.js receipts.js # creation/transfer/split tx receipts -> origins_<chain>.json (creator tracing)
price.js              # DexScreener, one address per request -> prices.json
build.js full.js extra.js extra2.js   # classification + every table in this report
owners.js             # eth_getCode / nonce for owners of tradeable positions
verify.js             # live top-10 verification
sgcmp.js <chain>      # subgraph vs on-chain comparison (§0)
```

RPCs: publicnode (Ethereum; Base/BNB Chain for latest-state calls), `bsc-dataseed*.binance.org`/defibit and `mainnet.base.org`/meowrpc for historical receipts (publicnode refuses archive receipts on those chains).

## Appendix B: lock IDs

TokenVesting lock IDs are the on-chain `lockID`, readable with `getLock(id)` on the chain's locker.

| # | Token | Chain | Locker | Lock ID | Creation tx |
|---|---|---|---|---|---|
| 1 | FUELX | Ethereum | `0xdba68f07…5caf` | 8187 | `0x07d24fd3bc7f32c333b5acc71d635a9f0751584adb38dbb1f5518a7048769edc` |
| 2 | IMO | Base | `0xa8268552…5e33` | 893 | `0x4092114606ef92ec6ed26730355c4c950af142311d82f93ef853dbecb20c7892` |
| 3 | DSync | Ethereum | `0xdba68f07…5caf` | 7505 | `0x065b0cae0de68e015e39bbc1d967ca80297e987c230ed655b867bd1b1519d45f` |
| 4 | $0xGas | Ethereum | `0xdba68f07…5caf` | 9160 | `0x55e4f606d116481563419432d531d572d7ed0499d800896eba761b98ea148fe9` |
| 5 | ZIGGY | Base | `0xa8268552…5e33` | 1014 | `0x1fcefbc490579ab123e178c78e13272af7e177d7a9df4fa8817d392423b811bd` |
| 6 | CREO | BNB Chain | `0xeaed594b…6b8d` | 48721 | `0x427bfe1c08f34eb3a432ce7c518d83f41e219ca11ed09149927d5b46a1901b7d` |
| 7 | UNCX | Ethereum | `0xdba68f07…5caf` | 8 | `0xd79308c39fd582cb4205ee0eaaf152e1023505c733fbdea7dc9915eeb6f36f48` |
| 8 | UNCX | Ethereum | `0xdba68f07…5caf` | 13 | `0x0d85c2961efe19f27fb2b8e6eba2310dba019637a961419b74cc828558ee562e` |
| 9 | CULT | Ethereum | `0xdba68f07…5caf` | 1399 | `0x73cd24a10daba77a904bdf39650c318c63c6648428e3b01ead1b70ec1d1f4160` |
| 10 | CULT | Ethereum | `0xdba68f07…5caf` | 1405 | `0xc54911b9a2ed310fc1c5764ae74edc299c11effd28c6cbb55c9e0cd34492144b` |

Excluded by design, recorded for completeness: BabyDoge, BNB Chain lock **67276** ($7,510,035, team treasury; transfer tx `0x79023fefe09219895bb5a58e1a22a93c07f81de243816cecd01e6eef1a3e2db8`). Also BANANA, Ethereum locks 5567 / 6266 / 5696 (self-locks, $14.9M combined).
