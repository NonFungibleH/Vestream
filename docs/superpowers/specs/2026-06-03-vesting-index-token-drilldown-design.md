# Vesting Index Token Drill-Down — Design

**Date:** 2026-06-03
**Status:** Awaiting user review of spec
**Author:** Claude (Opus 4.8) + Howard

## Goal

Turn the Vesting Index (`/dashboard/explorer`) into a tool people *drill into*:
navigate to a token → see all of its vesting plotted on one overview graph and
grouped into **rounds** → click a round → see every wallet receiving tokens with
amount, cadence, and unlock dates. Bundled with this: make the Wallet Scanner's
result tokens clickable into that view, fold the standalone Watchlist into a
"Save" action in the Index, and remove the paused Team Finance protocol from
every surface.

## Scope (four workstreams, build in this order)

1. **Team Finance removal (everywhere)** — cleanup, no design risk.
2. **A — Token drill-down view** in the explorer (the headline; defines the new route).
3. **C — Wallet scanner amends** — clickable result tokens → A's route.
4. **B — Watchlist → "Save"** — save action in the Index; retire the standalone page.

---

## Decisions locked with user

| Question | Decision |
|---|---|
| How to group a token's streams into "schedules" | **By round (vesting terms)** |
| Where the drill-down lives | **New view inside the explorer** (not the public `/token` page) |
| Watchlist future | **Merge into the Index as a "Save" action**; retire standalone page |
| Team Finance removal | **Everywhere**, including marketing (InteractiveDemo + tickers) |

### Defaults chosen for the three open points (user may veto at spec review)

1. **Round signature** = `protocol + shape + cliffOffset(day-bucketed) + duration(day-bucketed)`.
   **No start-date bucketing in v1** — simpler, and identical-terms batches months
   apart merging into one round is an acceptable v1 tradeoff. (Can add a
   `startMonth` term later if it proves too coarse.)
2. **Overview graph** = **cumulative unlock curve over time, stacked by round**
   (reuses the unlock-timeline chart pattern already in the dashboard).
3. **Symbol search collision** = when a searched symbol resolves to multiple
   tokens, show a small **token picker**; address/click entries are unambiguous
   and skip the picker.

---

## A. Token drill-down view

