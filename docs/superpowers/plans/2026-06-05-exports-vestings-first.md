# Exports "Vestings-First" Tax Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, in-session). Steps use `- [ ]`. Each PHASE is independently shippable — build, verify (`npm run build` to EXIT=0, then deploy + check), commit, push.

**Goal:** Rebuild `/dashboard/exports` into a vestings-first tax tool: the user sees their vestings, drills into one token to view its **income** (claims, priced at receipt) and **gains** (sales), then exports to a tax format — per token or for everything.

**Architecture:** Reuse what already exists — `getTokenStreams()` for the vestings list, `claim_events` (now populated via the ingest-claims cron) for income, the existing **web** sales-ledger API `/api/dashboard/pnl/[token]/sales` for gains, and `/api/claims/export` for CSVs. New work is mostly UI + adding a `tokenAddress` scope param to the claims history/export/refresh endpoints.

**Tech Stack:** Next.js 16.3 canary (RSC + client islands), Tailwind, Drizzle/Postgres.

**Spec:** `docs/superpowers/specs/2026-06-04-exports-vestings-first-redesign-design.md`

---

## What already exists (reuse — do NOT rebuild)
- `claim_events` table + `GET /api/claims/history?since&until&protocol` → income data (now populated).
- `POST /api/claims/history?action=refresh` → ingests claims (currently all-protocol, all-chain).
- `GET /api/claims/export?format&since&until` → CSV (Koinly / CoinTracker / TurboTax / per-claim / per-payer).
- `/api/dashboard/pnl/[token]/sales` (GET/POST) + `…/sales/[saleId]` (DELETE) — **web** sales ledger (`stream_sales`).
- `getTokenStreams(chainId, address)` (token-aggregates.ts) — raw streams for a token.
- `groupIntoRounds()` — available if we want round grouping later (not needed for v1).

## File map
| File | Responsibility | Action |
|---|---|---|
| `src/app/api/claims/history/route.ts` | add `tokenAddress` filter (GET) + scoped refresh (POST) | Modify |
| `src/app/api/claims/export/route.ts` | add `tokenAddress` scope | Modify |
| `src/lib/vesting/ingestors/index.ts` | add `ingestClaimsForToken()` (scoped) | Modify |
| `src/app/dashboard/exports/page.tsx` | vestings-first rebuild | Modify (large) |
| `src/app/dashboard/exports/VestingsList.tsx` | client: list + expand income/gains | Create |
| `src/lib/vesting/user-vestings.ts` | `getUserVestingTokens(userId)` — tokens across the user's wallets w/ claim totals | Create + test |

---

## PHASE 0 — Baseline check (no code)
- [ ] Confirm the **current** exports page now shows data (claim_events populated). Open `/dashboard/exports` as Pro; the tax-year dropdown + a refresh should now list Sablier claims. This tells us how much the #2 fix already delivered before we redesign. (If it shows claims + exports a CSV, the income half is already functional — the rebuild is UX.)

---

## PHASE 1 — Vestings list (income-first)

### Task 1.1: `getUserVestingTokens()` (pure-ish data fn)
**Files:** Create `src/lib/vesting/user-vestings.ts` + `…user-vestings.test.ts`.
- Returns, for a user, one entry per (chainId, tokenAddress) they have a tracked vesting in: `{ chainId, tokenAddress, tokenSymbol, protocols[], totalClaimedUsd, claimCount, lastClaimAt }`.
- Source: join the user's tracked `wallets` → `vesting_streams_cache` (streams) for the token list; LEFT JOIN aggregated `claim_events` for the claimed totals. Build-phase guard (return []).
- [ ] TDD the aggregation/grouping logic (mock rows → grouped entries). Build. Commit.

### Task 1.2: Vestings-first page + list
**Files:** Modify `src/app/dashboard/exports/page.tsx`; Create `…/VestingsList.tsx`.
- Page (server): `getUserVestingTokens(userId)` → render `<VestingsList vestings=… />`. Keep the coverage banner + tax-year filter + a "Export everything" button.
- `VestingsList` (client): a row per token (symbol, chain, protocol, claimed-to-date, last claim). Click a row → expand a **claim-history table** for that token (date · amount · USD-at-receipt) from `GET /api/claims/history?tokenAddress=…` (Phase 2 adds the param; until then filter client-side) + a per-token **Export** menu.
- Reuse the existing scroll-container pattern (`overflow-y-auto`) — the exports page already got that fix.
- [ ] Build + deploy; verify the list shows Howard's FeeC with 3 claims. Commit.

---

## PHASE 2 — Scoped per-token report

### Task 2.1: `tokenAddress` scope on history + export
**Files:** `src/app/api/claims/history/route.ts`, `src/app/api/claims/export/route.ts`.
- GET history: accept `tokenAddress` → add `eq(lower(claimEvents.tokenAddress), …)` to the WHERE.
- export: accept `tokenAddress` → same filter so a per-token CSV is scoped.
- [ ] Build + deploy; `GET /api/claims/history?tokenAddress=…` returns only that token. Commit.

### Task 2.2: Scoped ingest (`ingestClaimsForToken`)
**Files:** `src/lib/vesting/ingestors/index.ts` (+ the relevant ingestor(s) accept a token filter).
- Add `ingestClaimsForToken(userId, wallets, { chainId, tokenAddress, protocol? })` → dispatch to the matching shipped ingestor(s), token-filtered. For protocols whose ingestor can't cheaply filter, ingest the protocol then drop non-matching rows before insert.
- `POST /api/claims/history?action=refresh&tokenAddress=&chainId=&protocol=` → call the scoped path when params present, else the existing global path.
- Wire each vesting row's **"Run report"** button to the scoped refresh, then re-fetch that token's history.
- [ ] Build + deploy; "Run report" on a token ingests just that token. Commit.

---

## PHASE 3 — Gains (sales ledger)
**Files:** `…/VestingsList.tsx` (expand section).
- In a token's expanded view, add a **Sales** sub-section: `GET /api/dashboard/pnl/[token]/sales` → list rows (date · amount · price · realized gain). Add-row form → `POST`; delete → `DELETE …/sales/[saleId]`. Cost basis = the token's entry price (`stream_pnl`) or claim FMV; realized gain = (salePrice − costBasis) × amount.
- Per-token export now includes both income (claims) and the sales ledger where the format supports disposals (Koinly/CoinTracker).
- [ ] Build + deploy; add/remove a sale, see it persist + realized gain compute. Commit.

## PHASE 4 — Honest coverage copy
**Files:** `src/app/dashboard/exports/page.tsx`.
- Replace the stale "Live: Sablier · …coming soon" banner with accurate copy: Sablier verified; others "indexing" with the caveat labels (Superfluid discrete-only, Solana approximate). Tie to the ROADMAP "verify all ingestors" item.
- [ ] Build + deploy + commit.

---

## Verification (per phase)
- `npm run build` to **EXIT=0** (type-check is a separate phase — never trust "Compiled successfully" alone).
- Pro-gated → verify on the Vercel deploy. Use Howard's account (FeeC, 3 Sablier claims) as the smoke test.

## Out of scope (v2 — roadmap)
- Auto on-chain sale detection (suggested disposals) — gains stays manual-ledger for v1.
- Re-introducing the income statement page.
- Solana/Superfluid claim verification (separate roadmap item).
