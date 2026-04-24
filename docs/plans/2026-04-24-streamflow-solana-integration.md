# Streamflow + Solana Integration — Implementation Plan

**Date:** 2026-04-24
**Author:** CTO (drafted by Claude)
**Status:** Draft for review
**Estimated scope:** 4–5 focused days end-to-end, shippable behind a feature flag

---

## 1. Executive summary

Add Solana as a non-EVM chain with **Streamflow** as the sole protocol. Treat Solana as a deliberate exception in three isolated places (adapter, address validator, one chain-pill case) rather than refactoring the entire chain-abstraction layer. Defer multi-ecosystem generalisation until we add a second non-EVM chain.

**What ships end-to-end:**
- Users paste a Solana pubkey in tracked-wallets and see Streamflow streams appear alongside their EVM vestings.
- Dashboard, settings, Discover, find-vestings, mobile app, REST API, MCP all work transparently for Solana wallets.
- Pricing, alerts, CSV export, push notifications — all work without code changes (the cache and downstream layers are ecosystem-agnostic).

**What does NOT ship in this sprint:**
- Phantom/Backpack wallet-connect (email OTP is primary auth; users paste pubkeys manually)
- SIWS (Sign-In With Solana) — not needed for the tracking use case
- A generic multi-ecosystem abstraction layer — premature

---

## 2. Open questions blocking design (need user decision)

### Q1. Discovery + TVL strategy — **decided: DefiLlama for headline TVL, on-demand SDK for user streams**

Streamflow has no public "all recent streams" firehose, and we don't want to spend on paid indexers. But we don't need full on-chain indexing to show a credible TVL number — DefiLlama already tracks Streamflow.

**TVL headline number:** pull from DefiLlama.
- Endpoint: `https://api.llama.fi/protocol/streamflow` (public, no key, generous rate limit)
- Cache server-side for 5 min
- Returns current TVL, historical TVL, per-chain breakdown
- Arguably more accurate than our own sampled computation — they index full on-chain state, not a subset
- Surfaced on `/protocols` Streamflow card with a small "via DefiLlama" tag for transparency

**Per-user stream fetches:** Streamflow SDK against Alchemy free Solana RPC.
- User pastes a Solana pubkey → `client.get({ address: wallet })` on demand
- Stream data populates our cache for that user and flows through the normal VestingStream pipeline (alerts, CSV, MCP, REST API, dashboard)
- Alchemy free tier is 30M CU/mo ≈ 2–3M RPC calls/mo — ~50× what we'd consume at 1,000 active users

**Stream count on `/protocols`:** starts at 0, grows as users add wallets. Card includes a small "indexing live via user wallets" subtitle so the 0 doesn't feel broken — it feels fresh.

**Token prices on user streams:** existing DexScreener + CoinGecko pipeline already supports Solana (both have a `"solana"` chain slug). No new pricing infra needed.

**Future work (deferred):** when we want a proper seeded stream count too, add `discoverStreamflowRecipients` via `getProgramAccounts` + memcmp discriminator filter + `dataSlice(offset, 32)` to fetch only the recipient pubkey per stream account. ~150 LOC, 0.5 day, stays within Alchemy free tier at weekly cadence.

**Nice side-effect:** DefiLlama also tracks our existing EVM protocols (Sablier, Hedgey, Team Finance, UNCX). After Streamflow ships we can use it as a sanity-check source — if our sampled TVL diverges >20% from DefiLlama's, something is wrong with our seeder or pricing.

**Actions:**
1. Signup for Alchemy free tier, get the Solana mainnet RPC URL, put in Vercel as `SOLANA_RPC_URL`. No card required.
2. Verify `api.llama.fi/protocol/streamflow` returns expected shape (should be a simple GET during implementation).

### Q2. Solana "chainId" value

Solana has no canonical EVM-style integer chainId. Conventions:
- `101` — Solana cluster enum (most common informal convention)
- `900000+` — clearly synthetic, avoids any EVM-range collision
- SLIP-44 coin type `501` — not really a chainId

**Recommendation: `101`.** It's what most multi-chain aggregators use, DexScreener and CoinGecko both accept it implicitly via their "solana" slug, and it won't collide with any real EVM chainId in our lifetime.

### Q3. Solana RPC provider

