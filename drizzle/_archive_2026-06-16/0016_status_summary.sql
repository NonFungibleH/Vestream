-- Migration 0016 — status_summary materialised view
--
-- Pre-aggregated rollup of vesting_streams_cache, maintained by the
-- seed-cache cron at the end of each run. Replaces the GROUP BY full-
-- scan that used to power /status and /api/admin/cache-stats.
--
-- Why a real table, not a Postgres MATERIALIZED VIEW: we want the cron
-- to control freshness (one upsert at the end of each run, not on every
-- read), and we want a `computed_at` provenance timestamp that's
-- independent of the underlying data freshness. A real table gives us
-- both; a MATVIEW would conflate "cron run completed" with "view
-- refreshed."
--
-- Read path: getCacheStatsCells() in src/lib/vesting/cache-stats.ts
-- now selects from status_summary (sub-50ms) instead of running the
-- GROUP BY itself.
--
-- Write path: refreshStatusSummary() runs the same aggregation
-- expression and upserts every row in one transaction. The seeder
-- calls it from the END of seed-cache once per group. Idempotent.
--
-- Composite PK (protocol, chain_id) — one row per cell. Total table
-- size stays under 100 rows for the foreseeable future.

CREATE TABLE IF NOT EXISTS "status_summary" (
  "protocol"           text       NOT NULL,
  "chain_id"           integer    NOT NULL,
  "streams"            integer    NOT NULL DEFAULT 0,
  "active"             integer    NOT NULL DEFAULT 0,
  "with_token_symbol"  integer    NOT NULL DEFAULT 0,
  "distinct_tokens"    integer    NOT NULL DEFAULT 0,
  "freshest_sec"       integer,
  "oldest_sec"         integer,
  "computed_at"        timestamp  NOT NULL DEFAULT now(),
  CONSTRAINT "status_summary_pk" PRIMARY KEY ("protocol", "chain_id")
);
