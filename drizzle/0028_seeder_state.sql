-- Seeder state — diagnostic mirror of indexer_state for batch-seeder
-- protocols (pinksale, sablier, hedgey, uncx, uncx-vm, unvest, superfluid,
-- llamapay, streamflow, jupiter-lock). Filled the diagnostic gap that left
-- the admin /status grid showing "11d stale" for cells whose seeder ran
-- daily but produced no cache diff (per-second streamers with no
-- withdrawals, curated-list adapters whose discover() returned 0).
--
-- Pre-existing heartbeat (`bumpSeedHeartbeat` in dbcache.ts) only fires
-- when (a) discover returned recipients AND (b) the cell has ≥1 cache row
-- to UPDATE. Both conditions miss legitimate "cron ran, nothing to write"
-- runs. This table records every attempt unconditionally so the admin
-- grid can show "checked Xh ago" for all 11 protocols, matching what
-- indexer_state already provides for event-driven indexers.
--
-- 2026-06-13 hand-rolled (Drizzle journal collision at 0009 — see 0026 comment).
-- Applied via:  node scripts/apply-migration.mjs drizzle/0028_seeder_state.sql

CREATE TABLE IF NOT EXISTS "seeder_state" (
  "adapter_id"           text     NOT NULL,
  "chain_id"             integer  NOT NULL,

  -- Wall-clock time of the last attempt (success OR failure).
  "last_attempt_at"      timestamp,
  -- Wall-clock time of the last successful run (no error thrown).
  "last_success_at"      timestamp,
  -- Last error message, if the most recent run failed. NULL on success.
  "last_error"           text,
  -- How many streams the last run wrote to vesting_streams_cache —
  -- diagnostic only; 0 is a healthy outcome for empty-discovery runs.
  "last_streams_written" integer  DEFAULT 0,

  "created_at"           timestamp DEFAULT now() NOT NULL,
  "updated_at"           timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "seeder_state_pk" PRIMARY KEY ("adapter_id", "chain_id")
);

-- "Show me every seeder cell that hasn't attempted in N minutes" —
-- powers the staleness diagnostic surfaced on /admin/cache-stats.
CREATE INDEX IF NOT EXISTS "seeder_state_last_attempt_idx"
  ON "seeder_state" ("last_attempt_at");
