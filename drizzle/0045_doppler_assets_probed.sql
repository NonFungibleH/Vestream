-- 0045: doppler_assets.vested_total becomes nullable.
--
-- The Airlock indexer now reads the vesting header (vestedTotalAmount,
-- vestingScheduleCount, symbol, decimals) ONLY for launches by enabled
-- integrators; every other launch gets integrator + pool recorded and
-- vested_total = NULL meaning "not probed". Before this, six reads per asset
-- for 1,500+ launches in a single Base window took 97 minutes on free RPCs.
-- NULL vs 0 keeps the measurement honest: 0 means vesting was off, NULL means
-- we did not look.
--
-- Idempotent. Apply with: node scripts/apply-migration.mjs drizzle/0045_doppler_assets_probed.sql

ALTER TABLE doppler_assets ALTER COLUMN vested_total DROP NOT NULL;
ALTER TABLE doppler_assets ALTER COLUMN vested_total DROP DEFAULT;