### Route & rendering
- New nested **server component** page: `/dashboard/explorer/token/[chainId]/[address]/page.tsx`.
- Inherits the `/dashboard` layout → auth gate (Pro), dashboard chrome, dark mode.
- Data: `explorerFetch(address, chainId)` → `VestingStream[]` (already powers the
  public `/token` page). Wrap the call in `unstable_cache` (5-min) like `/token` does.
  Server-rendered so data arrives in the HTML (directly addresses the "slow
  front-end load" concern).
- Free/Pro caps consistent with the explorer (`FREE_TIER_ROW_CAP`).

### Round grouping (new pure function)
- `src/lib/vesting/rounds.ts` → `groupIntoRounds(streams: VestingStream[]): Round[]`.
- Signature key: `${protocol}|${shape}|${cliffOffsetDays}|${durationDays}` where
  `cliffOffsetDays = round((cliffTime ?? startTime) - startTime / 86400)` and
  `durationDays = round((endTime - startTime) / 86400)`.
- `Round` shape:
  ```ts
  interface Round {
    key: string;
    protocol: string;
    shape: "linear" | "steps";
    cliffOffsetDays: number;
    durationDays: number;
    label: string;          // e.g. "24-mo linear · 6-mo cliff"
    recipientCount: number;
    totalLocked: string;    // stringified bigint (sum)
    totalAmount: string;
    nextUnlockTime: number | null;
    streams: VestingStream[];
  }
  ```
- Rounds sorted by `totalLocked` desc. Label derived from terms (no on-chain
  "Seed/Team" name exists). Pure + **unit-tested** (TDD): empty input, single
  round, multiple rounds, cliff vs no-cliff, steps vs linear.

### Layout (three stacked sections)
1. **Header** — token symbol + name, copyable contract address, chain badge,
   and totals: total locked, # recipients, # rounds, next unlock. A **Save**
   star button (workstream B). A back link to the Index.
2. **Overview graph** — one chart: cumulative unlock curve over time, stacked by
   round (reuse `UnlockTimeline`/the token-page chart pattern; pass round-grouped
   series).
3. **Rounds → wallets** — list of round cards (`label · N wallets · total · next
   unlock`). Clicking a round expands its **wallets table**:
   recipient (truncated, links to that wallet's view in the Index),
   amount, cadence (e.g. "linear over 24mo" / "monthly steps"),
   start / cliff / end dates, claimed vs claimable.

### Entry points
- **Click** any token in calendar/stream results and scanner results → this route.
- **Search a token address** → straight here.
- **Search a symbol** → if it resolves to exactly one token, go here; otherwise
  show a token picker. (`detect-query.ts` + `destinationForQuery` extended for the
  symbol→token resolution; needs a "tokens matching symbol" lookup in the data layer.)

---

## C. Wallet scanner amends (`/dashboard/discover`)
- Remove the Team Finance protocol filter chip (covered by workstream 1).
- Make each result token clickable → `/dashboard/explorer/token/[chainId]/[address]`.
  (Result rows already carry `chainId` + token address; wrap the token cell in a `Link`.)

---

## B. Watchlist → "Save" in the Index
- Keep the **existing `/api/watchlist` endpoint + `watchlist` table** — only the
  surfacing changes.
- Add a **star / "Save token"** button on the token-detail header (and optionally
  token rows). POST/DELETE to `/api/watchlist`.
- Surface saved tokens as a **"Saved" lens/section** in the Index (reuse watchlist
  data; show next-unlock + quick link into the token view).
- **Retire** the standalone `/dashboard/watchlist` page and its sidebar nav item;
  redirect `/dashboard/watchlist` → `/dashboard/explorer` for any bookmarks.
- Per-token unlock-alert toggles stay attached to the saved entry (already in the
  table; surfaced on the saved item).

---

## 1. Team Finance removal (everywhere)
- **Dashboard:** remove the `team-finance` protocol filter chip in
  `discover/page.tsx`; remove `team-finance` from display-name/colour/link maps in
  `dashboard/page.tsx`, `income-statement/*`, `TokenMetaPanel`, explorer
  `detect-query.ts` aliases.
- **Marketing/components:** remove Team Finance from `InteractiveDemo.tsx`
  (protocol list + the "hit" example), `LiveActivityTicker.tsx`,
  `UpcomingUnlockTicker.tsx` protocol maps, and any `CancellableWatchdog` copy.
- **Leave untouched:** the adapter, `explorer.ts` `explorerFetchTeamFinance`,
  `protocol-constants.ts` `disabled:true` flag, and cached rows — this is a
  *pause*, not a removal (per CLAUDE.md "Pausing an integration"). Only the
  user-visible mentions go.

---

## Architecture / data flow

```
/dashboard/explorer/token/[chainId]/[address]   (server component, Pro-gated)
  └─ unstable_cache(5m) → explorerFetch(address, chainId) → VestingStream[]
       └─ groupIntoRounds(streams) → Round[]            (pure, tested)
            └─ render: Header · OverviewGraph(rounds) · RoundsList → WalletsTable
  └─ Save button → POST/DELETE /api/watchlist

Entry: calendar/stream/scanner token cells → <Link href=".../token/{chain}/{addr}">
       search(address) → destinationForQuery → that route
       search(symbol)  → resolve → one token (route) | many (picker)
```

## Error handling
- `explorerFetch` returns `[]` on upstream failure → render an empty state
  ("No active vesting streams indexed for this token yet"), same pattern as `/token`.
- Invalid/unsupported chainId or malformed address → `notFound()`.
- DB-touching helpers short-circuit during `next build` (CLAUDE.md landmine).

## Testing
- `groupIntoRounds` unit tests (TDD) — the one piece of real logic.
- Build pass (TS) + manual deploy review (dashboard is Pro-gated; hard to preview
  locally without a session).

## Out of scope (v2)
- Start-date bucketing of rounds (revisit if v1 grouping is too coarse).
- Saved-token push/digest alert UI (toggle already stored; surfacing later).
- Solana token-detail (explorer token view is EVM-first, matching watchlist v1).
- Speeding up the main `/dashboard` first paint (separate task if desired).
