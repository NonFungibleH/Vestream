# Vestream Roadmap (internal)

> Working document. Edit liberally. Items are sized roughly — `S` = a few hours,
> `M` = 1–3 days, `L` = a week, `XL` = multi-week. Sizes are coding time only,
> not including review/testing/marketing follow-up. Re-rank when priorities
> change. **This is for internal planning — not a public commitment.**
>
> _Last updated: 2026-05-31_

---

## Recently shipped (last 24h)

- **Stream annotations** (custom names + notes, 200-char cap) — schema, API,
  web dashboard editor + Asset-column display, mobile editor card +
  portfolio cell custom-name display, CSV export descriptions threaded
  through Koinly / TurboTax / Vestream-generic formats.
- **Hedgey BSC/Polygon/Base RPC fix** — adapter-level migration to the
  shared multi-RPC pool. Cleared the 8.85-day silent failure.
- **Arbitrum chain** — Sablier wired end-to-end, LlamaPay TVL covers it
  via DefiLlama passthrough. Hedgey/UNCX/Unvest/Superfluid Arbitrum
  pending (see "Now").
- **LlamaPay protocol** — DefiLlama vesting passthrough, listed on
  /protocols.
- **Team Finance pause** — `disabled` flag pattern documented in
  CLAUDE.md.
- **Seed-cache fan-out** — single cron entry → 3 background self-fetches
  (heavy / solana / subgraphs), each with its own 300s budget.
- **writeToCache setWhere** — skip UPDATE when stream data unchanged;
  ~90% IO reduction in typical incremental cron runs.

---

## Now (active or queued this week)

### Verify today's shipping batch
- **What** — Tomorrow morning UK time, run the cache-stats freshness check + confirm `/protocols/llamapay` card shows TVL + verify Sablier Arbitrum streams populated.
- **Why** — We shipped 9+ commits today (LlamaPay, Arbitrum, fan-out cron, hedgey pagination, build-phase guards, setWhere optimisation, Team Finance pause, marketing sweep, CLAUDE.md). Without verification, all of it is theoretical.
- **Size** — `S` (one curl + one page load + visual sanity check)
- **Open question** — Hedgey BSC/Polygon/Base still 12,000+m stale at last check. If the next fan-out doesn't unstick them, the pagination fix isn't doing what we think.

### Hedgey + UNCX on Arbitrum
- **What** — Same shape as Sablier Arbitrum integration just shipped. Hedgey contract is the same address on every EVM chain (verified). UNCX needs the Arbitrum subgraph deployment ID looked up.
- **Why** — Currently we claim "Arbitrum support" but only Sablier is wired. Two more protocols brings real coverage to 3 of 9.
- **Size** — `M` if the subgraph IDs publish cleanly; `L` if we need to read the contracts directly.

---

## Next (this month)

### Stickiness trifecta — calendar export + tags

The next two stickiness wins on top of stream notes (shipped May 2026).
Compound differently from notes:
- **Notes** = personal context per stream (shipped — view/edit on web + mobile, flows into CSV exports).
- **Tags** = a personal taxonomy spanning streams (Investor / Salary / Advisor / etc).
- **Calendar export** = where you live. Once a user pins Vestream events to their calendar, they see Vestream every time they look at it.

**Tags** (`L`, ~2-3 days): same per-user-per-stream shape as notes. New `stream_tags` table with `(user_id, stream_id, tag, color)`. Free-form tag creation, dashboard filter chips, color-coded ribbons on cards. Same dual-auth API pattern. Mobile parity.

**Calendar export** (`L`, ~2-3 days): `.ics` feed at `/api/calendar/[token].ics` (token = a user-scoped opaque slug). Subscribe URL on the dashboard with one-click "Add to Google Calendar / Apple Calendar / Outlook". Auto-includes upcoming unlocks for all tracked wallets, refreshes server-side. Uses iCal RFC 5545 — every calendar app on earth speaks this.

After these land, the personal-context trifecta is complete: what (notes), how organised (tags), where it lives (calendar).

### Other stickiness candidates (sequenced behind the trifecta)

