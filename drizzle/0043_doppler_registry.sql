-- 0043: Doppler asset + vesting allocation registry.
--
-- Doppler (Airlock) launches a DERC20 per token and the vesting lives INSIDE
-- that token contract, so there is no single address to read positions from
-- and no reverse index from beneficiary -> tokens. We discover assets from
-- Airlock's Create event, record which launchpad created each one (the
-- `integrator` from getAssetData, e.g. Bankr), and record every
-- VestingAllocated(beneficiary, scheduleId, amount) so a wallet scan is a
-- registry lookup followed by live reads. Same shape as magna_vesters (0039)
-- and ponzu_presales (0042).
--
-- ALL vesting-enabled Doppler assets go in here regardless of integrator;
-- which integrators we surface as streams is a code-level allowlist
-- (DOPPLER_ENABLED_INTEGRATORS), so widening later is a config change.
--
-- Idempotent. Apply with: node scripts/apply-migration.mjs drizzle/0043_doppler_registry.sql

CREATE TABLE IF NOT EXISTS doppler_assets (
  chain_id          integer   NOT NULL,
  -- The DERC20 token. Vesting state is read from this address.
  asset             text      NOT NULL,
  -- Launchpad that called Airlock.create(); Bankr = 0xf60633d0...163e.
  integrator        text,
  numeraire         text,
  pool              text,
  token_symbol      text,
  token_decimals    integer   NOT NULL DEFAULT 18,
  -- vestingStart() unix seconds; schedules are offsets from this.
  vesting_start     bigint,
  -- vestedTotalAmount() in base units. 0 = vesting disabled at launch.
  vested_total      numeric   NOT NULL DEFAULT 0,
  schedule_count    integer   NOT NULL DEFAULT 0,
  discovered_block  bigint    NOT NULL DEFAULT 0,
  created_at        timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, asset)
);

CREATE INDEX IF NOT EXISTS doppler_assets_integrator_idx
  ON doppler_assets (chain_id, integrator);

CREATE TABLE IF NOT EXISTS doppler_vesting_allocations (
  chain_id          integer   NOT NULL,
  asset             text      NOT NULL,
  -- Canonical lowercase. One row per (asset, beneficiary, schedule).
  beneficiary       text      NOT NULL,
  schedule_id       integer   NOT NULL,
  -- vestingSchedules(scheduleId): seconds from vesting_start.
  cliff_seconds     bigint    NOT NULL DEFAULT 0,
  duration_seconds  bigint    NOT NULL DEFAULT 0,
  -- VestingAllocated amount in base units (== vestingOf().totalAmount).
  allocated         numeric   NOT NULL DEFAULT 0,
  discovered_block  bigint    NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, asset, beneficiary, schedule_id)
);

CREATE INDEX IF NOT EXISTS doppler_alloc_beneficiary_idx
  ON doppler_vesting_allocations (beneficiary, chain_id);
