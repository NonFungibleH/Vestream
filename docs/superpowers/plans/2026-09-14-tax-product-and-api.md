# Tax Product + Claims API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tax engine we already have into a product a stranger can use, in time for the 31 January 2027 UK self-assessment deadline, and expose the same data as a `/v1` claims endpoint to sell to tax tools.

**Architecture:** Nothing here is a new indexer. Fourteen protocol claim ingestors, historical pricing with confidence bands, and Koinly/CoinTracker/TurboTax exports already exist. Two things block the product: claims are only ingested for *paid users with linked wallets* (41 rows in `claim_events` platform-wide), and the unlock-basis half of the feature was built in July and never merged. This plan lands the branch, decouples claim ingestion from paid accounts so any scanned wallet gets a history, and draws the paywall between **the events** (free — proves the data is real) and **the money** (Pro — USD at the time, income statement, CSV, confidence).

**Tech Stack:** Next.js 16 canary, Drizzle ORM + Supabase Postgres, Vercel cron, TypeScript, vitest. Migrations are hand-written idempotent SQL in `drizzle/` (the drizzle journal was archived — follow `drizzle/0046_vsc_last_refreshed_idx.sql` as the pattern).

**Paywall line (locked by Howard, 2026-09-14):**
- **Free:** scan any wallet, see the vesting positions *and* the claim history as events — date, token, amount, protocol. This is the proof that we found their real data.
- **Pro ($9.99/mo, $74.99/yr):** USD value at the moment of each claim, the income statement, the CSV exports, and the confidence breakdown.
- This is already what `src/app/tax/page.tsx` promises in five places including the "Is this free?" FAQ answer. **Do not change that copy** — this plan makes it true.

**Non-goals:** Phase 2 continuous-stream unlock bucketing; local-time tax-year bucketing (stays UTC, matching the claim path); automated jurisdiction inference; capital-gains chaining beyond storing the unlock value.

---

## Task 1: Recover the unlock-basis branch

`feat/unlock-basis-tax` is ten commits, 22 files, built 2026-07-05 and never merged. Main has moved 205 commits since (Smithii, five new chains, the rollup liquidity guards). There is exactly **one** conflict, in `src/lib/vesting/csv-exports.ts`. This is the highest value-per-hour work in the plan: it is the accrual-basis feature that makes the product credible in the UK and EU, and it is decaying.

**Files:**
- Merge: `feat/unlock-basis-tax` → `main`
- Conflict: `src/lib/vesting/csv-exports.ts`
- Migrations to apply: `drizzle/0038_vesting_unlock_events.sql`, `drizzle/0039_users_tax_basis.sql`
- Verify: `src/lib/vesting/__golden_csv.json`, `src/lib/vesting/csv-exports.test.ts`

- [ ] **Step 1: Branch from main and merge, expecting the one conflict**

```bash
git checkout main && git pull
git checkout -b feat/tax-product-recovery
git merge feat/unlock-basis-tax
```

- [ ] **Step 2: Resolve `csv-exports.ts`**

The branch rewrote the export row into a `TaxExportRow` shape so one writer serves both bases. Main has changed the same file since. Keep the branch's `TaxExportRow` abstraction and re-apply main's changes on top of it. Do not "resolve" by taking either side wholesale.

- [ ] **Step 3: Run the golden CSV regression**

Run: `npx vitest run src/lib/vesting/csv-exports.test.ts`
Expected: PASS. This test asserts byte-identical claim-basis output, so it is the guard that the merge did not change what existing Pro users download.

- [ ] **Step 4: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: clean, 207+ tests passing.

- [ ] **Step 5: Apply both migrations against production**

Run: `node scripts/apply-migration.mjs drizzle/0038_vesting_unlock_events.sql` then the same for `0039`. Both are idempotent.

- [ ] **Step 6: Confirm the cron is registered**

`vercel.json` should carry the `generate-unlocks` entry from the branch. Check it did not get dropped in the merge.

- [ ] **Step 7: Commit and push to main**

---

## Task 2: Let any scanned wallet have a claim history

This is the blocker. `ingestAllClaimsForUser(userId, wallets, chainIds)` threads a `userId` through purely as the storage key — the on-chain fetching is already wallet-scoped. `claim_events.user_id` is NOT NULL, so there is nowhere to put a claim for a wallet that has no account.

**Files:**
- Modify: `src/lib/db/schema.ts` (`claimEvents`)
- Create: `drizzle/0047_claim_events_wallet_scoped.sql`
- Modify: `src/lib/vesting/ingestors/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/vesting/ingestors/wallet-scoped.test.ts
it("stores a claim for a wallet with no user account", async () => {
  const n = await ingestAllClaimsForWallet("0xabc…", [CHAIN_IDS.ETHEREUM]);
  expect(n).toBeGreaterThanOrEqual(0);
  // and the row is retrievable by wallet, with userId null
});
```

- [ ] **Step 2: Migration — make `user_id` nullable, add a wallet index**

```sql
ALTER TABLE claim_events ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS claim_events_recipient_idx ON claim_events (lower(recipient), claimed_at DESC);
```

Rows keyed by wallet carry `user_id = NULL`. When that wallet is later linked to an account, backfill the `user_id` rather than re-ingesting — the unique indexes already dedupe.