Need one prod RPC + one testnet for local dev.

**Recommendation: Helius.** If we're paying for the indexer anyway (Q1 option B), use the same provider for plain RPC reads too.

### Q4. Should Streamflow's `AlignedContract` (price-aligned unlocks) be supported?

Streamflow has two stream types: standard `Contract` (time-based) and `AlignedContract` (unlocks tied to token price via an oracle). Standard is the vast majority. `AlignedContract` adds `minPrice/maxPrice/oracleType` fields that don't map cleanly to our `VestingStream` schema.

**Recommendation: Ship standard only in v1.** Log-and-skip aligned contracts with a TODO. They're <5% of Streamflow volume per our research and represent a data-model extension we can do separately.

---

## 3. Architecture — what changes vs. what doesn't

### Unchanged (confirmed by audit)
- `VestingStream` interface — already ecosystem-agnostic (addresses as `string`, chainId as `number`, amounts as stringified bigint)
- DB schema — `vestingStreamsCache.chainId` is `integer`, addresses are `text` with no length constraint. Base58 stores fine.
- `tvl.ts` pricing — already has `"solana"` slug path in `DS_CHAIN_SLUG` and `CG_PLATFORM_SLUG` (adding one map entry is sufficient)
- Email-OTP auth — treats addresses as opaque strings
- Middleware — no address coupling
- Cache read/write (`dbcache.ts`), aggregate, normalize — all treat addresses as plain strings
- Notification scheduler, push, email — all downstream of VestingStream
- CSV/PDF export, upcoming-unlocks endpoint, MCP tools — all pass VestingStream through transparently

### Changed (explicitly scoped)

#### 3.1 Shared types (`packages/shared/src/vesting.ts`)

Add a Solana chain constant and extend the union:

```ts
export const CHAIN_IDS = {
  ETHEREUM:     1,
  BSC:          56,
  POLYGON:      137,
  BASE:         8453,
  SEPOLIA:      11155111,
  BASE_SEPOLIA: 84532,
  SOLANA:       101,        // NEW — Solana mainnet-beta
} as const;

export const CHAIN_NAMES: Record<SupportedChainId, string> = {
  // ...existing...
  [CHAIN_IDS.SOLANA]: "Solana",
};

// NEW — convenience helper used by address validators + adapters
export const NON_EVM_CHAIN_IDS: SupportedChainId[] = [CHAIN_IDS.SOLANA];
export const EVM_CHAIN_IDS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.BASE,
  CHAIN_IDS.SEPOLIA, CHAIN_IDS.BASE_SEPOLIA,
];

export function isEvmChain(id: SupportedChainId): boolean {
  return EVM_CHAIN_IDS.includes(id);
}
```

The `VestingStream` interface itself does not change. A comment update clarifies that `chainId` is a "network identifier" not specifically EVM.

#### 3.2 Address validation — new helper module

**File:** `src/lib/address-validation.ts` (new, ~60 LOC)

```ts
import { isAddress as isEvmAddress } from "viem";
import { PublicKey } from "@solana/web3.js";

export type AddressEcosystem = "evm" | "solana";

export function detectEcosystem(address: string): AddressEcosystem | null {
  if (/^0x[0-9a-fA-F]{40}$/.test(address) && isEvmAddress(address)) return "evm";
  if (isValidSolanaAddress(address)) return "solana";
  return null;
}

export function isValidSolanaAddress(s: string): boolean {
  if (s.length < 32 || s.length > 44) return false;
  try { new PublicKey(s); return true; } catch { return false; }
}

/** Ecosystem-aware validator — returns true if the address is valid on EITHER chain family. */
export function isValidWalletAddress(address: string): boolean {
  return detectEcosystem(address) !== null;
}

/** Normalise an address for cache key / DB storage. EVM → lowercase hex. Solana → base58 unchanged. */
export function normaliseAddress(address: string): string {
  const ecosystem = detectEcosystem(address);
  if (ecosystem === "evm")    return address.toLowerCase();
  if (ecosystem === "solana") return address;  // base58 is case-sensitive
  return address;
}
```

**Call sites to update (14 files from audit):** each call to `isAddress(x)` becomes `isValidWalletAddress(x)`. Each call to `x.toLowerCase()` on an address becomes `normaliseAddress(x)`.

