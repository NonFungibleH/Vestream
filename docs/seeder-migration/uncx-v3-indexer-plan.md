# UNCX V3 (TokenVesting) — Event-Driven Indexer Migration Plan

**Status:** Planned  
**Priority:** First migration (easiest — UNCX-VM already done, identical protocol family)  
**Seeder jobs removed on completion:** 5 (ETH, BSC, Polygon, Base, Sepolia from `subgraphs` group)

---

## Why UNCX V3 first

UNCX-VM (VestingManager) is already fully event-indexed. UNCX V3 (TokenVesting V3) is the same
protocol family — same company, similar contract patterns, same subgraph infrastructure. The
indexer for V3 will be structurally identical to `uncx-vm.ts`. Completing this migration removes
5 jobs from the `subgraphs` group and validates the migration workflow before tackling more
complex protocols (Sablier, Superfluid).

---

## Current state (batch seeder)

The `uncx` adapter (`src/lib/vesting/adapters/uncx.ts`) queries The Graph subgraph per chain
for locks owned by tracked wallet addresses. It runs as part of the `subgraphs` seed group
every 2 hours.

Chains with active subgraphs: ETH, BSC, Base, Sepolia (Polygon subgraph deprecated).

---

## Indexer approach: on-chain events via eth_getLogs

UNCX TokenVesting V3 emits an `OnTokenLock` event on every new lock creation. The indexer
will watch this event (same pattern as UNCX-VM watching `VestingCreated`), decode the lockID
from the event, and call `getLock(lockID)` on the contract to fetch the full schedule.

This matches the existing `Indexer` interface exactly — block-based scanning, no changes
to runner.ts needed.

**Why on-chain events over subgraph polling:**
- Consistent with UNCX-VM and Hedgey — same runner, same state table, same cron route
- No The Graph dependency — survives subgraph outages
- Polygon becomes indexable even though its subgraph was deprecated (if the contract is deployed there)

---

## Implementation steps

### Step 1 — Research (30 min)

Verify per chain:
- UNCX TokenVesting V3 contract addresses (ETH, BSC, Base; check if Polygon has a deployment)
- `OnTokenLock` event signature — compute topic hash:
  `keccak256("OnTokenLock(uint256,address,address,uint256,uint256,uint256,address)")` or similar
- `OnTokenWithdrawal` event signature — needed for claim tracking (see Step 5)
- `getLock(uint256 lockID)` return struct — verify field names match what the adapter uses
- Deployment (genesis) block per chain — check Etherscan/BscScan for contract creation tx

The UNCX-VM adapter at `src/lib/vesting/adapters/uncx-vm.ts` is the closest reference for
the ABI shape; the V3 contract ABI will differ but the pattern (indexed event → read schedule)
is the same.

### Step 2 — Write the indexer (2–3 hours)

Create `src/lib/vesting/indexer/uncx.ts` following the `uncx-vm.ts` pattern exactly:

```
UNCX_V3_CONFIG = {
  [CHAIN_IDS.ETHEREUM]: { contractAddress, genesisBlock },
  [CHAIN_IDS.BSC]:      { contractAddress, genesisBlock },
  [CHAIN_IDS.BASE]:     { contractAddress, genesisBlock },
  // Polygon only if contract confirmed deployed there
}

ON_TOKEN_LOCK_TOPIC = keccak256("OnTokenLock(...)")

makeIndexer(chainId):
  scanWindow(client, fromBlock, toBlock):
    1. getLogs for OnTokenLock events in [fromBlock, toBlock]
    2. Extract lockID from each event (indexed param)
    3. Multicall getLock(lockID) for all lockIDs in the window
    4. Decode each lock → VestingStream using same math as uncx.ts adapter
       (Linear: computeLinearVesting; Cliff: endEmission is the cliff date)
    5. writeToCache(streams)
    6. return { eventCount: streams.length }

maxBlocksPerScan: 5000 (same as UNCX-VM — sparse events)
reorgLag: 12
```

