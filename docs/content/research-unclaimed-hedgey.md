# Unclaimed finished vesting: Hedgey

**Vestream original research, Hedgey part.**
Measurement date: **2026-10-09**. "Finished" means the plan's original end time is before **2026-09-06** (ended 30+ days ago), the same definition the Sablier, UNCX, Unvest and Team Finance parts use.
Scope: `hedgey` on Ethereum, BNB Chain, Polygon, Base, Arbitrum and Optimism. All four Hedgey plan contracts are covered (same address on every chain):

| Contract | Address | Indexed by the app? |
|---|---|---|
| TokenVestingPlans (TVP) | `0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C` | **Yes, the only one** |
| VotingTokenVestingPlans (VTVP) | `0x1bb64AF7FE05fc69c740609267d2AbE3e119Ef82` | No |
| TokenLockupPlans (TLP) | `0x1961A23409CA59EEDCA6a99c97E4087DaD752486` | No |
| VotingTokenLockupPlans (VTLP) | `0x73cD8626b3cD47B009E68380720CFE6679A3Ec3D` | No |

`vesting_streams_cache` was **not** used for any number (see the protocol-trust report: `withdrawnAmount` is a literal `"0"` and `totalAmount` is the remaining balance).

---

## For the graphic

All figures are **third-party only**: plans where the current holder is not the creator. They also exclude revoked plans, test-named tokens and burn/token-contract recipients. Exclusions are listed in §0.

### 1. Finished plans and how many are unclaimed

| Population | Finished plans | Unclaimed (>1% still held) | Rate | Tokens |
|---|---|---|---|---|
| **All tokens** | **140,464** | **57,417** | **40.9%** | 298 with unclaimed (355 finished) |
| All tokens, excluding the 2 mass distributions (MASA on Base, GX on Polygon) | 29,007 | 12,370 | **42.6%** | 294 |
| **Tokens that still trade** (pool >= $10k) | **3,733** | **1,080** | **28.9%** | 72 with unclaimed (79 finished) |
| Still trade, excluding the Polygon USDC claim campaign | 3,196 | 742 | 23.2% | — |

**Headline: about 4 in 10 finished Hedgey plans still hold tokens (41%, or 43% without the two mass distributions). In tokens that still trade, it is about 3 in 10 (29%).**

Read §1.1 before using the all-tokens row. Two single-token distributions are 79% of the finished count and 78% of the unclaimed count, and neither token has a DEX pair. The rate barely moves without them (40.9% vs 42.6%), so the rate is safe. The raw count (57,417) is not; see "Numbers not safe to publish".

### 2. Never touched

| Population | Never redeemed anything, as a share of unclaimed |
|---|---|
| All tokens | 96.2% (55,238 of 57,417). Inflated by MASA and GX |
| **All tokens, excluding MASA and GX** | **82.7%** (10,229 of 12,370) |
| **Tokens that still trade** | **85.6%** (925 of 1,080) |

**About 5 in 6 unclaimed finished Hedgey plans were never touched once.**

### 3. Value in tokens that still trade

| Basis | Value |
|---|---|
| Mark-to-market (third-party, pool >= $10k) | $8,248,917 (1,080 plans, 72 tokens) |
| **Same, each token capped at its pool depth** | **$2,298,676** |
| Capped, excluding Derive (DRV) | $1,448,490 |
| Strict: pool >= $100k **and** >= $10k 24h volume, capped | $1,899,121 (553 plans, 26 tokens) |

**Headline the pool-capped figure: "about $2.3 million".** Do not use the $8.2M mark-to-market figure. **DRV on Ethereum is $5.98M of it, against a $219,984 pool**, so 72% of the mark-to-market total cannot be sold at that price. Give $1.9M as the conservative floor if a range is wanted.

Capped value by chain: Base $1.22M, Ethereum $0.99M, Arbitrum $46k, Optimism $21k, BNB Chain $15k, Polygon $7k.

### 4. Value ladder (third-party, tokens that still trade, mark-to-market per plan)

| Unclaimed value per plan | Plans | Of which never touched | Total |
|---|---|---|---|
| **Over $100,000** | **10** | 9 | $5,040,479 |
| **Over $10,000** (incl. the 10 above) | **88** | 76 | $7,781,449 |
| **Over $1,000** (incl. the above) | **195** | 138 | $8,170,893 |
| $1,000 – $10,000 | 107 | 62 | $389,444 |
| **Under $1,000** | **885** | 787 | $78,024 |
| — of which **under $1** | **320** | 307 | **$61** |

