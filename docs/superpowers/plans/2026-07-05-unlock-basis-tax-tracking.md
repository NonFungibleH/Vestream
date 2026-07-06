# Unlock-Basis Tax Tracking (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record token income at **unlock (vest) time** in addition to the existing **claim time**, so Vestream's tax tool serves accrual-basis jurisdictions — surfaced as a dashboard table that shows both bases side by side per tranche, and a CSV export the user runs on their chosen basis.

**Architecture:** Unlocks have no on-chain transaction (unlike claims, which are indexed from `eth_getLogs`). So unlock income events are **computed** from each stream's vesting schedule by a pure generator, persisted into a new `vesting_unlock_events` table (mirroring `claim_events`), then priced at each unlock timestamp via the existing `getHistoricalPrice`. A cron generates + prices them per tracked wallet. A per-user `taxBasis` setting (default `claim`) drives which basis the dashboard table highlights and the export uses. Unpriced tokens store `usd = null` with `priceConfidence = "missing"` and are flagged for manual FMV entry.

**Tech Stack:** Next.js 16 (canary), Drizzle ORM + Postgres (Supabase), Vercel cron, TypeScript, vitest. Historical prices via CoinGecko (already wrapped). Migrations hand-written idempotent SQL in `drizzle/` (drizzle journal was archived — follow `drizzle/0037_scan_events.sql` as the pattern).

