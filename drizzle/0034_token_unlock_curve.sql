-- 0034_token_unlock_curve.sql
-- Compact per-token cumulative-unlock curve for the explorer's row sparkline.
-- 12 integers (0–100) = cumulative % of the allocation vested at 12 evenly
-- spaced points across the token's vesting span, comma-joined. Cron-maintained
-- in refreshTokenRollups; the explorer reads it straight off the rollup so the
-- sparkline is a free indexed read, no per-row stream fetch.
ALTER TABLE token_vesting_rollups
  ADD COLUMN IF NOT EXISTS unlock_curve text;
