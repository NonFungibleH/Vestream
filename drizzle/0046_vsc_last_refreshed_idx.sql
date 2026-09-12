-- 0038 — index vesting_streams_cache(last_refreshed_at)
--
-- /api/health runs `max(last_refreshed_at)` over the whole cache on every
-- call. Measured 2026-09-12: 20.5s, a full scan of 277,927 rows, which is
-- why the probe took 14–26s and why concurrent admin reads (cache-stats)
-- queued behind it on the pooler until they timed out. A btree makes it an
-- index-only max.
--
-- CONCURRENTLY so it cannot lock writes while the indexers are running.
-- Idempotent (IF NOT EXISTS) per the raw-SQL deploy convention in CLAUDE.md.
CREATE INDEX CONCURRENTLY IF NOT EXISTS vsc_last_refreshed_idx
  ON vesting_streams_cache (last_refreshed_at);