**Scope (Phase 1 — locked):**
- **Discrete-tranche protocols only**: cliff, stepped, and tranched schedules (Hedgey, UNCX, Team Finance, PinkSale, Sablier *tranched*). **Defer** continuous/linear streams (Sablier linear, Superfluid, LlamaPay) to Phase 2 — the generator returns `[]` for them.
- **Manual** tax-basis pick (toggle). Claim-basis stays the **default**; unlock-basis is opt-in.
- **Unpriced tokens** → `usd: null`, `priceConfidence: "missing"`, flagged "needs your input" for manual FMV.
- **Not legal advice** — a disclaimer ships with the UI + export.
- **Date/tax-year bucketing stays UTC** in Phase 1 — matching the existing claim path (`income-statement/route.ts:88` uses `EXTRACT(YEAR FROM claimedAt)`; `csv-exports.ts` formats with `toISOString()`). *(Review fix #1/#2: an earlier draft mandated local-time via `users.timezone`, which contradicts the byte-identical claim-regression guard and references a `mobile/income.ts` file that does not exist in this repo. Local-time is deferred to its own later task that migrates BOTH bases together and explicitly retires the byte-identical guard.)*

**Non-goals (Phase 1):** continuous-stream bucketing; local-time tax-year bucketing; automated jurisdiction inference; capital-gains cost-basis chaining beyond storing the unlock value so Phase 3 can consume it (we store it now, we do not yet compute gains).

> **Reviewed 2026-07-05.** A plan-document review verified every reuse point against the codebase and corrected four blocking assumptions (see inline *Review fix* notes): UTC bucketing (not local-time), the `csv-exports` refactor is a `TaxExportRow` rewrite (not a param), the discrete/continuous split is schedule *geometry* (no clean enum exists), and `unlockSteps` are already-incremental (no differencing).

---

## File Structure

**Create:**
- `src/lib/vesting/unlock-schedule.ts` — pure generator: `VestingStream → UnlockTranche[]` for discrete schedules only. No I/O. The heart of the feature; unit-tested hard.
- `src/lib/vesting/unlock-schedule.test.ts` — tranche-math tests (cliff, stepped, tranched, linear→`[]`, dedup key stability).
- `src/lib/vesting/unlock-events.ts` — DB layer: `generateUnlockEventsForWallets()` (generate → dedup-insert unpriced), `priceUnlockEvents()` (enrich `missing` rows via `getHistoricalPrice`), `getUnlockEventsForUser()`, `setManualUnlockPrice()`.
- `src/lib/vesting/unlock-events.test.ts` — dedup, idempotency, pricing-confidence, manual-override tests.
- `src/app/api/cron/generate-unlocks/route.ts` — cron: per tracked wallet, generate + price unlock events. Mirrors `cron/ingest-claims`.
- `src/lib/tax/tax-basis.ts` — `TaxBasis = "claim" | "unlock"`, validation, default.
- `src/app/api/tax/basis/route.ts` — GET/PUT the user's `taxBasis` (dual-auth: web session OR mobile bearer, mirror `/api/streams/[streamId]/tags`).
- `src/app/api/tax/unlock-events/route.ts` — GET unified per-event rows (unlock + matching claim side by side) for the dashboard table.
- `src/app/api/tax/unlock-events/[id]/price/route.ts` — PUT manual FMV for one unlock event (`missing` rows only).
- `drizzle/0038_vesting_unlock_events.sql` — idempotent table + indexes.
- `drizzle/0039_users_tax_basis.sql` — idempotent `ALTER TABLE users ADD COLUMN tax_basis`.

**Modify:**
- `src/lib/db/schema.ts` — add `vestingUnlockEvents` table; add `taxBasis` column to `users`.
- `src/lib/vesting/csv-exports.ts` — add an unlock-basis row source + a `basis` param so exports emit on the chosen basis with the correct date/value columns.
- The tax dashboard page (locate via `grep -rl "usdValueAtClaim\|income-statement" src/app/dashboard`) — add the side-by-side table + basis toggle + "needs your input" flags + FMV-entry affordance + disclaimer.
- `vercel.json` (or wherever crons are declared — `grep -n "crons" vercel.json`) — schedule `generate-unlocks`.

**Read-only references (do NOT modify — reuse):**
- `src/lib/vesting/historical-prices.ts` → `getHistoricalPrice(chainId, tokenAddress, timestampSec)` → `{ usd: number|null, confidence: "exact"|"nearest"|"missing", resolvedDate }`.
- `src/lib/db/schema.ts` → `claimEvents` (shape to mirror), `vestingStreamsCache`.
- `src/lib/vesting/types.ts` + wherever `VestingStream` is defined (`grep -rn "interface VestingStream"`) → schedule fields `startTime, cliffTime, endTime, totalAmount, tokenDecimals, unlockSteps, shape, nextUnlockTime`.
- `src/lib/vesting/calendar-ics.ts` and `src/lib/vesting/rounds.ts` — existing schedule→event/round logic to model the generator on (check before writing new tranche math).
- `src/app/api/cron/ingest-claims/route.ts` — cron auth + structure pattern.
- `drizzle/0037_scan_events.sql` — idempotent-migration pattern.

---

## Task 1: Understand the schedule model + existing tranche logic (spike, no code)

**Files:** none — investigation only.

- [ ] **Step 1:** Read the `VestingStream` interface and the `UnlockStep`/`shape` types (`grep -rn "interface VestingStream\|unlockSteps\|shape:" src/lib/vesting/`). Write down, in the PR description, the exact fields and units: is `totalAmount` base units (stringified bigint)? What are the `shape` enum values (`"linear" | "steps" | ...`)? What is one `unlockSteps` entry `{ timestamp, amount }` or cumulative?
- [ ] **Step 2:** Read `src/lib/vesting/calendar-ics.ts` and `src/lib/vesting/rounds.ts`. Determine whether either already turns a schedule into discrete unlock events. If yes, the generator in Task 2 **reuses/extracts** that logic rather than re-deriving tranche math. Note the function names in the PR description.
- [ ] **Step 3:** The discrete-vs-continuous predicate — **there is no clean `cliff|stepped|tranched` enum** (review fix #4). `VestingStream` only has `shape?: "linear" | "steps"` + optional `unlockSteps?: { timestamp: number; amount: string }[]` + `cliffTime: number | null`. Use this predicate (derived from `rounds.ts:98-99` `isInstant`/`isCliffOnly` geometry):

```ts
// discrete (Phase 1) = stepped OR one-lump. Everything else (real linear
// duration) → deferred to Phase 2.
function isDiscreteSchedule(s: VestingStream): boolean {
  if (s.shape === "steps" && (s.unlockSteps?.length ?? 0) > 0) return true; // stepped/tranched
  const duration = s.endTime - s.startTime;
  if (duration <= 0) return true;                                            // instant lump
  if (s.cliffTime != null && s.endTime - s.cliffTime <= 3 * 86400) return true; // cliff-only lump
  return false;                                                              // linear/continuous → Phase 2
}
```

**Exit criteria:** confirmed in this doc — `shape` ∈ `"linear"|"steps"`; `unlockSteps` entries are `{timestamp, amount}` **already-incremental** (review fix #5 — `computeStepVesting` sums them directly, `vesting.ts:274`); no historical-tranche expander exists to reuse (`calendar-ics.ts` emits only *future* unlocks, `rounds.ts` groups streams — the generator is net-new, review fix #14). No code yet beyond the predicate.

---

## Task 2: Unlock-tranche generator (pure function)

**Files:**
- Create: `src/lib/vesting/unlock-schedule.ts`
- Test: `src/lib/vesting/unlock-schedule.test.ts`

- [ ] **Step 1: Write failing tests** covering the tranche math. Use the real `VestingStream` type (import it); build fixtures with a small helper.

```ts
import { describe, it, expect } from "vitest";
import { computeUnlockTranches, type UnlockTranche } from "./unlock-schedule";

// A cliff schedule: whole amount unlocks at cliffTime.
it("cliff: emits one tranche of the full amount at the cliff", () => {
  const t = computeUnlockTranches(cliffStream({ cliffTime: 1_700_000_000, total: "1000000000000000000", decimals: 18 }));
  expect(t).toHaveLength(1);
  expect(t[0].unlockTime).toBe(1_700_000_000);
  expect(t[0].amount).toBe("1000000000000000000");
});

// A stepped schedule: one tranche per step, amounts sum to total, no double-count.
it("stepped: one tranche per step, amounts sum to the total", () => {
  const t = computeUnlockTranches(steppedStream({ steps: [
    { timestamp: 1000, amount: "100" }, { timestamp: 2000, amount: "300" }, { timestamp: 3000, amount: "600" },
  ]}));
  expect(t.map(x => x.unlockTime)).toEqual([1000, 2000, 3000]);
  expect(t.reduce((s, x) => s + BigInt(x.amount), 0n)).toBe(1000n);
});

// Linear/continuous is DEFERRED in Phase 1 → returns [].
it("linear (continuous) returns [] in phase 1", () => {
  expect(computeUnlockTranches(linearStream())).toEqual([]);
});

// Dedup key is stable across regenerations (same input → same tranche key).
it("emits a stable dedup key per tranche", () => {
  const a = computeUnlockTranches(steppedStream());
  const b = computeUnlockTranches(steppedStream());
  expect(a.map(x => x.trancheKey)).toEqual(b.map(x => x.trancheKey));
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`npx vitest run src/lib/vesting/unlock-schedule.test.ts`) with "computeUnlockTranches is not a function".

- [ ] **Step 3: Implement `computeUnlockTranches`.** Signature + shape:

```ts
export interface UnlockTranche {
  unlockTime: number;      // unix seconds
  amount:     string;      // token base units (stringified bigint)
  /** Stable per-(stream, tranche) id for dedup: `${stream.id}:${index}:${unlockTime}`. */
  trancheKey: string;
}

/** Discrete schedules only (cliff/stepped/tranched). Continuous (linear/stream)
 *  return [] — deferred to Phase 2. Never emit a tranche with amount 0 or an
 *  unlockTime before startTime. Amounts MUST sum to the schedule's total (assert
 *  in a test) so unlock income can't over/under-count. */
export function computeUnlockTranches(stream: VestingStream): UnlockTranche[] { /* ... */ }
```
Rules (corrected per review):
- **Not discrete** (`!isDiscreteSchedule`) → `[]`.
- **Stepped** (`shape === "steps"`, has `unlockSteps`) → one tranche per step; `amount = step.amount` **as-is** (already incremental — do NOT difference them, review fix #5), `unlockTime = step.timestamp`. Drop any step with `amount === "0"`.
- **Cliff / instant lump** (discrete but no steps) → single tranche: `unlockTime = cliffTime ?? endTime` (review fix #6 — `cliffTime` is nullable, fall back to `endTime`), `amount = totalAmount`.
- `trancheKey = \`${stream.id}:${index}:${unlockTime}\``. Never emit `amount === "0"` or `unlockTime < startTime`.
- **Invariant (assert in a test):** `sum(tranche.amount) === totalAmount` for every discrete stream.

- [ ] **Step 4: Run tests — expect PASS.**

- [ ] **Step 5: Commit.**
```bash
git add src/lib/vesting/unlock-schedule.ts src/lib/vesting/unlock-schedule.test.ts
git commit -m "feat(tax): pure unlock-tranche generator for discrete schedules"
```

---

## Task 3: `vesting_unlock_events` table + migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0038_vesting_unlock_events.sql`

- [ ] **Step 1:** Add the Drizzle table mirroring `claimEvents`, minus tx/gas fields (unlocks have no tx), plus a manual-FMV flag:

```ts
export const vestingUnlockEvents = pgTable("vesting_unlock_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  streamId: text("stream_id").notNull(),
  protocol: text("protocol").notNull(),
  chainId: integer("chain_id").notNull(),
  recipient: text("recipient").notNull(),          // canonical lowercase (EVM) / preserved (Solana)
  tokenAddress: text("token_address").notNull(),
  tokenSymbol: text("token_symbol"),
  tokenDecimals: integer("token_decimals").notNull(),
  amount: text("amount").notNull(),                // base units, stringified bigint
  unlockTime: timestamp("unlock_time").notNull(),  // when the tranche vested
  trancheKey: text("tranche_key").notNull(),       // dedup: from computeUnlockTranches
  usdValueAtUnlock: numeric("usd_value_at_unlock"),// null until priced / if missing
  priceConfidence: text("price_confidence").notNull().default("missing"), // exact|nearest|missing|manual
  manualPrice: boolean("manual_price").default(false).notNull(),          // user-entered FMV
  computedAt: timestamp("computed_at").defaultNow().notNull(),
}, (t) => [
  index("unlock_events_user_time_idx").on(t.userId, t.unlockTime),
  index("unlock_events_stream_idx").on(t.streamId),
  index("unlock_events_needs_price_idx").on(t.priceConfidence),
  uniqueIndex("unlock_events_user_tranche_uq").on(t.userId, t.trancheKey),
]);
```
Note the extra `"manual"` value for `priceConfidence` (user-entered) so exports can label it.

- [ ] **Step 2:** Hand-write idempotent SQL (drizzle journal is archived — mirror `drizzle/0037_scan_events.sql`): `CREATE TABLE IF NOT EXISTS`, `DO $$ ... duplicate_object` for the FK, `CREATE INDEX IF NOT EXISTS` for all four indexes (incl. the unique one).

- [ ] **Step 3:** Apply with the documented applier (review fix #9): `node scripts/apply-migration.mjs drizzle/0038_vesting_unlock_events.sql`. Then verify `to_regclass('public.vesting_unlock_events')`, the columns, and the `unlock_events_user_tranche_uq` unique constraint exist.

- [ ] **Step 4:** `npx tsc --noEmit` — expect clean.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/db/schema.ts drizzle/0038_vesting_unlock_events.sql
git commit -m "feat(tax): vesting_unlock_events table (mirrors claim_events, +manual FMV)"
```

---

## Task 4: Generate + dedup unlock events for a wallet's streams

**Files:**
- Create: `src/lib/vesting/unlock-events.ts`
- Test: `src/lib/vesting/unlock-events.test.ts`

- [ ] **Step 1: Failing test** for `generateUnlockEventsForUser(userId, streams)`: given discrete streams it inserts one row per tranche with `priceConfidence="missing"`; running it twice inserts **no duplicates** (onConflictDoNothing on `(userId, trancheKey)`); linear streams produce nothing. Mock the db layer or use a test db per the repo's existing test convention (check `*.test.ts` neighbours — most are pure; if there's no db-test harness, keep this function thin and test the *pure* selection/mapping via a `toUnlockRows(userId, streams)` helper, and test the pure helper).

```ts
it("maps a wallet's discrete streams to unlock rows (one per tranche, unpriced)", () => {
  const rows = toUnlockRows("user-1", [steppedStream({ id: "hedgey-1-42", steps: 3 }), linearStream()]);
  expect(rows).toHaveLength(3);                 // linear contributes 0
  expect(rows.every(r => r.priceConfidence === "missing" && r.usdValueAtUnlock === null)).toBe(true);
  expect(new Set(rows.map(r => r.trancheKey)).size).toBe(3); // unique keys
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `toUnlockRows` (pure: streams → insert-shaped rows via `computeUnlockTranches`, carrying recipient/token/decimals/symbol/protocol/chainId; `normaliseAddress` for token/recipient — **never blanket `.toLowerCase()`**, Solana base58 is case-sensitive, review fix #15). **Convert `unlockTime` seconds → `new Date(unlockTime * 1000)`** for the `timestamp` column (review fix #7 — mirror `hedgey-claims.ts:249`). Then `generateUnlockEventsForUser` (chunked `insert(...).onConflictDoNothing({ target: [vestingUnlockEvents.userId, vestingUnlockEvents.trancheKey] })` — **column refs, not strings** (review fix #11), matching the `unlock_events_user_tranche_uq` index; best-effort, returns count). Reuse the wallet→streams source the vestings scan uses. **Coverage note (review fix #10): the repo has no db-test harness — this insert/dedup is exercised only in Final Verification, not a unit test. That's the accepted tradeoff; the pure `toUnlockRows` carries the logic.**

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit.** `feat(tax): generate + dedup unlock events from vesting schedules`

---

## Task 5: Price unlock events (enrich `missing` rows)

**Files:**
- Modify: `src/lib/vesting/unlock-events.ts`
- Modify: `src/lib/vesting/unlock-events.test.ts`

- [ ] **Step 1: Failing test** for `priceUnlockEvents(rows)` (or a pure `priceForTranche` wrapper): given a tranche, it calls `getHistoricalPrice(chainId, token, unlockTimeSec)` and sets `usdValueAtUnlock = price * (amount / 10^decimals)` with the returned `confidence`; when the price is `null` it leaves `usdValueAtUnlock = null` and `confidence = "missing"`. Mock `getHistoricalPrice`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Select rows where `priceConfidence = "missing" AND manual_price = false`, price via `getHistoricalPrice` (which is already Redis-cached — dedup by `(chainId, token, day)` so a whole stepped stream shares cache hits), and `UPDATE` each row's `usdValueAtUnlock` + `priceConfidence`. Do NOT overwrite `manual_price = true` rows. Whole-token conversion mirrors `token-rollups.ts` (`Number(amount)/10**min(decimals,30)`).

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit.** `feat(tax): price unlock events at unlock timestamp (confidence-flagged)`

---

## Task 6: Generation + pricing cron

**Files:**
- Create: `src/app/api/cron/generate-unlocks/route.ts`
- Modify: `vercel.json` (crons)

- [ ] **Step 1:** Read `src/app/api/cron/ingest-claims/route.ts` for the auth gate (`Authorization: Bearer ${CRON_SECRET}`), `maxDuration`, and the "iterate tracked wallets" loop.
- [ ] **Step 2:** Implement the route: for each user with tracked wallets, load their discrete streams (same source as the vestings scan), `generateUnlockEventsForUser`, then `priceUnlockEvents`. **Synchronous/awaited** (Vercel kills `after()` — this session's hard-won lesson); wrap each user in try/catch; `maxDuration = 300`. Gate on `CRON_SECRET`.
- [ ] **Step 3:** Add to `vercel.json` crons (e.g. daily `0 4 * * *`, staggered off other crons).
- [ ] **Step 4:** `npm run build` — expect exit 0 (confirms the route + `maxDuration`/config compile; static-gen guards `process.env.NEXT_PHASE === "phase-production-build"` if it touches the DB at module scope).
- [ ] **Step 5: Commit.** `feat(tax): cron to generate + price unlock events per wallet`

---

## Task 7: User `taxBasis` setting (data + API)

**Files:**
- Modify: `src/lib/db/schema.ts` (add `taxBasis: text("tax_basis").default("claim").notNull()` to `users`)
- Create: `drizzle/0039_users_tax_basis.sql` (idempotent `ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_basis text NOT NULL DEFAULT 'claim'`)
- Create: `src/lib/tax/tax-basis.ts` (`export type TaxBasis = "claim" | "unlock"; export const DEFAULT_TAX_BASIS = "claim"; export function isTaxBasis(x): x is TaxBasis`)
- Create: `src/app/api/tax/basis/route.ts` (GET returns `{ basis }`; PUT validates via `isTaxBasis` and updates `users.tax_basis`)
- Test: `src/lib/tax/tax-basis.test.ts`

- [ ] **Step 1: Failing test** for `isTaxBasis` (accepts "claim"/"unlock", rejects "", "income", null).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the type guard + default; add the column + migration (apply idempotently as in Task 3); build the dual-auth route (mirror `/api/streams/[streamId]/tags` `resolveUserId`).
- [ ] **Step 4: Run test — PASS;** `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.** `feat(tax): per-user taxBasis setting (claim default, unlock opt-in)`

---

## Task 8: Unified per-event API for the dashboard table

**Files:**
- Create: `src/app/api/tax/unlock-events/route.ts`
- Create: `src/app/api/tax/unlock-events/[id]/price/route.ts`
- Modify: `src/lib/vesting/unlock-events.ts` (add `getTaxEventsForUser`, `setManualUnlockPrice`)
- Test: `src/lib/vesting/unlock-events.test.ts`

- [ ] **Step 1: Failing test** for `mergeUnlockAndClaim(unlockRows, claimRows)` — a **pure** function that produces one dashboard row per tranche with both sides: `{ token, symbol, chainId, amount, unlockTime, usdAtUnlock, unlockConfidence, claimedAt|null, usdAtClaim|null, claimConfidence|null, needsInput: boolean }`. `needsInput` is true when `unlockConfidence === "missing"`. Match claims to unlocks by `(streamId, token)` and nearest time (claim on/after the tranche). Test: an unlock with no matching claim → claim side null; a `missing`-priced unlock → `needsInput: true`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `mergeUnlockAndClaim` (pure) + `getTaxEventsForUser(userId)` (loads both tables, calls the pure merge) + `setManualUnlockPrice(userId, eventId, usd)` (guards: row belongs to user AND `priceConfidence === "missing"`; sets `usdValueAtUnlock`, `priceConfidence="manual"`, `manual_price=true`). Build the two routes (dual-auth). The PUT price route validates a positive finite number.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `feat(tax): unified unlock+claim tax-event API + manual FMV override`

---

## Task 9: Tax dashboard table (both bases side by side) + toggle + disclaimer

**Files:**
- Modify: the tax dashboard page (locate: `grep -rln "income-statement\|usdValueAtClaim\|Tax" src/app/dashboard`)

- [ ] **Step 1:** Add a **basis toggle** (Claim ⇄ Unlock) bound to `/api/tax/basis`; default reflects the stored `taxBasis`. The toggle changes which column set is emphasised + which the export uses — it does NOT hide the other (both always visible for transparency).
- [ ] **Step 2:** Render the table with columns: **Token · Chain · Amount · Unlocked on · Price @ unlock · Value @ unlock · Claimed on · Price @ claim · Value @ claim · Confidence**. Rows come from `/api/tax/unlock-events`.
- [ ] **Step 3:** For `needsInput` rows, show a "needs your input" pill + an inline **Enter FMV** control that PUTs to `/api/tax/unlock-events/[id]/price`, then optimistically fills the value + flips the pill to a "manual" tag.
- [ ] **Step 4:** Add a persistent **disclaimer** near the toggle: "Vestream is not a tax advisor. Vesting is taxed at unlock in some jurisdictions and at claim in others — pick the basis your accountant/region requires. Figures are estimates; verify before filing." (link to `/faq`).
- [ ] **Step 5:** Manual verification with `/run` or the preview server: log in, load the tax page, confirm the table renders both bases, a `missing` row shows the FMV control, the toggle persists across reload. (Follow `superpowers:verification-before-completion` — run it, observe, don't assert blind.)
- [ ] **Step 6: Commit.** `feat(tax): dashboard table showing unlock + claim bases side by side`

---

## Task 10: CSV / report export on the chosen basis

**Files:**
- Modify: `src/lib/vesting/csv-exports.ts`
- Modify: `src/app/api/claims/income-statement/route.ts` (+ mobile `tax-reports` if it shares the exporter)
- Test: `src/lib/vesting/csv-exports.test.ts` (create if absent)

**Review fix #3: `csv-exports.ts` builders are hardwired to `ClaimRow` (`typeof claimEvents.$inferSelect`) and read claim-only fields (`r.claimedAt`, `r.usdValueAtClaim`, `r.txHash`, `r.gasNative`). Threading a `basis` param is NOT enough — it needs a common row type first.**

- [ ] **Step 1: Define `TaxExportRow`** — a normalized shape both sides map into: `{ date: Date; usdValue: string|null; txHash: string|null; confidence: string; protocol; chainId; tokenSymbol; tokenAddress; amount; tokenDecimals }`. Write `claimRowToExportRow(ClaimRow)` and `unlockRowToExportRow(UnlockRow)` adapters (unlock: `date = unlockTime`, `usdValue = usdValueAtUnlock`, `txHash = null`, `confidence = priceConfidence`).
- [ ] **Step 2: Failing test:** the seven `build*` functions take `TaxExportRow[]`; feeding claim-adapted rows reproduces **byte-identical** current output (regression guard — the claim path stays **UTC**, review fix #1: keep `toISOString()`, do NOT switch to local time); feeding unlock-adapted rows emits unlock dates/values; a `missing` row exports a blank value + confidence flag, never a silent 0.
- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement** — refactor the seven builders to consume `TaxExportRow[]`; the route selects claim rows OR unlock rows by `basis` and adapts them. **Cost-basis note (Phase 1):** income is emitted on exactly ONE basis per report (never both) so it can't double-count; the unlock USD value is persisted for Phase 3 capital-gains chaining but not turned into gains yet. **Bucketing stays UTC** (matches production; local-time is a deferred cross-basis task).
- [ ] **Step 5: Run — PASS** (claim-regression byte-identical + unlock tests green).
- [ ] **Step 5:** `npm run lint && npx tsc --noEmit && npm run build` — all clean (lint gate is a real CI blocker — do not skip).
- [ ] **Step 6: Commit.** `feat(tax): export tax report on the user's chosen basis (claim|unlock)`

---

## Final verification (before handoff)

- [ ] `npm run lint` exit 0, `npx tsc --noEmit` clean, `npx vitest run` all green, `npm run build` exit 0.
- [ ] Trigger the `generate-unlocks` cron locally (curl with `Authorization: Bearer $CRON_SECRET`) against a wallet known to hold a discrete-tranche vesting (e.g. a Hedgey or Team Finance wallet from `vesting_streams_cache`); confirm rows land in `vesting_unlock_events`, priced where CoinGecko has data, `missing` where not.
- [ ] Confirm claim-basis output is **unchanged** vs current production (the regression test + a manual diff of one user's export).
- [ ] Dispatch `superpowers:requesting-code-review` on the full diff before merge — flag the tax-correctness surfaces (tranche-sum invariant, dedup, no double-count, local-time bucketing) for focused review.

## Risks / watch-items

- **Tranche math correctness** = the whole feature. The "amounts sum to total" invariant (Task 2) is the guard; keep it as an assertion-backed test.
- **Pre-liquid tokens are common** (unlock before listing → `missing`). The manual-FMV path is a first-class flow, not an edge case — make it obvious in the UI, not buried.
- **Double-counting:** never emit income on both bases in one export. One basis per report.
- **Volume/rate limits:** a stepped stream can be dozens of tranches × many wallets. `getHistoricalPrice` is cached per `(chain, token, day)`; ensure the pricing pass exploits that (same token+day across a stream's tranches = one CoinGecko call).
- **Cancellations:** a stream cancelled mid-schedule has computed future tranches that never vest. Phase 1 accepts this (we regenerate from the current cache each run; the unique key prevents dupes, but stale future tranches may persist). Note as a Phase 2 reconciliation item.
