# Data-trust audit: "X% of finished vesting schedules still hold unclaimed tokens"

**Audited:** 2026-10-06 · **Cohort re-measured live** (the 2026-09-24 numbers reproduce within a
few points) · **Method:** read every adapter/indexer, then verify samples against the protocol's
own contract views over public RPC. No application code was changed.

**Headline finding: the statistic as currently computed is not publishable.** Four of the ten
protocols contribute numbers that are pure measurement artefacts, and the cohort selector itself
is driven by a database column that is never updated after a row is first inserted.

---

## 1. Verdict table

| Protocol | Current figure | Where `withdrawnAmount` comes from | On-chain spot-check | Verdict |
|---|---|---|---|---|
| **hedgey** | 3,641/3,641 = **100%** | **Hardcoded literal `"0"`** in both adapter and indexer | 4/5 plans genuinely hold tokens, but `plans().amount` is the *remaining* balance and the NFT is burned on full redemption — 10/60 stale rows had been redeemed since | **UNRELIABLE — exclude** |
| **pinksale** | 20,207/20,226 = **99.9%** | Real contract read: `getLockById().unlockedAmount` | 86/100 genuinely unclaimed; Polygon 16/25 only | **FIXABLE — ~90% after a fresh re-read; Polygon is stale** |
| **unvest** | 15,816/19,009 = **83%** | Subgraph `holderBalance.claimed` | 39/40 reconcile *exactly* to the holder's VestedERC20 balance | **TRUSTED (best of the ten), with a staleness caveat** |
| **uncx** | 6,024/11,866 = **51%** | Subgraph `lock.sharesWithdrawn` | 71/75 match `getWithdrawableShares` | **TRUSTED — ~48% corrected; amounts are *shares*, not tokens** |
| **team-finance** | 2,234/4,663 = **48%** | Derived from Squid `vestingClaims` events | 5/18 "unclaimed" rows have a **completely empty escrow** | **UNRELIABLE as published — ~28% false positives; FIXABLE** |
| **superfluid** | 345/3,200 = **11%** | Subgraph `settledAmount` — *amount streamed*, not withdrawn | 5/5 samples: `cliffAndFlowExecutedAt = null` — the schedule **never executed** | **UNRELIABLE — wrong semantic (push, not claim)** |
| **magna** | 0/8,715 = **0%** | Real contract read `distributionState.withdrawn` | 10,424/10,424 rows have `withdrawn > 0` **by construction** | **UNRELIABLE — total selection bias; exclude** |
| **llamapay** | 645/653 = **99%** | Sum of subgraph `Withdraw` events | On-chain `withdrawable = 0`, `owed` = full — it is **unfunded debt**, not unclaimed vesting | **UNRELIABLE — not a vesting schedule; exclude** |
| **sablier-flow** | 369/371 = **99%** | Subgraph `withdrawnAmount` | 3/5 have `withdrawableAmountOf = 0`; all are live/paused payroll streams | **UNRELIABLE — not a vesting schedule; exclude** |
| **hoodlock** | 5/32 | Real contract read: `getLock().withdrawn` bool | **2/5 are already `withdrawn == true` on-chain** | **UNRELIABLE — n too small, chain is days old, rows stale** |

### Corrected headline

| Cohort | Figure |
|---|---|
| All ten protocols, as currently measured | 51,586 / 74,910 = **68.9%** |
| Publishable subset (pinksale + unvest + uncx, mainnet only), raw | 43,429 / 52,496 = **82.7%** |
| Same subset after applying measured per-protocol false-positive rates | **≈ 78%** (plausible range 75–82%) |

If you must publish one number today, publish it for **Unvest and UNCX only** (the two that
survive on-chain verification with a <6% error rate) and say so explicitly. Do not publish an
all-protocol average: Hedgey, Magna, LlamaPay and Sablier Flow between them contribute ~13,000
rows whose values are structurally determined rather than measured.

---

## 2. Two defects that affect the cohort itself, not just one protocol

### 2.1 `end_time` is insert-only — the cohort selector reads a frozen column

`src/lib/vesting/dbcache.ts:275-294` — the `onConflictDoUpdate` `set` block updates
`is_fully_vested`, `stream_data`, `last_refreshed_at` and `token_symbol`. **It does not include
`endTime`.** The `end_time` column therefore keeps whatever value the row had the first time it
was ever inserted, while the real value inside `stream_data->>'endTime'` keeps moving.