Median plan: **$18.48**. 8 of the 10 plans over $100k are DRV (7 on Ethereum, 1 on Base). The ladder is mark-to-market; 81 plans are each worth more than 10% of their token's pool.

### 5. Distinct recipient wallets with unclaimed plans

| Population | Wallets |
|---|---|
| All tokens | **51,315** (10,436 excluding MASA and GX) |
| Tokens that still trade | **802** |

### 6. Oldest and largest

**Oldest unclaimed plan in a token that still trades:** USDC on BNB Chain, TokenLockupPlans #1. It ended 2023-11-29, **34.3 months ago**, was never touched, and is worth **$0.10**.
Oldest with real money in it: **ARB on Arbitrum, TokenVestingPlans #280, $10,257.** It ended 2024-01-26, **32.4 months ago**. The recipient took 71.4% and stopped.
**Best single example: ARB on Arbitrum, TokenVestingPlans #1517, $26,925.** 150,000 ARB, ended 2024-08-12 (**25.9 months ago**), never touched. That is 1.4% of a $1.88M pool with $5.6M of 24h volume, so there is no pool-depth caveat.

**Largest single plan: DRV (Derive) on Ethereum, TokenVestingPlans #4494, $2,261,000 mark-to-market.**
- Ended 2025-11-15, **10.8 months ago**, never touched. 5,000,000 DRV.
- Pool liquidity **$219,984**, 24h volume $541,520.
- **Pool-depth caveat: the plan is 1,028% of the token's whole Ethereum pool.** Realisable value is at most about $220k. All 87 Ethereum DRV plans together are $5.98M against that one pool.
- The recipient is an EOA that has never sent a transaction (nonce 0). The creator is a 5-signer Safe that shares no signers with the recipient.

The largest plan that sits **under 10% of its pool** is **DRV on Base, TokenVestingPlans #1504, $152,087**. It ended 2025-07-17, **14.8 months ago**, and was never touched. It is 2.8% of a $5.43M pool with $6.3M of 24h volume.

### 7. On-chain verification of the top 10 (live `eth_call`, 2026-10-09)

For each plan I read, at the head block: `plans(id)` (token and remaining amount), `ownerOf(id)`, `planBalanceOf(id, now, now)` (redeemable now; the remainder must be 0) and `planEnd(id)`. I also read `balanceOf(contract)` for the token and compared it with the sum of `plans(id).amount` over **every** live plan of that token in that contract.

| # | Token | Chain | Plan | Value | Exists | Recipient owns NFT | Redeemable now = remaining | Ended | Contract holds plan | Contract holds all live plans of token | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | DRV | Ethereum | TVP #4494 | $2,261,000 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |
| 2 | DRV | Ethereum | TVP #4493 | $603,280 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |
| 3 | DRV | Ethereum | TVP #4492 | $522,405 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |
| 4 | DRV | Ethereum | TVP #2052 | $439,557 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |
| 5 | DRV | Ethereum | TVP #4488 | $419,498 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |
| 6 | DRV | Ethereum | TVP #4491 | $302,557 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |
| 7 | DRV | Base | TVP #1504 | $152,087 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |
| 8 | EDEL | Base | TVP #2146 | $129,214 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (see note) | **PASS** |
| 9 | DRV | Ethereum | TVP #1969 | $105,440 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |
| 10 | DRV | Ethereum | TVP #1970 | $105,440 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **PASS** |

