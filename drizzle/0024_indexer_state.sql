-- Event-driven indexer state — single source of truth for resumable log scans.
-- Shipped 2026-05-14 as Phase 3 of the indexer migration (event-driven
-- replacement for the daily seed-cache cron, which was repeatedly hitting
-- free-tier RPC limits on full-history walks).
--
-- Each (protocol, chainId) cron run picks up from last_confirmed_block + 1
-- and scans a bounded block window forward. The reorg-lag column
-- (last_scanned vs last_confirmed) lets us re-scan the trailing N blocks
-- on each tick — idempotent upserts on vesting_streams_cache dedupe any
-- duplicates from re-orgs.
--
-- Diagnostic fields (last_run_at / last_attempt_at / last_error /
-- last_event_count) feed /api/admin/indexer-status so stuck indexers
-- surface without grepping Vercel logs.

CREATE TABLE IF NOT EXISTS "indexer_state" (
  "protocol"             text     NOT NULL,
  "chain_id"             integer  NOT NULL,

  -- Highest block we've scanned logs from (regardless of confirmation).
  "last_scanned_block"   bigint   NOT NULL DEFAULT 0,
  -- Highest block we trust isn't reorg-fragile (scanned - REORG_LAG).
  "last_confirmed_block" bigint   NOT NULL DEFAULT 0,

  -- Diagnostic / staleness tracking.
  "last_run_at"          timestamp,
  "last_attempt_at"      timestamp,
  "last_error"           text,
  "last_event_count"     integer  DEFAULT 0,

  "created_at"           timestamp DEFAULT now() NOT NULL,
  "updated_at"           timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "indexer_state_pk" PRIMARY KEY ("protocol", "chain_id")
);

-- "Show me every indexer that hasn't run in N minutes" — powers the
-- staleness diagnostic and future alerting.
CREATE INDEX IF NOT EXISTS "indexer_state_last_run_idx"
  ON "indexer_state" ("last_run_at");