Measured drift (`end_time` column vs the JSON it was copied from):

| Protocol | Rows | Column ≠ JSON |
|---|---|---|
| sablier-flow | 373 | **373 (100%)** |
| llamapay | 668 | **666 (99.7%)** |
| uncx-vm | 5,077 | 3,926 (77%) |
| pinksale | 27,550 | 311 |
| streamflow | 10,722 | 164 |
| hoodlock | 652 | 33 |
| hedgey | 6,822 | 21 |
| unvest / team-finance / superfluid / doppler / smithii | — | 0 |

Visible directly in a LlamaPay row: `col_end = 2026-05-04`, `json_end = 2026-09-14`.

This is benign for protocols with a genuinely fixed schedule end. It is fatal for LlamaPay and
Sablier Flow, where the adapters deliberately set `endTime = nowSec` (see §3.8/§3.9) — the frozen
column turns the first-sight timestamp into a permanent "ended on" date, so **every** such row
falls into "finished 30+ days ago" as soon as 30 days pass. That is exactly why those two read
373/373 and 663/668.

### 2.2 Testnet rows are in the cohort

| Protocol | Cohort rows | Of which testnet (Sepolia etc.) |
|---|---|---|
| team-finance | 4,703 | **815 (17%)** |
| hedgey | 4,017 | **456 (11%)** |
| uncx | 11,982 | 144 (1%) |

Team Finance's Sepolia rows are the worst offenders: 417 of the 815 have `withdrawnAmount = 0`,
i.e. testnet data is inflating the "unclaimed" count on a chain where nobody has any reason to
claim.

### 2.3 Read `last_refreshed_at` correctly

`dbcache.ts` documents that `lastRefreshedAt` means "when this row's data last *moved*", not "when
we last looked" — **except** that the `setWhere` clause force-bumps any row the seeder touches that
is more than 23 hours old. So a row with `last_refreshed_at` older than ~1 day means the pipeline
**did not fetch it**. Cohort staleness:

| Protocol | Cohort | >30d stale | >90d stale |
|---|---|---|---|
| unvest | 19,830 | 17,289 | **16,708 (84%)** |
| uncx | 11,982 | 9,587 | **8,324 (69%)** |
| superfluid | 3,205 | 1,953 | **1,953 (61%)** |
| hedgey | 4,017 | 1,195 | 1,078 (27%) |
| magna | 9,225 | 8,345 | 0 |
| hoodlock | 84 | 66 | 0 |
| pinksale | 20,828 | 1,467 | 1,046 (5%) |
| team-finance | 4,703 | 217 | 217 (5%) |
| llamapay / sablier-flow | 663 / 373 | 65 / 10 | 41 / 5 |

Unvest, the single most trustworthy protocol by adapter design, has the *stalest* cohort. See
§3.3 — I tested whether that staleness actually breaks it, and it mostly does not, but this is the
thing to fix before publishing.

---

## 3. Evidence per protocol

### 3.1 hedgey — UNRELIABLE (exclude)

**Code.** `src/lib/vesting/adapters/hedgey.ts:245` and `src/lib/vesting/indexer/hedgey.ts:260`
both emit:

```
withdrawnAmount: "0",
```

It is a string literal. Nothing in the Hedgey path has ever read a redemption. The 100% figure is
an identity, not a measurement: `0 < totalAmount * 0.99` is true for every row with a non-zero
total.

**Design.** Hedgey `TokenVestingPlans` plans are ERC-721s. `redeemPlans` **reduces
`plans[id].amount`** by the redeemed balance and advances `plans[id].start`; a fully-redeemed plan
is deleted and the NFT burned. So our `totalAmount` is the *remaining* balance, not the original
grant — a plan that redeemed 80% appears as "100% of a smaller total, unclaimed".

**On-chain.** `plans(planId)` + `ownerOf(planId)` + `planBalanceOf(planId, now, now)` on
`0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C`:

