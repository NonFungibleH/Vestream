-- 0034_rollup_explorer_fields.sql
-- Extend the per-token rollup so the Vesting Explorer's "Upcoming" list can be
-- a single fast, PAGINATED indexed read instead of re-aggregating
-- vesting_streams_cache per request (benchmarked at 1.2s warm / 3.9s cold —
-- the JSONB nextUnlockTime extraction over 32K active streams can't use an
-- index). With these columns the explorer reads one row per token straight
-- from the rollup (≈49ms), ORDER BY + LIMIT/OFFSET, reaching ALL ~5,000 tokens
-- with upcoming unlocks (was capped at the soonest ~923).
--
--   next_unlock       — soonest FUTURE unlock across the token's streams (unix sec)
--   protocols         — distinct protocols vesting this token (for the protocol filter)
--   token_decimals    — for amount formatting on the client
--   locked_value_usd  — total locked × price (for the $-amount filter + USD sort)
--   market_cap        — token market cap (for the unlock-risk metric)
--
-- All cron-maintained (refreshTokenRollups). next_unlock is a stored absolute
-- timestamp, so the client's "in X" countdown stays accurate between refreshes;
-- only the list ORDER can lag a refresh cycle, which is fine for a browse view.
ALTER TABLE token_vesting_rollups
  ADD COLUMN IF NOT EXISTS next_unlock      bigint,
  ADD COLUMN IF NOT EXISTS protocols        text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_decimals   integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS locked_value_usd double precision,
  ADD COLUMN IF NOT EXISTS market_cap       double precision;

-- Drives the default ORDER BY next_unlock for the "Upcoming" list. Partial: we
-- only ever page through tokens that HAVE an upcoming unlock.
CREATE INDEX IF NOT EXISTS token_rollups_next_unlock_idx
  ON token_vesting_rollups (next_unlock)
  WHERE next_unlock IS NOT NULL;
