# Tax Exports — "Vestings-First" Redesign

**Date:** 2026-06-04
**Status:** Awaiting user review of spec
**Author:** Claude (Opus 4.8) + Howard

## Goal

Turn `/dashboard/exports` from a format-first page into a **vestings-first
tax tool**: the user picks one of their vestings → the tool shows, for that
token, the **full tax picture — both** (a) **income**: every claim/unlock
*received*, valued at FMV on receipt, and (b) **gains**: every *sale/disposal*,
valued at the price on the sale date — then exports to a pre-made tax format
(per token or for everything).

**Scope = Both (income + gains)** per user decision (2026-06-04). Income is
auto-indexed (claim ingestors, all protocols). Gains need a sales-data source
(see the Gains section — the key open decision).

## Why

Today the page leads with format cards and a single global "Refresh claims"
that ingests every protocol for every wallet. Users think in terms of *their
vestings* ("what did I claim from my FLUX grant?"), not formats. Scoping the
scan to one token is faster, cheaper (one protocol/chain, not all), and reads
as a purpose-built tax tool.

## What already exists (reuse)

**Income (claims) side:**
- `ingestAllClaimsForUser(userId, wallets, chainIds)` → fans out to per-protocol
  ingestors in `src/lib/vesting/ingestors/*-claims.ts`. **CORRECTION:** the
  ingestor code exists for ALL ten protocols (`SHIPPED_INGESTORS` lists them
  all) — the "only Sablier · others coming soon" banner on the page is **stale
  copy**, not reality. Remaining work is verification + honest caveat labels
  (Superfluid = discrete events only; Streamflow/Jupiter = Solana snapshot
  approximations, `SOLANA_ENABLED`-gated; Team Finance = paused).
- `GET /api/claims/history?since&until&protocol` → `{ events, summary{byYear} }`.
- `GET /api/claims/export?format=…&year=…` → CSV.
- Export formats (Koinly / CoinTracker / TurboTax / per-claim FMV / per-payer).

**Gains (sales) side — already partly built:**
- `stream_sales` table + `/api/mobile/pnl/[token]/sales` (POST add, DELETE one)
  — a **manual sales ledger**: `{ saleDate, amount, price }` per (user, token).
  Powers mobile P&L. This is the reliable source of disposal data today.
- There is **no** automatic on-chain sale detection yet.

- The user's tracked streams (token + protocol + chain + wallet) — same data the
  dashboard renders; read from the cache (`getTokenStreams` / wallets→streams).

## Decisions locked with user

- **Approach:** spec first, then build (this doc).
- **Scope:** vestings list → pick a vesting → BOTH income (claims) + gains
  (sales) for that token → export.
- **Coverage:** all protocols' claim ingestors already exist; verify + drop the
  "only Sablier" banner (caveats on Superfluid / Solana / Team Finance).

## Gains (sales) — the key open decision

Auto-detecting disposals purely on-chain is genuinely hard and error-prone for
tax (a transfer out could be a CEX deposit/sale, a move to your own wallet, an
LP deposit, a gift…). Tax tools solve this with exchange imports + heuristics +
user reconciliation. Three ways to source sales, in increasing cost/risk:

1. **Manual sales ledger (recommended v1).** Reuse `stream_sales` — the user
   logs each sale (date, amount, price; or we auto-fill price-at-date). Reliable,
   honest, already built on mobile; we just surface + edit it on web per vesting.
2. **On-chain "candidate disposals" (v2).** Index ERC-20 `Transfer` events *out*
   of the user's wallet for that token and present them as **suggested** sales
   for the user to confirm/price — never auto-booked. Approximate; flags only.
3. **Full auto sale detection.** Not recommended — accuracy/liability risk.

**Default for the plan: (1) now, design so (2) can layer on later.** Confirm at
review.

## Open decisions (defaults chosen; confirm at review)

1. **Vestings-list granularity** = **per token** (default). Each row = a token
   the user has a vesting in (symbol, chain, protocol(s), total claimed to date,
   last claim). Alternative: per individual stream (noisier) or per vesting
   round (drill-down style). *Per-token reads cleanest for tax.*
2. **Coverage** = only Sablier scans for now (same honest banner). Non-Sablier
   tokens show a "claims coming soon for {protocol}" state on their row instead
   of a Run-report button.
3. **Global export stays** = keep an "export everything" path alongside the
   per-token exports (some users want one combined file).

## Architecture

```
/dashboard/exports  (client page, Pro-gated)
  1. Vestings list  ← read user's streams (tracked wallets), group by token
       each row: token · chain · protocol · claimed-to-date · [Run report]
  2. Run report (per token) → POST /api/claims/history?action=refresh
       &chainId=&tokenAddress=&protocol=         (NEW scoped params)
         → ingestClaimsForToken(userId, wallets, {chainId, tokenAddress, protocol})  (NEW)
            → calls only the matching protocol's ingestor, token-filtered
  3. Claim history (per token) → GET /api/claims/history?tokenAddress=&protocol=
       table: date · amount · price-at-receipt · USD value
  4. Export → GET /api/claims/export?format=…&tokenAddress=&year=…  (NEW token scope)
       existing format cards, scoped to the selected token (+ "export all")
```

### Backend changes
- `src/lib/vesting/claims-ingest.ts` (or wherever `ingestAllClaimsForUser`
  lives): add `ingestClaimsForToken(userId, wallets, { chainId, tokenAddress, protocol })`
  that dispatches to the single matching shipped ingestor with a token filter.
  Each shipped ingestor (`sablier-claims.ts` first) accepts an optional
  `tokenAddress`/`chainId` filter; unshipped → `notImplemented`.
- `POST /api/claims/history`: accept `tokenAddress`, `chainId`, `protocol`
  query params → call the scoped ingest when present, else current global path.
- `GET /api/claims/export`: accept `tokenAddress` (+ existing `protocol`/`year`)
  to scope the CSV.

### Frontend changes (`src/app/dashboard/exports/page.tsx`)
- Replace the format-first layout with: vestings list → (expand) per-token claim
  history + per-token export buttons. Keep the tax-year filter + coverage banner
  + the "export all" affordance + the existing format definitions/cards (reused
  per-token).
- Reuse the page's existing scroll fix + format metadata.

## Error handling
- Token with no shipped ingestor → row shows "coming soon for {protocol}",
  no Run button.
- Scan failure / rate-limit (existing 2 per 5 min) → inline message on the row.
- No claims found after scan → "No claims indexed yet for {token}."
- DB helpers short-circuit during `next build` (CLAUDE.md landmine).

## Testing
- Unit-test the token-scoped dispatch (`ingestClaimsForToken` picks the right
  ingestor + passes the token filter; unshipped → notImplemented).
- Build pass; manual review on deploy (Pro-gated).

## Out of scope (v2)
- Ingestors for non-Sablier protocols (tracked separately; this redesign just
  exposes scoped scanning for whatever is shipped).
- Re-introducing the income statement (separate ROADMAP item).
