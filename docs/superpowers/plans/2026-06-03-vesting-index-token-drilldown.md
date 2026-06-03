# Vesting Index Token Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, in-session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Each PHASE is independently shippable — build, verify, commit, push, deploy, then move on.

**Goal:** Make `/dashboard/explorer` a tool people drill into: token → rounds → wallets, with one overview graph; make scanner result tokens clickable into it; fold the watchlist into a "Save" action; remove paused Team Finance from every visible surface.

**Architecture:** A new server-component route `/dashboard/explorer/token/[chainId]/[address]` reads `explorerFetch()` (cached), groups streams into "rounds" via a new pure `groupIntoRounds()`, and renders header → overview chart → rounds→wallets. Existing explorer/scanner token cells repoint to it. Watchlist becomes a "Save" button reusing `/api/watchlist`.

**Tech Stack:** Next.js 16.3 canary (App Router, RSC), Tailwind v4 + inline styles, Vitest, Drizzle/Postgres, `unstable_cache`.

**Spec:** `docs/superpowers/specs/2026-06-03-vesting-index-token-drilldown-design.md`

---

## File map

| File | Responsibility | Action |
|---|---|---|
| `src/lib/vesting/rounds.ts` | `groupIntoRounds()` pure logic + `Round` type | Create |
| `src/lib/vesting/rounds.test.ts` | Unit tests for grouping | Create |
| `src/app/dashboard/explorer/token/[chainId]/[address]/page.tsx` | Token drill-down server page | Create |
| `src/app/dashboard/explorer/token/[chainId]/[address]/TokenUnlockChart.tsx` | Overview cumulative-unlock chart (client) | Create |
| `src/app/dashboard/explorer/token/[chainId]/[address]/RoundsList.tsx` | Rounds → wallets drill-down (client) | Create |
| `src/app/dashboard/explorer/token/[chainId]/[address]/SaveTokenButton.tsx` | Star/save → `/api/watchlist` (client) | Create |
| `src/app/dashboard/explorer/page.tsx` | Repoint calendar/stream token links; symbol→token resolution | Modify |
| `src/app/dashboard/explorer/detect-query.ts` | Drop TF aliases; symbol→token destination | Modify |
| `src/app/dashboard/discover/page.tsx` | Remove TF chip; clickable result tokens | Modify |
| `src/components/{InteractiveDemo,LiveActivityTicker,UpcomingUnlockTicker,TokenMetaPanel}.tsx` | Remove TF mentions | Modify |
| `src/app/dashboard/page.tsx`, `income-statement/{page,print/page}.tsx` | Remove TF name maps | Modify |
| `src/components/DashboardSidebar.tsx` | Remove "Token Watchlist" nav item | Modify |
| `src/app/dashboard/watchlist/page.tsx` | Replace with redirect to `/dashboard/explorer` | Modify |

---

## PHASE 1 — Team Finance removal (everywhere)