The audit identified the exact files and line numbers — see Section 5 for the complete list.

#### 3.3 Chain-links module (`src/lib/chain-links.ts`)

Update the switch statements to handle Solana:
- `blockExplorerUrl(chainId, hash)` → returns `solscan.io/tx/{hash}` or `solana.fm/tx/{hash}` for Solana
- `blockExplorerName(chainId)` → returns `"Solscan"` for Solana
- `tokenSnifferUrl(chainId, addr)` → returns null or a RugCheck equivalent for Solana (prefer RugCheck: `rugcheck.xyz/tokens/{addr}`)
- Drop the `EVM_ADDR` regex from line 12 — superseded by `detectEcosystem`

#### 3.4 New adapter: `src/lib/vesting/adapters/streamflow.ts` (~300 LOC)

Follows the same contract as `pinksale.ts`:

```ts
import { VestingAdapter } from "./index";
import { VestingStream, CHAIN_IDS, computeStepVesting } from "../types";
import { StreamflowSolana, Types as StreamflowTypes } from "@streamflow/stream";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

async function fetchForChain(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<VestingStream[]> {
  if (chainId !== CHAIN_IDS.SOLANA) return [];
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) { console.error("[streamflow] SOLANA_RPC_URL not set"); return []; }

  const client = new StreamflowSolana.SolanaStreamClient(rpcUrl);
  const connection = new Connection(rpcUrl);

  const allStreams: Array<{ id: string; account: Contract }> = [];
  for (const wallet of wallets) {
    try {
      const streams = await client.get({
        address:   wallet,
        type:      StreamflowTypes.StreamType.All,
        direction: StreamflowTypes.StreamDirection.All,
      });
      for (const [id, account] of streams) {
        // Skip AlignedContract variants for v1 (see Q4)
        if ("minPrice" in account) continue;
        allStreams.push({ id, account });
      }
    } catch (err) {
      console.error(`[streamflow] fetch failed for ${wallet}:`, err);
    }
  }

  if (allStreams.length === 0) return [];

  // Batch-fetch SPL token decimals (one getMint call per unique mint)
  const mints = [...new Set(allStreams.map((s) => s.account.tokenId))];
  const decimalsByMint = new Map<string, number>();
  const symbolsByMint  = new Map<string, string>();
  await Promise.allSettled(
    mints.map(async (mint) => {
      const mintInfo = await getMint(connection, new PublicKey(mint));
      decimalsByMint.set(mint, mintInfo.decimals);
      // Symbol: fetch via Metaplex metadata PDA. Fallback to "???" on miss.
      symbolsByMint.set(mint, await fetchSplSymbol(connection, mint));
    }),
  );

  const nowSec = Math.floor(Date.now() / 1000);

  return allStreams.map(({ id, account }): VestingStream => {
    const decimals = decimalsByMint.get(account.tokenId) ?? 9;
    const symbol   = symbolsByMint.get(account.tokenId) ?? "???";
    // Streamflow streams are step-shaped (cliff + periodic unlocks)
    const steps    = buildUnlockSteps(account);
    const total    = BigInt(account.depositedAmount.toString());
    const withdrawn = BigInt(account.withdrawnAmount.toString());
    const { claimableNow, lockedAmount, isFullyVested } =
      computeStepVesting(total, withdrawn, steps, nowSec);

    return {
      id:              `streamflow-${CHAIN_IDS.SOLANA}-${id}`,
      protocol:        "streamflow",
      chainId:         CHAIN_IDS.SOLANA,
      recipient:       account.recipient,
      tokenAddress:    account.tokenId,
      tokenSymbol:     symbol,
      tokenDecimals:   decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime:       account.start,
      endTime:         account.end,
      cliffTime:       account.cliff > account.start ? account.cliff : null,
      isFullyVested,
      nextUnlockTime:  nextUnlockTimeForSteps(nowSec, steps),
      cancelable:      account.cancelableBySender || account.cancelableByRecipient,
      shape:           "steps",
      unlockSteps:     steps,
    };
  });
}

export const streamflowAdapter: VestingAdapter = {
  id:   "streamflow",
  name: "Streamflow",
  supportedChainIds: [CHAIN_IDS.SOLANA],
  fetch: fetchForChain,
};
```

