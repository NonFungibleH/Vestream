# Auto Sell-Detection — Design

**Date:** 2026-06-08
**Status:** Draft for review
**Related:** vestings-first Tax tool (#3), `stream_sales` ledger, `getHistoricalPrice`

## Goal

Let a user pick a vested token and have Vestream **automatically find the times
they disposed of (sold/sent) that token**, with timestamp + value at the time —
instead of entering every sale by hand. Detected disposals are **candidates the
user confirms**; confirmed ones flow into the existing gains/sales ledger so
realized-gain math and CSV exports work unchanged.

This is the "gains" half of the tax tool. It is **protocol-independent** — once
tokens are claimed into a wallet, a disposal is a wallet-level ERC-20 movement,
regardless of which vesting protocol they came from. So this is one feature, not
one per protocol.

## Decisions (locked)

- **What counts as a sale:** *all outbound disposals* — every outbound movement
  (DEX swap or plain transfer) of the token from the user's tracked wallets is a
  **candidate**. The user confirms / edits / dismisses. Max coverage, user keeps
  control. We do NOT try to auto-classify swap-vs-transfer in v1.
- **Data source / chains:** **Alchemy `alchemy_getAssetTransfers`**, **ETH + Base
  only** for v1 (we already have `ALCHEMY_RPC_URL_ETH` / `ALCHEMY_RPC_URL_BASE`).
  Other chains (BSC/Polygon/Arbitrum/Solana) come in v2 via a multi-chain
  transfers provider — out of scope here.
- **Trigger:** on-demand ("Scan for sales" button per token in the gains
  section). No background cron in v1.

## Flow

1. User expands a token in the Tax page gains section → taps **Scan for sales**.
2. Server, for each of the user's tracked wallets **on a supported chain**, calls
   `alchemy_getAssetTransfers`:
   - `category: ["erc20"]`, `fromAddress: <wallet>`, `contractAddresses: [token]`,
     `withMetadata: true` (gives block timestamp), `order: "asc"`, paginated.
3. For each outbound transfer → resolve **value at the time** via the existing
   `getHistoricalPrice(tokenAddress, chainId, timestampSec)` (already used by the
   claim ingestors). USD = amount × historical price.
4. **Noise reduction:** if a transfer's `to` address is **another of the user's
   own tracked wallets**, pre-flag it `internalTransfer: true` (defaults to
   *not* a sale, user can still include it). Everything else defaults to a
   pending candidate.
5. Upsert candidates into `disposal_candidates` (dedup on tx hash + log index).
6. UI lists pending candidates (date · amount · est. price · USD · tx link) with
   **Confirm** / **Dismiss** per row, plus inline edit of amount/price.
7. **Confirm** → insert a `stream_sales` row (`source: "detected"`) and mark the
   candidate `confirmed`. **Dismiss** → mark `dismissed` so re-scans skip it.

`stream_sales` stays the single source of truth for realized-gain math + exports;
`disposal_candidates` is just the detection inbox.

## Data model

New table `disposal_candidates`:

| col | type | notes |
|---|---|---|
| id | uuid pk | |
| userId | text | fk user |
| chainId | int | |
| tokenAddress | text | lowercased |
| txHash | text | |
| logIndex | int | dedup key = (userId, txHash, logIndex) |
| toAddress | text | for internal-transfer flagging |
| amount | numeric/text | token base units |
| occurredAt | timestamptz | block time |
| priceUsdAtTime | numeric null | from getHistoricalPrice (null if none) |
| internalTransfer | bool | `to` ∈ user's tracked wallets |
| status | text | `pending` \| `confirmed` \| `dismissed` |
| createdAt | timestamptz | |

Unique index on `(userId, txHash, logIndex)`. Extend `stream_sales` with a
nullable `source text default 'manual'` so confirmed-detected rows are
distinguishable (and re-scans can map a candidate→sale).

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/dashboard/pnl/[token]/detect-sales?chainId=` | Run Alchemy scan, upsert candidates, return pending list. Pro-gated, rate-limited (Alchemy calls are metered). |
| GET | `/api/dashboard/pnl/[token]/candidates` | List pending candidates for the token (or fold into existing pnl GET). |
| POST | `/api/dashboard/pnl/[token]/candidates/[id]/confirm` | Candidate → `stream_sales` (source=detected) + mark confirmed. |
| POST | `/api/dashboard/pnl/[token]/candidates/[id]/dismiss` | Mark dismissed. |

(Exact route shape can be consolidated; this is the responsibility split.)

## UI

Extend the Phase 3 `SalesSection` (`/dashboard/exports/VestingsList.tsx`):
- A **Scan for sales** button (shows per supported chain; disabled w/ tooltip on
  unsupported chains).
- A **Detected** sub-list above the manual ledger: pending candidates with
  Confirm/Dismiss, internal-transfer rows visually de-emphasized + collapsed by
  default.
- Confirmed candidates appear in the existing sales table like manual rows.

## Caveats / honest limits (surface in UI)

- v1 = ETH + Base only; other chains say "scan not yet available on <chain>".
- "All outbound" includes non-sales (gifts, moving to cold storage, own wallets
  not yet tracked) — hence user confirmation. Price-at-time is an estimate from
  our historical price cache; user can edit.
- A swap's *proceeds* (what they received) aren't read in v1 — we price the token
  amount disposed at market at that timestamp. Good enough for a disposal record;
  exact swap-proceeds parsing is a v2 refinement.

## Out of scope (v2)

- Other chains (BSC/Polygon/Arbitrum/Solana) via multi-chain provider.
- Reading actual swap proceeds from DEX logs (vs market-price estimate).
- Background auto-scan / notifications on new disposals.
- CEX-deposit-address classification.

## Verification

- Unit-test the pure parts: transfer → candidate mapping, internal-transfer
  flagging, dedup key, candidate→sale conversion.
- Manual: a known ETH/Base wallet that has sent a tracked token → scan → see
  candidates with sane dates/prices → confirm → appears in gains + export.