| Idea | Build | Stickiness mechanic |
|---|---|---|
| **Watchlist / pin streams** | ~1 day | Tiny build, big UX for users with many vestings. |
| **Per-stream alert preferences** (mute / custom thresholds) | 2-3 days | Quietens noise without losing important events. |
| **Counterparty / issuer field** ("Issued by Acme Capital") | ~1 day | Structured extension of notes. Enables future grouping. |
| **Pinned KPI tiles on dashboard** (user-defined widgets) | 3-4 days | User-built dashboard = personal config = switching cost. |
| **Goal tracker** ("$50k by July" + progress bar) | 3-4 days | Emotional commitment > functional commitment. |
| **Shared view-only links for accountants** | 3-4 days | Two-sided stickiness — accountants bookmark Vestream during tax season. |
| **Document attachments** (grant PDFs, side letters) | ~5 days | Highest per-feature value; needs Supabase storage. |
| **Email forwarding bucket** (`vestr-{id}@vestream.io` → docs) | 1-2 weeks | Power-user feature, distinctive moat. |

### Auto P&L tracking (DEX sells)
- **What** — Detect when tracked wallets sell vested tokens via DEX swaps; pull historical USD value at sale; match to claim events for cost basis; surface auto-populated rows in the existing P&L panel.
- **Why** — Strongest product extension on top of what we have. We already track claim events with timestamps (income side); generic crypto-tax tools have to estimate that. With auto sell-detection, our P&L for vested tokens is *more accurate* than CoinTracker/Koinly for the exact use case our users care about.
- **Size** — `XL` (~3–4 weeks for credible v1)
  - Transaction history fetch via Alchemy/Covalent: ~1 week
  - DEX swap classification (UniV2/V3/V4, Sushi, Aerodrome, PancakeSwap, Curve): ~1 week
  - Historical price cache: ~3 days
  - FIFO lot-matching engine: ~3–5 days
  - CEX-detection UX (prompt-on-transfer to known exchange addresses): ~2 days
  - UI integration: ~3 days
- **Caveats**
  - Don't market as "tax-ready" until per-jurisdiction logic (FIFO/LIFO/pooling/wash sales) lands. Market as "auto P&L" first.
  - Wrapped tokens / LSTs (wstETH↔ETH, WBTC↔BTC) aren't sells — need a no-op pair classifier.
  - CEX sells need user confirmation; we can see the transfer-out but not the trade.
- **Stack** — Likely Alchemy `getAssetTransfers` + per-router Swap event ABI parsing. Historical prices from DexScreener (free) with CoinGecko Pro fallback for older blocks.

### Real LlamaPay adapter (per-wallet streams)
- **What** — Move LlamaPay from TVL-only DefiLlama passthrough to a real adapter that surfaces per-wallet streams in the dashboard.
- **Why** — Today /protocols/llamapay shows TVL but no actual stream tracking. The "track your payroll stream" promise on the homepage is currently an IOU.
- **Size** — `L` (1–2 days)
- **Approach** — LlamaPay has factory contracts on each chain emitting `StreamCreated` events. Either subgraph (if public deployment exists) or factory-contract event scan via the multi-RPC pool.
- **Dependency** — Pairs naturally with Auto P&L (same data layer touches transactions for the same wallets).

### Payroll-recipient positioning push
- **What** — A small landing module / hero variant aimed specifically at crypto-paid contractors: "track your stablecoin streams, get tax-ready exports, alert on cliffs." A/B test against current homepage hero.
- **Why** — We added LlamaPay + Superfluid coverage specifically because of this thesis. Now is the validation moment — if no one clicks, we know the recipient-payroll angle isn't real before we build the real LlamaPay adapter.
- **Size** — `M` (1–2 days for variant + analytics wiring)
- **Success criteria** — Watch for 30 days post-launch. Lift in `wallet_added` events from `/payroll` route vs control. If no lift, drop the angle and don't build the LlamaPay adapter for it.

### Hedgey BSC/Polygon/Base un-stick
- **What** — If `288c25c` pagination fix doesn't unstick the 8.5-day staleness, dig into why. Possible causes: contract not deployed at expected address, Multicall3 not at expected address, viem multicall response shape difference, dRPC gating something specific to those chains.
- **Why** — Three chains × Hedgey is real volume. Silent failures are the worst kind.
- **Size** — `S` to debug, `M` if it requires a different fetch pattern.

---

## Soon (1–3 months)

### Vesting income statement (re-introduce)

- **What** — Bring back the `/dashboard/income-statement` view (gross vesting income by payer/period). The page code still exists; it was unlinked from the sidebar + the Tax page sub-tab on 2026-06-04 as low-priority while we focus the Tax page on the claims→export flow.
- **Why** — Useful for DAO contributors / payroll recipients filing ordinary income, but lower priority than making the core export tool slick. Re-link the nav + sub-tab when we pick it back up.
- **Size** — `S` to re-link; `M` if we rework it to match the redesigned Tax page.

