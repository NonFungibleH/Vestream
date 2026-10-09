# Unclaimed finished vesting: Team Finance (V3 merkle vesting)

**Vestream original research, Team Finance part.**
Measurement date: **2026-10-07**. "Finished" means the vesting ended before **2026-09-06** (30+ days ago), the same definition the Sablier, UNCX and Unvest parts use.
Scope: Team Finance V3 vesting contracts on **Ethereum, BNB Chain, Polygon, Avalanche and zkSync Era** (the five chains in `protocol-constants.ts`). Sepolia is excluded.

**Every amount in this report was read from chain.** Nothing comes from `vesting_streams_cache` or from the Squid's claim data. The audit in `research-unclaimed-protocol-trust.md` §3.5 found that data wrong about 28% of the time. The Squid was used only to list the vesting contracts.

---

## For the graphic

The unit matters, so it is stated in every row:

- A **contract** is one Team Finance vesting contract (one escrow, one token, one merkle root).
- A **position** is one recipient's allocation inside a contract: one merkle leaf, which is one wallet's grant.

Both units are measurable here. Team Finance vestings are merkle distributions, but the contract tracks claims per leaf (`claimed(index)`), and I proved every leaf against the contract's on-chain merkle root (§0.3). Per-wallet attribution is therefore exact, not estimated.

All figures are **third-party only**. Excluded: vestings where every beneficiary is the creator or the contract's owner (a project vesting to itself), test-named tokens, revoked allocations, and Sepolia. Accounting is in §0.4.

### 1. Finished vestings, and how many still hold unclaimed tokens

| Population | Finished | Still holding > 1% | Rate |
|---|---|---|---|
| **Contracts, all tokens** | **1,467** | **925** | **63.1%** |
| Contracts, tokens that still trade (pool ≥ $10k) | 166 | 91 | 54.8% |
| Contracts, still trade, excluding ScapesMania (MANIA) | 147 | 74 | 50.3% |
| Positions (wallet allocations), all tokens | 152,260 | 122,524 | 80.5% |
| Positions, all tokens, excluding the 41 contracts with > 1,000 recipients | 54,761 | 36,292 | 66.3% |
| Positions, tokens that still trade | 28,577 | 24,058 | 84.2% |
| Positions, still trade, excl. MANIA | 5,126 | 3,852 | 75.1% |
| Positions, still trade, excl. MANIA and Castle of Blackwater (COBE) | 1,468 | 452 | **30.8%** |

**Headline: "63% of finished Team Finance vesting contracts still hold unclaimed tokens (925 of 1,467)."** This is the contract-level figure, and it is the robust one. It barely moves when the three largest creators are removed (62.0%, 793 of 1,279). It covers 462 distinct creators, and 355 of them (77%) have at least one finished contract still holding tokens.

**Do not headline the position-level "still trade" rate (84%).** One token, ScapesMania (MANIA) on BNB Chain, supplies **23,451 of the 28,577** tradeable finished positions (82%). Castle of Blackwater (COBE) supplies another 3,658. Once both are removed, only 1,468 positions remain and the rate falls to **30.8%**. That is the same pattern as CREO in the UNCX part.

### 2. Never touched, as a share of unclaimed

| Population | Never touched / unclaimed | Share |
|---|---|---|
| Contracts, all tokens (escrow ≥ 99% full **and** no recipient ever claimed) | 271 / 925 | **29.3%** |
| Contracts, tokens that still trade | 30 / 91 | 33.0% |
| **Positions, all tokens** (`claimed(index) == 0`) | **113,363 / 122,524** | **92.5%** |
| Positions, tokens that still trade (third-party, excl. team-sized, §3) | 22,078 / 24,048 | 91.8% |
| Positions, still trade, excl. MANIA and COBE | 323 / 452 | 71.5% |

**Use the position figure: "9 in 10 unclaimed allocations were never claimed once."** The contract figure is much lower (29%) by construction. A contract counts as "touched" if any one of its hundreds of recipients ever claimed. Do not put the two figures side by side without saying which unit each one uses.

### 3. Value in tokens that still trade

| Basis | Value |
|---|---|
| Mark-to-market, all third-party positions, pool ≥ $10k | $617,121 (24,058 positions, 34 tokens) |
| Same, excluding 10 team-sized positions (≥ 5% of token supply, §3.1) | $502,761 (24,048 positions, 34 tokens) |
| **Same, each token capped at its pool depth** | **$467,169** |
| Capped, also excluding the single ANYONE position | $241,981 |
| Strict: pool ≥ $100k **and** ≥ $10k 24h volume (mark-to-market = capped) | $229,854 (41 positions, 7 tokens), of which ANYONE is $223,300 |

