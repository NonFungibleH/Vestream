# HoodLock + Robinhood Chain Integration — Design

**Date:** 2026-08-29
**Status:** Approved design (pending user sign-off) → next: implementation plan

## Goal

Make Vestream the first vesting tracker to cover **Robinhood Chain** (EVM L2,
chain ID `4663`) and the **HoodLock** locker/vesting protocol — across both the
web app (`~/vestr`) and the mobile app (`~/Projects/vestream-app`) — to own the
"Robinhood Chain vesting" / "HoodLock unlocks" queries ahead of the chain's
hype window.

### Success criteria (I'll know I'm done when…)
- A HoodLock vesting on chain 4663 shows up on: the user's dashboard/vestings,
  its `/token/4663/{addr}` page, `/unlocks`, `/protocols/hoodlock`, and the
  sitemap.
- `/protocols/hoodlock` renders with a live indexed stream/lock count; TVL flows
  through the **standard** pricing pipeline (shows priced value where a price
  source exists, degrades to unpriced exactly like any thin token — no bespoke
  handling).
- The REST API (`/api/v1/wallet/{addr}/vestings`) and MCP return HoodLock
  streams for a wallet on chain 4663.
- The mobile app renders chain 4663 (name/colour) and the `hoodlock` protocol
  name correctly, and lists HoodLock vestings (it fetches from the web API, so
  this is display-only).
- Tax claim ingestion records HoodLock withdrawals as income (full-parity).
- `npm run build` passes clean; walker locked-amount math has unit tests.

## Locked decisions (from scoping)
1. **Scope:** HoodLock only for phase 1. Architect the chain generically so
   Locksley/TrustSwap can be added later.
2. **Pricing:** Same pipeline as every other protocol — walker → `priceAggregates`
   (DexScreener/CoinGecko). No special "amounts-only" UI. It will show unpriced
   until a source covers chain 4663; that's acceptable and self-upgrading.
3. **Phasing:** Full parity in one release (discovery + all surfaces + tax
   ingestion + mobile).

## Recon (confirmed 2026-08-29)
- **Chain 4663**: Arbitrum Orbit / Nitro L2, gas = ETH, official RPC
  `https://rpc.mainnet.chain.robinhood.com` (reachable; head ~49.4M).
  Testnet = 46630. Explorer: `robinhoodchain.blockscout.com` (Blockscout).
- **`eth_getLogs` full-range works in one call** at current volume — no window
  gymnastics needed yet (indexer should still window for future growth).
- **HoodLock locker `0xd0f7d8c6e9f6d80c297bebe4f7fd1b9c8125c32f`** — verified on
  Blockscout. `$LOCK` token `0xd5BF43f29BF7Aa5bb42Ae9e217b84B86EB7a4B94`.
  219 total logs across 5 event topics:
  - `0x1cb39d6e…035676` ×151 (dominant — likely lock/vesting created)
  - `0xcf7d23a3…202372` ×36
  - `0x41a73beb…e9b4bc` ×22
  - `0x94cb47ee…b2f873` ×9
  - `0x6bbc5748…6c6584c3` ×1
  First event at block ~4,609,892.
- **Blockscout REST API is behind a Cloudflare bot-challenge** → server-side
  discovery must use the **raw JSON-RPC**, not Blockscout. Sourcify has no copy
  of the ABI.
- **Mobile app is API-driven** (`lib/api.ts` → `${API_BASE}/api/mobile/*`) and
  keeps its own primitive chain constants in `lib/constants.ts`
  (`CHAIN_NAMES`, chain colours, `CHAINS_CONFIG`, `PROTOCOL_NAMES`). It has **no
  vesting adapters of its own** → mobile work is display constants only.

## RESOLVED — HoodLock contract (build task 1, done 2026-08-29)
Pulled the verified source via the in-app browser (Blockscout API JSON renders
past Cloudflare in the real browser).

**Contract `RobinhoodLocker` @ `0xd0f7d8c6e9f6d80c297bebe4f7fd1b9c8125c32f`** — a
simple **cliff locker, NOT linear vesting**. `struct Lock { address owner;
address token; uint256 amount; uint256 unlockTime; bool withdrawn; }`. One vault,
many locks; whole `amount` unlocks at `unlockTime`; withdraw-in-full after.
No separate vesting contract is referenced — the marketed "vesting" product is
not deployed at a discoverable address yet. Fee collector `0xb252…0960`.