Pure cleanup. The adapter, `explorer.ts`, `protocol-constants.ts` `disabled:true`, and cached rows STAY (it's a pause, not a deletion — see CLAUDE.md "Pausing an integration"). Only remove user-visible mentions.

### Task 1.1: Remove visible Team Finance references

**Files:**
- Modify: `src/app/dashboard/discover/page.tsx` — delete `{ id: "team-finance", label: "Team Finance" }` from `PROTOCOL_OPTIONS`.
- Modify: `src/app/dashboard/explorer/detect-query.ts` — delete the `"team":` and `"teamfinance":` entries from `PROTOCOL_ALIASES`.
- Modify: `src/components/InteractiveDemo.tsx` — remove `team-finance` from the `protocolId` union, the example object (line ~66), and the protocol list (line ~83). Adjust any count/`hit` logic so the demo still renders with the remaining protocols.
- Modify: `src/components/LiveActivityTicker.tsx` + `src/components/UpcomingUnlockTicker.tsx` — delete the `"team-finance":` entry from the protocol style map.
- Modify: `src/components/TokenMetaPanel.tsx`, `src/app/dashboard/page.tsx` (lines ~227, ~4072), `src/app/dashboard/income-statement/page.tsx` (~102), `src/app/dashboard/income-statement/print/page.tsx` (~95) — delete the `"team-finance": "Team Finance"` display-name entries. (Colour/link map entries are harmless fallbacks and may stay, but removing is fine if the Record isn't strictly typed to require the key.)

- [ ] **Step 1:** Make the edits above.
- [ ] **Step 2: Verify no visible mentions remain.** Run:
  ```bash
  grep -rni "team.?finance" src/app src/components | grep -viE "explorer\.ts|protocol-constants|disabled|// |/\*|adapters/team-finance"
  ```
  Expected: no hits (only adapter/constants/comment references remain elsewhere).
- [ ] **Step 3: Build.** `npm run build` → `Compiled successfully`, no type errors.
- [ ] **Step 4: Commit + push.**
  ```bash
  git add -A && git commit -m "cleanup: remove paused Team Finance from all visible surfaces"
  git push origin main
  ```

---

## PHASE 2 — Round-grouping logic (the testable core, TDD)

### Task 2.1: `groupIntoRounds()` + tests

**Files:**
- Create: `src/lib/vesting/rounds.ts`
- Test: `src/lib/vesting/rounds.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// src/lib/vesting/rounds.test.ts
import { describe, it, expect } from "vitest";
import { groupIntoRounds } from "./rounds";
import type { VestingStream } from "./types";

function mk(o: Partial<VestingStream>): VestingStream {
  return {
    id: o.id ?? Math.random().toString(),
    protocol: o.protocol ?? "sablier",
    chainId: o.chainId ?? 1,
    recipient: o.recipient ?? "0xrec",
    tokenAddress: "0xtok", tokenSymbol: "TKN", tokenDecimals: 18,
    totalAmount: o.totalAmount ?? "1000", withdrawnAmount: "0",
    claimableNow: "0", lockedAmount: o.lockedAmount ?? "1000",
    startTime: o.startTime ?? 0, endTime: o.endTime ?? 86400 * 365,
    cliffTime: o.cliffTime ?? null, isFullyVested: false,
    nextUnlockTime: o.nextUnlockTime ?? null, shape: o.shape ?? "linear",
  } as VestingStream;
}

describe("groupIntoRounds", () => {
  it("returns [] for no streams", () => {
    expect(groupIntoRounds([])).toEqual([]);
  });

  it("groups two streams with identical terms into one round, counting recipients", () => {
    const rounds = groupIntoRounds([
      mk({ recipient: "0xA", lockedAmount: "100" }),
      mk({ recipient: "0xB", lockedAmount: "200" }),
    ]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].recipientCount).toBe(2);
    expect(rounds[0].totalLocked).toBe("300");
  });

  it("separates different protocols, cliffs, durations, and shapes", () => {
    const rounds = groupIntoRounds([
      mk({ protocol: "sablier" }),
      mk({ protocol: "uncx" }),
      mk({ cliffTime: 86400 * 90 }),                 // 90d cliff
      mk({ endTime: 86400 * 730 }),                  // 2yr duration
      mk({ shape: "steps" }),
    ]);
    expect(rounds.length).toBe(5);
  });

  it("sorts rounds by totalLocked desc", () => {
    const rounds = groupIntoRounds([
      mk({ protocol: "uncx", lockedAmount: "10" }),
      mk({ protocol: "sablier", lockedAmount: "999" }),
    ]);
    expect(rounds[0].protocol).toBe("sablier");
  });

  it("labels by terms incl. cliff", () => {
    const [r] = groupIntoRounds([mk({ cliffTime: 86400 * 180, endTime: 86400 * 730 })]);
    expect(r.label).toContain("cliff");
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run src/lib/vesting/rounds.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement.**

```ts
// src/lib/vesting/rounds.ts
import type { VestingStream } from "./types";

export interface Round {
  key: string;
  protocol: string;
  shape: "linear" | "steps";
  cliffOffsetDays: number;
  durationDays: number;
  label: string;            // e.g. "24-mo linear · 6-mo cliff"
  recipientCount: number;
  totalLocked: string;      // stringified bigint
  totalAmount: string;      // stringified bigint
  nextUnlockTime: number | null;
  streams: VestingStream[];
}

const DAY = 86_400;
const roundDays = (s: number) => Math.max(0, Math.round(s / DAY));

function fmtDuration(days: number): string {
  if (days <= 0) return "instant";
  if (days % 365 === 0) return `${days / 365}-yr`;
  const months = Math.round(days / 30);
  return months >= 1 ? `${months}-mo` : `${days}-day`;
}

export function groupIntoRounds(streams: VestingStream[]): Round[] {
  const map = new Map<string, VestingStream[]>();
  for (const s of streams) {
    const shape = s.shape === "steps" ? "steps" : "linear";
    const cliffOffset = roundDays((s.cliffTime ?? s.startTime) - s.startTime);
    const duration = roundDays(s.endTime - s.startTime);
    const key = `${s.protocol}|${shape}|${cliffOffset}|${duration}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(s);
  }

  const rounds: Round[] = [];
  for (const [key, group] of map) {
    const [protocol, shape, cliffStr, durStr] = key.split("|");
    const cliffOffsetDays = Number(cliffStr);
    const durationDays = Number(durStr);
    let totalLocked = 0n, totalAmount = 0n;
    let nextUnlockTime: number | null = null;
    const recipients = new Set<string>();
    for (const s of group) {
      totalLocked += BigInt(s.lockedAmount ?? "0");
      totalAmount += BigInt(s.totalAmount ?? "0");
      recipients.add(s.recipient.toLowerCase());
      if (s.nextUnlockTime && (nextUnlockTime === null || s.nextUnlockTime < nextUnlockTime)) {
        nextUnlockTime = s.nextUnlockTime;
      }
    }
    const cliffLabel = cliffOffsetDays > 0 ? ` · ${fmtDuration(cliffOffsetDays)} cliff` : "";
    rounds.push({
      key, protocol, shape: shape as "linear" | "steps",
      cliffOffsetDays, durationDays,
      label: `${fmtDuration(durationDays)} ${shape}${cliffLabel}`,
      recipientCount: recipients.size,
      totalLocked: totalLocked.toString(),
      totalAmount: totalAmount.toString(),
      nextUnlockTime, streams: group,
    });
  }
  rounds.sort((a, b) => {
    const x = BigInt(a.totalLocked), y = BigInt(b.totalLocked);
    return y > x ? 1 : y < x ? -1 : 0;
  });
  return rounds;
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run src/lib/vesting/rounds.test.ts` → PASS.
- [ ] **Step 5: Commit.** `git add src/lib/vesting/rounds.ts src/lib/vesting/rounds.test.ts && git commit -m "feat: groupIntoRounds() for token vesting-round grouping"`

---

## PHASE 3 — Token drill-down view

### Task 3.1: New route — data + header

**Files:** Create `src/app/dashboard/explorer/token/[chainId]/[address]/page.tsx`.

Server component. Pattern after `/token/[chainId]/[address]/page.tsx` and the existing explorer page:
- `params: Promise<{ chainId: string; address: string }>`; parse + validate (`isValidWalletAddress`, supported chain) else `notFound()`.
- Guard `if (process.env.NEXT_PHASE === "phase-production-build") return <Empty/>` (CLAUDE.md build landmine).
- `const streams = await unstable_cache(() => explorerFetch(address, chainId), ["explorer-token", chainId, address], { revalidate: 300 })();`
- `const rounds = groupIntoRounds(streams);`
- Resolve symbol/name/decimals/price from streams (+ optional price cache, like `/token`).
- Render: breadcrumb (Dashboard / Vesting Index / SYMBOL), header card with symbol+name, **copyable contract** (reuse `CopyButton` pattern), chain badge, and totals (total locked, recipientCount across streams, `rounds.length`, soonest `nextUnlockTime`), plus `<SaveTokenButton chainId address symbol/>` (built in Phase 5 — stub import until then, or build 3.x last).
- Below: `<TokenUnlockChart .../>` (3.2) then `<RoundsList rounds=… />` (3.3).
- Empty state when `streams.length === 0` (mirror `/token` copy).

- [ ] Build the page with header + empty state (chart/list as placeholders).
- [ ] **Verify:** `npm run build` passes. Manually hit a known token URL post-deploy.
- [ ] Commit.

### Task 3.2: Overview chart

**Files:** Create `…/TokenUnlockChart.tsx` (client).

Cumulative-unlock-over-time curve, stacked by round. Build an inline SVG area/line chart (codebase builds SVG charts inline — see `UnlockTimeline` in `dashboard/page.tsx:2617` and the `/token` page chart for the pattern). Input: `rounds: Round[]` (+ `dark` via `useDarkMode()`). Sample N points across [minStart, maxEnd]; per round compute cumulative vested at each t (`computeLinearVesting` / `computeStepVesting` from `@vestream/shared`); stack. Legend = round labels with colours.

- [ ] Implement; feed from Task 3.1.
- [ ] **Verify:** build + deploy; chart renders for a multi-round token.
- [ ] Commit.

### Task 3.3: Rounds → wallets

**Files:** Create `…/RoundsList.tsx` (client).

- Round cards: `label · {recipientCount} wallets · {fmt totalLocked} SYMBOL · next unlock {…}`. Colour-coded to match chart.
- Click toggles an expanded **wallets table** for that round: recipient (truncated, link `→ /dashboard/explorer?q={recipient}&mode=wallet`), amount (totalAmount), cadence (`shape === "steps" ? "N steps" : "linear over {durationDays}"`), start / cliff / end dates, claimed (`withdrawnAmount`) vs claimable (`claimableNow`).
- Apply `FREE_TIER_ROW_CAP` to wallet rows for free tier (pass `isFree` from page).

- [ ] Implement.
- [ ] **Verify:** build + deploy; expanding a round shows wallets.
- [ ] Commit.

### Task 3.4: Entry points — repoint links + symbol resolution

**Files:** Modify `src/app/dashboard/explorer/page.tsx`, `src/app/dashboard/explorer/detect-query.ts`.

- In `CalendarResults` (line ~484) and `StreamResults` (line ~600): change `href={`/token/${…}/${…}`}` → `href={`/dashboard/explorer/token/${…}/${…}`}`.
- Symbol→token: when `queryKind.kind === "symbol"`, look up matching tokens (add a lightweight `getTokensBySymbol(symbol)` in the explorer data layer returning `{chainId, address, symbol}[]`). If exactly one → `redirect()` to the token route; if many → render a small picker list; if none → current calendar-filtered behaviour. Update `destinationForQuery`/page accordingly. (Keep address/ENS routing unchanged.)

- [ ] Implement; **verify** clicking a calendar/stream token lands on the new view; symbol search resolves/pickers correctly.
- [ ] Commit + push (Phase 3 shippable).

---

## PHASE 4 — Wallet scanner amends

### Task 4.1: Clickable result tokens

**Files:** Modify `src/app/dashboard/discover/page.tsx`.

(TF chip already removed in Phase 1.) Around the token row render (~line 274, `tokenKey`), wrap the token symbol/icon cell in `<Link href={`/dashboard/explorer/token/${result.chainId}/${tok.address}`}>` — only when `tok.address` is present (skip symbol-only rows). Don't break the existing watch/track buttons (stop propagation if needed).

- [ ] Implement; **verify** build + deploy; clicking a scanned token opens the drill-down.
- [ ] Commit + push.

---

## PHASE 5 — Watchlist → "Save"

### Task 5.1: SaveTokenButton

**Files:** Create `…/SaveTokenButton.tsx` (client); wire into Task 3.1 header.

- On mount, GET `/api/watchlist`, determine if `(chainId,address)` is saved. Star toggles: POST `{chainId, tokenAddress, label}` to save, DELETE `?id=` to remove. Optimistic UI; `track("cta_clicked", {cta_id:"token_saved"})`.

- [ ] Implement; **verify** save/unsave persists across reload.
- [ ] Commit.

### Task 5.2: "Saved" surfacing in the Index

**Files:** Modify `src/app/dashboard/explorer/page.tsx`.

- Add a compact "Saved tokens" strip/section (above results or as a lens): GET `/api/watchlist`, render chips/rows linking to `/dashboard/explorer/token/{chainId}/{addr}` with next-unlock if cheaply available. Empty → hidden.

- [ ] Implement; **verify** saved tokens appear and link in.
- [ ] Commit.

### Task 5.3: Retire the standalone watchlist page

**Files:** Modify `src/components/DashboardSidebar.tsx`, `src/app/dashboard/watchlist/page.tsx`.

- Remove the `{ label: "Token Watchlist", href: "/dashboard/watchlist" }` NAV_ITEM (line ~55).
- Replace `watchlist/page.tsx` body with a server `redirect("/dashboard/explorer")` (keeps bookmarks working). API + table untouched.

- [ ] Implement; **verify** build; `/dashboard/watchlist` redirects; nav no longer shows it.
- [ ] Commit + push (Phase 5 shippable).

---

## Verification (per phase)
- `npm run build` must print `Compiled successfully` with no TS errors (ignore `bigint`/`Failed to fetch usage 403` noise).
- `npx vitest run src/lib/vesting/rounds.test.ts` green (Phase 2).
- Dashboard is Pro-gated → no local preview; verify each phase on the Vercel deploy.

## Notes / landmines
- DB-touching helpers must short-circuit during `next build` (CLAUDE.md).
- Don't delete the TF adapter/constants/cache — pause only.
- Keep `/token/[chainId]/[address]` public page as-is (it still serves SEO/marketing); the new route is the Pro in-explorer view.
