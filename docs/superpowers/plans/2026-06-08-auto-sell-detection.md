# Auto Sell-Detection — Implementation Plan

> Execute inline (superpowers:executing-plans). Each phase is independently
> shippable: build to EXIT=0, lint clean, commit, push.

**Spec:** `docs/superpowers/specs/2026-06-08-auto-sell-detection-design.md`
**Goal:** User picks a vested token → clicks **Scan** → sees every time they
sold or transferred that (claimed) token, with timestamp + value-at-time →
confirms/dismisses → confirmed disposals feed the gains ledger.
**v1 scope:** ETH + Base, Alchemy `alchemy_getAssetTransfers`, on-demand scan.

---

## PHASE 1 — Detection core (pure + fetch)
**Files:** Create `src/lib/vesting/sell-detect.ts` + `…sell-detect.test.ts`.
- `transfersToCandidates(transfers, ownWallets, chainId, tokenAddress)` — PURE.
  Maps Alchemy transfer rows → candidate objects; flags `internalTransfer`
  when `to` ∈ the user's own tracked wallets; dedup id from Alchemy `uniqueId`.
  **TDD this.**
- `fetchOutboundTransfers(chainId, wallet, tokenAddress)` — calls Alchemy
  (`category:["erc20"]`, `fromAddress`, `contractAddresses:[token]`,
  `withMetadata:true`, `order:"asc"`, paginated via `pageKey`). ETH/Base only;
  returns `[]` for unsupported chains + during `next build`.
- [ ] Tests pass, build, commit.

## PHASE 2 — Storage
**Files:** `src/lib/db/schema.ts` (+ generated migration).
- `disposal_candidates` table per the spec (unique on `userId,chainId,txHash,uniqueId`).
- Add `source text default 'manual'` to `stream_sales`.
- Build-phase guards on any new query helpers.
- [ ] `npm run db:generate`, review migration, apply to prod, commit.

## PHASE 3 — Endpoints
**Files:** `src/app/api/dashboard/pnl/[token]/detect-sales/route.ts` (+ confirm/dismiss).
- `POST detect-sales?chainId=` → for each tracked wallet on that chain:
  `fetchOutboundTransfers` → `transfersToCandidates` → price each via
  `getHistoricalPrice(token, chainId, ts)` → upsert candidates → return pending.
  Pro-gated, rate-limited.
- `POST candidates/[id]/confirm` → insert `stream_sales` (source=detected) + mark
  confirmed. `POST candidates/[id]/dismiss` → mark dismissed.
- [ ] Build + deploy; scan a known ETH/Base wallet → candidates returned. Commit.

## PHASE 4 — UI
**Files:** `src/app/dashboard/exports/VestingsList.tsx` (extend `SalesSection`).
- "Scan for sales" button (per supported chain; disabled tooltip otherwise).
- "Detected" candidate list above the manual ledger: date · amount · est. price
  · USD · tx link, with Confirm / Dismiss; internal-transfer rows de-emphasized.
- Confirmed candidates appear in the existing sales table.
- [ ] Build + deploy + commit.

## Out of scope (v2): other chains, swap-proceeds parsing, background auto-scan.
