-- 0044: Doppler fee streams registry.
--
-- Doppler locks each launched pool's liquidity in StreamableFeesLockerV2 and
-- streams the pool's trading fees to a set of beneficiaries, weighted by
-- shares that sum to 1e18, forever. A beneficiary's claimable amount is
--   (getCumulatedFees - getLastCumulatedFees[beneficiary]) * shares / 1e18
-- per token side, readable live. What is NOT readable from anywhere is who
-- the beneficiaries are without the Lock event, so we index Lock (and
-- UpdateBeneficiary / Unlock) into this registry and read the live numbers
-- per wallet at scan time.
--
-- This is NOT vesting. It never joins vesting_streams_cache, the unlock
-- calendar, TVL or any public page. It surfaces only inside a wallet scan
-- as "Fees owed" (see feedback_one_promise_not_four_products).
--
-- Idempotent. Apply with: node scripts/apply-migration.mjs drizzle/0044_doppler_fee_streams.sql

CREATE TABLE IF NOT EXISTS doppler_fee_streams (
  chain_id          integer   NOT NULL,
  locker            text      NOT NULL,
  -- Uniswap v4 PoolId (bytes32 hex, lowercase).
  pool_id           text      NOT NULL,
  -- PoolKey currencies. address(0) = native ETH on that chain.
  currency0         text,
  currency1         text,
  -- Canonical lowercase. One row per (pool, beneficiary).
  beneficiary       text      NOT NULL,
  -- WAD-scaled share of the pool's fees (sum over beneficiaries = 1e18).
  shares            numeric   NOT NULL DEFAULT 0,
  -- The address that receives the liquidity itself after lock_duration.
  recipient         text,
  start_date        bigint,
  lock_duration     bigint,
  is_unlocked       boolean   NOT NULL DEFAULT false,
  discovered_block  bigint    NOT NULL DEFAULT 0,
  created_at        timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, pool_id, beneficiary)
);

CREATE INDEX IF NOT EXISTS doppler_fee_streams_beneficiary_idx
  ON doppler_fee_streams (beneficiary, chain_id);