### In-app claiming (connect wallet → claim direct from smart contracts)

- **What** — Instead of linking users out to Sablier/Hedgey/etc to claim, surface a "Claim" button in the dashboard and mobile app. User connects their wallet, we call the protocol's release function directly. No protocol page needed.
- **Why** — Every "Go to Sablier" tap is a moment we lose the user. In-app claiming closes the loop: track → notify → claim, all inside Vestream. Strongest retention mechanic we could add.
- **Infrastructure already in place** — wagmi v3 + RainbowKit v2 + viem + WalletConnect are already installed and configured. ETH, Base, BSC, Polygon chains wired. The UI wallet-connect layer is free.
- **Size** — `M` per protocol group (see below). Total ~`L` for the first 3 easy protocols; `XL` for full coverage.
- **Web only initially** — wagmi is browser-based. Mobile in-app claiming needs a separate wallet approach (WalletConnect mobile or embedded wallet like Privy/Dynamic).

**Protocol breakdown (assessed 2026-05-30):**

| Protocol | Difficulty | Why | Contract data we already have |
|---|---|---|---|
| Hedgey | 🟢 Easy (~2–3h) | Contract address hardcoded in adapter, have plan IDs. Call: `redeemPlans([planId])` | ✅ contract address, ✅ plan ID |
| UNCX-VM | 🟢 Easy (~2–3h) | Contract addresses per chain in adapter, have vesting IDs. Call: `release(vestingId)` | ✅ contract address, ✅ vesting ID |
| PinkSale | 🟢 Easy (~2–3h) | Contract addresses in adapter, have lock IDs. Call: `unlock(lockId)` | ✅ contract address, ✅ lock ID |
| Sablier Lockup | 🟡 Medium (~4–6h) | Have stream IDs + claimable amounts; contract address per stream not stored yet — in subgraph but not persisted. Call: `withdraw(streamId, to, amount)` | ✅ stream ID, ✅ claimable amount, ❌ contract address (needs storing in streamData) |
| Sablier Flow | 🟡 Medium (~4–6h) | Same gap as Sablier Lockup | ✅ stream ID, ❌ contract address |
| Team Finance | 🟡 Medium (~4–6h) | Per-vesting contract address is in API response; need to confirm V3 claim ABI from docs/Etherscan | ✅ contract address in TFVesting, ❌ write ABI unconfirmed |
| LlamaPay | 🟡 Medium (~4–6h) | No numeric stream ID — identified by (payer, token, amountPerSec). Factory deploys one contract per payer. Different calling convention from all others. | ✅ payer, token, amountPerSec — ❌ contract address needs resolving per stream |
| Unvest | 🟡 Medium (~4–6h) | Per-project vesting token contract. ABI may vary between deployments. | ✅ contract address in subgraph, ❌ ABI consistency unconfirmed |
| UNCX V2 | 🟡 Medium (~1 day) | Contract address not stored per lock. Also: access control unclear — may be owner-only not recipient-callable. Needs research. | ❌ contract address not stored, ❌ access control unknown |
| Superfluid | 🔴 Hard (~2–3 days) | Push-based streaming, not pull. Tokens flow as SuperTokens automatically. "Claiming" means calling `downgrade()` to convert SuperTokens → underlying ERC20. Different mental model and UX from everything else. | ✅ superToken address, ❌ fundamentally different flow |
| Streamflow | 🔴 Hard (~3–5 days) | Solana — outside the EVM/wagmi stack entirely. Needs `@solana/wallet-adapter` + Phantom/Backpack support. SDK has a `withdraw()` method so contract side is solved once infra is in place. | N/A (Solana) |
| Jupiter Lock | 🔴 Hard (~1–2 days on top of Streamflow) | Solana — same infra dependency as Streamflow. | N/A (Solana) |

**Recommended order:**
1. Hedgey + UNCX-VM + PinkSale — ship all three together in one PR (~1 day total). Covers a large portion of EVM users.
2. Sablier Lockup + Flow — store contract address in streamData during seeding, then ~half a day for claim buttons.
3. Solana (Streamflow + Jupiter) — separate workstream. Needs Solana wallet infrastructure first.
4. Superfluid — defer. Different claiming model warrants its own design pass.