Helper functions (in same file):
- `buildUnlockSteps(contract)` — converts `(start, cliff, cliffAmount, period, amountPerPeriod, end, depositedAmount)` to a `{timestamp, amount}[]` array
- `fetchSplSymbol(connection, mint)` — Metaplex metadata PDA lookup with Jupiter token-list fallback

#### 3.5 Adapter registry (`src/lib/vesting/adapters/index.ts`)

Append to `ADAPTER_REGISTRY`:
```ts
import { streamflowAdapter } from "./streamflow";

export const ADAPTER_REGISTRY = [
  // ...existing 8...
  streamflowAdapter,
] as const;
```

#### 3.6 Protocol registry (`src/lib/protocol-constants.ts`)

Add to `PROTOCOLS` object:

```ts
streamflow: {
  slug:        "streamflow",
  name:        "Streamflow",
  adapterIds:  ["streamflow"],
  chainIds:    [CHAIN_IDS.SOLANA],
  color:       "#14f195",  // Solana green
  bg:          "#14f19510",
  border:      "#14f19530",
  tagline:     "Solana's #1 vesting protocol",
  description: "Streamflow powers token vesting for 25k+ Solana projects — now indexed alongside the EVM ecosystem.",
  // ...match the existing shape for the other 7 protocols
},
```

And append `"streamflow"` to `PROTOCOL_SLUGS`.

#### 3.7 Seeder (`src/lib/vesting/seeder.ts`)

Add a new discover function:

```ts
async function discoverStreamflowRecipients(
  chainId: SupportedChainId,
  limit: number,
): Promise<string[]> {
  if (chainId !== CHAIN_IDS.SOLANA) return [];
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) return [];

  // Option A (getProgramAccounts) or Option B (Helius-enhanced) depending on Q1.
  // For Helius: use the DAS API or getProgramAccounts with filters.
  // Returns up to `limit` unique recipient pubkeys from recent streams.
  // Union with STREAMFLOW_SEED_WALLETS safety-net list (mirror pinksale pattern).
}
```

Append to `SEED_JOBS`:
```ts
{ adapterId: "streamflow", chainId: CHAIN_IDS.SOLANA, discover: discoverStreamflowRecipients },
```

#### 3.8 Pricing (`src/lib/vesting/tvl.ts`)

Single-line change to both slug maps:
```ts
const DS_CHAIN_SLUG: Record<number, string> = {
  // ...existing 4...
  101: "solana",
};
const CG_PLATFORM_SLUG: Record<number, string> = {
  // ...existing 4...
  101: "solana",
};
```

#### 3.9 Frontend chain pill / wallet input

**Chain pill lists** (`dashboard/page.tsx`, `settings/page.tsx`, `dashboard/discover/page.tsx`):
Add `{ id: "101", label: "Solana", short: "SOL" }` to each `CHAIN_OPTIONS` array.

**Wallet input** (`WalletInput.tsx`):
- Placeholder: `"0x… or Solana pubkey"` (or dynamic based on detected ecosystem mid-typing)
- Validation: replace `isAddress(value)` with `isValidWalletAddress(value)` from the new helper
- Error message: "Enter a valid wallet address (EVM 0x… or Solana pubkey)"

**Find-vestings** (`FindVestingsClient.tsx`):
- Drop the local regex at line 69-70 in favour of the shared helper
- Error message at line 99 genericised to match

#### 3.10 REST API error messages

`src/app/api/v1/wallet/[address]/vestings/route.ts:33` and sibling endpoints: change `"Expected a 0x EVM address"` to `"Expected a valid wallet address (EVM or Solana)"`.

`mobile/wallets/route.ts`, `wallets/route.ts`, `wallets/scan/route.ts`, `wallets/[address]/route.ts`, `find-vestings/route.ts`, `vesting/route.ts`, `explore/route.ts` — same pattern.

**Token address validation (`tokenAddress` input in those routes)** needs ecosystem-awareness too — an SPL mint is base58, not 0x. The `normaliseAddress` helper handles both.

#### 3.11 MCP server (`mcp/vestream.ts`)

Update the `address` and `chain` parameter docstrings to mention Solana:

