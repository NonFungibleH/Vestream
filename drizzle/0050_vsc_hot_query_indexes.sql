-- 0050_vsc_hot_query_indexes.sql
-- Composite indexes for the three slowest statements in pg_stat_statements
-- (2026-10-21), plus removal of a duplicate index.
--
-- ROOT CAUSE of the Vercel bill tripling (Sep–Oct 2026): pages sat waiting on
-- these queries until their 60s maxDuration, and Fluid bills provisioned memory
-- for every second a function waits. Doppler's ~69k active Robinhood rows made
-- every walk longer. Measured before this migration:
--   - next unlocks on ONE chain (`is_fully_vested = false AND chain_id IN (..)
--     ORDER BY end_time LIMIT n`): planner walked vsc_active_end_time_idx across
--     every chain filtering row-by-row — 5.2s mean, 8.8s on Ethereum.
--   - per-chain stream count for a protocol (`protocol IN (..) GROUP BY
--     chain_id`): 5.3s mean, 11.9s on PinkSale.
--   - bumpSeedHeartbeat's `WHERE protocol = $1 AND chain_id = $2 ORDER BY
--     stream_id LIMIT 1`: walked the primary key filtering — 42s mean.
--
-- vsc_protocol_chain_stream_idx serves both the GROUP BY (prefix) and the
-- heartbeat seek. vsc_chain_token_lower_idx (archived 0012) is the same
-- definition as vsc_chain_lower_token_idx (0030) — every cache write was
-- maintaining it twice.
--
-- CONCURRENTLY = no table lock; IF [NOT] EXISTS = idempotent. Run each
-- statement on its own (CONCURRENTLY cannot run inside a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS vsc_active_chain_end_time_idx
  ON vesting_streams_cache (chain_id, end_time) WHERE is_fully_vested = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS vsc_protocol_chain_stream_idx
  ON vesting_streams_cache (protocol, chain_id, stream_id);

DROP INDEX CONCURRENTLY IF EXISTS vsc_chain_token_lower_idx;