- [ ] **Step 3: Add `ingestAllClaimsForWallet(wallet, chainIds)`**

Thin sibling of `ingestAllClaimsForUser` that passes `null` as the user id. Keep both; the cron path for paid users is unchanged.

- [ ] **Step 4: Run tests, then commit**

---

## Task 3: Scope the scan by known positions (this is what makes it fast)

A naive scan is unusable. The log-based ingestors read from each protocol's **deployment block** to latest (see `DEPLOYMENT_BLOCKS` in `hedgey-claims.ts`, `pinksale-claims.ts`, and `fromBlock` in `uncx-vm-claims.ts`), which for UNCX-VM on BSC is ~11,000 chunked `eth_getLogs` calls for one wallet on one protocol. Full history is *recoverable* — that is the good news, and it is why a complete tax year is possible — but not synchronously.

The fix: we already know which protocols and chains a wallet touches, from `vesting_streams_cache`. Scan only those.

**Files:**
- Modify: `src/lib/vesting/ingestors/index.ts`
- Read: `src/lib/vesting/dbcache.ts` (`readAllStreamsForWallets`)

- [ ] **Step 1: Write the failing test** — a wallet with only Sablier/Ethereum positions must not trigger the UNCX-VM or PinkSale ingestors.

- [ ] **Step 2: Derive the (protocol, chain) set from the cache before fanning out**

- [ ] **Step 3: Assert the reduction in a test** (protocols invoked == protocols with positions)

- [ ] **Step 4: Commit**

> Verified 2026-09-14: `vesting_streams_cache` retains completed positions, so scoping by position history is safe. Sablier alone holds 40,567 fully-vested rows with the oldest ending July 2023, against 9,379 active. There is no prune path that deletes completed streams. This matters because the tax customer we most want is someone whose vesting *finished* — they have a liability and no paperwork — and scoping would silently miss them if history were pruned.

---

## Task 4: Run the scan as a background job

**Files:**
- Create: `src/app/api/claims/scan/route.ts` (start + status)
- Modify: `src/app/api/find-vestings/route.ts` (kick the claim scan after the position scan)

- [ ] **Step 1:** Return fast results immediately. Indexer-backed protocols (Sablier via Envio, Streamflow, Magna) resolve in seconds; log-scanned ones fill in behind.
- [ ] **Step 2:** Persist progress so the UI can poll. Reuse the `scan_events` table pattern.
- [ ] **Step 3:** Rate limit as the position scan already does (5/IP/hour, 20/day in `find-vestings/route.ts`) so deep multi-chain scans cannot be abused anonymously.
- [ ] **Step 4:** Commit.

---

## Task 5: The free claim list, and the Pro wall

**Files:**
- Modify: `src/app/find-vestings/page.tsx` (surface claims alongside positions)
- Modify: `src/app/tax/page.tsx` (point "Scan my wallet free" at the tax scan, not `/find-vestings`)
- Modify: `src/app/dashboard/exports/page.tsx`

- [ ] **Step 1:** Render the claim list free: date, token, amount, protocol, chain. **No USD.**
- [ ] **Step 2:** Show the count and tax-year split free ("14 claims in the 2025-26 tax year"), because that is the line that converts.
- [ ] **Step 3:** Paywall USD-at-claim, the income statement, the CSVs and the confidence breakdown behind Pro.
- [ ] **Step 4:** Capture an email on the free result so a seasonal visitor scanning in October can be told when their report is ready. **Do this even if nothing else in Task 5 ships** — the season is the business and we are currently early with no way to hold a lead.
- [ ] **Step 5:** Commit.

---

## Task 6: Close the free-scan chain gap

`EVM_SCAN_CHAINS` in `src/app/api/find-vestings/route.ts` covers Ethereum, BSC, Polygon, Base, Arbitrum, Optimism, Avalanche (+ Sepolia) and Solana. We index fourteen. Robinhood Chain alone has 377 HoodLock positions that a free scan reports as nothing.

A false empty is worse than a slow scan, especially on the page we are about to point tax traffic at.

- [ ] **Step 1:** Add the missing mainnets, watching the 25s `maxDuration` budget — add them to the position scan, not necessarily the deep claim scan.
- [ ] **Step 2:** Verify a known Robinhood Chain wallet returns its HoodLock position.
- [ ] **Step 3:** Commit.

---

## Task 7: `/v1` claims endpoint

Only after Tasks 2–5, because the consumer product is the reference implementation that makes this sellable.

**Files:**
- Create: `src/app/api/v1/wallet/[address]/claims/route.ts`
- Read: `src/lib/api-key-auth.ts` (tiers, monthly limits, usage — already built)

- [ ] **Step 1:** Mirror the shape of `v1/wallet/[address]/vestings`.
- [ ] **Step 2:** Return claims with USD at claim and the confidence flag — the field a tax tool cannot compute itself, because it sees an inbound transfer with no acquisition context.
- [ ] **Step 3:** Document it on `/developer`.
- [ ] **Step 4:** Commit.

---

## Sequencing and why

The 31 January 2027 deadline is the constraint. People start looking in November, which leaves roughly eight weeks. Tasks 1–5 are what can realistically be live for this season. Task 7 and the tax-tool partnerships are a 2027 play: an integration will not close before January, so the API must not be what we race the season with.
