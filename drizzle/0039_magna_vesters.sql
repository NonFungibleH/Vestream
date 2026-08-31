-- 0039: Magna vester registry.
-- One row per vesting contract deployed by a Magna Airlock factory, per chain.
-- Seeded from the explorer backfill; extended by the daily TVL walker's
-- recent-window log scan so discovered vesters survive aging out of the
-- free-tier eth_getLogs window. Idempotent — safe to re-run.
-- Apply with: node scripts/apply-migration.mjs drizzle/0039_magna_vesters.sql

CREATE TABLE IF NOT EXISTS magna_vesters (
  chain_id         integer     NOT NULL,
  address          text        NOT NULL,
  factory_version  text,
  discovered_block bigint      NOT NULL DEFAULT 0,
  created_at       timestamp   NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, address)
);
