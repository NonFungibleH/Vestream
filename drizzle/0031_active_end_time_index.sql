-- 0031_active_end_time_index.sql
-- Partial B-tree index on (end_time) for the active rows of
-- vesting_streams_cache.
--
-- ROOT CAUSE of the explorer landing-page 30s render / timeout
-- (EXPLAIN ANALYZE, 2026-06-16): getUnlocksInWindow's two passes filter
-- `is_fully_vested = false AND end_time > X` and `ORDER BY end_time ASC
-- LIMIT 2000`. The only end_time index was `(protocol, end_time)` —
-- protocol-leading, so with no protocol filter (the default explorer view)
-- the planner used a Bitmap Index Scan, which cannot emit sorted rows.
-- That forced an explicit Sort of all ~24k matching wide rows (each
-- carrying the heavy `stream_data` JSONB) → 22 MB external merge sort
-- spilled to disk → ~5.5s warm, far worse on the cold Supabase pooler.
--
-- A partial index keyed on `end_time` alone lets the planner do an ordered
-- index scan: walk end_time ascending from X, fetch ~2000 heap rows, stop
-- at the LIMIT. No 24k-row heap fetch, no disk sort. The predicate matches
-- the query's `is_fully_vested = false` exactly so the planner can use it.
--
-- CONCURRENTLY = no table lock (safe on the live cache the crons write to).
-- IF NOT EXISTS = idempotent (drizzle generate chain is broken; we apply
-- raw idempotent SQL — see CLAUDE.md "DB migrations").
CREATE INDEX CONCURRENTLY IF NOT EXISTS vsc_active_end_time_idx
  ON vesting_streams_cache (end_time)
  WHERE is_fully_vested = false;