| Sample | On-chain `amount` | Owner | Redeemable | Escrow balance of token | Real? |
|---|---|---|---|---|---|
| 137 / plan 50743 (FAST) | `5.95e28` = our total | `0x3d89…93c4` | full | `2.40e29` | **yes, genuinely sitting there** |
| 8453 / plan 1927 (PANES) | `0` | **`ownerOf` reverts — burned** | n/a | `0` | **no — plan was fully redeemed; our row is a ghost** |
| 8453 / plan 1796 (WTF?) | `6.667e27` = our total | `0xdF52…3402` | full | `9.17e27` | yes |
| 8453 / plan 1082 (BLONDE) | `5e27` = our total | `0x9396…300d` | full | `5e27` (exact) | yes |
| 8453 / plan 2258 (BILL) | `3e27` = our total | `0x0000…e8e1` | full | `4.2e27` | yes |

So the tokens *are* usually there — but that is guaranteed by survivorship, because fully-redeemed
plans are burned out of existence and partial redemptions silently shrink the number we call
"total". Direct proof of the shrink, comparing cached `totalAmount` against the live `plans().amount`
for rows last written >60 days ago:

```
chain 1    : n=30  unchanged=26  partially-redeemed=0  fully-redeemed(zeroed)=4
chain 8453 : n=30  unchanged=22  partially-redeemed=2  fully-redeemed(zeroed)=6
  SHRUNK hedgey-8453-2188: cached 3.000e27 -> onchain 1.244e27
  SHRUNK hedgey-8453-2352: cached 1.183e24 -> onchain 5.331e22
```

**10 of 60 (17%)** of our stale Hedgey rows had been redeemed in whole or part since we wrote them,
and all 60 of them say `withdrawnAmount: "0"`.

*(A separate check of 120 random finished plans found 120/120 still alive — burned ghosts like plan
1927 are rare in the cache, which is itself the survivorship problem: the claimers leave the
dataset.)*

**To make it real:** index `PlanRedeemed` / `PlanTokensUnlocked`
(`0xa6faee2246474597b6de7c76bf9a45d256737543cb0806e6e805b55b38c7663f` /
`0x40da6a62b19e79f1c35eb951a73fb30a757ea574fd119f923ce6792869e0713a`) per plan id, keep the
`PlanCreated` amount as `totalAmount`, and sum redemptions into `withdrawnAmount`. Also retain
burned plans as `withdrawn == total` instead of leaving stale ghosts in the cache.

### 3.2 pinksale — FIXABLE (~90%, not 99.9%)

**Code.** `src/lib/vesting/adapters/pinksale.ts:404,433` — `withdrawn = lock.unlockedAmount`,
straight from the PinkLock V2 lock struct. This is a genuine contract read, and it is the right
field: PinkLock never deletes locks, so a fully-unlocked lock persists with
`unlockedAmount == amount`.

**On-chain, five largest cohort rows (BSC PinkLock `0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe`,
`getLockById(id)`):** all five returned `unlockedAmount = 0`, matching our cache exactly, and for
four of them the locker's balance of that token **equals the lock amount to the wei** — the tokens
are unambiguously still escrowed.

```
lock 1022645  amount 1.0e52  unlockedAmount 0  lockerBal 1.0e52   (tgeDate 2022-08-31)
lock 1060233  amount 8.547e40 unlockedAmount 0  lockerBal 8.547e40 (exact)
lock 1060212  amount 7.256e40 unlockedAmount 0  lockerBal 7.256e40 (exact)
lock 1034520  amount 2.0e40   unlockedAmount 0  lockerBal 2.0e40   (exact)
lock 1020913  amount 9.999e39 unlockedAmount 0  lockerBal 9.999e39 (exact)
```

**Census, 25 random `withdrawn = 0` cohort rows per chain:**

| Chain | n | Genuinely unclaimed | On-chain already unlocked (false positive) |
|---|---|---|---|
| BSC (56) | 25 | 24 | 1 (4%) |
| Ethereum (1) | 25 | 23 | 2 (8%) |
| **Polygon (137)** | 25 | **16** | **9 (36%)** |
| Base (8453) | 25 | 23 | 2 (8%) |

Positive control — 20 random rows where we *do* record a withdrawal: **20/20 matched the contract
exactly** on both `amount` and `unlockedAmount`. The adapter is correct; the errors are staleness,
concentrated on Polygon.