```ts
address: z.string().describe(
  "Wallet address. EVM: 0x-prefixed hex (e.g. 0xd8dA6BF...). " +
  "Solana: base58 pubkey (e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU)."
),
chain: z.string().optional().describe(
  "Comma-separated chain ID filter. Supported: 1 (Ethereum), 56 (BSC), " +
  "137 (Polygon), 8453 (Base), 101 (Solana)."
),
```

Also `protocol` needs `streamflow` added to the valid-values list.

#### 3.12 OpenAPI spec (`public/openapi.json`)

- Add `"streamflow"` to the `protocol` enum on `VestingStream.protocol`
- Add `101 (Solana)` to the chainId description
- Update the top-level description from "Normalised, chain-indexed token vesting data across 7 protocols / 4 chains" → "… across 8 protocols / 5 chains including Solana"
- Bump spec version to 1.2.0

#### 3.13 Landing-page copy

Files with "7 protocols" / "4 chains" strings (grepped earlier):
- `src/app/find-vestings/page.tsx:38` — `"7 protocols · 4 chains"` → `"8 protocols · 5 chains"`
- `src/app/find-vestings/FindVestingsClient.tsx:176,326,523` — same update
- `src/app/developer/page.tsx:18,526` — same update
- `src/app/faq/page.tsx` — multiple mentions
- `src/app/token/[chainId]/[address]/page.tsx:539` — same
- `src/app/dashboard/discover/page.tsx:613,832` — same
- `src/components/LiveActivityTicker.tsx:14,202` — same
- `src/app/dashboard/page.tsx:3711` — same