**10 of 10 pass.** The next five (ENS VTLP #170, DRV #2048, DRV #4489, ENS VTLP #11, #13) were also checked and all pass. For ENS on VotingTokenLockupPlans, the escrow check is per plan only, because voting plans can move tokens into per-plan voting vaults.

*EDEL note:* the first escrow check failed by 0.014%. That was my event-log sum being stale: a different EDEL plan redeemed after the Base scan finished. Re-reading all 118 EDEL plan IDs live gave owed = `balanceOf` **exactly** (313,761,563.08 EDEL each).

Snapshot blocks: Ethereum 26,155,696; Base 52,384,849.

---

## Numbers NOT safe to publish

1. **"$8.2M unclaimed"** (mark-to-market). Ethereum DRV is $5.98M of it, against a $220k pool, and one DRV plan alone is $2.26M. Use the capped $2.3M.
2. **"57,417 unclaimed plans" or "51,315 wallets"** as a count. Two distributions make up 78% of it, and neither token has a DEX pair ($0):
   - **MASA on Base**: 91,518 finished plans (65% of all finished) and 25,114 unclaimed (44%). They came from claim-campaign contracts.
   - **GX on Polygon**: 19,896 finished plans, **all** unclaimed (35% of unclaimed). One vesting admin made 49,163 GX plans in 13,946 transactions through the ERC-4337 EntryPoint. Most are under 5 GX. **29,221 GX plans were revoked**, which is why Polygon's revoked count is so high.

   If a count is needed, use the ex-MASA/GX figure: **12,370 unclaimed of 29,007 finished**.
3. **"96% never touched".** This is MASA and GX (plans of a few tokens, which nobody redeems). Use 83% (ex-mass) or 86% (still-trading).
4. **Any single-plan DRV figure without the pool caveat.** The top 6 plans are all Ethereum DRV, and every one is between 138% and 1,028% of the Ethereum pool. The 100 DRV plans across both chains belong to 41 wallets. They are third-party by our definition (EOA recipients, Safe creators, no shared signers), but the pattern looks like team or investor allocations, not a retail airdrop.
5. **"Revoked plans still hold $1.2M".** Revoked plans are excluded from every number above. But 20 revoked Ethereum DRV plans still hold **$1.21M** (mark-to-market) of tokens that vested **before** the revoke. Those tokens are still the recipient's to redeem. Do not add this to the headline, and do not say revoked plans "hold nothing".
6. **The still-trading rate without its concentration note.** Polygon USDC from one claim campaign is 338 of the 1,080 still-trading unclaimed plans (31%). Without it the rate is 23.2%.
7. **ENS ($473k, 14 plans, 13 from one Safe)** is real, and every plan is under 14% of the pool. But it is one grant programme, so do not present it as evidence of a broad pattern.

---

## 0. Population, sources and method

### Contract mechanics (verified source, Sourcify exact match)

- `createPlan` stores `Plan{token, amount, start, cliff, rate, period, vestingAdmin, adminTransferOBO}` and emits `PlanCreated(id, recipient, token, amount, start, cliff, end, rate, period, vestingAdmin, adminTransferOBO)`. The lockup contracts emit the same event without the last two fields, so it has a different topic.
- **`_redeemPlan`**: if `remainder == 0` it runs `delete plans[id]` and `_burn(id)`. Otherwise it sets **`plans[id].amount = remainder` and `plans[id].start = latestUnlock`**, where `latestUnlock = start + period * periodsElapsed`. It emits `PlanRedeemed(id, amountRedeemed, planRemainder, resetDate)`. `partialRedeemPlans` can redeem up to an earlier timestamp.
- **End date**: `endDate = start + ceil(amount / rate) * period`, from `TimelockLibrary.endDate`. Because redemption moves `start` forward by exactly as many periods as it removes from `amount`, **the end date never changes on redemption**. Verified: `planEnd(id)` equals `PlanCreated.end` for all 58,372 live finished plans read.
- **`_revokePlan`** (vesting contracts only): sends the unvested remainder to the vesting admin. If nothing had vested it deletes and burns the plan. Otherwise it sets `amount = vested balance` and `vestingAdmin = 0`. Event: `PlanRevoked(id, amountRedeemed, revokedAmount)`.
- The lockup contracts also have `segmentPlan` (`PlanSegmented`, which mints a new id without `PlanCreated`) and `combinePlans` (`PlansCombined`, which burns the second plan). There were 40 segment events and 1 combine across all chains.
- The vesting NFTs can only be moved by the vesting admin (`transferFrom` is overridden, and `_safeTransfer` reverts). Lockup NFTs are freely transferable.

### What was measured

1. **Every log from all four contracts** on all six chains, from just before deployment to the head (`eth_getLogs`, address-filtered, no topic filter):

| Chain | Log provider (window) | Plans created | Burned | Revoked |
|---|---|---|---|---|
| Ethereum | Tenderly public (1M blocks) | 14,800 | 9,579 | 543 |
| BNB Chain | NodeReal public key (50k) | 11,144 | 4,396 | 308 |
| Polygon | Tenderly public (1M) | 51,795 | 5,592 | 29,291 |
| Base | thirdweb + Tenderly (1k) | 96,246 | 68,242 | 287 |
| Arbitrum | Tenderly public (1M) | 2,936 | 1,168 | 170 |
| Optimism | mainnet.optimism.io (1M) | 684 | 155 | 28 |
| **Total** | | **177,605** | | |

   (blxrbdn was returning 503 for BSC, and mainnet.base.org was refusing this IP.)
2. **Completeness checks:**
   - Every `PlanCreated` id range is contiguous from 1 to max. The only gaps are in the lockup contracts, and each gap is exactly a `PlanSegmented` id.
   - Every chunk of every chain's block range is recorded as scanned.
   - For every plan without a segment, combine or revoke (146,917 plans), `remaining + Σ PlanRedeemed.amountRedeemed == PlanCreated.amount` **with zero exceptions**.
3. **Plan state from events:** original amount, original start, cliff, end, rate, period, admin, remaining, Σ redeemed, number of redemptions, revoked, burned and current owner (last `Transfer`).
4. **Live reconciliation:** for **all 58,372 live, non-revoked finished plans**, I read `plans(id)`, `ownerOf(id)` and `planEnd(id)` at the head. Event-derived remaining, owner and end matched the chain on **every one** (0 mismatches).
5. **Definitions:**
   - Original = `PlanCreated.amount` (`remaining + Σ redeemed` for segment/combine children).
   - Unclaimed = live and remaining > 1% of original.
   - Never touched = no `PlanRedeemed` for that id. A burned plan was fully redeemed.
6. **Prices:** DexScreener `/latest/dex/tokens/{address}`, one address per request, fetched 2026-10-08/09. I used the deepest pair on the same chain. A token on the quote side is priced as `priceUsd / priceNative`. No pair = $0. "Still trades" = that pool's `liquidity.usd >= $10,000`.

### Exclusions (finished plans)

| Reason | Plans |
|---|---|
| Revoked (29,221 of them are GX) | 30,142 |
| Test-named token (`Test Taco` 737 on Base, TestPEAR, dummy-PHI, "FLY test", TIMETST…) | 781 |
| Self: recipient = creator | 245 |
| Self: recipient = vesting admin | 98 |
| Self: recipient = tx sender of a direct creation | 42 |
| Recipient is a burn address or the token contract | 41 |
| Self: recipient is a Safe owned by the creator | 3 |

**How the creator is identified** (from the creation transaction):
- Direct creation (tx sent to a plan contract, Hedgey BatchPlanner `0x3466eb…`, BatchCreator or Safe MultiSendCallOnly): the creator is `tx.from`.
- Safe `execTransaction`: the creator is the Safe.
- Anything else: the creator is the intermediary contract. This covers Hedgey ClaimCampaigns / DelegatedClaimCampaigns, the ERC-4337 EntryPoint, Gelato relay and governors. A claimant calling a claim campaign is the recipient, not the creator, so these plans are third-party.

**Coverage gap:** creation transactions were fetched for every finished non-revoked plan on five chains. On Base they were fetched for every non-MASA plan, plus a random 1,000 of the 91,518 MASA plans. In the sample, 998 were claim-campaign claims (third-party) and 2 were self-plans. **About 180 MASA self-plans are therefore probably still counted, worth under 0.2 percentage points on any rate.**

Safe detection used `getOwners()` via multicall. It found 0 Safes among BNB Chain and Polygon recipients, which may be a provider limitation; on the other chains this rule removed only 3 plans.

### What the app can see

- **Only TokenVestingPlans is indexed.** That is 32,026 of the 140,464 third-party finished plans (23%). In value terms it is $7.47M of the $8.25M still-trading mark-to-market. Most of the rest is VotingTokenLockupPlans ($587k, mostly ENS).
- The ~108k finished plans in the other three contracts (all of MASA, GAIA and most claim campaigns) are invisible to the app.
- Berachain is indexed by the app but is out of scope here.

---

## How to fix the adapter

Today both `src/lib/vesting/adapters/hedgey.ts` (lines 244–248) and `src/lib/vesting/indexer/hedgey.ts` (lines 259–263) emit:
- `totalAmount = plans(id).amount`, which is the **remaining** balance;
- `withdrawnAmount = "0"`;
- `startTime = plans(id).start`, which **moves forward on every redemption**.

What to change, in order of impact:

1. **Index the plan events, not just `Transfer`.** In `indexer/hedgey.ts`, add these topics alongside `TRANSFER_TOPIC`:

   | Event | Topic |
   |---|---|
   | `PlanCreated` (vesting) | `0x6d5fb3665416b633057b4e53641a7dec63a802702a55e386df478871ea22af9b` |
   | `PlanCreated` (lockup) | `0xe7d9b7fd810a51c7f2f160d0c100b1bb756592fdeaf6b9b84425b44eca133e9b` |
   | `PlanRedeemed` | `0xa6faee2246474597b6de7c76bf9a45d256737543cb0806e6e805b55b38c7663f` |
   | `PlanRevoked` | `0xa4489f0d65c1250dc8e830211cb0442bfcbf6a32300cb9cfa67f2b2176bd18f3` |
   | `PlanSegmented` | `0x951d6388fa4b9c632ce8fdc16c4275079f7a0f61173a15b277546c9810fa44dd` |
   | `PlansCombined` | `0x68362f23abee957d51cf9ad5676447be98bb329fda7263be069a80d23569a8e8` |

   Persist per `(chainId, contract, planId)`: `originalAmount` and `originalStart` (from `PlanCreated.amount` / `.start`), `end` (`PlanCreated.end`), `redeemedTotal` (running Σ `PlanRedeemed.amountRedeemed`), `revokedAmount` and `revoked` (from `PlanRevoked`). For a segment, `originalAmount = segmentAmount`, and the parent's `originalAmount` is reduced by the same amount.
2. **Derive the stream fields from those values:**
   - `totalAmount = originalAmount − revokedAmount`
   - `withdrawnAmount = redeemedTotal`. Equivalently, with no event history: `originalAmount − plans(id).amount`. This identity held on all 146,917 plain plans.
   - `startTime = originalStart`
   - `endTime = PlanCreated.end` or `planEnd(id)`; they are always equal.
   - `claimableNow = planBalanceOf(id, now, now).balance`. This is the contract's own view, and it handles the cliff and the cap.
3. **Write a terminal row for burned plans instead of skipping them.** At line 199 the indexer does `continue` when `ownerOf` reverts, so a fully redeemed plan keeps its last cached row forever, with the old amount and `withdrawnAmount "0"`. That is the "10 of 60 stale rows had been redeemed" finding. On a `Transfer` to `0x0`, or on `PlanRedeemed` with `planRemainder == 0`, write `withdrawnAmount = totalAmount`, `claimableNow = 0` and `isFullyVested = true`.
4. **Backfill from deployment, not from the May-2026 genesis.** `HEDGEY_GENESIS` starts in May 2026, so no plan created earlier has a `PlanCreated` in our data. Deployment blocks (TVP / VTLP):

   | Chain | TVP | VTLP |
   |---|---|---|
   | Ethereum | 18,466,404 | 17,873,069 |
   | BNB Chain | 33,071,093 | 30,685,045 |
   | Polygon | 49,353,539 | 46,072,582 |
   | Base | 5,962,614 | 2,372,658 |
   | Optimism | 111,556,146 | 107,967,332 |

   On Arbitrum the first Hedgey log is at block 119,495,304. On free RPCs the full scan took minutes on Ethereum, Polygon, Optimism and Arbitrum, about 1.5h on BNB Chain (50k windows, rate-limited) and about 2h on Base (1k windows). Base needs a paid RPC or a one-off backfill script.
5. **Wallet-lookup adapter (no event history):** read the persisted `originalAmount` and `redeemedTotal` from the indexer's table. If there is no row, set `withdrawnAmount` to **null/unknown**, not `"0"`, and exclude the plan from claimed/unclaimed statistics. Do not reconstruct the original from current state: `amount` and `start` move together and cannot be told apart from a never-redeemed plan.
6. **Smaller bugs found on the way:**
   - `endTime` uses `floor(amount / rate)` (adapter line 221–222, indexer 233–234). The contract uses **ceil**, so for **50.2% of plans** (amount not divisible by rate) the app's end date is one period early.
   - The indexer's `vested = rate * periodsElapsed` (line 232) has **no cliff gate** (the adapter fixed this in June 2026 via `hedgeyRedeemable`; the indexer did not). It is also **not capped at the amount**, so `claimableNow` (line 236) exceeds `totalAmount` on every finished plan.
   - Only TokenVestingPlans is indexed. Adding VTVP, TLP and VTLP is the same code with a different address, plus the lockup `PlanCreated` topic. Those three contracts hold 77% of finished plans.