**Headline the capped figure: "nearly $470,000".** It must carry the disclosure that **one wallet holds $223,300 of it (48%)**. That wallet's ANYONE allocation is still being claimed in instalments (§6), so it is unclaimed but not abandoned. If one number has to stand without a footnote, use **"about $240,000"** (capped, without ANYONE).

**Do not publish $617k.** It includes three never-touched Metafluence (METO) allocations worth $77,217. Together they are **43.7% of METO's total supply**, their pool is $17,005 and 24h volume was $9 (§3.1).

### 4. Value ladder (third-party positions in tokens that still trade, team-sized excluded)

**Unit: positions** (one wallet's allocation in one contract). The wallet-aggregated ladder is almost identical and is shown on the right.

| Unclaimed value | Positions | Of which never touched | Total | Wallets (aggregated) |
|---|---|---|---|---|
| **Over $100,000** | **1** | 0 | $223,300 | 1 |
| **Over $10,000** (incl. the above) | **6** | 5 | $326,990 | 6 |
| **Over $1,000** (incl. the above) | **25** | 21 | $383,997 | 25 |
| $1,000 – $10,000 | 19 | 16 | $57,007 | 19 |
| **Under $1,000** | **24,023** | 22,058 | $118,764 | 20,372 |
| of which **under $1** | **11,954** | 10,726 | **$4,036** | 9,433 |

20,205 of the 24,023 sub-$1,000 positions are MANIA, and 3,394 are COBE. The median position is worth **$1.02**, or **$0.48** without MANIA.

### 5. Distinct recipient wallets: genuinely attributable

Every one of the **174,283** merkle leaves behind the 2,572 contracts was proven against the merkle root stored in its contract on-chain. That proves each leaf's recipient address and amount. `claimed(index)` then gives that leaf's own claim state.

| Population | Distinct wallets with an unclaimed finished position |
|---|---|
| All tokens | **81,379** |
| Tokens that still trade | **20,397** |
| Still trade, excl. MANIA | 3,820 |
| Still trade, excl. MANIA and COBE | 439 |

### 6. Oldest and largest

**Oldest unclaimed position in a token that still trades:** TrustSwap (SWAP) on Ethereum, contract `0x8550e6a6…8c19` leaf 1. It ended **2023-01-18, 44.6 months ago**, was never touched, and holds **20 SWAP worth $0.86**. It is test-sized: in the same contract the creator vested 15 SWAP to itself. Use it as a curiosity only.

**Oldest with real money:**
- **ScapesMania (MANIA), BNB Chain, $2,400.** Contract `0xf3e55356…4c68` leaf 2668. It ended 2024-10-30, **23.2 months ago**, and was never touched. It is 4.7% of a $51,169 pool, and 24h volume was $113. The position is one recipient among 5,110 in a single distribution.
- **Cortensor (COR), Ethereum, $5,187.** This is the best "old" example. Contract `0x33b297c5…a865`, a single recipient. It ended **2024-12-31, 21.2 months ago**, and was never touched. It is 2.1% of a $252,024 pool. The recipient is an ordinary wallet (nonce 9) that **holds 2,000,000 COR elsewhere**, so it is an active holder that never claimed this grant.

**Largest: ANYONE Protocol (ANYONE) on Ethereum, $223,300 mark-to-market.**
- Contract `0xe8fdfb7b…2b6f`, single recipient `0x10add06d…e5c3`. The grant was 4,000,000 ANYONE from 2024-08-26 to **2025-08-25 (13.4 months ago)**, released weekly. 1,000,000 ANYONE is unclaimed, 1.0% of supply.
- Pool liquidity **$898,609**, 24h volume $70,163, market cap $21.5M.
- **Pool-depth caveat: the position is 24.8% of the pool.**
- **Abandonment caveat:** the recipient has claimed 3,000,000 in 11 claims. The latest was 2026-05-05, after the vesting ended, so this is someone drawing down a grant, not a forgotten one. The wallet has made 43 transactions and still holds 105k ANYONE. Do not describe this position as "forgotten".

**Largest never-touched position under 10% of its pool: OVR on Ethereum, $40,104.** Contract `0xbe805810…ec9c` leaf 0. 1,042,752 OVR (1.16% of supply), ended 2025-12-18, 9.6 months ago. It is 9.7% of a $413,341 pool, but 24h volume is only $501. The other recipient in the same contract claimed everything.
**The most defensible single example is Cortensor (COR), $11,066:** contract `0x1db03ae4…f8a0`, 6,400,000 COR, never touched, ended 2025-01-31 (**20.2 months ago**). It is 4.4% of a $252,024 pool, the recipient is an ordinary wallet, and the grant is 0.64% of supply.

### 7. On-chain verification of the top 10 (live `eth_call`, 2026-10-07)

For each position I read the following live from the vesting contract:

- `merkleRoot()`, then a check of the leaf's proof against that root. This proves the wallet, amount and schedule.
- `claimed(index)` and `getRevoked(index)`, which give that leaf's claimed amount and whether it was revoked.
- `token().balanceOf(contract)`, the escrow balance.
- `claimed` and `getRevoked` for **every** leaf in the contract, summed into the contract's total outstanding.

A position passes if the proof is valid, the leaf is not revoked, the live remaining amount equals the attributed amount, and the escrow covers the whole contract's outstanding total, not just this position.

| # | Token | Chain | Contract / leaf | Attributed unclaimed | Live `claimed` | Escrow `balanceOf` | Σ outstanding, all leaves | Proof | Result |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ANYONE | ETH | `0xe8fdfb7b` / 0 | 1,000,000 | 3,000,000 | 1,000,000 | 1,000,000 (1 leaf) | ✓ | **PASS** |
| 2 | OVR | ETH | `0xbe805810` / 0 | 1,042,752 | 0 | 1,042,752 | 1,042,752 (2 leaves) | ✓ | **PASS** |
| 3 | OVR | ETH | `0x4d227574` / 0 | 830,069 | 0 | 830,069 | 830,069 (1) | ✓ | **PASS** |
| 4 | COR | ETH | `0x1db03ae4` / 0 | 6,400,000 | 0 | 6,400,000 | 6,400,000 (1) | ✓ | **PASS** |
| 5 | COBE | ETH | `0x7fe10d18` / 2278 | 4,700,000 | 0 | 21,966,428.40 | 21,966,428.40 (3,597) | ✓ | **PASS** |
| 6 | COBE | ETH | `0x7fe10d18` / 2384 | 4,700,000 | 0 | 21,966,428.40 | 21,966,428.40 (3,597) | ✓ | **PASS** |
| 7 | BDCA | BSC | `0x3d578efa` / 0 | 27,826 | 0 | 49,615.87 | 49,615.87 (17) | ✓ | **PASS** |
| 8 | BDCA | BSC | `0x3d578efa` / 12 | 20,870 | 0 | 49,615.87 | 49,615.87 (17) | ✓ | **PASS** |
| 9 | COBE | ETH | `0x7fe10d18` / 1223 | 2,668,000 | 0 | 21,966,428.40 | 21,966,428.40 (3,597) | ✓ | **PASS** |
| 10 | COR | ETH | `0x33b297c5` / 0 | 3,000,000 | 0 | 3,000,000 | 3,000,000 (1) | ✓ | **PASS** |

**10/10 pass.** In every case the escrow balance equals the contract's total outstanding **to the wei**. The tokens are there, and they are spoken for by exactly these leaves.
I also verified the raw (pre-exclusion) top 10, which adds METO ×3 and AWARE. All of those pass too: METO's escrow holds exactly 2.1B against 3 × 700M outstanding.

---

## 0. Method

### 0.1 Population
- **Enumeration:** the Squid's `vestingFactoryVestings` (the same source as `tvl-walker/team-finance.ts`), every page on every chain. It returned **2,587 mainnet contracts**: Ethereum 1,096, BNB 1,042, Polygon 189, Avalanche 149, zkSync 111. Sepolia's 1,378 were dropped. Base returned 0. The Squid supplied only the contract address, token, creator, `tokenTotal` and merkle root.
- **Schedules and recipients:** Team Finance's public REST endpoint `GET https://api.team.finance/api/vesting/admin/{creator}` (from their OpenAPI spec at `/docs/openapi.yaml`) returns every vesting a creator made, **with the full leaf list**: recipient, amount, start, end, cadence, `percentageOnStart`, `revocable`, index and proof. I called it for all 1,033 distinct creators, with no failures. It matched **2,572 of the 2,587** contracts and gave 174,283 leaves. The API's merkle roots matched the Squid's 2,572/2,572.
- **Finished:** for contracts, the **latest** leaf end is before 2026-09-06. For positions, the leaf's own end is before 2026-09-06.

### 0.2 What was read from chain (blocks: ETH 26,139,641 · BSC 126,228,927 · Polygon 95,107,475 · Avalanche 96,945,190 · zkSync 72,371,520)
- `balanceOf(contract)` on the vesting token, plus `owner()` and `token()`, for all 2,587 contracts. `token()` matched the Squid for every contract.
- `claimed(index)` and `getRevoked(index)` for every ended leaf in every contract whose escrow is non-empty: ~299,000 calls with zero failed reads. When the escrow is empty, every leaf in it is by definition not "sitting unclaimed", so I did not read those leaves.
- Contract semantics come from the verified source of all three factory generations (Sourcify). The key points are:
  - `claimed[index]` increases only in `claim()`.
  - `stopVesting()` sends the whole unvested remainder to the owner and sets the revoked bit. Older generations also push the vested-but-unclaimed part to the recipient. Either way, a revoked leaf has nothing left to claim.
  - The newest generation has `emergencyWithdraw()`, which lets the owner pull the **entire** balance as long as nobody has ever claimed. A never-touched contract on that generation is therefore one owner transaction away from being empty.
- **Unclaimed** (position) = not revoked, and `amount − claimed(index)` > 1% of the leaf amount. **Unclaimed** (contract) = escrow `balanceOf` > 1% of `tokenTotal`, and at least one ended leaf still has a remainder.
- **Never touched** (position) = `claimed(index) == 0` and not revoked. **Never touched** (contract) = escrow ≥ 99% of total and no leaf ever claimed or revoked.

### 0.3 Attribution check
I recomputed all **174,283 leaves** (`keccak256(abi.encodePacked(index, account, amount, revocable, start, end, cadence, percentageOnStart))`) and verified each proof against the contract's **on-chain** `merkleRoot()`. **174,283 valid, 0 invalid.** The recipient lists are therefore cryptographically the ones the contracts will pay out to, not Team Finance's word for it.

### 0.4 Exclusions and accounting

| Step | Contracts | Positions |
|---|---|---|
| Squid mainnet vesting contracts | 2,587 | |
| No schedule available (15 absent from the API, 45 with an empty leaf list) | −60 | |
| Contracts with a verified leaf list | 2,527 | 174,283 leaves |
| Not finished (latest leaf ends on/after 2026-09-06) | −643 | |
| Finished | 1,884 | 153,277 ended leaves (excl. test tokens) |
| Test-named tokens (`TEST`, `test-OFN`, `TestAI`, `TFVT`, `TFE1`, `TFE2`, `TTT`) | −12 | |
| **Self-vesting**: every recipient is the creator or the contract owner | **−405** | −471 leaves where recipient = creator/owner |
| Revoked leaves (stopped before they ended) | | −546 |
| **Finished, third-party** | **1,467** | **152,260** |

How self-vesting was traced: `creator` is the `msg.sender` of `createVesting` (from the Squid's event). `owner()` is read live, because ownership can be transferred. A contract is "self" when its full leaf set ⊆ {creator, owner}. **This is a lower bound.** A team that vests to a second wallet or a Safe it controls is not caught by this rule. §3.1 applies a further supply-share screen to catch those cases in the value figures.

Not in the population: **7 vestings** on supported chains that the REST API knows but the Squid does not index (for example SYC on Ethereum `0x39bf54ab…`, 63 leaves). They are small, but the Squid is not complete.

### 0.5 Pricing
DexScreener `latest/dex/tokens/{address}`, one address per request, on 2026-10-07. I took the deepest pair on the **same chain** in which the token is the **base** token. No pair means $0. "Still trades" means pool liquidity ≥ $10k: 34 of 360 tokens with an unclaimed position qualify. "Capped" means each token's total unclaimed value is limited to its pool's `liquidity.usd`, the same cap the UNCX and Sablier parts use.

---

## 1. Concentration (read before quoting anything)

### 1.1 Mass distributions drive the position counts
| Contract size (recipients) | Contracts | Finished positions | Unclaimed rate |
|---|---|---|---|
| 1 | 271 | 271 | 41.0% |
| 2–10 | 285 | 1,072 | 53.2% |
| 11–100 | 232 | 9,195 | 59.4% |
| 101–1,000 | 137 | 43,344 | 67.9% |
| **> 1,000** | **41** | **98,378 (65%)** | **88.4%** |

41 contracts (launchpad/IDO-style distributions such as SHOOT, MANIA, CLAY and GAGA) account for 65% of all positions, and they have the highest unclaimed rate. These are mostly tokens that no longer trade, which is the rational case for not claiming. That is why the position-level all-token rate (80.5%) should be quoted only alongside the 66.3% figure that excludes them.

### 1.2 One token is 82% of the "still trades" positions
ScapesMania (MANIA, BNB Chain) has 23,451 tradeable finished positions, 20,206 of them unclaimed, mostly worth about $1 each. Its pool is $51,169 with $113 of 24h volume. Its 19 contracts are also 19 of the 166 tradeable finished **contracts**, which is why §1 also gives an ex-MANIA contract row.

### 1.3 One position is 48% of the value
ANYONE's $223,300 is 48% of the $467k capped total. It is genuinely third-party by every test available: an ordinary wallet, not the creator, holding 1% of supply. But it is being actively claimed (§6).

### 1.4 Team-sized allocations behind "third-party" recipients (excluded from the value headline)
Ten positions pass the creator/owner test but are **≥ 5% of their token's total supply**. Most go to Safe multisigs (171-byte proxy code), or to wallets that have never sent a transaction. They are treasury or team allocations, not grants to outsiders:

| Token | Chain | Value | % of supply | Recipient | Pool | Note |
|---|---|---|---|---|---|---|
| METO ×3 | BSC | $77,217 | 14.6% each, **43.7% combined** | 3 EOAs, two with **nonce 0** | $17,005 | 24h volume $9; 4.5x the pool |
| AWARE ×2 | BSC | $17,737 | 13.0%, 8.0% | Safes | $10,759 | 1.6x the pool |
| BRCST ×3 | BSC | $11,445 | 12.0%, 10.8%, 9.9% | **one** Safe | $12,457 | |
| SHIBA ("Shiba", not SHIB) | ETH | $4,159 | 5.0% | 11.7 KB contract | $43,123 | |
| WOOF | AVAX | $3,802 | 12.0% | Safe | $12,021 | |

Borderline cases kept in, but disclose them if you use COBE: COBE's two $10,298 positions (4.7% of supply each) also go to Safes, from a creator that is itself a contract.

---

## 2. Numbers NOT safe to publish

| Number | Why not |
|---|---|
| **48% unclaimed** (current app figure, `research-unclaimed-protocol-trust.md`) | Built on the Squid's claim events. Measured against chain today: in **452 of 2,587 contracts (17.5%)** the Squid-implied locked amount (`tokenTotal − claimed`) exceeds the escrow's real balance by > 1%. **263 of those escrows are completely empty.** 234 of the 263 have revocable leaves, which is consistent with the Squid not indexing `VestingRevoked`. Among the 1,239 contracts where I read every leaf, 78 have Squid claim totals below the on-chain `Σ claimed(index)`. |
| **$617k** unclaimed (raw mark-to-market) | Includes $114k of team-sized allocations (§1.4), METO's $77k alone. METO's three wallets hold 43.7% of supply against a $17k pool. |
| **84% of finished allocations in live tokens are unclaimed** | MANIA is 82% of that cohort. Without MANIA and COBE the figure is 30.8% on 1,468 positions. |
| **80% of allocations unclaimed** (all tokens) without a qualifier | 65% of positions sit in 41 mass distributions with > 1,000 recipients each. Without them the figure is 66.3%. |
| **"92% never touched"** next to **"63% of contracts"** | Mixed units. The contract-level never-touched share is 29%. State the unit every time. |
| **ANYONE "forgotten" / "abandoned"** | The recipient has claimed 75% across 11 claims, the latest five months ago. |
| **"$223k waiting to be claimed" as realisable** | It is 24.8% of ANYONE's pool. |
| **BTCLE ("Bitcoin Limited Edition"), $4,458 from 10 tokens** | DexScreener prices it at $445.79, with pool liquidity ($5.6M) at 81% of its $7.0M market cap. The price is not credible. It sits in the over-$1k ladder bucket, so the bucket count could be 24 rather than 25. |
| **Avalanche 94.5% contract rate** (86/91) | 54 of the 91 contracts are a single GAGA distribution from one creator. |
| **zkSync rates** (24 finished contracts, 47 positions) | n too small. |
| **Self-vesting as "unclaimed"** | 410 finished contracts vest only to their own creator or owner, and 281 of them still hold > 1%. These are project treasuries, not grants. They are excluded above. If they are ever quoted, quote them as their own category. |
| **Base coverage / "five chains = all of Team Finance"** | The Squid has 0 Base vestings, but the REST API returned 50 Base vestings for these creators alone. Team Finance also runs factories on chains outside our list (Unichain, Berachain, Flare, X Layer and others, per the Squid's `vestingFactories`). Say "on the five chains Vestream indexes". |

---

## 3. App bugs found (not fixed)

1. **`percentageOnStart` is scaled 100x too large. Live in production.**
   - **Where:** `src/lib/vesting/adapters/team-finance.ts:332`, `const bps = BigInt(Math.round(pct * 100))`, with the comment at `:52` claiming the field is "0–100".
   - **Units:** the REST API returns the field **already in basis points**. The OVR leaf returns `5000`, and the contract has `MAX_PERCENTAGE = 1e4`. Observed values are 10000, 2000, 3330, 600, 1200 and so on.
   - **Effect:** any value ≥ 100 makes `initialUnlock ≥ total` and `linearPortion` negative. So `vested ≥ total` from the start date. The row is marked fully vested, `lockedAmount = 0`, and `claimableNow` can exceed the grant. For example, a 20% upfront vesting shows 20x the grant claimable on day one.
   - **Scale:** 28,204 leaves have a non-zero value, 3,947 of them in active vestings.
   - **Observed in the cache:** 49 active non-Sepolia rows have `claimableNow > totalAmount`. For example, RWA on zkSync: total 20,000, claimable 50,115. Another 59 are `isFullyVested` before their end date, out of 636 active rows.
   - **Fix:** `bps = BigInt(pct)`.
2. **Cadence is ignored.**
   - **Where:** `adapters/team-finance.ts:342-344` vests continuously and `:374` hard-codes `shape: "linear"`.
   - **Contract behaviour:** `getClaimable` floors elapsed time to whole `cadence` steps (weekly 604800 and monthly 2592000 are common).
   - **Effect:** `claimableNow` is overstated by up to one step, and `nextUnlockTime` is always `endTime` instead of the next step.
3. **Withdrawn defaults to 0 from the Squid.** This is already known (`:326`). The fix is now simple: the REST response already carries each leaf's `index`, so `withdrawn = claimed(index)` is a single on-chain read per position. No Squid is needed.
4. **Revocation is never read.** The adapter never calls `getRevoked(index)`. 546 ended leaves in 59 contracts are revoked on-chain. The adapter will show their remainder as owed to the recipient, although `stopVesting` has already sent it to the owner.
5. **The TVL walker overstates locked value.** `src/lib/vesting/tvl-walker/team-finance.ts:205` computes `locked = tokenTotal − claimed` from the Squid. This is wrong for 452 contracts (17.5%), and it counts 263 empty escrows as locked. The fix is `balanceOf(vestingContract)`, one multicall per chain. This is the same fix the Smithii research used.
6. **The reason for dropping Base no longer holds.** `protocol-constants.ts` and the adapter header say Base was dropped because the Squid has no Base data. The REST API serves Base leaves (with indices and proofs), and `claimed(index)` works on chain, so Base could be supported without the Squid. This is an opportunity rather than a bug.
7. **Stale header and testnet in the cohort.** The adapter header (`:20`) lists "Ethereum, BSC, Base, Sepolia". The real list is ETH/BSC/Polygon/Avalanche/zkSync. `supportedChainIds` (`:390`) still includes Sepolia, which feeds testnet rows into any cohort query. This was already flagged in the trust audit.
8. **The Squid is incomplete in both directions.** 15 Squid vestings are unknown to the REST API (14 on zkSync), and 7 REST vestings on supported chains are absent from the Squid. Discovery that relies only on the Squid misses the second group.

---

## 4. Reproducing

The numbers come from five chain reads, all against the public REST/Squid endpoints and RPC. No database is involved:

1. Squid `vestingFactoryVestings` per chain (limit/offset paging).
2. `GET api.team.finance/api/vesting/admin/{creator}` for each distinct creator.
3. Multicall `balanceOf(contract)`, `owner()`, `token()`.
4. Multicall `claimed(index)` and `getRevoked(index)` per ended leaf where the escrow is non-zero.
5. Proof verification of every leaf against `merkleRoot()`.

RPCs used:

- Ethereum: Alchemy.
- BNB: `bsc-dataseed.binance.org`.
- Polygon: `polygon.gateway.tenderly.co` (`polygon-rpc.com` and publicnode were too slow).
- Avalanche: `avalanche-c-chain-rpc.publicnode.com` (`api.avax.network` returned Cloudflare 1015 rate-limit errors).
- zkSync: `mainnet.era.zksync.io`.

The scripts were run from a session scratchpad and were not committed.