Population-weighted false-positive rate ≈ **9.5%**, so the true figure is **≈ 90%**, not 99.9%.

**Composition caveat you must publish alongside it.** This cohort is dominated by BSC 2022
launchpad locks on dead tokens with absurd supplies (`1e52` raw units, symbols like `SexDOGE`,
`VIRUSCAT`, `CANGINAO`). "Nobody unlocked" is literally true and also uninteresting — the projects
are abandoned. A value-weighted figure would be meaningless here.

**To make it real:** re-read the full cohort (it is a direct `getLockById` multicall, cheap) before
publishing, and fix whatever is starving the Polygon PinkSale seeder.

### 3.3 unvest — TRUSTED (the one to lead with)

**Code.** `src/lib/vesting/adapters/unvest.ts:192,245` — `withdrawn = BigInt(raw.claimed)` from the
Unvest subgraph's `holderBalance` entity. Independent of our own event handling.

**Design.** Unvest issues a transferable `VestedERC20`; the holder calls `claim()`, which burns
their vested tokens in exchange for the underlying. So the holder's balance of the vesting token
*is* the unclaimed allocation — a perfect independent check, and fully-claimed holders keep their
entity (3,126 cohort rows already have `withdrawn >= total`), so there is no survivorship bias.

**On-chain, five largest cohort rows — `balanceOf(holder)` on the vesting token:**

| Sample | Our total | Our withdrawn | Our remaining | Holder's vesting-token balance | Match |
|---|---|---|---|---|---|
| 1 / azETH | 9.2139e29 | 0 | 9.2139e29 | **9.2139e29** | exact |
| 8453 / RIN-TEAM | 1.7778e28 | 4.4445e27 | 1.3333e28 | **1.3333e28** | exact |
| 137 / vDOBLE | 1.01e28 | 0 | 1.01e28 | **1.01e28** | exact |
| 8453 / RIN-TEAM | 8.8889e27 | 6.7723e27 | 2.1166e27 | **2.1166e27** | exact |
| 1 / esETH SEED | 7e27 | 0 | 7e27 | **7e27** | exact |

Five for five, to the wei, including two partial claimers — the subgraph's `claimed` is real.

**Census, 20 random `withdrawn = 0` cohort rows from each freshness bucket:**

```
STALE (>90d) : n=20  still holds full balance = 20   actually claimed = 0
FRESH (<30d) : n=20  still holds full balance = 19   actually claimed = 1
```

**39/40.** Remarkably, the 84% staleness does *not* translate into errors — these are finished
schedules on abandoned tokens, and nothing moves.

**Caveats to state in the piece.**
- The `VestedERC20` is transferable, so `balanceOf = 0` can mean "sold the position", not "claimed".
  That cuts both ways and is a real limit of the metric, for us and for anyone else measuring it.
- 84% of the cohort has not been re-fetched in 90+ days. Re-run the Unvest seeder before publishing
  so the number is as of publication date.
- Some rows have a suspect shape: `recipient == tokenAddress` with symbol `ETH` (e.g.
  `unvest-1-0x1a0f…-0xf602…`). On-chain, `0x1a0f…` really is an ERC-20 called `ETH` that holds the
  vesting position, so the row is not corrupt — but the `tokenSymbol`/`recipient` labelling is
  confusing enough that any chart derived from it needs a look first.

### 3.4 uncx — TRUSTED (~48%), but the amounts are shares

**Code.** `src/lib/vesting/adapters/uncx.ts:184,222` — `withdrawn = BigInt(raw.sharesWithdrawn)`
from the UNCX TokenVesting V3 subgraph.

**On-chain, `getWithdrawableShares(lockID)` / `getWithdrawableTokens(lockID)` on the per-chain
TokenVesting vaults (ETH `0xdba68f07…`, BSC `0xeaed594b…`, Base `0xa8268552…`):**