**Note:** Arbitrum and Optimism need to be added to the wagmi chain config before Hedgey claiming works on those chains (30 min).

---

### Received-token wallet alerts

- **What** — Push notification when a token lands in a tracked wallet — airdrop, OTC transfer, exchange withdrawal, payment received. Completes the money-in picture alongside vesting unlocks (scheduled money) and payment streams (streamed money). Tagline: "Every way money moves to you, one inbox."
- **Why** — Natural product extension. Users already trust Vestream for unlocks; this makes the app the single notification surface for all incoming crypto value — raising daily engagement and reducing churn.
- **How** — Register each tracked wallet with the Alchemy Address Activity webhook (free tier: 100 endpoints, 10M CUs/month). Webhook fires on any ERC-20 receive → value check against `tokenPricesCache` → push if above threshold. Dedup via existing `webhook_event_dedup` table.
- **Size** — `M` (~2–3 days EVM v1)
- **Dust filter (hard-coded defaults, v1):**

  | Tier  | Alert threshold | Rationale |
  |-------|-----------------|-----------|
  | Free  | > $10 USD       | Aggressive — only genuinely meaningful amounts count against the push quota |
  | Pro   | > $1 USD        | More sensitive but still filters dust and unknown-price spam tokens |

  Tokens with no liquid market price → skip alert entirely (eliminates ~95% of spam airdrops without any blocklist).
  Same token received twice within 1 hour → debounce (split-transaction guard).
  Wallet already has a vesting stream for this token → skip (they already get unlock alerts; no double-fire).

- **Caveats / decisions before building:**
  1. **EVM v1, Solana v2** — Alchemy doesn't cover Solana. Helius has an equivalent API but requires a separate registration path. Ship EVM, add Solana in a follow-on.
  2. **User-controlled threshold** — a slider in notification preferences ("alert me for > $X") is a nice v2 polish; fixed defaults are M-size and ship faster.
  3. **Free-tier push quota** — received-token alerts consume the same 10/month Free push budget as unlock alerts. No new gating needed.

- **Stack additions:** Alchemy Webhook API (POST on wallet-add, DELETE on wallet-remove), `alchemy_webhook_id` column on `wallets` table, new `POST /api/webhooks/alchemy` route.

---

### More chains
Priority order based on TVL/protocol overlap:
1. **Optimism** — `M`. Sablier, Hedgey, UNCX all deployed. Same shape as Arbitrum integration.
2. **Avalanche** — `M`. Sablier, Hedgey deployed.
3. **zkSync Era / Linea / Scroll** — `M` each, lower volume. Probably do as a single batch.

After each chain adds, run the marketing-copy sweep (search for "6 chains" → "7 chains" etc — this would be ~30+ files; **worth refactoring to a shared `SUPPORTED_CHAIN_COUNT` const before the next chain to avoid the manual sweep**).

### More protocols (real adapters, not passthroughs)
Each requires research before sizing — does it have a subgraph? Factory contract events? Per-recipient enumerable interface?
- **Liquifi** — not on DefiLlama. Need to read contracts directly. `L`.
- **TokenOps** — not on DefiLlama. `L`.
- **Magna** — verify DefiLlama listing first; might be a passthrough quick-win like LlamaPay.
- **Decubate** — verify DefiLlama listing.
- **Custom contract import** — let users add an arbitrary vesting contract address and Vestream parses what it can. `XL`. Long-tail SEO + power-user feature.

### Mobile app design system rollout
- **What** — Calendar tab already upgraded to premium-mockup tier (commit `e51b6534d`). Apply same design language to Home, Discover, Onboarding, Alerts screens.
- **Why** — Visual consistency across the app; calendar tab is the only one currently at the App Store screenshot quality.
- **Size** — `L` per screen, can be parallelised.

### Tax-grade accuracy (US/UK/EU)
- **What** — Per-jurisdiction lot-matching rules layered on top of Auto P&L:
  - US: FIFO default, allow specific-ID election; wash-sale detection (30-day rule)
  - UK: 30-day pooling rule + Section 104 holding
  - EU: Varies by country; Germany has a 1-year hold rule, Portugal/Belgium are flat
- **Why** — Unlocks "tax-ready" marketing claim and pushes Pro tier upgrade rate.
- **Size** — `XL` (per-jurisdiction logic + tested fixtures + accountant review). Don't ship without an accountant signing off on the math per jurisdiction.