Roughly 15 spots total. Mechanical sed-replace reviewed line by line (we've been burned before).

#### 3.14 Environment variables

Add to Vercel + `.env.local`:
```
SOLANA_RPC_URL           Helius or chosen provider mainnet endpoint
SOLANA_RPC_URL_TESTNET   Optional — for local/staging QA
HELIUS_API_KEY           If using Helius DAS for discovery
```

---

## 4. Implementation phases + estimated effort

| Phase | Duration | Deliverable |
|---|---|---|
| **Phase 0 — decisions + setup** | 0.25 day | Q2–Q4 answered; Alchemy free Solana RPC URL in Vercel env |
| **Phase 1 — core types + validation** | 0.5 day | Solana chainId in shared types, `address-validation.ts` helper, all 14 `isAddress` call sites updated |
| **Phase 2 — Streamflow adapter** | 1.5 days | `streamflow.ts` implementing `VestingAdapter`, tested locally against a real Solana wallet with Streamflow streams |
| **Phase 3 — DefiLlama TVL fetcher + card UI** | 0.5 day | `lib/external-tvl.ts` wrapping DefiLlama `/protocol/streamflow` with 5min cache; `/protocols` Streamflow card displays TVL from DefiLlama with transparency tag |
| **Phase 4 — pricing + chain-links + registries** | 0.5 day | `tvl.ts` slug maps, `chain-links.ts` Solscan/RugCheck, protocol + adapter registry entries |
| **Phase 5 — frontend + API error messages** | 0.5 day | Chain pills, wallet input placeholder, error message updates, REST + MCP + OpenAPI doc updates, landing-page "5 chains" copy |
| **Phase 6 — QA + rollout** | 0.5 day | Real-wallet smoke tests, feature-flag toggle, production deploy |

**Total: ~4 days of focused engineering work.** Plus ~0.5 day of slack for Streamflow SDK surprises.

**Deferred (free-tier future work, 0.5 day when we want it):** build `discoverStreamflowRecipients` via `getProgramAccounts` + memcmp + dataSlice. Optional, not blocking launch.

---

## 5. Testing strategy

### 5.1 Unit tests

- `detectEcosystem()` — EVM checksum, EVM lowercase, Solana mainnet address, PDA (should still validate), short/long garbage, empty string, `0x` prefix only
- `normaliseAddress()` — roundtrip on both EVM and Solana addresses
- `streamflow.fetchForChain([wallet])` — mocked RPC + SDK responses; snapshot a real stream fixture

### 5.2 Integration tests (Playwright)

Extend `e2e/smoke.spec.ts`:
- `/find-vestings` with a real Solana wallet that has a known Streamflow stream — assert the stream card renders with correct token symbol and claimable amount
- Wallet input accepts both `0x…` and base58 formats without showing the "Invalid" state

### 5.3 Production canary

Ship behind a feature flag `NEXT_PUBLIC_SOLANA_ENABLED=true`. Roll out to admin users first, then all users after 48h of green monitoring.

---

## 6. Rollout / cutover

1. Land all code behind the feature flag (flag defaults off in prod until explicitly enabled)
2. Run `?mode=deep` against Streamflow only via an opt-in scripted seeder run to populate a representative cache
3. Enable flag for admin users (`if (session.isAdmin || env.NEXT_PUBLIC_SOLANA_ENABLED)`)
4. 48-hour soak — watch error rates on `SOLANA_RPC_URL`, watch DexScreener/CoinGecko pricing coverage for Solana tokens
5. Public flip — set `NEXT_PUBLIC_SOLANA_ENABLED=true` in Vercel production env
6. Update all landing-page copy in a single commit (now that we're actually live)
7. Tweet about it; ask Streamflow to RT — their marketing team might appreciate the ecosystem shoutout

---

## 7. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Streamflow SDK field names differ from docs (e.g. `tokenId` vs `mint`) | Medium | Pin SDK version, write integration test against a real wallet, verify types against installed `.d.ts` |
| SPL metadata fetches slow down adapter.fetch() to >60s per batch of 50 recipients | Medium | Cache `decimals` + `symbol` in a Postgres table keyed by mint; TTL 30 days. Pre-warm during deep seed. |
| Helius rate limits on seeder deep-pass | Low | Start with Builder tier ($49/mo = 50M credits). Monitor with Helius dashboard. |
| Long-tail SPL tokens have no Metaplex metadata → symbol "???" | High | Fall back to Jupiter token list (`token.jup.ag/all`) — covers the top few thousand by volume. Final fallback: first 4 chars of mint address. |
| `AlignedContract` streams exist in a user's wallet, we skip them → "missing data" complaints | Low | Log the skip at info level; add a footer note on empty-state: "Price-aligned streams not yet supported." |
| Base58 addresses accidentally passed to viem `isAddress` elsewhere → uncaught false rejection | Medium | TypeScript + the new `isValidWalletAddress` helper. Grep-guard: CI job fails if `viem.isAddress` is imported in any file not covered by the new wrapper. |
| Deep-seed adds Streamflow to the daily run and pushes runtime past 300s maxDuration | Medium | Run Streamflow seeding only on `?mode=deep` initially; add to incremental only after measuring actual runtime. |

---

## 8. Out of scope for this sprint (explicit)

- Phantom/Backpack/Solflare wallet connection — manual paste is enough
- Sign-In With Solana (SIWS) — email OTP handles auth
- Jupiter Lock / Bonfida / other Solana vesting protocols — add incrementally once Streamflow is stable
- Multi-ecosystem generic abstraction — defer until a second non-EVM chain is on the roadmap
- Solana-native token page (`/token/{chainId}/{address}`) — reuse the existing EVM-focused page with minor chain-aware tweaks in a follow-up
- NFT-based Streamflow streams (if any exist) — treated as regular streams at the SDK level
- Real-time Streamflow webhook subscription — polling via cron is fine for v1

---

## 9. Success metrics

- **Week 1 post-launch:** Streamflow card on `/protocols` shows non-zero TVL with >30% priced coverage
- **Week 2:** At least 10 distinct users have added a Solana wallet to their tracked set
- **Week 4:** "Solana" appears in wallet-added events at ≥5% of new-wallet daily rate
- **Anti-metric:** Zero regressions in EVM flows (measured by null-rate on `fetch-vestings` success for EVM wallets — should stay flat pre/post)

---

## 10. Next step after this plan is approved

I'll break this into a sequenced PR list so each phase lands independently reviewable:

1. PR #1: shared types + address validator (no user-facing change)
2. PR #2: chain-links module + pricing slug maps (no user-facing change)
3. PR #3: Streamflow adapter + registry wiring (feature-flagged, no UI)
4. PR #4: Seeder discovery + env vars
5. PR #5: Frontend chain pill + wallet input + error messages (still feature-flagged)
6. PR #6: Landing-page copy + MCP + OpenAPI docs
7. PR #7: Feature-flag flip

Each PR small enough to review in ~15 minutes. Each can ship to main without breaking production.