| Sample | Our total | `getWithdrawableShares` | `getWithdrawableTokens` | Vault's balance of the token |
|---|---|---|---|---|
| 1 / lock 5144 (PNDX) | 1.29686e58 | **1.29686e58** (match) | **0** | **0** |
| 56 / lock 69062 (Broccoli) | 3.986e35 | 3.986e35 | 3.986e35 | 3.986e35 (exact) |
| 56 / lock 67027 (TFP) | 2.2354e35 | 2.2354e35 | 2.2354e35 | 2.2354e35 (exact) |
| 8453 / lock 900 (MOK) | 9.9633e33 | 9.9633e33 | 9.9633e33 | 9.9633e33 (exact) |
| 1 / lock 5021 (BTC2) | 1.57447e33 | 1.57447e33 | 1.57447e33 | 1.57447e33 (exact) |

Four of five: the full amount is genuinely unwithdrawn and physically present in the UNCX vault.

The PNDX case is the caveat that matters: the **shares** are intact but the vault holds **zero**
of the underlying token. UNCX is share-accounted, so our `totalAmount` is a share count, and for
rebasing/dead tokens it can correspond to nothing. **Never publish a token- or value-weighted UNCX
figure**; count-weighted is fine.

**Census, 25 random cohort rows per chain, comparing on-chain remaining shares to our
`total − withdrawn`:**

```
chain 56   : n=25  matches=24  on-chain lower (claim missed)=1
chain 1    : n=25  matches=23  on-chain lower (claim missed)=2
chain 8453 : n=25  matches=24  on-chain lower (claim missed)=1
```

**71/75 (5.3% false positives)** → corrected figure **≈ 48%**, essentially the reported 51%.
Also drop the 144 Sepolia rows.

### 3.5 team-finance — UNRELIABLE as published, FIXABLE