---

## Later (vision)

### B2B / Corporate offering for token issuers
- **What** — Sender-side companion: companies issuing vests use Vestream as the white-label recipient experience. Already have a `/corporate/token-payroll` page hinting at this.
- **Why** — Annual contracts > B2C subscriptions. One company with 50 employees = 50 Pro accounts.
- **Size** — `XL`+. Different sales motion (B2B SaaS), different SLA expectations, custom branding, SSO.
- **Open question** — Is this Vestream or a separate product? Brand stretches awkwardly across token-holder-tracker AND HR-ops platform.

### "Custom contract" vesting tracker
- **What** — User pastes a vesting contract address; Vestream attempts to parse it via heuristics (common ABI patterns) and surfaces what it can. Premium feature.
- **Why** — Long-tail coverage. Most launchpad-built bespoke vesting contracts don't fit any of our standard adapters.
- **Size** — `XL`. Heuristic parsing is open-ended.

### Public TVL leaderboard / trends API
- **What** — Open the daily TVL snapshot table as a queryable public dataset (rate-limited free tier, paid for higher volume). Position Vestream as the canonical "vesting TVL by protocol" data source.
- **Why** — Defensible content moat (DefiLlama doesn't separate vesting from token-locker for several protocols; we do). SEO + developer-acquisition flywheel.
- **Size** — `M` to expose; `L` to grow into a real API product.

---

## Infrastructure / hygiene (run during slack time)

### Rotate leaked secrets
- `CRON_SECRET`, Alchemy Solana key, Helius key were committed to git history at various points. Not actively exploited as far as we know, but cheaper to rotate than to discover an incident.
- **Size** — `S` (~30 min: generate new keys, update Vercel env vars, push, smoke-test).

### Articles.ts cleanup post-Team-Finance pause
- **Context** — `src/lib/articles.ts` has 50+ Team Finance references. We deliberately left them untouched in the May 2 marketing sweep because the dedicated TF article is legitimate SEO content (Team Finance still exists on-chain; we just paused our indexer).
- **What needs cleanup** — Lines that say "Vestream's Team Finance adapter covers..." are now factually wrong. Other passing mentions ("compares Sablier vs UNCX vs Team Finance") are fine.
- **Size** — `S`-`M`. Worth doing before Team Finance unpauses (else copy goes through two stale states).

### Refactor "9 protocols" / "6 chains" hardcoded counts
- **Context** — Today's marketing sweep touched 30+ files. Will repeat every protocol/chain change. Currently invariant-bound to actual code, but every count change is manual.
- **What** — Extract to constants in `protocol-constants.ts` (`ENABLED_PROTOCOL_COUNT`, `SUPPORTED_MAINNET_CHAIN_COUNT`); replace hardcoded numbers in JSX with const interpolations.
- **Size** — `M` (touches ~30 files but mechanical).
- **When** — Before the next protocol or chain addition.

### CLAUDE.md upkeep cadence
- Updated 2026-05-02 (commit `9031926`) — was 3 days stale.
- **Soft rule** — flag stale entries when they're > 1 week old or after any infrastructure-pattern change.

### Supabase Disk IO monitoring
- May 2 alert prompted the `setWhere` optimisation. Watch the IO graph for the next two weeks to confirm the fix landed.
- If IO climbs again post-fix, evaluate: drop `DEEP_SEED_LIMIT` 5000 → 2500, or upgrade Supabase compute tier (~$10/mo Small).

---

## Decided NOT to do (yet)

These have been considered and explicitly held — capture the reasoning so future sessions don't re-litigate.

- **Pivot Vestream into a crypto payroll *platform* (sender-side).** Discussed 2026-05-02. Crypto-native payroll TAM is real but niche; pivoting to compete with Toku/Request requires a different product, sales motion, and competitor set. Decision: lean into recipient-side payroll features instead.
- **Add `BSC_RPC_URL` / `POLYGON_RPC_URL` / `ALCHEMY_RPC_URL_BASE` as required env vars.** Reviewed and rejected three times (`6a09a13`, `ef21b41`, 2026-04-29). Canonical fallback is dRPC. See CLAUDE.md landmine note.
- **Drop `DEEP_SEED_LIMIT` 5000 → 2500.** Held until IO data shows 1+2 (skip-unchanged + weekly-not-daily-deep) aren't enough. Real coverage trade-off — only do it with data.
