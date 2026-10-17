# UNCX claim guide — HELD (do not publish yet)

**Why held:** UNCX's Vesting V2 (VestingManager) contracts were exploited on 14–15 Oct 2026: about $1.49M across 10 tokens on Ethereum, Base, BNB Chain and Robinhood Chain (Blockaid; Crypto Times, 15 Oct). UNCX said on X (14 Oct) that the incident is isolated to Vesting V2, and that its liquidity lockers and legacy vesting contracts are unaffected. It expects to publish an incident report and recovery plan. A "how to claim" guide published during an open incident could tell people to interact with an affected contract, or go stale within days.

**Publish when:** UNCX's incident report is out and V2's status (paused, migrated, recovery) is known.

**Before publishing, verify:**
- The current claim UI path. Ours is `app.uncx.network/services/token-vesting/list` (from `protocol-constants.ts` claimUrl). UNCX's docs don't describe the recipient flow; check the live app with a wallet that holds a position.
- Which contract a reader's position is on. Legacy TokenVesting = our `uncx` adapter; Vesting V2/VestingManager = `uncx-vm`.
- Whether Vestream's `uncx-vm` cached positions for the 10 affected tokens still reflect what's claimable after the drain.

**Target queries:** "uncx" (293 impressions, position 37), "uncx locker" (127, position 48), "uncx token" (37). Vestream tracks UNCX *vesting*, not liquidity locks, so the guide must say that clearly.

**Draft outline:**
1. Short version: connect the recipient wallet, open UNCX's token vesting list, find the vest and withdraw what's unlocked.
2. Legacy TokenVesting vs Vesting V2: how to tell which one holds your position, and the October 2026 status of each (from UNCX's own statements only).
3. Steps (verified against the live app).
4. Liquidity lockers aren't vesting: what Vestream does and doesn't show.
5. Find your vests: Vestream scan → UNCX protocol page.
6. FAQ.

Sources:
- https://www.cryptotimes.io/2026/10/15/uncx-exploit-escalates-vesting-v2-bug-drains-1-5m-across-4-chains-as-copycats-join-in/
- https://thedefiant.io/news/hacks/uncx-vesting-pool-exploited-for-about-86-000-blockaid-says
- https://www.mitrade.com/insights/news/live-news/article-3-2163342-20261015