**Code.** `src/lib/vesting/adapters/team-finance.ts:331,365` — `withdrawn = claimTotals.get(key)
?? 0n`, where `claimTotals` is built from the Team Finance Squid's `vestingClaims` events, keyed
`wallet:vestingContract`. So `withdrawnAmount` is **derived from a third-party event index with a
default of zero** — exactly the shape that silently converts "we have no claim data" into "nobody
claimed". The file's own header already records that Base was dropped for this reason
("TF's Squid has zero Base data, so per-wallet REST Base vestings can't get correct withdrawn
amounts").

**On-chain, four cohort rows — ERC-20 `balanceOf(vestingContract)` reconciled against our
outstanding for that contract:**

| Chain | Vesting contract | Rows we hold | Our outstanding | Contract's token balance | Ratio |
|---|---|---|---|---|---|
| 56 | `0xd1926c48…` (NEI) | 1 | 3.08219178e26 | **3.08219359e26** | **1.000 — perfect** |
| 1 | `0x59036035…` (TITR), our withdrawn = **0** | 1 | 2.0e27 | 4.9667e26 | **0.248 — 75% of the tokens are gone** |
| 1 | `0x64396ad4…` (RPILL) | 5 | 3.1386e26 | 1.1957e29 | 381 — shared escrow, inconclusive |

The TITR row is a single-beneficiary contract: our data says 2.0e27 is unclaimed, the escrow holds
4.97e26. The beneficiary claimed and the Squid never told us.

**Census, 18 random single-beneficiary cohort rows with `withdrawn = 0`:**

```
escrow holds the full amount          = 13
escrow is COMPLETELY EMPTY (bal = 0)  =  5
```

```
SHORT chain56 0x52c716c8… total 5.0e22   bal 0
SHORT chain56 0xdc347931… total 2.1429e22 bal 0
SHORT chain56 0x8f162ec2… total 1.7391e22 bal 0
SHORT chain56 0xdd4674dd… total 2.09e23   bal 0
SHORT chain56 0x5d5f505d… total 2.1429e22 bal 0
```

**~28% false positives** on the `withdrawn = 0` subset (the escrow is empty, so the tokens were
either claimed or the grant was revoked — either way it is not "sitting there unclaimed"). Add the
17% Sepolia contamination and the 48% figure is not defensible.

None of `released(address)`, `claimed(address)`, `claimedAmount`, `withdrawnAmount`,
`getVestingSchedule`, `getClaimableAmount` or `beneficiaries` resolve on the V3 vesting contracts,
so there is no cheap per-wallet view to fall back on.

**To make it real:** stop defaulting to `0`. Either (a) treat "no Squid coverage for this
chain/contract" as `null` and exclude the row from any claimed/unclaimed statistic, or (b) index
the vesting contracts' own claim/withdraw events over RPC per chain, or (c) at minimum
cross-check single-beneficiary contracts against `balanceOf(vestingContract)` and void the row
when the escrow cannot cover what we claim is outstanding. Drop Sepolia from research cohorts.

### 3.6 superfluid — UNRELIABLE (the metric does not apply)

**Code.** `src/lib/vesting/adapters/superfluid.ts:276` — `withdrawnAmount: settled.toString()`
where `settled = raw.settledAmount` from Superfluid's own vesting-scheduler subgraph.

**Design mismatch.** Superfluid vesting is **push**, not pull. The `VestingScheduler` streams the
SuperToken to the receiver; the receiver never claims, and the tokens are **never escrowed** — they
stay in the sender's wallet and move under an ACL permission. `settledAmount` is "how much has been
streamed/settled", which is not a withdrawal. "Unclaimed" has no referent here.

**On-chain/subgraph check, the five largest `unclaimed` cohort rows (all Optimism, OPx), queried
live against `https://subgraph-endpoints.superfluid.dev/optimism-mainnet/vesting-scheduler`:**

| Schedule | totalAmount | settledAmount | `cliffAndFlowExecutedAt` | `endExecutedAt` | `deletedAt` / `failedAt` |
|---|---|---|---|---|---|
| `0xe82282…-22-v2` | 3.5909e23 | **0** | **null** | null | null / null |
| `0x5e1fd4…-52-v3` | 2.5e23 | **0** | **null** | null | null / null |
| `0xc80f9c…-386-v3` | 2.0100e23 | **0** | **null** | null | null / null |
| `0xab5e91…-162-v3` | 1.8266e23 | 1.3994e23 | **null** | null | null / null |
| `0xb151d6…-972-v2` | 1.7553e23 | **0** | **null** | null | null / null |

`cliffAndFlowExecutedAt = null` on all five: these schedules were **created and never executed**.
Nobody ever called `executeCliffAndFlow`, so no tokens ever moved. Our data reports them as
"finished vesting schedules with 100% unclaimed tokens". They are closer to "vesting that never
started", and there are no tokens sitting anywhere for a recipient to collect.

**Verdict: exclude.** If you want a Superfluid statistic at all, it is a different and genuinely
interesting one — *"N% of Superfluid vesting schedules were created but never executed"* — and it
needs `cliffAndFlowExecutedAt` / `endExecutedAt` / `failedAt` pulled into `stream_data` first (they
are in the query but not persisted).

### 3.7 magna — UNRELIABLE (pure selection artefact; exclude)

**Code.** `src/lib/vesting/indexer/magna.ts:462,481,519` — `withdrawn =
alloc.distributionState.withdrawn`, a real contract read from
`getCalendarLeafAllocationData` / `getIntervalLeafAllocationData`. The *value* is trustworthy.

**The population is not.** The indexer's own header states the mechanism
(`src/lib/vesting/indexer/magna.ts:5-32`): Magna is merkle-based, allocations live in off-chain
leaves, and **a row can only exist because a claim revealed the leaf** — the indexer watches ERC-20
transfers out of each vester, decodes the `withdraw()` calldata, and replays the proof. Phase 3
(Magna's Portal API, which would cover never-claimed allocations) is not built; `magna.ts` is the
only writer of `protocol = "magna"` rows apart from `magna-claims.ts`.

Consequence, measured:

```
magna rows: 10424   with withdrawnAmount = 0: 0   min withdrawnAmount: 10000000 wei
```

**Zero** rows out of 10,424 have never claimed. 0% unclaimed is therefore tautological: the dataset
*is* the set of claimers. The never-claimed Magna population — precisely the thing the research
question asks about — is 100% invisible to us. (Today's re-measurement reads 4.4%, not 0%, because
the cohort now includes partial claimers; the bias is identical.)

**Escrow reconciliation** (ETH, `balanceOf(vester)`):

| Vester | Leaves we know | Our outstanding | Vester escrow | Ratio |
|---|---|---|---|---|
| `0x47c0b1c0…` (TREAT) | 104 | 1.2457e27 | 5.4270e26 | **0.44** |
| `0xcaeb505c…` (MOCA) | 17 | 2.8452e25 | 3.1301e25 | 1.10 |

The 0.44 ratio shows our Magna `withdrawn` values are also stale (median refresh 2026-09-01) on top
of the selection bias.

**To make it real:** Phase 3 — Magna Portal API ingestion of full allocation lists, so the
denominator includes recipients who never claimed. Until then Magna cannot answer this question in
either direction.

### 3.8 llamapay — UNRELIABLE (not a vesting schedule; exclude)

**Code.** `src/lib/vesting/adapters/llamapay.ts:1-38` is explicit about the mapping:

```
totalAmount     = streamedSoFar (at fetch time)
withdrawnAmount = sum of historical Withdraw events
endTime         = nowSec
isFullyVested   = true
```

A LlamaPay stream has **no fixed total and no end**. `endTime = nowSec` is a snapshot clock. Combined
with the frozen `end_time` column (§2.1 — 666/668 rows drift), every LlamaPay row becomes "finished
30+ days ago" automatically. 663 of 668 rows are in the cohort. That is the whole explanation for 99%.

**On-chain, `withdrawable(from, to, amountPerSec)` on the per-token LlamaPay contract, for cohort
rows with `withdrawnAmount = 0`:**

| Row | col `end_time` | json `endTime` | Our "unclaimed" | On-chain `withdrawable` | On-chain `owed` |
|---|---|---|---|---|---|
| `llamapay-1-0x3e67cc2c…` | 2026-05-04 | 2026-09-14 | 100,634,760 | **1,999,999** | 100,133,319 |
| `llamapay-1-0xb70b0fee…` | 2026-05-04 | 2026-09-14 | 2.3174e20 | **0** | 2.3797e20 |
| `llamapay-1-0xb70b0fee…` | 2026-05-04 | 2026-09-14 | 1.8639e18 | **0** | 1.8960e18 |

The frozen-column drift is visible in the first two columns. More importantly, `withdrawable = 0`
with a large `owed`: the payer's deposit is **exhausted**, so the recipient cannot withdraw at all.
Our "unclaimed vested tokens" is unfunded streaming **debt** — a completely different phenomenon,
and in two of three cases there are no tokens anywhere to claim.

Also note the `totalAmount` arithmetic is unsound for some rows: the largest FRAX row carries
`2.1159e70` raw units (≈1e52 FRAX), which is not a real quantity.

**Verdict: exclude from this research entirely.** It is `category: "stream"`, not `"vesting"`, and
it has no finish line. Any future claimed/unclaimed stat for LlamaPay has to be built on
`withdrawable` (deposit-capped), not on time-accrued `streamedSoFar`.

### 3.9 sablier-flow — UNRELIABLE (not a vesting schedule; exclude)

**Code.** `src/lib/vesting/adapters/sablier-flow.ts:9-23` — same deliberate mapping as LlamaPay:
`totalAmount = streamed-so-far`, `endTime = nowSec`, `isFullyVested = true`. `withdrawnAmount` is a
real subgraph field, but `totalAmount` is a moving snapshot. **373/373 rows have a frozen `end_time`
column**, so 100% of Sablier Flow is in the cohort.

**On-chain, the five largest cohort rows (`withdrawableAmountOf`, `isVoided`, `statusOf` on each
Flow contract):**

| Sample | Our "unclaimed" | `withdrawableAmountOf` | `statusOf` | `isVoided` |
|---|---|---|---|---|
| 56 / `0x5505c239…` #3 | 7.533e37 | **0** | 2 (paused) | false |
| 137 / `0x62b6d5a3…` #2 | 1.503e37 | **0** | 2 (paused) | false |
| 8453 / `0x6fe93c7f…` #5 | 2.028e28 | 5.450e27 (27% of ours) | 1 (streaming, insolvent) | false |
| 8453 / `0x0cbfe6ce…` #2 | 9.762e26 | 3.709e26 (38% of ours) | 2 (paused) | false |
| 56 / `0x4c4610af…` #5 | 3.195e26 | **0** | 1 (streaming, insolvent) | false |

Three of five have **nothing withdrawable**; the other two have 27–38% of what we call unclaimed.
None of them is a finished vesting schedule — they are live or paused payroll streams. Exclude.

### 3.10 hoodlock — UNRELIABLE (n too small, rows stale)

**Code.** `src/lib/vesting/adapters/hoodlock.ts:112` — `withdrawn = l.withdrawn ? l.amount : 0n`,
read from `getLock().withdrawn` (a bool). The right field, all-or-nothing by design.

**On-chain, all five cohort samples, `getLock(id)` on
`0xd0f7d8c6e9f6d80c297bebe4f7fd1b9c8125c32f` (Robinhood Chain 4663):**

| Lock | Our withdrawn | On-chain `withdrawn` | Locker's balance of the token | Real? |
|---|---|---|---|---|
| 143 (TEST40) | 0 | `false` | 9.0e26 (exact) | yes |
| 6 (ROBBIN) | 0 | `false` | 4.0e25 (exact) | yes |
| 19 (POI) | 0 | `false` | 1.0e25 (exact) | yes |
| 100 (EQUITY) | 0 | **`true`** | **0** | **no — already withdrawn** |
| 156 (LOCK) | 0 | **`true`** | — | **no — already withdrawn** |

**2 of 5 false positives** from stale rows (last refreshed 2026-08-30 / 09-01; 66 of 84 cohort rows
are >30 days stale). With n = 32–84 on a chain that launched weeks ago, and token symbols like
`TEST40`, `POI` and `EQUITY`, there is no publishable statistic here regardless.

**To make it real:** a trivial fix — re-read `getLock` for the whole set (fewer than 700 locks) on
every cron tick. Then revisit when n is meaningful.

---

## 4. What to do before publishing

**Exclude outright (artefacts, not measurements):** hedgey, magna, llamapay, sablier-flow,
superfluid, hoodlock. That is ~17,500 cohort rows and every one of the suspicious clean 0%/100%
figures.

**Publishable now, with corrections:** unvest (≈81% after a 2.5% correction) and uncx (≈48%). Say
plainly that the figure covers two protocols, is count-weighted not value-weighted, and that UNCX
amounts are share-denominated.

**Publishable after one fresh seeder run:** pinksale (≈90%, pending the Polygon staleness fix).

**Fix before any future run of this analysis:**

1. Add `endTime: sql\`excluded.end_time\`` to the `onConflictDoUpdate` set in
   `src/lib/vesting/dbcache.ts:275-294`. The cohort selector currently reads an insert-only column.
2. Exclude `category: "stream"` protocols (llamapay, sablier-flow) from anything described as a
   "finished schedule" — they have no end.
3. Exclude testnet chain ids (11155111, 84532, 80002, 97, 421614, 11155420) from research cohorts.
4. Stop defaulting `withdrawnAmount` to `0` when the source has no coverage — Hedgey's literal
   `"0"` and Team Finance's `?? 0n` are the two places where "unknown" is being published as
   "unclaimed". Use `null` and exclude.
5. Re-fetch the cohort immediately before measuring; 84% of Unvest and 69% of UNCX rows had not
   been looked at in 90 days.

---

## Appendix: how this was measured

- Cohort re-measured from `vesting_streams_cache` with
  `end_time < extract(epoch from now()) - 2592000` and
  `(stream_data->>'withdrawnAmount')::numeric < (stream_data->>'totalAmount')::numeric * 0.99`.
  (`end_time` is a bigint of unix seconds, not a timestamp.)
- RPC endpoints: the repo's `.env.local` values for Ethereum, BSC, Polygon and Base; public
  endpoints for Arbitrum (`arb1.arbitrum.io/rpc`), Optimism (`mainnet.optimism.io`) and Robinhood
  Chain (`rpc.mainnet.chain.robinhood.com`).
- Contract views used: Hedgey `plans` / `ownerOf` / `planBalanceOf`; PinkLock V2 `getLockById`;
  UNCX TokenVesting V3 `getWithdrawableShares` / `getWithdrawableTokens`; Unvest VestedERC20
  `balanceOf`; HoodLock `getLock`; Sablier Flow `withdrawableAmountOf` / `statusOf` / `isVoided`;
  LlamaPay `withdrawable`; ERC-20 `balanceOf` for every escrow reconciliation.
- Superfluid was checked against its own hosted vesting-scheduler subgraph for the execution-state
  fields (`cliffAndFlowExecutedAt`, `endExecutedAt`, `deletedAt`, `failedAt`) that our cache does
  not persist.