The VestingStream shape must be byte-identical to what the adapter produces so both
paths can run in parallel during cutover. Copy the decode logic from `uncx.ts` adapter
(don't import from it — keep the indexer self-contained to avoid circular dep risk).

### Step 3 — Register and add cron entries (15 min)

Add to `src/lib/vesting/indexer/index.ts`:
```ts
import { uncxIndexers } from "./uncx";
export const INDEXERS = [...uncxVmIndexers, ...hedgeyIndexers, ...uncxIndexers];
```

Add to `vercel.json` (one entry per chain, `*/30`):
```json
{ "path": "/api/cron/indexer?protocol=uncx&chainId=1",    "schedule": "*/30 * * * *" },
{ "path": "/api/cron/indexer?protocol=uncx&chainId=56",   "schedule": "*/30 * * * *" },
{ "path": "/api/cron/indexer?protocol=uncx&chainId=8453", "schedule": "*/30 * * * *" },
```

### Step 4 — Parallel verification period (7 days)

Run the indexer alongside the seeder. Do NOT remove the seeder entries yet.

Check daily using the admin cache-stats endpoint:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.vestream.io/api/admin/cache-stats" | \
jq -r '.cells[] | select(.protocol == "uncx") | "\(.chainId) streams=\(.streams) fresh=\(.freshestMin)m"'
```

And indexer health:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.vestream.io/api/admin/indexer-status" | \
jq -r '.indexers[] | select(.protocol == "uncx") | "\(.chainId) lastRun=\(.minutesSinceLastRun)m events=\(.lastEventCount) err=\(.lastError // "ok")"'
```

Success criteria: stream counts per chain within 5% of what the seeder was writing, for 7 consecutive days.

### Step 5 — Add claim event indexing (1 hour)

Before removing the seeder, the indexer must also watch `OnTokenWithdrawal` (or equivalent)
so `withdrawnAmount` stays fresh when users claim. Without this, removing the seeder would
leave claim amounts stale until the next seeder run (which won't exist after removal).

In `scanWindow`, add a second `getLogs` call for `OnTokenWithdrawal` events in the same
block window. For each withdrawal event: read the updated lock state via `getLock(lockID)`,
update the cache row. The upsert is idempotent so running both creation and withdrawal
paths in the same window is safe.

### Step 6 — Remove seeder entries

Once 7-day verification passes and claim events are being indexed:

1. Remove from `src/lib/vesting/seeder.ts`:
   - The 5 `uncx` entries from `SEED_JOBS` (ETH, BSC, Polygon, Base, Sepolia)
   - Polygon and Sepolia have no indexer chain — their streams remain in cache, just not
     refreshed by either path. Acceptable: Polygon subgraph was already deprecated (0 new
     locks); Sepolia is testnet. Set a comment noting this.

2. If the `subgraphs` group becomes empty enough to collapse with another group, do that too.

3. Update CLAUDE.md "Migrated protocols" list to include `uncx`.

4. Update this document: set Status to "Complete".

---

## Risk / rollback

- **Rollback:** Comment out the `uncxIndexers` line in `indexer/index.ts` + remove the
  3 vercel.json cron entries. The seeder continues unchanged.
- **Polygon gap:** UNCX V3 Polygon subgraph was deprecated (0 new locks expected). If the
  contract IS deployed on Polygon and events exist, add a Polygon indexer entry. If not,
  the Polygon seeder job is already returning 0 recipients — safe to remove.
- **Sepolia:** Testnet. No indexer needed; remove seeder entry at Step 6 with a comment.
- **Stale claimableNow:** `claimableNow` is a computed field from schedule timestamps +
  `now`. It's recomputed each time the row is written. Between writes it drifts — this
  was already the case with the 2h seeder cadence. 30-min indexer cadence is actually
  better for active claimers than the 2h seeder was.

---

## After this migration

Remove one more group from the pattern if `subgraphs` now fits within 300s with only
Unvest + LlamaPay + UNCX-VM remaining. The next migration to plan is Unvest — same
approach (creation events + withdrawal events), 6 chains.