**Events (topic0 → decoded):**
- `0x1cb39d6e…035676` `Locked(uint256 indexed id, address indexed owner, address indexed token, uint256 amount, uint256 unlockTime)` — CREATE (×151)
- `0xcf7d23a3…202372` `Withdrawn(uint256 indexed id, address indexed owner, uint256 amount)` — WITHDRAW/claim (×36)
- `0x41a73beb…e9b4bc` `Extended(uint256 indexed id, uint256 newUnlockTime)` (×22)
- `0x94cb47ee…b2f873` `LockOwnershipTransferred(uint256 indexed id, address indexed from, address indexed to)` (×9)
- `0x6bbc5748…6c6584c3` `FeeChanged(uint256 fee)` (×1)

**Views for discovery (no log-scan needed):** `totalLocks()`/`nextLockId`,
`getLock(id)`→struct, `locks(id)`→tuple, `locksByOwner(addr)`→id[],
`locksByToken(addr)`→id[], `lockedAmount(id)`.

**→ VestingStream mapping (single-cliff):**
`recipient=owner`, `tokenAddress=token`, `totalAmount=amount`,
`cliffTime = endTime = unlockTime`, `startTime = lock-tx timestamp` (from the
`Locked` log's block), `shape="steps"` with one step `{unlockTime, amount}`,
`withdrawnAmount = amount if withdrawn else 0`, `lockedAmount = 0 if withdrawn
else amount`, `nextUnlockTime = unlockTime if (!withdrawn && unlockTime>now)`,
`isFullyVested = now>=unlockTime`, `id = "hoodlock-4663-{lockId}"`.
Claimable gates on the cliff (repo rule): 0 before `unlockTime`, full after.

**Simplified pipeline (vs. the generic plan):**
- **Adapter** `adapters/hoodlock.ts`: `locksByOwner(wallet)` → batch `getLock(id)`
  (paginate multicalls ≤50) → map to streams.
- **Walker** `tvl-walker/hoodlock.ts`: read `totalLocks()` → batch `getLock(0..n-1)`
  → aggregate non-withdrawn `amount` by `(4663, token)`.
- **Indexer** `indexer/hoodlock.ts`: watch `Locked` (create), `Withdrawn`
  (→withdrawn/claimEvents), `Extended` (→unlockTime). `genesisBlock` ≈ 4,609,892.
- **Ingestor** `ingestors/hoodlock-claims.ts`: `Withdrawn` → `claimEvents` income.

**Pricing — RESOLVED:** DexScreener DOES cover Robinhood Chain (slug
`"robinhood"`, verified live: $LOCK `0xd5BF43…4B94` → robinhood/uniswap pair,
$0.00042, ~$73k liq). Wired into `DS_CHAIN_SLUG` in both `quick-prices.ts` and
`tvl.ts` → chain-4663 tokens price normally through the standard pipeline. Real
tokens price; test tokens with no DEX pair fall out of the headline as usual.

**Team Finance on Robinhood Chain — DEFERRED (verified not feasible yet):** TF's
product may support RH Chain, but their Squid indexer (which our TF walker +
claims consume) returns **0 vestings on chainId 4663** (vs 1091 ETH / 1036 BSC,
probed 2026-08-29) — identical to the TF/Base situation we already dropped for.
Adding TF on 4663 now would create a permanent empty "$0 on Robinhood Chain".
Revisit when `vestingFactoryVestingsConnection(where:{chainId_eq:4663})` on the
TF Squid returns > 0.

## Architecture

### A. Add chain 4663 (shared-package plumbing)
- `packages/shared/src/vesting.ts`: add `CHAIN_IDS.ROBINHOOD = 4663`, entry in
  `CHAIN_NAMES` ("Robinhood Chain"), and include in `EVM_CHAIN_IDS` +
  `ALL_CHAIN_IDS` (NOT non-EVM). Rebuild the shared package.
- `src/lib/vesting/rpc.ts`: add `POOL[CHAIN_IDS.ROBINHOOD]` = official RPC
  (+ optional `ROBINHOOD_RPC_URL` env override, following the optional-env
  pattern; no new *required* env var). Not a publicnode; safe for logs.
- Explorer link + chain colour/label maps (web token page "view on explorer" →
  `robinhoodchain.blockscout.com`, `/token/[chainId]` chain filters, any
  exhaustive `Record<SupportedChainId, …>`). Grep for existing chain maps and
  extend each.
- Address validation already handles `0x…` EVM — no change.

### B. `hoodlock` protocol (web — the real work)
Contract-reads + event-scan protocol → PinkSale / UNCX-VM pattern.
- `src/lib/vesting/indexer/hoodlock.ts` implementing the `Indexer` interface
  (`genesisBlock` ≈ first-event block, `maxBlocksPerScan`, `reorgLag`,
  `scanWindow`). Watches the **create** event (→ `VestingStream`) and the
  **withdraw** event (→ `withdrawnAmount`). Register in `indexer/index.ts`.
- `src/lib/vesting/adapters/hoodlock.ts` — `VestingAdapter` with per-wallet
  fetch (contract reads for a recipient/owner; **paginate multicalls ≤50** to
  dodge the ~100KB free-RPC cap). Register in `adapters/index.ts`.
- `src/lib/protocol-constants.ts` — `ProtocolMeta` for `hoodlock`
  (slug/adapterIds/name/tagline/description/color/bg/border,
  `chainIds: [4663]`, officialUrl `https://hoodlock.tech`, `disabled: false`).
- `src/lib/vesting/tvl-walker/hoodlock.ts` — enumerate ALL locks (full-range
  getLogs → per-lock reads), aggregate by `(chainId, tokenAddress)` locked
  amount; omit `externalTvl` so the standard walker→`priceAggregates` path runs.
  Register in `tvl-walker/index.ts`. **Unit test** the locked-amount math.
- `src/lib/vesting/ingestors/hoodlock-claims.ts` — withdraw events →
  `claimEvents` (tax income). Register in `ingestors/index.ts`.
- `vercel.json`: cron `/api/cron/indexer?protocol=hoodlock&chainId=4663`
  (`*/30 * * * *`) + a TVL-snapshot group entry for `hoodlock`.

### C. Surfaces (web)
Mostly automatic once the protocol is registered + data flows: token pages,
`/unlocks`, `/protocols/hoodlock`, sitemap, search, REST API, MCP. Verify each.
Nice-to-have: deep-link a stream to its HoodLock proof page.

### D. Mobile (`~/Projects/vestream-app`)
Display-only, because it fetches vestings from the web API:
- `lib/constants.ts`: add 4663 → `CHAIN_NAMES`, chain colour, `CHAINS_CONFIG`
  entry, and `PROTOCOL_NAMES['hoodlock']`. Mirror in `lib/streamPulse.ts`
  `CHAIN_NAMES` if it renders chains.
- Verify chain filter + token/vesting screens render 4663 + HoodLock correctly.

## Vesting-math correctness (CORE integrity)
The create-event fields → `VestingStream` mapping (start/cliff/end,
`shape: "linear"|"steps"`, `unlockSteps`) MUST match HoodLock's on-chain
semantics, and claimable MUST gate on the cliff (repo rule). Walker locked-amount
= sum of un-withdrawn locked balances. Unit-test both against a real on-chain
lock.

## Risks / mitigations
- **RPC single-endpoint**: only the official RPC is known. Add it as the primary
  with room for a fallback later; window getLogs for growth. Quarantine via the
  existing multi-RPC pool.
- **Unpriced TVL**: accepted (decision 2); self-upgrades when a price source
  lands. Don't fake a headline (TVL-honesty rule).
- **Adding a chain ripples through exhaustive maps** — grep every
  `Record<SupportedChainId,…>` / chain switch and extend; `npm run build` (TS
  exhaustiveness) is the backstop. Let the full build finish.
- **Chain-launch TVL/cron gotcha** (memory): merge chain+protocol code to `main`
  FIRST, poll the deployed static asset for live, THEN trigger the TVL snapshot —
  otherwise prod crons wipe the new chain's rows before code is live.

## Rollout sequence (full parity, ordered)
1. Resolve ABI/events (+ separate-vesting question, DexScreener support).
2. Chain 4663 in shared + rpc + maps; rebuild shared; `npm run build`.
3. Indexer + adapter + protocol-constants; register; unit tests.
4. TVL walker + ingestor; register; cron entries.
5. Web surface verification (token/unlocks/protocol/sitemap/API/MCP) via preview.
6. Mobile constants + screen verification.
7. Merge to `main`; after deploy-live, trigger indexer + TVL snapshot for 4663.
8. (Post-launch) tag @HoodLockRH; watch for a price source.
